import 'dotenv/config'
import path from 'path'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import compression from 'compression'
import { createServer } from 'http'
import { Server, Socket } from 'socket.io'
import jwt from 'jsonwebtoken'
import router from './routes'
import { initIo } from './lib/socketio'
import { startAuctionExpiryJob } from './jobs/auctionExpiry'
import { startEscrowAutoReleaseJob } from './jobs/escrowAutoRelease'
import { startShipmentDeadlineJob } from './jobs/shipmentDeadlineJob'
import { apiLimiter } from './middleware/rateLimit'
import { errorHandler } from './middleware/errorHandler'
import { prisma } from './lib/prisma'

// ── 환경변수 필수값 검증 ──────────────────────────────────────────────────────
const REQUIRED_ENV = ['DATABASE_URL', 'JWT_SECRET', 'PORT', 'FRONTEND_URL', 'API_URL'] as const
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`[FATAL] Missing env: ${key}`)
    process.exit(1)
  }
}
if (process.env.JWT_SECRET === 'rocket-auction-house-super-secret-key-change-in-production') {
  console.warn('[WARN] JWT_SECRET is using the default value. Change it in production!')
}

const app = express()
const httpServer = createServer(app)

const io = new Server(httpServer, {
  cors: { origin: process.env.FRONTEND_URL, credentials: true },
})

initIo(io)

// ── 보안 헤더 ─────────────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // 업로드 이미지 허용
}))

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true,
}))

// ── Gzip 압축 ────────────────────────────────────────────────────────────────
app.use(compression())

// ── 요청 로깅 ─────────────────────────────────────────────────────────────────
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'))

// ── 파서 ─────────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }))

// ── 정적 파일 ─────────────────────────────────────────────────────────────────
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')))

// ── API 라우트 (전역 rate limit 포함) ─────────────────────────────────────────
app.use('/api', apiLimiter, router)

// ── Socket.io JWT 인증 미들웨어 ───────────────────────────────────────────────
io.use((socket: Socket, next) => {
  const token = socket.handshake.auth.token as string | undefined
  if (!token) { next(new Error('unauthorized')); return }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string }
    socket.data.userId = payload.userId
    next()
  } catch {
    next(new Error('unauthorized'))
  }
})

// ── Socket.io 이벤트 핸들러 ───────────────────────────────────────────────────
io.on('connection', (socket: Socket) => {
  const userId = socket.data.userId as string

  // 리스팅 실시간 업데이트용 (경매 등)
  socket.on('join:listing', (listingId: string) => socket.join(`listing:${listingId}`))
  socket.on('leave:listing', (listingId: string) => socket.leave(`listing:${listingId}`))

  // 채팅방 입장
  socket.on('chat:join', async (roomId: string) => {
    try {
      const room = await prisma.chatRoom.findUnique({ where: { id: roomId }, select: { buyerId: true, sellerId: true } })
      if (!room || (room.buyerId !== userId && room.sellerId !== userId)) return
      socket.join(`chat:${roomId}`)
    } catch (err) {
      console.error('[socket chat:join]', err)
    }
  })

  // 메시지 전송
  socket.on('chat:send', async ({ roomId, content }: { roomId: string; content: string }) => {
    try {
      if (!content?.trim() || content.length > 1000) return
      const room = await prisma.chatRoom.findUnique({ where: { id: roomId }, select: { buyerId: true, sellerId: true } })
      if (!room || (room.buyerId !== userId && room.sellerId !== userId)) return

      const msg = await prisma.chatMessage.create({
        data: { roomId, senderId: userId, content: content.trim() },
        select: {
          id: true, content: true, createdAt: true, readAt: true,
          sender: { select: { id: true, nickname: true, avatarUrl: true } },
        },
      })
      await prisma.chatRoom.update({ where: { id: roomId }, data: { lastMessageAt: new Date() } })

      io.to(`chat:${roomId}`).emit('chat:message', msg)
    } catch (err) {
      console.error('[socket chat:send]', err)
      socket.emit('chat:error', { roomId: (err as { roomId?: string }).roomId, message: '메시지 전송에 실패했습니다.' })
    }
  })

  // 읽음 처리
  socket.on('chat:read', async (roomId: string) => {
    try {
      const room = await prisma.chatRoom.findUnique({ where: { id: roomId }, select: { buyerId: true, sellerId: true } })
      if (!room || (room.buyerId !== userId && room.sellerId !== userId)) return

      await prisma.chatMessage.updateMany({
        where: { roomId, senderId: { not: userId }, readAt: null },
        data: { readAt: new Date() },
      })
      socket.to(`chat:${roomId}`).emit('chat:read', { roomId, userId })
    } catch (err) {
      console.error('[socket chat:read]', err)
    }
  })

  // ── DM (친구 1:1) ─────────────────────────────────────────────────────────

  socket.on('dm:join', async (roomId: string) => {
    try {
      const room = await prisma.friendRoom.findUnique({ where: { id: roomId } })
      if (!room || (room.user1Id !== userId && room.user2Id !== userId)) return
      socket.join(`dm:${roomId}`)
    } catch (err) {
      console.error('[socket dm:join]', err)
    }
  })

  socket.on('dm:send', async ({ roomId, content }: { roomId: string; content: string }) => {
    try {
      if (!content?.trim() || content.length > 1000) return
      const room = await prisma.friendRoom.findUnique({ where: { id: roomId } })
      if (!room || (room.user1Id !== userId && room.user2Id !== userId)) return

      const msg = await prisma.friendMessage.create({
        data: { roomId, senderId: userId, content: content.trim() },
        select: {
          id: true, content: true, createdAt: true, readAt: true, senderId: true,
          sender: { select: { id: true, nickname: true, avatarUrl: true } },
        },
      })
      await prisma.friendRoom.update({ where: { id: roomId }, data: { lastMessageAt: new Date() } })

      io.to(`dm:${roomId}`).emit('dm:message', msg)
    } catch (err) {
      console.error('[socket dm:send]', err)
    }
  })

  socket.on('dm:read', async (roomId: string) => {
    try {
      const room = await prisma.friendRoom.findUnique({ where: { id: roomId } })
      if (!room || (room.user1Id !== userId && room.user2Id !== userId)) return
      await prisma.friendMessage.updateMany({
        where: { roomId, senderId: { not: userId }, readAt: null },
        data: { readAt: new Date() },
      })
      socket.to(`dm:${roomId}`).emit('dm:read', { roomId, userId })
    } catch (err) {
      console.error('[socket dm:read]', err)
    }
  })

  // 개인 알림용 룸 입장 (친구 요청 알림)
  socket.join(`user:${userId}`)
})

// ── 경매 만료 잡 ──────────────────────────────────────────────────────────────
startAuctionExpiryJob()

// ── 에스크로 자동 해제 잡 ─────────────────────────────────────────────────────
startEscrowAutoReleaseJob()

// ── 미발송 자동 취소 잡 ───────────────────────────────────────────────────────
startShipmentDeadlineJob()

// ── 중앙 에러 핸들러 (라우트 이후 마지막에 등록) ──────────────────────────────
app.use(errorHandler)

export { io }

const PORT = process.env.PORT ?? 4000
httpServer.requestTimeout = 30000
httpServer.listen(PORT, () => {
  console.log(`[Server] http://localhost:${PORT}`)
})

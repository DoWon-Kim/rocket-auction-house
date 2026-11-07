// 중고거래 채팅 소켓: 입장·전송(사진)·읽음·입력 중·삭제·접속 상태
import { Server, Socket } from 'socket.io'
import { prisma } from './prisma'
import { CHAT_MSG_SELECT, maskDeleted } from './chatTrade'
import { detectChatRisk } from './chatSafety'

const DELETE_WINDOW_MS = 5 * 60_000 // 보낸 뒤 5분 안에만 삭제
const MAX_IMAGES = 5

// 접속 상태 (서버 메모리 — 한 사람이 여러 탭을 열 수 있어 연결 수로 센다)
const online = new Map<string, number>()
export const isOnline = (userId: string) => (online.get(userId) ?? 0) > 0

async function roomOf(roomId: string, userId: string) {
  if (typeof roomId !== 'string') return null
  const room = await prisma.chatRoom.findUnique({ where: { id: roomId }, select: { buyerId: true, sellerId: true } })
  if (!room || (room.buyerId !== userId && room.sellerId !== userId)) return null
  return { ...room, otherId: room.buyerId === userId ? room.sellerId : room.buyerId }
}

export async function isBlockedBetween(a: string, b: string) {
  const block = await prisma.userBlock.findFirst({ where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] }, select: { id: true } })
  return !!block
}

const validImages = (urls: unknown): string[] | null => {
  if (urls === undefined || urls === null) return []
  if (!Array.isArray(urls) || urls.length > MAX_IMAGES) return null
  return urls.every(u => typeof u === 'string' && u.length < 600 && /^https?:\/\//.test(u)) ? urls as string[] : null
}

export function registerChatHandlers(io: Server, socket: Socket) {
  const userId = socket.data.userId as string

  // ── 접속 상태 ──
  online.set(userId, (online.get(userId) ?? 0) + 1)
  if (online.get(userId) === 1) io.to(`presence:${userId}`).emit('presence', { userId, online: true })
  socket.on('disconnect', () => {
    const n = (online.get(userId) ?? 1) - 1
    if (n > 0) { online.set(userId, n); return }
    online.delete(userId)
    const lastSeenAt = new Date()
    prisma.user.update({ where: { id: userId }, data: { lastSeenAt } }).catch(() => {})
    io.to(`presence:${userId}`).emit('presence', { userId, online: false, lastSeenAt })
  })

  // 채팅 상대의 접속 상태 구독 (같은 채팅방 상대만)
  socket.on('presence:watch', async (targetId: string) => {
    try {
      if (typeof targetId !== 'string') return
      const shared = await prisma.chatRoom.findFirst({ where: { OR: [{ buyerId: userId, sellerId: targetId }, { buyerId: targetId, sellerId: userId }] }, select: { id: true } })
      if (!shared) return
      socket.join(`presence:${targetId}`)
      const u = await prisma.user.findUnique({ where: { id: targetId }, select: { lastSeenAt: true } })
      socket.emit('presence', { userId: targetId, online: isOnline(targetId), lastSeenAt: u?.lastSeenAt ?? null })
    } catch (err) { console.error('[socket presence:watch]', err) }
  })
  socket.on('presence:unwatch', (targetId: string) => { if (typeof targetId === 'string') socket.leave(`presence:${targetId}`) })

  // ── 채팅방 입장 ──
  socket.on('chat:join', async (roomId: string) => {
    try { if (await roomOf(roomId, userId)) socket.join(`chat:${roomId}`) } catch (err) { console.error('[socket chat:join]', err) }
  })
  socket.on('chat:leave', (roomId: string) => { if (typeof roomId === 'string') socket.leave(`chat:${roomId}`) })

  // ── 메시지 전송 (글·사진) ──
  const sentAt: number[] = []
  socket.on('chat:send', async (payload: { roomId: string; content?: string; imageUrls?: string[]; clientId?: string }) => {
    const clientId = typeof payload?.clientId === 'string' ? payload.clientId.slice(0, 64) : undefined
    const fail = (message: string) => socket.emit('chat:error', { roomId: payload?.roomId, clientId, message })
    try {
      // 도배 방지: 5초에 10개까지
      const now = Date.now()
      while (sentAt.length && now - sentAt[0] > 5000) sentAt.shift()
      if (sentAt.length >= 10) return fail('메시지를 너무 빨리 보내고 있어요. 잠시 후 다시 시도해주세요.')
      sentAt.push(now)

      const content = (payload?.content ?? '').trim()
      const images = validImages(payload?.imageUrls)
      if (!images) return fail('사진은 한 번에 5장까지 보낼 수 있어요.')
      if (!content && images.length === 0) return
      if (content.length > 1000) return fail('메시지는 1000자까지 보낼 수 있어요.')

      const room = await roomOf(payload.roomId, userId)
      if (!room) return fail('채팅방에 접근할 수 없어요.')
      if (await isBlockedBetween(userId, room.otherId)) return fail('차단된 사용자와는 대화할 수 없어요.')

      const msg = await prisma.chatMessage.create({
        data: { roomId: payload.roomId, senderId: userId, content, imageUrls: images, flagged: detectChatRisk(content).length > 0 },
        select: CHAT_MSG_SELECT,
      })
      await prisma.chatRoom.update({ where: { id: payload.roomId }, data: { lastMessageAt: new Date() } })

      io.to(`chat:${payload.roomId}`).emit('chat:message', { ...msg, clientId })
      io.to(`user:${room.otherId}`).emit('chat:room-updated', { roomId: payload.roomId })
      io.to(`user:${userId}`).emit('chat:room-updated', { roomId: payload.roomId })
    } catch (err) {
      console.error('[socket chat:send]', err)
      fail('메시지 전송에 실패했어요.')
    }
  })

  // ── 읽음 ──
  socket.on('chat:read', async (roomId: string) => {
    try {
      if (!(await roomOf(roomId, userId))) return
      const r = await prisma.chatMessage.updateMany({ where: { roomId, senderId: { not: userId }, readAt: null }, data: { readAt: new Date() } })
      socket.to(`chat:${roomId}`).emit('chat:read', { roomId, userId })
      if (r.count > 0) io.to(`user:${userId}`).emit('chat:room-updated', { roomId })
    } catch (err) { console.error('[socket chat:read]', err) }
  })

  // ── 입력 중 (방 멤버 확인은 입장 때 했으므로 방에 들어가 있는지만 본다) ──
  socket.on('chat:typing', ({ roomId, typing }: { roomId: string; typing: boolean }) => {
    if (typeof roomId !== 'string' || !socket.rooms.has(`chat:${roomId}`)) return
    socket.to(`chat:${roomId}`).emit('chat:typing', { roomId, userId, typing: !!typing })
  })

  // ── 보낸 메시지 삭제 (5분 이내, 일반 메시지만) ──
  socket.on('chat:delete', async ({ messageId }: { messageId: string }) => {
    try {
      if (typeof messageId !== 'string') return
      const msg = await prisma.chatMessage.findUnique({ where: { id: messageId }, select: { id: true, roomId: true, senderId: true, type: true, createdAt: true, deletedAt: true } })
      if (!msg || msg.senderId !== userId || msg.type !== 'TEXT' || msg.deletedAt) return
      if (Date.now() - msg.createdAt.getTime() > DELETE_WINDOW_MS) {
        socket.emit('chat:error', { roomId: msg.roomId, message: '보낸 지 5분이 지난 메시지는 삭제할 수 없어요.' })
        return
      }
      const updated = await prisma.chatMessage.update({ where: { id: messageId }, data: { deletedAt: new Date() }, select: CHAT_MSG_SELECT })
      io.to(`chat:${msg.roomId}`).emit('chat:updated', maskDeleted(updated))
    } catch (err) { console.error('[socket chat:delete]', err) }
  })
}

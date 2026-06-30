import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'

const MSG_SELECT = {
  id: true, content: true, createdAt: true, readAt: true,
  sender: { select: { id: true, nickname: true, avatarUrl: true } },
}

// 채팅방 가져오기 (없으면 생성) — 구매자가 리스팅에서 채팅 시작
export async function getOrCreateRoom(req: AuthRequest, res: Response) {
  const listingId = String(req.params['listingId'])

  try {
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, sellerId: true, status: true },
    })
    if (!listing) { res.status(404).json({ message: '리스팅을 찾을 수 없습니다.' }); return }
    if (listing.sellerId === req.userId) {
      res.status(400).json({ message: '본인 리스팅에는 채팅할 수 없습니다.' }); return
    }

    const room = await prisma.chatRoom.upsert({
      where: { listingId_buyerId: { listingId, buyerId: req.userId! } },
      create: { listingId, buyerId: req.userId!, sellerId: listing.sellerId },
      update: {},
      include: {
        listing: { select: { id: true, status: true, card: { select: { name: true, nameKo: true, imageUrl: true } } } },
        buyer:  { select: { id: true, nickname: true, avatarUrl: true } },
        seller: { select: { id: true, nickname: true, avatarUrl: true } },
        transaction: { select: { id: true, txStatus: true, escrowStatus: true, finalPrice: true, trackingCarrier: true, trackingNumber: true, shippedAt: true } },
        messages: { orderBy: { createdAt: 'asc' }, take: 50, select: MSG_SELECT },
      },
    })

    res.json(room)
  } catch (err) {
    console.error('[getOrCreateRoom]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// 내 채팅방 목록
export async function getMyRooms(req: AuthRequest, res: Response) {
  try {
    const rooms = await prisma.chatRoom.findMany({
      where: {
        OR: [{ buyerId: req.userId! }, { sellerId: req.userId! }],
      },
      include: {
        listing: { select: { id: true, status: true, card: { select: { name: true, nameKo: true, imageUrl: true } } } },
        buyer:  { select: { id: true, nickname: true, avatarUrl: true } },
        seller: { select: { id: true, nickname: true, avatarUrl: true } },
        transaction: { select: { id: true, txStatus: true, escrowStatus: true, finalPrice: true, trackingCarrier: true, trackingNumber: true, shippedAt: true } },
        messages: {
          orderBy: { createdAt: 'desc' }, take: 1,
          select: { id: true, content: true, createdAt: true, senderId: true, readAt: true },
        },
        _count: {
          select: { messages: { where: { senderId: { not: req.userId! }, readAt: null } } },
        },
      },
      orderBy: { lastMessageAt: { sort: 'desc', nulls: 'last' } },
    })

    res.json(rooms)
  } catch (err) {
    console.error('[getMyRooms]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// 채팅방 메시지 조회 (페이지네이션)
export async function getRoomMessages(req: AuthRequest, res: Response) {
  const roomId = String(req.params['roomId'])
  try {
    const room = await prisma.chatRoom.findUnique({ where: { id: roomId } })
    if (!room || (room.buyerId !== req.userId && room.sellerId !== req.userId)) {
      res.status(403).json({ message: '접근 권한이 없습니다.' }); return
    }

    const before = req.query.before as string | undefined
    const limit = Math.min(50, Number(req.query.limit ?? 30))

    const messages = await prisma.chatMessage.findMany({
      where: { roomId, ...(before ? { createdAt: { lt: new Date(before) } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: MSG_SELECT,
    })

    // 읽음 처리
    await prisma.chatMessage.updateMany({
      where: { roomId, senderId: { not: req.userId! }, readAt: null },
      data: { readAt: new Date() },
    })

    res.json(messages.reverse())
  } catch (err) {
    console.error('[getRoomMessages]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// 읽지 않은 메시지 수
export async function getUnreadCount(req: AuthRequest, res: Response) {
  try {
    const count = await prisma.chatMessage.count({
      where: {
        senderId: { not: req.userId! },
        readAt: null,
        room: { OR: [{ buyerId: req.userId! }, { sellerId: req.userId! }] },
      },
    })
    res.json({ count })
  } catch (err) {
    console.error('[getUnreadCount]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

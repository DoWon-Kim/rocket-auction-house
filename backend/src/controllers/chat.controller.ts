import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { CHAT_MSG_SELECT as MSG_SELECT, maskDeleted } from '../lib/chatTrade'
import { isBlockedBetween } from '../lib/chatSocket'

const ROOM_INCLUDE = {
  listing: { select: { id: true, status: true, title: true, listingType: true, buyNowPrice: true, minOfferPrice: true, currentPrice: true, shippingFee: true, negotiable: true, imageUrls: true, reservedForId: true, reservedPrice: true, sellerId: true, card: { select: { name: true, nameKo: true, imageUrl: true } } } },
  buyer:  { select: { id: true, nickname: true, avatarUrl: true } },
  seller: { select: { id: true, nickname: true, avatarUrl: true } },
  transaction: { select: { id: true, txStatus: true, escrowStatus: true, finalPrice: true, shippingFee: true, completedAt: true, shipClockAt: true, trackingCarrier: true, trackingNumber: true, shippedAt: true, recipientName: true, recipientPhone: true, zipCode: true, address: true, addressDetail: true, shippingMemo: true } },
} as const

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
    if (await isBlockedBetween(req.userId!, listing.sellerId)) {
      res.status(403).json({ message: '차단된 사용자와는 채팅할 수 없어요.' }); return
    }

    const room = await prisma.chatRoom.upsert({
      where: { listingId_buyerId: { listingId, buyerId: req.userId! } },
      create: { listingId, buyerId: req.userId!, sellerId: listing.sellerId },
      update: { buyerLeftAt: null },
      include: {
        ...ROOM_INCLUDE,
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
        ...ROOM_INCLUDE,
        messages: {
          orderBy: { createdAt: 'desc' }, take: 1,
          select: { id: true, content: true, createdAt: true, senderId: true, readAt: true, type: true, imageUrls: true, deletedAt: true },
        },
        _count: {
          select: { messages: { where: { senderId: { not: req.userId! }, readAt: null } } },
        },
      },
      orderBy: { lastMessageAt: { sort: 'desc', nulls: 'last' } },
    })

    // 나간 방은 그 뒤로 새 메시지가 왔을 때만 다시 보인다
    const visible = rooms.filter(r => {
      const leftAt = r.buyerId === req.userId ? r.buyerLeftAt : r.sellerLeftAt
      return !leftAt || (r.lastMessageAt && r.lastMessageAt > leftAt)
    })
    res.json(visible.map(r => ({ ...r, messages: r.messages.map(maskDeleted) })))
  } catch (err) {
    console.error('[getMyRooms]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// 채팅방 정보 — 상품·거래 상태, 이 방의 가격 제안
export async function getRoom(req: AuthRequest, res: Response) {
  try {
    const room = await prisma.chatRoom.findUnique({ where: { id: String(req.params['roomId']) }, include: ROOM_INCLUDE })
    if (!room || (room.buyerId !== req.userId && room.sellerId !== req.userId)) {
      res.status(403).json({ message: '접근 권한이 없습니다.' }); return
    }
    const otherId = room.buyerId === req.userId ? room.sellerId : room.buyerId
    const [blockedByMe, blockedMe] = await Promise.all([
      prisma.userBlock.findUnique({ where: { blockerId_blockedId: { blockerId: req.userId!, blockedId: otherId } } }).then(Boolean),
      prisma.userBlock.findUnique({ where: { blockerId_blockedId: { blockerId: otherId, blockedId: req.userId! } } }).then(Boolean),
    ])
    const offers = await prisma.offer.findMany({
      where: { listingId: room.listingId, buyerId: room.buyerId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, amount: true, status: true, createdAt: true },
      take: 20,
    })
    res.json({ ...room, offers, blockedByMe, blockedMe })
  } catch (err) {
    console.error('[getRoom]', err)
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
    const beforeId = req.query.beforeId as string | undefined
    const limit = Math.min(50, Number(req.query.limit ?? 30))

    // 커서: (시각, id) — 같은 밀리초에 보낸 메시지도 빠지지 않게
    const cursor = before
      ? beforeId
        ? { OR: [{ createdAt: { lt: new Date(before) } }, { createdAt: new Date(before), id: { lt: beforeId } }] }
        : { createdAt: { lt: new Date(before) } }
      : {}
    const messages = await prisma.chatMessage.findMany({
      where: { roomId, ...cursor },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: MSG_SELECT,
    })

    // 읽음 처리
    await prisma.chatMessage.updateMany({
      where: { roomId, senderId: { not: req.userId! }, readAt: null },
      data: { readAt: new Date() },
    })

    res.json(messages.reverse().map(maskDeleted))
  } catch (err) {
    console.error('[getRoomMessages]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// 읽지 않은 메시지 수
export async function getUnreadCount(req: AuthRequest, res: Response) {
  try {
    // 거래 채팅 + 1:1 메시지(친구 DM)를 한 메시지함으로 — 배지 숫자는 합계
    const [trade, dm] = await Promise.all([
      prisma.chatMessage.count({
        where: {
          senderId: { not: req.userId! },
          readAt: null,
          room: { OR: [{ buyerId: req.userId! }, { sellerId: req.userId! }] },
        },
      }),
      prisma.friendMessage.count({
        where: {
          senderId: { not: req.userId! },
          readAt: null,
          room: { OR: [{ user1Id: req.userId! }, { user2Id: req.userId! }] },
        },
      }),
    ])
    res.json({ count: trade + dm, trade, dm })
  } catch (err) {
    console.error('[getUnreadCount]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// 채팅방 나가기 — 진행 중인 안전결제가 있으면 나갈 수 없다
export async function leaveRoom(req: AuthRequest, res: Response) {
  try {
    const room = await prisma.chatRoom.findUnique({ where: { id: String(req.params['roomId']) }, select: { id: true, buyerId: true, sellerId: true, transaction: { select: { txStatus: true } } } })
    if (!room || (room.buyerId !== req.userId && room.sellerId !== req.userId)) {
      res.status(403).json({ message: '접근 권한이 없습니다.' }); return
    }
    if (room.transaction && ['PENDING_SHIPMENT', 'SHIPPED', 'DISPUTED'].includes(room.transaction.txStatus)) {
      res.status(400).json({ message: '거래가 끝나기 전에는 채팅방을 나갈 수 없어요.' }); return
    }
    await prisma.chatRoom.update({ where: { id: room.id }, data: room.buyerId === req.userId ? { buyerLeftAt: new Date() } : { sellerLeftAt: new Date() } })
    res.json({ message: '채팅방을 나갔어요.' })
  } catch (err) {
    console.error('[leaveRoom]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// 차단 토글 — 차단하면 서로 채팅을 보낼 수 없다
export async function toggleBlock(req: AuthRequest, res: Response) {
  const targetId = String(req.params['id'])
  if (targetId === req.userId) { res.status(400).json({ message: '자신은 차단할 수 없어요.' }); return }
  try {
    const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } })
    if (!target) { res.status(404).json({ message: '사용자를 찾을 수 없습니다.' }); return }
    const key = { blockerId_blockedId: { blockerId: req.userId!, blockedId: targetId } }
    const existing = await prisma.userBlock.findUnique({ where: key })
    if (existing) await prisma.userBlock.delete({ where: key })
    else await prisma.userBlock.create({ data: { blockerId: req.userId!, blockedId: targetId } })
    res.json({ blocked: !existing, message: existing ? '차단을 해제했어요.' : '차단했어요. 서로 채팅을 보낼 수 없어요.' })
  } catch (err) {
    console.error('[toggleBlock]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

export async function getMyBlocks(req: AuthRequest, res: Response) {
  try {
    const rows = await prisma.userBlock.findMany({ where: { blockerId: req.userId! }, orderBy: { createdAt: 'desc' }, select: { createdAt: true, blocked: { select: { id: true, nickname: true, avatarUrl: true } } } })
    res.json(rows.map(r => ({ ...r.blocked, blockedAt: r.createdAt })))
  } catch (err) {
    console.error('[getMyBlocks]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

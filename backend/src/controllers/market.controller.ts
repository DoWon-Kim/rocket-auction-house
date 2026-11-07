// 번개장터식 C2C 거래: 찜 · 끌올 · 예약 · 상품 수정 · 안전결제(배송지) · 상점/팔로우
import { Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { notify } from '../lib/notify'
import { analyzeUserRisk, issueWarning } from '../lib/fraudDetection'
import { canBump, bumpAvailableAt, resolvePurchasePrice } from '../lib/marketTrade'
import { postChatMessage } from '../lib/chatTrade'
import { SHIP_DEADLINE_DAYS } from '../lib/adminOps'

const fail = (res: Response, status: number, message: string) => { res.status(status).json({ message }) }
const P = (n: number) => `${n.toLocaleString()}P`
const listingName = (l: { title: string | null; card: { name: string; nameKo: string | null } }) => l.title ?? l.card.nameKo ?? l.card.name

// ── 찜 ───────────────────────────────────────────────────────────────────────

export async function toggleLike(req: AuthRequest, res: Response) {
  const listingId = String(req.params['id'])
  try {
    const listing = await prisma.listing.findUnique({ where: { id: listingId }, select: { sellerId: true } })
    if (!listing) return fail(res, 404, '상품을 찾을 수 없습니다.')
    if (listing.sellerId === req.userId) return fail(res, 400, '내 상품은 찜할 수 없습니다.')

    const key = { userId_listingId: { userId: req.userId!, listingId } }
    const existing = await prisma.listingLike.findUnique({ where: key })
    const [, updated] = await prisma.$transaction(existing
      ? [prisma.listingLike.delete({ where: key }), prisma.listing.update({ where: { id: listingId }, data: { likeCount: { decrement: 1 } }, select: { likeCount: true } })]
      : [prisma.listingLike.create({ data: { userId: req.userId!, listingId } }), prisma.listing.update({ where: { id: listingId }, data: { likeCount: { increment: 1 } }, select: { likeCount: true } })])
    res.json({ liked: !existing, likeCount: Math.max(0, updated.likeCount) })
  } catch (err) {
    console.error('[toggleLike]', err)
    fail(res, 500, '서버 오류가 발생했습니다.')
  }
}

export const MARKET_CARD_INCLUDE = {
  card: { select: { id: true, name: true, nameKo: true, imageUrl: true, rarity: true, tcgType: true, setName: true, cardNumber: true } },
  seller: { select: { id: true, nickname: true, avatarUrl: true, avgRating: true, reviewCount: true } },
  _count: { select: { bids: true, offers: true, chatRooms: true } },
} as const

export async function getMyLikes(req: AuthRequest, res: Response) {
  try {
    const likes = await prisma.listingLike.findMany({
      where: { userId: req.userId! },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { listing: { include: MARKET_CARD_INCLUDE } },
    })
    res.json(likes.map(l => l.listing))
  } catch (err) {
    console.error('[getMyLikes]', err)
    fail(res, 500, '서버 오류가 발생했습니다.')
  }
}

// ── 판매자: 끌올 · 예약 · 수정 ────────────────────────────────────────────────

async function ownListing(req: AuthRequest, res: Response) {
  const listing = await prisma.listing.findUnique({
    where: { id: String(req.params['id']) },
    include: { card: { select: { name: true, nameKo: true } }, _count: { select: { bids: true } } },
  })
  if (!listing) { fail(res, 404, '상품을 찾을 수 없습니다.'); return null }
  if (listing.sellerId !== req.userId) { fail(res, 403, '판매자만 할 수 있습니다.'); return null }
  return listing
}

export async function bumpListing(req: AuthRequest, res: Response) {
  try {
    const listing = await ownListing(req, res)
    if (!listing) return
    if (listing.status !== 'ACTIVE' && listing.status !== 'RESERVED') return fail(res, 400, '판매중인 상품만 끌올할 수 있습니다.')
    if (!canBump(listing.bumpedAt)) {
      return res.status(429).json({ message: '끌올은 하루에 한 번 할 수 있어요.', availableAt: bumpAvailableAt(listing.bumpedAt) })
    }
    const updated = await prisma.listing.update({ where: { id: listing.id }, data: { bumpedAt: new Date() }, select: { bumpedAt: true } })
    res.json({ message: '상품을 목록 맨 위로 올렸어요.', bumpedAt: updated.bumpedAt, availableAt: bumpAvailableAt(updated.bumpedAt) })
  } catch (err) {
    console.error('[bumpListing]', err)
    fail(res, 500, '서버 오류가 발생했습니다.')
  }
}

const reserveSchema = z.object({ buyerId: z.string().uuid(), price: z.number().int().min(1).optional() })

// 채팅한 구매자와 예약 — 이 구매자만 결제할 수 있게 된다
export async function reserveListing(req: AuthRequest, res: Response) {
  const parsed = reserveSchema.safeParse(req.body)
  if (!parsed.success) return fail(res, 400, '예약할 구매자를 선택해주세요.')
  try {
    const listing = await ownListing(req, res)
    if (!listing) return
    if (listing.listingType === 'AUCTION') return fail(res, 400, '경매 상품은 예약할 수 없습니다.')
    if (listing.status !== 'ACTIVE') return fail(res, 400, '판매중인 상품만 예약할 수 있습니다.')
    const price = parsed.data.price ?? listing.buyNowPrice
    if (!price) return fail(res, 400, '거래 금액을 입력해주세요.')

    const room = await prisma.chatRoom.findUnique({ where: { listingId_buyerId: { listingId: listing.id, buyerId: parsed.data.buyerId } }, select: { id: true } })
    if (!room) return fail(res, 400, '채팅한 구매자만 예약할 수 있습니다.')

    const done = await prisma.listing.updateMany({
      where: { id: listing.id, status: 'ACTIVE' },
      data: { status: 'RESERVED', reservedForId: parsed.data.buyerId, reservedPrice: price, reservedAt: new Date() },
    })
    if (done.count === 0) return fail(res, 409, '이미 판매 상태가 바뀐 상품입니다.')

    await postChatMessage({ roomId: room.id, senderId: req.userId!, type: 'SYSTEM', content: `판매자가 ${P(price)}에 예약했어요. 안전결제로 구매를 진행해주세요.` })
    notify({
      userId: parsed.data.buyerId, type: 'LISTING_RESERVED', title: '상품이 예약되었어요',
      body: `${listingName(listing)} — ${P(price)}에 예약되었습니다. 안전결제를 진행해주세요.`,
      link: `/chat/${room.id}`,
    }).catch(e => console.error('[notify LISTING_RESERVED]', e))
    res.json({ message: '예약중으로 변경했어요.' })
  } catch (err) {
    console.error('[reserveListing]', err)
    fail(res, 500, '서버 오류가 발생했습니다.')
  }
}

export async function cancelReservation(req: AuthRequest, res: Response) {
  try {
    const listing = await ownListing(req, res)
    if (!listing) return
    if (listing.status !== 'RESERVED') return fail(res, 400, '예약중인 상품이 아닙니다.')
    const buyerId = listing.reservedForId
    await prisma.listing.update({
      where: { id: listing.id },
      data: { status: 'ACTIVE', reservedForId: null, reservedPrice: null, reservedAt: null },
    })
    if (buyerId) {
      const room = await prisma.chatRoom.findUnique({ where: { listingId_buyerId: { listingId: listing.id, buyerId } }, select: { id: true } })
      if (room) await postChatMessage({ roomId: room.id, senderId: req.userId!, type: 'SYSTEM', content: '판매자가 예약을 취소했어요. 상품이 다시 판매중으로 바뀌었습니다.' })
    }
    res.json({ message: '예약을 취소하고 판매중으로 변경했어요.' })
  } catch (err) {
    console.error('[cancelReservation]', err)
    fail(res, 500, '서버 오류가 발생했습니다.')
  }
}

const updateSchema = z.object({
  title: z.string().trim().max(60).nullable().optional(),
  description: z.string().max(3000).nullable().optional(),
  condition: z.enum(['MINT', 'NEAR_MINT', 'EXCELLENT', 'GOOD', 'LIGHT_PLAYED', 'PLAYED', 'POOR']).optional(),
  imageUrls: z.array(z.string().url()).max(10).optional(),
  buyNowPrice: z.number().int().min(1).optional(),
  minOfferPrice: z.number().int().min(1).optional(),
  shippingFee: z.number().int().min(0).max(100000).optional(),
  negotiable: z.boolean().optional(),
})

export async function updateListing(req: AuthRequest, res: Response) {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ message: '입력값을 확인해주세요.', errors: parsed.error.flatten() })
  try {
    const listing = await ownListing(req, res)
    if (!listing) return
    if (listing.status !== 'ACTIVE' && listing.status !== 'RESERVED') return fail(res, 400, '판매중인 상품만 수정할 수 있습니다.')
    const d = parsed.data
    if (listing.listingType === 'AUCTION' && listing._count.bids > 0 && (d.condition || d.shippingFee !== undefined)) {
      return fail(res, 400, '입찰이 시작된 경매는 상태·배송비를 바꿀 수 없습니다.')
    }
    const updated = await prisma.listing.update({
      where: { id: listing.id },
      data: {
        title: d.title === undefined ? undefined : (d.title || null),
        description: d.description === undefined ? undefined : (d.description || null),
        condition: d.condition,
        imageUrls: d.imageUrls,
        buyNowPrice: listing.listingType === 'BUY_NOW' ? d.buyNowPrice : undefined,
        minOfferPrice: listing.listingType === 'OFFER' ? d.minOfferPrice : undefined,
        shippingFee: d.shippingFee,
        negotiable: listing.listingType === 'BUY_NOW' ? d.negotiable : undefined,
      },
    })
    res.json(updated)
  } catch (err) {
    console.error('[updateListing]', err)
    fail(res, 500, '서버 오류가 발생했습니다.')
  }
}

// ── 구매자: 안전결제 (배송지 포함) ────────────────────────────────────────────

const addressSchema = z.object({
  recipientName: z.string().trim().min(1).max(30),
  recipientPhone: z.string().trim().regex(/^[0-9-]{9,20}$/),
  zipCode: z.string().trim().min(1).max(10),
  address: z.string().trim().min(1).max(200),
  addressDetail: z.string().trim().max(100).optional(),
  shippingMemo: z.string().trim().max(100).optional(),
})
const checkoutSchema = addressSchema.extend({ expectedTotal: z.number().int().optional() })

export async function checkoutListing(req: AuthRequest, res: Response) {
  const parsed = checkoutSchema.safeParse(req.body)
  if (!parsed.success) return fail(res, 400, '받는 분·연락처·주소를 확인해주세요.')
  const { expectedTotal, ...addr } = parsed.data
  const listingId = String(req.params['id'])

  try {
    const buyer = await prisma.user.findUnique({ where: { id: req.userId! }, select: { isSuspended: true, nickname: true } })
    if (buyer?.isSuspended) return fail(res, 403, '계정이 정지되어 구매할 수 없습니다.')
    const risk = await analyzeUserRisk(req.userId!)
    if (risk.risk === 'HIGH') {
      await issueWarning(req.userId!, `고위험 구매 시도: ${risk.reasons.join(', ')}`)
      return fail(res, 403, '계정 위험도가 높아 일시적으로 구매가 제한됩니다. 고객센터에 문의해 주세요.')
    }

    const listing = await prisma.listing.findUnique({ where: { id: listingId }, include: { card: { select: { name: true, nameKo: true } } } })
    if (!listing) return fail(res, 404, '상품을 찾을 수 없습니다.')
    const check = resolvePurchasePrice(listing, req.userId!)
    if (!check.ok) return fail(res, 400, check.message)
    const price = check.price
    const total = price + listing.shippingFee
    if (expectedTotal !== undefined && expectedTotal !== total) return fail(res, 409, '결제 금액이 변경되었습니다. 다시 확인해주세요.')

    const result = await prisma.$transaction(async (tx) => {
      const deducted = await tx.user.updateMany({ where: { id: req.userId!, balance: { gte: total } }, data: { balance: { decrement: total } } })
      if (deducted.count === 0) throw Object.assign(new Error('BALANCE'), { status: 400, message: '포인트가 부족합니다.' })

      // 판매중/예약중(나에게)인 경우만 판매완료로 — 동시 구매 방지
      const updated = await tx.listing.updateMany({
        where: { id: listing.id, OR: [{ status: 'ACTIVE' }, { status: 'RESERVED', reservedForId: req.userId! }] },
        data: { status: 'SOLD' },
      })
      if (updated.count === 0) throw Object.assign(new Error('SOLD'), { status: 409, message: '방금 다른 분이 구매했어요.' })

      const txRecord = await tx.transaction.create({
        data: {
          listingId: listing.id, buyerId: req.userId!, sellerId: listing.sellerId,
          finalPrice: price, shippingFee: listing.shippingFee, escrowStatus: 'HELD',
          shipClockAt: new Date(), // 배송지를 함께 받았으니 발송 기한 바로 시작
          ...addr, addressDetail: addr.addressDetail || null, shippingMemo: addr.shippingMemo || null,
        },
      })
      await tx.offer.updateMany({ where: { listingId: listing.id, status: 'PENDING' }, data: { status: 'DECLINED' } })
      await tx.inventoryItem.create({
        data: {
          userId: req.userId!, cardId: listing.cardId, quantity: listing.quantity,
          source: 'PURCHASE', sourceId: txRecord.id,
          condition: listing.condition, gradingCompany: listing.gradingCompany,
          gradingGrade: listing.gradingGrade, imageUrls: listing.imageUrls,
        },
      })
      const room = await tx.chatRoom.upsert({
        where: { listingId_buyerId: { listingId: listing.id, buyerId: req.userId! } },
        create: { listingId: listing.id, buyerId: req.userId!, sellerId: listing.sellerId, transactionId: txRecord.id },
        update: { transactionId: txRecord.id },
        select: { id: true },
      })
      return { transactionId: txRecord.id, roomId: room.id }
    })

    await postChatMessage({
      roomId: result.roomId, senderId: req.userId!, type: 'SYSTEM',
      content: `안전결제 완료 · ${P(total)}${listing.shippingFee ? ` (배송비 ${P(listing.shippingFee)} 포함)` : ''}\n판매자는 3일 안에 발송해주세요. 구매 확정 전까지 대금은 안전하게 보관됩니다.`,
    }).catch(e => console.error('[checkout chat]', e))
    notify({
      userId: listing.sellerId, type: 'PURCHASE_PAID', title: '상품이 판매되었어요',
      body: `${buyer?.nickname ?? '구매자'}님이 ${listingName(listing)}을(를) ${P(total)}에 안전결제했어요. 3일 안에 발송해주세요.`,
      link: `/chat/${result.roomId}`,
    }).catch(e => console.error('[notify PURCHASE_PAID]', e))

    res.status(201).json({ ...result, total })
  } catch (err) {
    const e = err as { status?: number; message?: string }
    if (e.status) return fail(res, e.status, e.message ?? '결제에 실패했습니다.')
    console.error('[checkoutListing]', err)
    fail(res, 500, '서버 오류가 발생했습니다.')
  }
}

// 경매 낙찰 등 배송지 없이 생성된 거래 — 발송 전까지 구매자가 입력/수정
export async function setTransactionAddress(req: AuthRequest, res: Response) {
  const parsed = addressSchema.safeParse(req.body)
  if (!parsed.success) return fail(res, 400, '받는 분·연락처·주소를 확인해주세요.')
  try {
    const tx = await prisma.transaction.findUnique({ where: { id: String(req.params['id']) }, select: { id: true, buyerId: true, sellerId: true, txStatus: true, shipClockAt: true } })
    if (!tx) return fail(res, 404, '거래를 찾을 수 없습니다.')
    if (tx.buyerId !== req.userId) return fail(res, 403, '구매자만 배송지를 입력할 수 있습니다.')
    if (tx.txStatus !== 'PENDING_SHIPMENT') return fail(res, 400, '발송 전에만 배송지를 바꿀 수 있습니다.')
    const a = parsed.data
    const first = !tx.shipClockAt
    // 처음 입력하는 순간부터 판매자 발송 기한 시작 (수정할 때는 기한 그대로)
    const r = await prisma.transaction.updateMany({
      where: { id: tx.id, txStatus: 'PENDING_SHIPMENT', escrowStatus: 'HELD' },
      data: { ...a, addressDetail: a.addressDetail || null, shippingMemo: a.shippingMemo || null, ...(first ? { shipClockAt: new Date() } : {}) },
    })
    if (r.count === 0) return fail(res, 409, '이미 취소되었거나 발송된 거래입니다.')
    const room = await prisma.chatRoom.findUnique({ where: { transactionId: tx.id }, select: { id: true } })
    if (room) await postChatMessage({ roomId: room.id, senderId: req.userId!, type: 'SYSTEM', content: first ? `구매자가 배송지를 입력했어요.\n판매자는 ${SHIP_DEADLINE_DAYS}일 안에 발송해주세요. 기한을 넘기면 자동 취소·환불돼요.` : '구매자가 배송지를 변경했어요. 발송 전에 꼭 확인해주세요.' })
    notify({ userId: tx.sellerId, type: 'SYSTEM', title: first ? '배송지가 입력되었어요 · 발송해주세요' : '구매자가 배송지를 변경했어요', body: first ? `${SHIP_DEADLINE_DAYS}일 안에 발송하지 않으면 자동 취소돼요.` : '발송 전에 바뀐 주소를 확인해주세요.', link: room ? `/chat/${room.id}` : '/my?tab=sales' }).catch(() => {})
    res.json({ message: '배송지를 저장했어요.' })
  } catch (err) {
    console.error('[setTransactionAddress]', err)
    fail(res, 500, '서버 오류가 발생했습니다.')
  }
}

// 최근 배송지 — 중고거래·샵 주문 중 가장 최근 것
export async function getMyLastAddress(req: AuthRequest, res: Response) {
  try {
    const pick = { recipientName: true, recipientPhone: true, zipCode: true, address: true, addressDetail: true, shippingMemo: true } as const
    const [tx, order] = await Promise.all([
      prisma.transaction.findFirst({ where: { buyerId: req.userId!, address: { not: null } }, orderBy: { completedAt: 'desc' }, select: { ...pick, completedAt: true } }),
      prisma.shopOrder.findFirst({ where: { userId: req.userId!, address: { not: null } }, orderBy: { createdAt: 'desc' }, select: { ...pick, createdAt: true } }),
    ])
    const latest = !tx ? order : !order ? tx : (tx.completedAt > order.createdAt ? tx : order)
    if (!latest) return res.json({ address: null })
    const { recipientName, recipientPhone, zipCode, address, addressDetail, shippingMemo } = latest
    res.json({ address: { recipientName, recipientPhone, zipCode, address, addressDetail, shippingMemo } })
  } catch (err) {
    console.error('[getMyLastAddress]', err)
    fail(res, 500, '서버 오류가 발생했습니다.')
  }
}

// ── 상점 · 팔로우 ─────────────────────────────────────────────────────────────

export async function getShop(req: AuthRequest, res: Response) {
  const userId = String(req.params['id'])
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, nickname: true, avatarUrl: true, shopIntro: true, avgRating: true, reviewCount: true, createdAt: true },
    })
    if (!user) return fail(res, 404, '상점을 찾을 수 없습니다.')
    const [selling, reserved, sold, completed, followers, following, isFollowing] = await Promise.all([
      prisma.listing.count({ where: { sellerId: userId, status: 'ACTIVE' } }),
      prisma.listing.count({ where: { sellerId: userId, status: 'RESERVED' } }),
      prisma.listing.count({ where: { sellerId: userId, status: 'SOLD' } }),
      prisma.transaction.count({ where: { sellerId: userId, txStatus: { in: ['COMPLETED', 'AUTO_COMPLETED'] } } }),
      prisma.follow.count({ where: { followingId: userId } }),
      prisma.follow.count({ where: { followerId: userId } }),
      req.userId ? prisma.follow.findUnique({ where: { followerId_followingId: { followerId: req.userId, followingId: userId } } }).then(Boolean) : false,
    ])
    res.json({ ...user, stats: { selling, reserved, sold, completed, followers, following }, isFollowing })
  } catch (err) {
    console.error('[getShop]', err)
    fail(res, 500, '서버 오류가 발생했습니다.')
  }
}

export async function toggleFollow(req: AuthRequest, res: Response) {
  const followingId = String(req.params['id'])
  if (followingId === req.userId) return fail(res, 400, '내 상점은 팔로우할 수 없습니다.')
  try {
    const target = await prisma.user.findUnique({ where: { id: followingId }, select: { id: true } })
    if (!target) return fail(res, 404, '상점을 찾을 수 없습니다.')
    const key = { followerId_followingId: { followerId: req.userId!, followingId } }
    const existing = await prisma.follow.findUnique({ where: key })
    if (existing) await prisma.follow.delete({ where: key })
    else await prisma.follow.create({ data: { followerId: req.userId!, followingId } })
    const followers = await prisma.follow.count({ where: { followingId } })
    res.json({ isFollowing: !existing, followers })
  } catch (err) {
    console.error('[toggleFollow]', err)
    fail(res, 500, '서버 오류가 발생했습니다.')
  }
}

export async function getFollows(req: AuthRequest, res: Response) {
  const userId = String(req.params['id'])
  const kind = req.path.endsWith('/followers') ? 'followers' : 'following'
  try {
    const rows = await prisma.follow.findMany({
      where: kind === 'followers' ? { followingId: userId } : { followerId: userId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        follower: kind === 'followers' ? { select: { id: true, nickname: true, avatarUrl: true, avgRating: true, reviewCount: true, _count: { select: { listings: { where: { status: 'ACTIVE' } }, followers: true } } } } : false,
        following: kind === 'following' ? { select: { id: true, nickname: true, avatarUrl: true, avgRating: true, reviewCount: true, _count: { select: { listings: { where: { status: 'ACTIVE' } }, followers: true } } } } : false,
      },
    })
    res.json(rows.map(r => r.follower ?? r.following))
  } catch (err) {
    console.error('[getFollows]', err)
    fail(res, 500, '서버 오류가 발생했습니다.')
  }
}

export async function updateMyShop(req: AuthRequest, res: Response) {
  const parsed = z.object({ shopIntro: z.string().max(300) }).safeParse(req.body)
  if (!parsed.success) return fail(res, 400, '상점 소개는 300자까지 쓸 수 있어요.')
  try {
    const u = await prisma.user.update({ where: { id: req.userId! }, data: { shopIntro: parsed.data.shopIntro.trim() || null }, select: { shopIntro: true } })
    res.json(u)
  } catch (err) {
    console.error('[updateMyShop]', err)
    fail(res, 500, '서버 오류가 발생했습니다.')
  }
}

// 새 상품 등록 시 팔로워에게 알림 (비동기)
export function notifyFollowersOfListing(sellerId: string, listingId: string, name: string, price: number | null | undefined) {
  ;(async () => {
    const [seller, followers] = await Promise.all([
      prisma.user.findUnique({ where: { id: sellerId }, select: { nickname: true } }),
      prisma.follow.findMany({ where: { followingId: sellerId }, select: { followerId: true }, take: 1000 }),
    ])
    await Promise.allSettled(followers.map(f => notify({
      userId: f.followerId, type: 'FOLLOWED_SHOP_LISTING',
      title: `${seller?.nickname ?? '팔로우한 상점'}님의 새 상품`,
      body: `${name}${price ? ` · ${P(price)}` : ''}`,
      link: `/listings/${listingId}`,
    })))
  })().catch(e => console.error('[notifyFollowersOfListing]', e))
}

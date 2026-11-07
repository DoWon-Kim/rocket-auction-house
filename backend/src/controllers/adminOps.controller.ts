// 관리자 관제실: 처리 대기 큐 · 실시간 활동 · 안전결제 거래 · 마켓 상품 모니터링
import { Response } from 'express'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { notify } from '../lib/notify'
import { txAmount } from '../lib/marketTrade'
import { removePurchasedItems } from '../lib/tradeCancel'
import { postChatMessage } from '../lib/chatTrade'
import { tradeFlags, pendingDeadline, autoConfirmAt, TRADE_FILTERS, SHIP_DEADLINE_DAYS, ADDRESS_DEADLINE_DAYS, kstDayStart, lastKstDays } from '../lib/adminOps'

const DAY = 86400_000
const P = (n: number) => `${n.toLocaleString()}P`
const fail = (res: Response, status: number, message: string) => { res.status(status).json({ message }) }
const nameOf = (l: { title: string | null; card: { name: string; nameKo: string | null } }) => l.title ?? l.card.nameKo ?? l.card.name

// ── 개요: 처리 대기 · 돈 흐름 · 오늘 · 실시간 활동 ─────────────────────────────

export async function getOpsOverview(_req: AuthRequest, res: Response) {
  try {
    const now = new Date()
    const today = kstDayStart(now) // 한국 자정 기준
    const overdueBefore = new Date(now.getTime() - SHIP_DEADLINE_DAYS * DAY)
    const dueSoonBefore = new Date(now.getTime() - (SHIP_DEADLINE_DAYS - 1) * DAY)

    const [
      shipOverdue, shipDueSoon, noAddress, confirmWaiting, disputes, reports, withdrawals, withdrawAmount,
      shopOrders, shippingRequests, reservedStale, suspended,
      escrow, balances,
      signups, newListings, paidToday, doneToday, shopToday, chargesToday, chatsToday, flaggedToday,
    ] = await Promise.all([
      prisma.transaction.count({ where: { txStatus: 'PENDING_SHIPMENT', shipClockAt: { lt: overdueBefore } } }),
      prisma.transaction.count({ where: { txStatus: 'PENDING_SHIPMENT', shipClockAt: { gte: overdueBefore, lt: dueSoonBefore } } }),
      prisma.transaction.count({ where: { txStatus: 'PENDING_SHIPMENT', address: null } }),
      prisma.transaction.count({ where: { txStatus: 'SHIPPED' } }),
      prisma.dispute.count({ where: { status: { in: ['OPEN', 'REVIEWING'] } } }),
      prisma.report.count({ where: { status: { in: ['PENDING', 'INVESTIGATING'] } } }),
      prisma.withdrawalRequest.count({ where: { status: { in: ['PENDING', 'APPROVED'] } } }),
      prisma.withdrawalRequest.aggregate({ where: { status: { in: ['PENDING', 'APPROVED'] } }, _sum: { amount: true } }),
      prisma.shopOrder.count({ where: { shippingStatus: { in: ['PENDING', 'PREPARING'] } } }),
      prisma.shippingRequest.count({ where: { status: { in: ['PENDING', 'PROCESSING'] } } }),
      prisma.listing.count({ where: { status: 'RESERVED', reservedAt: { lt: new Date(now.getTime() - 3 * DAY) } } }),
      prisma.listing.count({ where: { status: 'SUSPENDED' } }),
      prisma.transaction.aggregate({ where: { escrowStatus: 'HELD' }, _sum: { finalPrice: true, shippingFee: true }, _count: true }),
      prisma.user.aggregate({ _sum: { balance: true } }),
      prisma.user.count({ where: { createdAt: { gte: today } } }),
      prisma.listing.count({ where: { createdAt: { gte: today } } }),
      prisma.transaction.aggregate({ where: { completedAt: { gte: today } }, _count: true, _sum: { finalPrice: true, shippingFee: true } }),
      prisma.transaction.count({ where: { confirmedAt: { gte: today } } }),
      prisma.shopOrder.aggregate({ where: { createdAt: { gte: today } }, _count: true, _sum: { totalPrice: true } }),
      prisma.paymentLog.aggregate({ where: { createdAt: { gte: today }, status: 'SUCCESS' }, _count: true, _sum: { amount: true } }),
      prisma.chatMessage.count({ where: { createdAt: { gte: today } } }),
      prisma.chatMessage.count({ where: { createdAt: { gte: today }, flagged: true } }),
    ])

    const queue = [
      { key: 'ship_overdue', label: '발송 기한 초과', hint: '곧 자동 취소·환불돼요', count: shipOverdue, level: 'danger', link: '/admin/trades?flag=SHIP_OVERDUE' },
      { key: 'disputes', label: '진행중 분쟁', hint: '구매자·판매자 분쟁', count: disputes, level: 'danger', link: '/admin/disputes' },
      { key: 'reports', label: '미처리 신고', hint: '사기·위조 신고 등', count: reports, level: 'danger', link: '/admin/reports' },
      { key: 'ship_due', label: '발송 기한 임박', hint: '24시간 안에 자동 취소', count: shipDueSoon, level: 'warn', link: '/admin/trades?flag=SHIP_DUE_SOON' },
      { key: 'no_address', label: '배송지 미입력', hint: `경매 낙찰 후 ${ADDRESS_DEADLINE_DAYS}일 안에 입력 안 하면 자동 취소`, count: noAddress, level: 'warn', link: '/admin/trades?flag=NO_ADDRESS' },
      { key: 'withdrawals', label: '환전 신청', hint: withdrawAmount._sum.amount ? `${P(withdrawAmount._sum.amount)} 대기` : '송금 대기', count: withdrawals, level: 'warn', link: '/admin/withdrawal' },
      { key: 'shop_orders', label: '샵 주문 발송', hint: '결제 완료·포장중', count: shopOrders, level: 'info', link: '/admin/shop' },
      { key: 'shipping_requests', label: '보관함 배송 요청', hint: '오리파·구매 카드 실물 배송', count: shippingRequests, level: 'info', link: '/admin/shipping' },
      { key: 'confirm_waiting', label: '구매확정 대기', hint: '발송 3일 후 자동 확정', count: confirmWaiting, level: 'info', link: '/admin/trades?filter=shipped' },
      { key: 'reserved_stale', label: '3일 넘은 예약', hint: '결제 없이 오래 묶인 상품', count: reservedStale, level: 'info', link: '/admin/trades?tab=listings&status=RESERVED' },
      { key: 'suspended', label: '숨김 처리된 상품', hint: '신고 누적·관리자 숨김', count: suspended, level: 'info', link: '/admin/trades?tab=listings&status=SUSPENDED' },
    ]

    res.json({
      queue,
      money: {
        escrowHeld: (escrow._sum.finalPrice ?? 0) + (escrow._sum.shippingFee ?? 0),
        escrowCount: escrow._count,
        totalBalance: balances._sum.balance ?? 0,
        pendingWithdrawAmount: withdrawAmount._sum.amount ?? 0,
      },
      today: {
        signups, newListings,
        paidCount: paidToday._count, paidAmount: (paidToday._sum.finalPrice ?? 0) + (paidToday._sum.shippingFee ?? 0),
        doneCount: doneToday,
        shopCount: shopToday._count, shopAmount: shopToday._sum.totalPrice ?? 0,
        chargeCount: chargesToday._count, chargeAmount: chargesToday._sum.amount ?? 0,
        chats: chatsToday, flaggedChats: flaggedToday,
      },
      totals: await buildTotals(),
      trend: await buildTrend(14),
      feed: await buildFeed(),
      generatedAt: now,
    })
  } catch (err) {
    console.error('[getOpsOverview]', err)
    fail(res, 500, '서버 오류가 발생했습니다.')
  }
}

// 누적 규모
async function buildTotals() {
  const [users, selling, reserved, trades, completed, shopItems] = await Promise.all([
    prisma.user.count(),
    prisma.listing.count({ where: { status: 'ACTIVE' } }),
    prisma.listing.count({ where: { status: 'RESERVED' } }),
    prisma.transaction.count(),
    prisma.transaction.count({ where: { txStatus: { in: ['COMPLETED', 'AUTO_COMPLETED'] } } }),
    prisma.shopItem.count({ where: { isActive: true } }),
  ])
  return { users, selling, reserved, trades, completed, shopItems }
}

// 최근 N일 일별 추이 (한국 날짜 기준) — 안전결제·샵 매출·가입·충전
async function buildTrend(days: number) {
  const since = new Date(kstDayStart().getTime() - (days - 1) * DAY)
  type Row = { day: string; count: bigint; amount: bigint | null }
  const kst = (col: string) => Prisma.raw(`to_char("${col}" + interval '9 hours', 'YYYY-MM-DD')`)
  const [trades, shop, signups, charges] = await Promise.all([
    prisma.$queryRaw<Row[]>`SELECT ${kst('completedAt')} AS day, COUNT(*) AS count, SUM("finalPrice" + "shippingFee") AS amount FROM "Transaction" WHERE "completedAt" >= ${since} GROUP BY 1`,
    prisma.$queryRaw<Row[]>`SELECT ${kst('createdAt')} AS day, COUNT(*) AS count, SUM("totalPrice") AS amount FROM "ShopOrder" WHERE "createdAt" >= ${since} GROUP BY 1`,
    prisma.$queryRaw<Row[]>`SELECT ${kst('createdAt')} AS day, COUNT(*) AS count, NULL::bigint AS amount FROM "User" WHERE "createdAt" >= ${since} GROUP BY 1`,
    prisma.$queryRaw<Row[]>`SELECT ${kst('createdAt')} AS day, COUNT(*) AS count, SUM("amount") AS amount FROM "PaymentLog" WHERE "createdAt" >= ${since} AND "status" = 'SUCCESS' GROUP BY 1`,
  ])
  const idx = (rows: Row[]) => new Map(rows.map(r => [r.day, { count: Number(r.count), amount: Number(r.amount ?? 0) }]))
  const [t, s, u, c] = [idx(trades), idx(shop), idx(signups), idx(charges)]
  return lastKstDays(days).map(day => ({
    date: day,
    trades: t.get(day)?.count ?? 0, tradeAmount: t.get(day)?.amount ?? 0,
    shopOrders: s.get(day)?.count ?? 0, shopAmount: s.get(day)?.amount ?? 0,
    signups: u.get(day)?.count ?? 0,
    charges: c.get(day)?.amount ?? 0,
  }))
}

type FeedItem = { type: string; at: Date; title: string; sub?: string; link?: string }

// 여러 테이블의 최근 이벤트를 시간순으로 합친 활동 로그
async function buildFeed(): Promise<FeedItem[]> {
  const T = 12
  const user = { select: { nickname: true } }
  const listingSel = { select: { id: true, title: true, card: { select: { name: true, nameKo: true } } } }
  const [signups, listings, paid, shipped, confirmed, shop, reports, withdrawals, disputes, charges, offers] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: 'desc' }, take: T, select: { id: true, nickname: true, createdAt: true } }),
    prisma.listing.findMany({ orderBy: { createdAt: 'desc' }, take: T, select: { id: true, title: true, createdAt: true, listingType: true, buyNowPrice: true, minOfferPrice: true, startingPrice: true, seller: user, card: { select: { name: true, nameKo: true } } } }),
    prisma.transaction.findMany({ orderBy: { completedAt: 'desc' }, take: T, select: { id: true, completedAt: true, finalPrice: true, shippingFee: true, buyer: user, seller: user, listing: listingSel } }),
    prisma.transaction.findMany({ where: { shippedAt: { not: null } }, orderBy: { shippedAt: 'desc' }, take: T, select: { id: true, shippedAt: true, trackingCarrier: true, seller: user, listing: listingSel } }),
    prisma.transaction.findMany({ where: { escrowReleasedAt: { not: null } }, orderBy: { escrowReleasedAt: 'desc' }, take: T, select: { id: true, escrowReleasedAt: true, txStatus: true, finalPrice: true, shippingFee: true, seller: user, listing: listingSel } }),
    prisma.shopOrder.findMany({ orderBy: { createdAt: 'desc' }, take: T, select: { id: true, createdAt: true, quantity: true, totalPrice: true, user, shopItem: { select: { name: true } } } }),
    prisma.report.findMany({ orderBy: { createdAt: 'desc' }, take: T, select: { id: true, createdAt: true, reason: true, reporter: user, reportedUser: user } }),
    prisma.withdrawalRequest.findMany({ orderBy: { createdAt: 'desc' }, take: T, select: { id: true, createdAt: true, amount: true, user } }),
    prisma.dispute.findMany({ orderBy: { createdAt: 'desc' }, take: T, select: { id: true, createdAt: true, transactionId: true, buyer: user, seller: user } }),
    prisma.paymentLog.findMany({ where: { status: 'SUCCESS' }, orderBy: { createdAt: 'desc' }, take: T, select: { id: true, createdAt: true, amount: true, userId: true } }),
    prisma.offer.findMany({ orderBy: { createdAt: 'desc' }, take: T, select: { id: true, createdAt: true, amount: true, buyer: user, listing: { select: { id: true, title: true, card: { select: { name: true, nameKo: true } }, seller: user } } } }),
  ])
  const payers = new Map((await prisma.user.findMany({ where: { id: { in: charges.map(c => c.userId) } }, select: { id: true, nickname: true } })).map(u => [u.id, u.nickname]))
  const listPrice = (l: { buyNowPrice: number | null; minOfferPrice: number | null; startingPrice: number | null }) => l.buyNowPrice ?? l.minOfferPrice ?? l.startingPrice

  const items: FeedItem[] = [
    ...signups.map(u => ({ type: 'signup', at: u.createdAt, title: `${u.nickname} 가입`, link: `/users/${u.id}` })),
    ...listings.map(l => ({ type: 'listing', at: l.createdAt, title: `${l.seller.nickname}님 상품 등록`, sub: `${nameOf(l)}${listPrice(l) ? ` · ${P(listPrice(l)!)}` : ''}`, link: `/listings/${l.id}` })),
    ...paid.map(t => ({ type: 'paid', at: t.completedAt, title: `안전결제 ${P(t.finalPrice + t.shippingFee)}`, sub: `${t.buyer.nickname} → ${t.seller.nickname} · ${nameOf(t.listing)}`, link: `/admin/trades?id=${t.id}` })),
    ...shipped.map(t => ({ type: 'shipped', at: t.shippedAt!, title: `${t.seller.nickname}님 발송`, sub: `${nameOf(t.listing)} · ${t.trackingCarrier ?? ''}`, link: `/admin/trades?id=${t.id}` })),
    ...confirmed.map(t => ({ type: t.txStatus === 'AUTO_COMPLETED' ? 'auto_confirmed' : 'confirmed', at: t.escrowReleasedAt!, title: `${t.txStatus === 'AUTO_COMPLETED' ? '자동 ' : ''}구매확정 · ${P(t.finalPrice + t.shippingFee)} 정산`, sub: `${t.seller.nickname} · ${nameOf(t.listing)}`, link: `/admin/trades?id=${t.id}` })),
    ...shop.map(o => ({ type: 'shop_order', at: o.createdAt, title: `샵 주문 ${P(o.totalPrice)}`, sub: `${o.user.nickname} · ${o.shopItem.name} ×${o.quantity}`, link: '/admin/shop' })),
    ...reports.map(r => ({ type: 'report', at: r.createdAt, title: `신고 접수`, sub: `${r.reporter.nickname} → ${r.reportedUser.nickname} (${r.reason})`, link: '/admin/reports' })),
    ...withdrawals.map(w => ({ type: 'withdrawal', at: w.createdAt, title: `환전 신청 ${P(w.amount)}`, sub: w.user.nickname, link: '/admin/withdrawal' })),
    ...disputes.map(d => ({ type: 'dispute', at: d.createdAt, title: '분쟁 접수', sub: `${d.buyer.nickname} ↔ ${d.seller.nickname}`, link: `/admin/trades?id=${d.transactionId}` })),
    ...offers.map(o => ({ type: 'offer', at: o.createdAt, title: `가격 제안 ${P(o.amount)}`, sub: `${o.buyer.nickname} → ${o.listing.seller.nickname} · ${nameOf(o.listing)}`, link: `/listings/${o.listing.id}` })),
    ...charges.map(c => ({ type: 'charge', at: c.createdAt, title: `포인트 충전 ${P(c.amount)}`, sub: payers.get(c.userId) ?? '' })),
  ]
  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 60)
}

// ── 안전결제 거래 ─────────────────────────────────────────────────────────────

const TRADE_INCLUDE = {
  listing: { select: { id: true, title: true, imageUrls: true, listingType: true, card: { select: { name: true, nameKo: true, imageUrl: true } } } },
  buyer: { select: { id: true, nickname: true } },
  seller: { select: { id: true, nickname: true } },
  chatRoom: { select: { id: true } },
  dispute: { select: { id: true, status: true } },
} satisfies Prisma.TransactionInclude

function withSignals<T extends { txStatus: string; completedAt: Date; shipClockAt: Date | null; shippedAt: Date | null; address: string | null; disputeStatus: string | null; finalPrice: number; shippingFee: number }>(t: T) {
  const due = pendingDeadline(t)
  return {
    ...t,
    total: txAmount(t),
    flags: tradeFlags(t),
    shipDeadline: due?.kind === 'SHIP' ? due.at : null,
    addressDeadline: due?.kind === 'ADDRESS' ? due.at : null,
    autoConfirmAt: t.txStatus === 'SHIPPED' && t.shippedAt ? autoConfirmAt(t.shippedAt) : null,
  }
}

export async function listTrades(req: AuthRequest, res: Response) {
  try {
    const filter = String(req.query.filter ?? '')
    const flag = String(req.query.flag ?? '')
    const q = String(req.query.q ?? '').trim()
    const page = Math.max(1, Number(req.query.page) || 1)
    const limit = 30
    const now = Date.now()

    const where: Prisma.TransactionWhereInput = {}
    if (TRADE_FILTERS[filter]) where.txStatus = { in: TRADE_FILTERS[filter] as Prisma.EnumTxStatusFilter['in'] }
    if (flag === 'SHIP_OVERDUE') Object.assign(where, { txStatus: 'PENDING_SHIPMENT', shipClockAt: { lt: new Date(now - SHIP_DEADLINE_DAYS * DAY) } })
    if (flag === 'SHIP_DUE_SOON') Object.assign(where, { txStatus: 'PENDING_SHIPMENT', shipClockAt: { gte: new Date(now - SHIP_DEADLINE_DAYS * DAY), lt: new Date(now - (SHIP_DEADLINE_DAYS - 1) * DAY) } })
    if (flag === 'NO_ADDRESS') Object.assign(where, { txStatus: 'PENDING_SHIPMENT', address: null })
    if (q) {
      where.OR = [
        { id: { startsWith: q } },
        { trackingNumber: { contains: q } },
        { recipientName: { contains: q } },
        { buyer: { nickname: { contains: q, mode: 'insensitive' } } },
        { seller: { nickname: { contains: q, mode: 'insensitive' } } },
        { listing: { title: { contains: q, mode: 'insensitive' } } },
        { listing: { card: { OR: [{ name: { contains: q, mode: 'insensitive' } }, { nameKo: { contains: q, mode: 'insensitive' } }] } } },
      ]
    }

    const [rows, total, groups] = await Promise.all([
      prisma.transaction.findMany({ where, include: TRADE_INCLUDE, orderBy: { completedAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      prisma.transaction.count({ where }),
      prisma.transaction.groupBy({ by: ['txStatus'], _count: true }),
    ])
    const byStatus = Object.fromEntries(groups.map(g => [g.txStatus, g._count]))
    const counts = Object.fromEntries(Object.entries(TRADE_FILTERS).map(([k, ss]) => [k, ss.reduce((n, s) => n + (byStatus[s] ?? 0), 0)]))
    counts.all = groups.reduce((n, g) => n + g._count, 0)

    res.json({ trades: rows.map(withSignals), total, page, limit, counts })
  } catch (err) {
    console.error('[listTrades]', err)
    fail(res, 500, '서버 오류가 발생했습니다.')
  }
}

export async function getTrade(req: AuthRequest, res: Response) {
  try {
    const tx = await prisma.transaction.findUnique({
      where: { id: String(req.params['id']) },
      include: {
        listing: { include: { card: { select: { id: true, name: true, nameKo: true, imageUrl: true, setName: true } } } },
        buyer: { select: { id: true, nickname: true, email: true, balance: true, warningCount: true, isSuspended: true, createdAt: true, avgRating: true, reviewCount: true } },
        seller: { select: { id: true, nickname: true, email: true, balance: true, warningCount: true, isSuspended: true, createdAt: true, avgRating: true, reviewCount: true } },
        chatRoom: { select: { id: true, messages: { orderBy: { createdAt: 'asc' }, take: 500, select: { id: true, content: true, type: true, createdAt: true, readAt: true, imageUrls: true, flagged: true, deletedAt: true, sender: { select: { id: true, nickname: true } } } } } },
        dispute: true,
        reports: { select: { id: true, reason: true, detail: true, status: true, createdAt: true, reporter: { select: { nickname: true } } } },
        reviews: { select: { id: true, rating: true, comment: true, role: true, createdAt: true, reviewer: { select: { nickname: true } } } },
      },
    })
    if (!tx) return fail(res, 404, '거래를 찾을 수 없습니다.')

    const [offers, buyerStats, sellerStats] = await Promise.all([
      prisma.offer.findMany({ where: { listingId: tx.listingId, buyerId: tx.buyerId }, orderBy: { createdAt: 'asc' }, select: { id: true, amount: true, status: true, createdAt: true } }),
      userTradeStats(tx.buyerId),
      userTradeStats(tx.sellerId),
    ])

    const timeline = [
      { at: tx.listing.createdAt, label: '상품 등록' },
      ...offers.map(o => ({ at: o.createdAt, label: `가격 제안 ${P(o.amount)} (${o.status})` })),
      ...(tx.listing.reservedAt ? [{ at: tx.listing.reservedAt, label: '예약' }] : []),
      { at: tx.completedAt, label: `안전결제 ${P(txAmount(tx))}` },
      ...(tx.shippedAt ? [{ at: tx.shippedAt, label: `발송 · ${tx.trackingCarrier ?? ''} ${tx.trackingNumber ?? ''}` }] : []),
      ...(tx.disputedAt ? [{ at: tx.disputedAt, label: '분쟁 접수' }] : []),
      ...(tx.escrowReleasedAt ? [{ at: tx.escrowReleasedAt, label: tx.escrowStatus === 'AUTO_RELEASED' ? '자동 구매확정 · 정산' : '구매확정 · 정산' }] : []),
      ...(tx.escrowStatus === 'REFUNDED' ? [{ at: null, label: '환불 처리' }] : []),
    ].sort((a, b) => (a.at && b.at ? new Date(a.at).getTime() - new Date(b.at).getTime() : a.at ? -1 : 1))

    res.json({ ...withSignals(tx), offers, timeline, buyerStats, sellerStats })
  } catch (err) {
    console.error('[getTrade]', err)
    fail(res, 500, '서버 오류가 발생했습니다.')
  }
}

async function userTradeStats(userId: string) {
  const [bought, sold, cancelled, reported] = await Promise.all([
    prisma.transaction.count({ where: { buyerId: userId } }),
    prisma.transaction.count({ where: { sellerId: userId, txStatus: { in: ['COMPLETED', 'AUTO_COMPLETED'] } } }),
    prisma.transaction.count({ where: { sellerId: userId, txStatus: { in: ['CANCELLED', 'AUTO_CANCELLED'] } } }),
    prisma.report.count({ where: { reportedUserId: userId } }),
  ])
  return { bought, sold, cancelled, reported }
}

// 운영자 안내 메시지 — 거래 채팅방에 남김 (분쟁 중재·발송 독촉 등)
export async function postTradeNotice(req: AuthRequest, res: Response) {
  const parsed = z.object({ content: z.string().trim().min(1).max(500) }).safeParse(req.body)
  if (!parsed.success) return fail(res, 400, '안내 내용을 입력해주세요.')
  try {
    const tx = await prisma.transaction.findUnique({ where: { id: String(req.params['id']) }, select: { id: true, buyerId: true, sellerId: true, chatRoom: { select: { id: true } } } })
    if (!tx) return fail(res, 404, '거래를 찾을 수 없습니다.')
    if (!tx.chatRoom) return fail(res, 400, '이 거래에는 채팅방이 없습니다.')
    await postChatMessage({ roomId: tx.chatRoom.id, senderId: req.userId!, type: 'SYSTEM', content: `[운영자 안내] ${parsed.data.content}` })
    await Promise.allSettled([tx.buyerId, tx.sellerId].map(userId => notify({ userId, type: 'SYSTEM', title: '거래에 운영자 안내가 도착했어요', body: parsed.data.content.slice(0, 80), link: `/chat/${tx.chatRoom!.id}` })))
    res.json({ message: '안내를 보냈어요.' })
  } catch (err) {
    console.error('[postTradeNotice]', err)
    fail(res, 500, '서버 오류가 발생했습니다.')
  }
}

// 관리자 환불: 보관 중인 대금을 구매자에게 돌려주고 거래 취소 (최종 관리자)
export async function refundTrade(req: AuthRequest, res: Response) {
  const parsed = z.object({ reason: z.string().trim().min(2).max(300) }).safeParse(req.body)
  if (!parsed.success) return fail(res, 400, '환불 사유를 입력해주세요.')
  try {
    const tx = await prisma.transaction.findUnique({ where: { id: String(req.params['id']) }, select: { id: true, buyerId: true, sellerId: true, finalPrice: true, shippingFee: true, escrowStatus: true } })
    if (!tx) return fail(res, 404, '거래를 찾을 수 없습니다.')
    const amount = txAmount(tx)
    const done = await prisma.$transaction(async t => {
      const r = await t.transaction.updateMany({ where: { id: tx.id, escrowStatus: 'HELD' }, data: { txStatus: 'CANCELLED', escrowStatus: 'REFUNDED' } })
      if (r.count === 0) return false
      await t.user.update({ where: { id: tx.buyerId }, data: { balance: { increment: amount } } })
      await removePurchasedItems(t, tx.id)
      return true
    })
    if (!done) return fail(res, 409, '보관 중인 대금이 없는 거래입니다. (이미 정산·환불됨)')

    const room = await prisma.chatRoom.findUnique({ where: { transactionId: tx.id }, select: { id: true } })
    if (room) await postChatMessage({ roomId: room.id, senderId: req.userId!, type: 'SYSTEM', content: `[운영자] 거래가 취소되고 구매자에게 ${P(amount)}가 환불되었습니다.\n사유: ${parsed.data.reason}` }).catch(() => {})
    await Promise.allSettled([
      notify({ userId: tx.buyerId, type: 'SYSTEM', title: '거래가 환불 처리되었어요', body: `${P(amount)}가 잔액으로 돌아왔어요. 사유: ${parsed.data.reason}`, link: room ? `/chat/${room.id}` : undefined }),
      notify({ userId: tx.sellerId, type: 'SYSTEM', title: '거래가 운영자에 의해 취소되었어요', body: `사유: ${parsed.data.reason}`, link: room ? `/chat/${room.id}` : undefined }),
    ])
    console.log(`[admin refund] tx=${tx.id} by=${req.userId} amount=${amount} reason=${parsed.data.reason}`)
    res.json({ message: `구매자에게 ${P(amount)}를 환불했어요.` })
  } catch (err) {
    console.error('[refundTrade]', err)
    fail(res, 500, '서버 오류가 발생했습니다.')
  }
}

// ── 마켓 상품 모니터링 ───────────────────────────────────────────────────────

export async function listMarketListings(req: AuthRequest, res: Response) {
  try {
    const status = String(req.query.status ?? '')
    const q = String(req.query.q ?? '').trim()
    const page = Math.max(1, Number(req.query.page) || 1)
    const limit = 40
    const where: Prisma.ListingWhereInput = {}
    if (['ACTIVE', 'RESERVED', 'SOLD', 'CANCELLED', 'EXPIRED', 'SUSPENDED'].includes(status)) where.status = status as Prisma.EnumListingStatusFilter['equals']
    if (q) where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { seller: { nickname: { contains: q, mode: 'insensitive' } } },
      { card: { OR: [{ name: { contains: q, mode: 'insensitive' } }, { nameKo: { contains: q, mode: 'insensitive' } }] } },
    ]
    const [rows, total, groups] = await Promise.all([
      prisma.listing.findMany({
        where, orderBy: { bumpedAt: 'desc' }, skip: (page - 1) * limit, take: limit,
        select: {
          id: true, title: true, status: true, listingType: true, buyNowPrice: true, minOfferPrice: true, currentPrice: true, startingPrice: true,
          shippingFee: true, imageUrls: true, likeCount: true, viewCount: true, createdAt: true, bumpedAt: true, reservedAt: true, reservedPrice: true,
          card: { select: { name: true, nameKo: true, imageUrl: true } },
          seller: { select: { id: true, nickname: true } },
          reservedFor: { select: { id: true, nickname: true } },
          _count: { select: { chatRooms: true, offers: true, reports: true, bids: true } },
        },
      }),
      prisma.listing.count({ where }),
      prisma.listing.groupBy({ by: ['status'], _count: true }),
    ])
    res.json({ listings: rows, total, page, limit, counts: Object.fromEntries(groups.map(g => [g.status, g._count])) })
  } catch (err) {
    console.error('[listMarketListings]', err)
    fail(res, 500, '서버 오류가 발생했습니다.')
  }
}

// 상품 숨김/복구 — 숨김 시 예약·대기 제안 정리 후 판매자에게 알림
export async function moderateListing(req: AuthRequest, res: Response) {
  const parsed = z.object({ action: z.enum(['suspend', 'restore']), reason: z.string().trim().max(200).optional() }).safeParse(req.body)
  if (!parsed.success) return fail(res, 400, '잘못된 요청입니다.')
  try {
    const listing = await prisma.listing.findUnique({ where: { id: String(req.params['id']) }, include: { card: { select: { name: true, nameKo: true } } } })
    if (!listing) return fail(res, 404, '상품을 찾을 수 없습니다.')
    if (parsed.data.action === 'suspend') {
      if (listing.status !== 'ACTIVE' && listing.status !== 'RESERVED') return fail(res, 400, '판매중·예약중 상품만 숨길 수 있어요.')
      await prisma.$transaction([
        prisma.listing.update({ where: { id: listing.id }, data: { status: 'SUSPENDED', reservedForId: null, reservedPrice: null, reservedAt: null } }),
        prisma.offer.updateMany({ where: { listingId: listing.id, status: 'PENDING' }, data: { status: 'DECLINED' } }),
      ])
      notify({ userId: listing.sellerId, type: 'SYSTEM', title: '상품이 운영 정책에 따라 숨김 처리되었어요', body: `${nameOf(listing)}${parsed.data.reason ? ` — ${parsed.data.reason}` : ''}`, link: `/listings/${listing.id}` }).catch(() => {})
      return res.json({ message: '상품을 숨겼어요.' })
    }
    if (listing.status !== 'SUSPENDED') return fail(res, 400, '숨김 상태가 아닌 상품입니다.')
    await prisma.listing.update({ where: { id: listing.id }, data: { status: 'ACTIVE' } })
    res.json({ message: '상품을 다시 판매중으로 복구했어요.' })
  } catch (err) {
    console.error('[moderateListing]', err)
    fail(res, 500, '서버 오류가 발생했습니다.')
  }
}

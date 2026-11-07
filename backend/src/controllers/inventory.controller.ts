import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'

const CARD_SELECT = {
  id: true, name: true, tcgType: true, rarity: true, setName: true, imageUrl: true,
}

type RawOripa = {
  id: string
  cardId: string
  quantity: number
  source: string
  createdAt: Date
  imageUrls: string[]
  exchangeValue: number | null
  card: { id: string; name: string; tcgType: string; rarity: string; setName: string; imageUrl: string | null }
}

// 동일 카드 묶기: id 목록과 합산 수량 반환
function groupOripaByCard(items: RawOripa[]) {
  const map = new Map<string, RawOripa & { ids: string[]; exchangeTotal: number; exchangeIds: string[] }>()
  for (const item of items) {
    const g = map.get(item.cardId)
    if (g) {
      g.quantity += item.quantity
      g.ids.push(item.id)
      if (item.exchangeValue) { g.exchangeTotal += item.exchangeValue; g.exchangeIds.push(item.id) }
      if (item.createdAt > g.createdAt) g.createdAt = item.createdAt
    } else {
      map.set(item.cardId, { ...item, ids: [item.id], exchangeTotal: item.exchangeValue ?? 0, exchangeIds: item.exchangeValue ? [item.id] : [] })
    }
  }
  return [...map.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
}

export async function getInventory(req: AuthRequest, res: Response) {
  const page  = Math.max(1, Number(req.query.page  ?? 1))
  const limit = Math.min(50, Number(req.query.limit ?? 20))
  const source = req.query.source as string | undefined

  try {
    // ── 오리파 필터: cardId 기준으로 묶어서 반환 ───────────────────────────
    if (source === 'ORIPA') {
      const raw = await prisma.inventoryItem.findMany({
        where: { userId: req.userId!, source: 'ORIPA' },
        select: { id: true, cardId: true, quantity: true, source: true, createdAt: true, imageUrls: true, exchangeValue: true, card: { select: CARD_SELECT } },
        orderBy: { createdAt: 'desc' },
      })
      const grouped = groupOripaByCard(raw)
      const total = grouped.length
      const items = grouped.slice((page - 1) * limit, page * limit)
      return res.json({ items, total, page, limit })
    }

    // ── 전체(all): 오리파는 그룹, 구매는 개별 ─────────────────────────────
    if (!source) {
      const [oripaRaw, purchaseItems, purchaseTotal] = await Promise.all([
        prisma.inventoryItem.findMany({
          where: { userId: req.userId!, source: 'ORIPA' },
          select: { id: true, cardId: true, quantity: true, source: true, createdAt: true, imageUrls: true, exchangeValue: true, card: { select: CARD_SELECT } },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.inventoryItem.findMany({
          where: { userId: req.userId!, source: 'PURCHASE' },
          include: { card: { select: CARD_SELECT } },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.inventoryItem.count({ where: { userId: req.userId!, source: 'PURCHASE' } }),
      ])
      const groupedOripa = groupOripaByCard(oripaRaw)
      const merged = [...groupedOripa, ...purchaseItems].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      const total = groupedOripa.length + purchaseTotal
      const items = merged.slice((page - 1) * limit, page * limit)
      return res.json({ items, total, page, limit })
    }

    // ── 구매(PURCHASE): 개별 아이템 ──────────────────────────────────────
    const where = { userId: req.userId!, source: 'PURCHASE' as const }
    const [items, total] = await Promise.all([
      prisma.inventoryItem.findMany({
        where,
        include: { card: { select: CARD_SELECT } },
        orderBy: { createdAt: 'desc' },
        skip:  (page - 1) * limit,
        take:  limit,
      }),
      prisma.inventoryItem.count({ where }),
    ])
    res.json({ items, total, page, limit })
  } catch (err) {
    console.error('[getInventory]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

export async function deleteInventoryItem(req: AuthRequest, res: Response) {
  try {
    const item = await prisma.inventoryItem.findUnique({
      where: { id: String(req.params['id']) },
      include: {
        shippingItems: {
          include: { shippingRequest: { select: { status: true } } },
        },
      },
    })
    if (!item || item.userId !== req.userId) {
      res.status(403).json({ message: '권한이 없습니다.' })
      return
    }
    const hasActiveShipping = item.shippingItems.some(
      (si) => !['CANCELLED', 'DELIVERED'].includes(si.shippingRequest.status),
    )
    if (hasActiveShipping) {
      res.status(400).json({ message: '배송이 진행 중인 아이템은 삭제할 수 없습니다.' })
      return
    }
    await prisma.inventoryItem.delete({ where: { id: item.id } })
    res.json({ message: '삭제되었습니다.' })
  } catch (err) {
    console.error('[deleteInventoryItem]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// 오리파 카드 → 포인트 교환 (배송 신청하지 않은 카드만)
export async function exchangeInventoryItems(req: AuthRequest, res: Response) {
  const ids = Array.isArray(req.body?.ids) ? (req.body.ids as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 200) : []
  if (ids.length === 0) { res.status(400).json({ message: '교환할 카드를 선택해주세요.' }); return }
  try {
    const result = await prisma.$transaction(async tx => {
      const items = await tx.inventoryItem.findMany({
        where: { id: { in: ids }, userId: req.userId!, source: 'ORIPA', exchangeValue: { gt: 0 }, shippingItems: { none: {} } },
        select: { id: true, exchangeValue: true },
      })
      if (items.length === 0) return { count: 0, total: 0 }
      const del = await tx.inventoryItem.deleteMany({ where: { id: { in: items.map(i => i.id) }, userId: req.userId! } })
      if (del.count !== items.length) throw new Error('EXCHANGE_RACE')
      const total = items.reduce((s, i) => s + (i.exchangeValue ?? 0), 0)
      await tx.user.update({ where: { id: req.userId! }, data: { balance: { increment: total } } })
      return { count: items.length, total }
    })
    if (result.count === 0) { res.status(400).json({ message: '교환할 수 있는 카드가 없어요. (배송 신청한 카드는 교환 불가)' }); return }
    const me = await prisma.user.findUnique({ where: { id: req.userId! }, select: { balance: true } })
    res.json({ ...result, balance: me?.balance, message: `${result.count}장을 ${result.total.toLocaleString()}P로 교환했어요.` })
  } catch (err) {
    console.error('[exchangeInventoryItems]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

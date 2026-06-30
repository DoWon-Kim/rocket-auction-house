import { Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'

// ── 내 위시리스트 목록 ────────────────────────────────────────────────────────

export async function getMyWishlist(req: AuthRequest, res: Response) {
  try {
    const items = await prisma.wishlist.findMany({
      where: { userId: req.userId! },
      include: {
        card: {
          select: {
            id: true, name: true, nameKo: true, tcgType: true,
            setName: true, rarity: true, imageUrl: true,
            _count: { select: { listings: { where: { status: 'ACTIVE' } } } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    if (items.length === 0) { res.json([]); return }

    // N+1 방지: 모든 카드 ID에 대한 활성 리스팅 가격을 한 번에 조회
    const cardIds = items.map(i => i.cardId)
    const priceRows = await prisma.listing.findMany({
      where: {
        cardId: { in: cardIds },
        status: 'ACTIVE',
        OR: [
          { listingType: 'BUY_NOW', buyNowPrice: { not: null } },
          { listingType: 'OFFER',   minOfferPrice: { not: null } },
        ],
      },
      select: { cardId: true, buyNowPrice: true, minOfferPrice: true },
    })

    // 카드별 buyNowPrice / minOfferPrice 중 실제 최솟값 계산
    const lowestByCard = new Map<string, number>()
    for (const row of priceRows) {
      const price = Math.min(
        row.buyNowPrice  ?? Infinity,
        row.minOfferPrice ?? Infinity,
      )
      if (price !== Infinity) {
        const cur = lowestByCard.get(row.cardId) ?? Infinity
        if (price < cur) lowestByCard.set(row.cardId, price)
      }
    }

    const enriched = items.map(item => {
      const currentLowest = lowestByCard.get(item.cardId) ?? null
      const isBelowTarget = item.targetPrice != null && currentLowest != null
        ? currentLowest <= item.targetPrice
        : false
      return { ...item, currentLowest, isBelowTarget }
    })

    res.json(enriched)
  } catch (err) {
    console.error('[getMyWishlist]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// ── 위시리스트 상태 확인 (카드 하나) ─────────────────────────────────────────

export async function getWishlistStatus(req: AuthRequest, res: Response) {
  const cardId = String(req.params['cardId'])
  try {
    const item = await prisma.wishlist.findUnique({
      where: { userId_cardId: { userId: req.userId!, cardId } },
      select: { id: true, targetPrice: true },
    })
    res.json(item ?? null)
  } catch (err) {
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// ── 위시리스트 추가/업데이트 ──────────────────────────────────────────────────

const upsertSchema = z.object({
  cardId:      z.string().min(1).optional(),  // PATCH는 URL param, POST는 body
  targetPrice: z.number().int().positive().optional().nullable(),
})

export async function upsertWishlist(req: AuthRequest, res: Response) {
  const parsed = upsertSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ message: '입력값이 올바르지 않습니다.' }); return }

  // PATCH /wishlist/:cardId → URL param 우선, POST /wishlist → body에서 cardId 필수
  const cardId = (req.params['cardId'] as string | undefined) ?? parsed.data.cardId
  if (!cardId) { res.status(400).json({ message: 'cardId가 필요합니다.' }); return }

  const { targetPrice } = parsed.data
  try {
    const card = await prisma.card.findUnique({ where: { id: cardId }, select: { id: true } })
    if (!card) { res.status(404).json({ message: '카드를 찾을 수 없습니다.' }); return }

    const existing = await prisma.wishlist.findUnique({
      where: { userId_cardId: { userId: req.userId!, cardId } },
      select: { id: true },
    })

    const item = await prisma.wishlist.upsert({
      where:  { userId_cardId: { userId: req.userId!, cardId } },
      create: { userId: req.userId!, cardId, targetPrice: targetPrice ?? null },
      update: { targetPrice: targetPrice ?? null },
    })

    // 새로 추가 시 201, 업데이트 시 200
    res.status(existing ? 200 : 201).json(item)
  } catch (err) {
    console.error('[upsertWishlist]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// ── 위시리스트 삭제 ───────────────────────────────────────────────────────────

export async function removeWishlist(req: AuthRequest, res: Response) {
  const cardId = String(req.params['cardId'])
  try {
    await prisma.wishlist.deleteMany({
      where: { userId: req.userId!, cardId },
    })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

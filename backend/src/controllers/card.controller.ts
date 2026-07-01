import { Request, Response } from 'express'
import { TcgType } from '@prisma/client'
import { prisma } from '../lib/prisma'

const VALID_TCG_TYPES = Object.values(TcgType)

function parseTcgType(raw: unknown): TcgType | undefined {
  return VALID_TCG_TYPES.includes(raw as TcgType) ? (raw as TcgType) : undefined
}

// ── GET /cards ─────────────────────────────────────────────────────────────────
// 카드 검색 & 필터 (공개)

export async function searchCards(req: Request, res: Response) {
  try {
    const q         = (req.query.q as string | undefined)?.trim()
    const tcgType   = parseTcgType(req.query.tcgType)
    const rarity    = (req.query.rarity as string | undefined)?.trim()
    const setName   = (req.query.setName as string | undefined)?.trim()
    const lang      = (req.query.lang as string | undefined)?.trim()
    const supertype = (req.query.supertype as string | undefined)?.trim()  // Pokémon / Trainer / Energy
    const cardType  = (req.query.cardType as string | undefined)?.trim()   // Fire / Water / Grass ...
    const hpMin     = req.query.hpMin ? Number(req.query.hpMin) : undefined
    const hpMax     = req.query.hpMax ? Number(req.query.hpMax) : undefined
    const sort      = (req.query.sort as string | undefined) ?? 'name'
    const page      = Math.max(1, Number(req.query.page ?? 1))
    const limit     = Math.min(60, Math.max(1, Number(req.query.limit ?? 24)))
    const skip      = (page - 1) * limit

    const langFilter =
      lang === 'ja' ? { OR: [
        { externalId: { startsWith: 'tcgdex_ja_' } },
        { externalId: { startsWith: 'pkmncardgame_ja_' } },
      ] } :
      lang === 'ko' ? { nameKo: { not: null } } :
      {}

    const where = {
      ...(q ? {
        OR: [
          { name:       { contains: q, mode: 'insensitive' as const } },
          { nameKo:     { contains: q, mode: 'insensitive' as const } },
          { nameJa:     { contains: q, mode: 'insensitive' as const } },
          { setName:    { contains: q, mode: 'insensitive' as const } },
          { setCode:    { contains: q, mode: 'insensitive' as const } },
          { cardNumber: { contains: q, mode: 'insensitive' as const } },
        ],
      } : {}),
      ...(tcgType   ? { tcgType }   : {}),
      ...(rarity    ? { rarity: { contains: rarity, mode: 'insensitive' as const } } : {}),
      ...(setName   ? { setName: { contains: setName, mode: 'insensitive' as const } } : {}),
      ...(supertype ? { supertype: { contains: supertype, mode: 'insensitive' as const } } : {}),
      ...(cardType  ? { cardTypes: { contains: cardType, mode: 'insensitive' as const } } : {}),
      ...(hpMin !== undefined ? { hp: { gte: hpMin } } : {}),
      ...(hpMax !== undefined ? { hp: { lte: hpMax } } : {}),
      ...langFilter,
    }

    const orderBy: object[] =
      sort === 'newest'
        ? [{ createdAt: 'desc' }]
        : sort === 'popular'
        ? [{ listings: { _count: 'desc' } }, { nameKo: { sort: 'asc', nulls: 'last' } }]
        : sort === 'hp_desc'
        ? [{ hp: { sort: 'desc', nulls: 'last' } }]
        : /* name (default) */
          [{ nameKo: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }]

    const [cards, total] = await prisma.$transaction([
      prisma.card.findMany({
        where,
        select: {
          id: true, name: true, nameKo: true, nameJa: true,
          tcgType: true, setName: true, setCode: true,
          cardNumber: true, rarity: true, imageUrl: true,
          supertype: true, subtypes: true, cardTypes: true, hp: true,
          _count: { select: { listings: true } },
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.card.count({ where }),
    ])

    res.json({ cards, total, page, totalPages: Math.ceil(total / limit), limit })
  } catch (err) {
    console.error('[searchCards]', err)
    res.status(500).json({ message: '카드 검색 중 오류가 발생했습니다.' })
  }
}

// ── GET /cards/meta ────────────────────────────────────────────────────────────
// 필터 옵션 (세트 목록, 레어도 목록, 에너지 타입 목록) — tcgType으로 좁힘

export async function getCardMeta(req: Request, res: Response) {
  try {
    const tcgType   = parseTcgType(req.query.tcgType)
    const lang      = (req.query.lang as string | undefined)?.trim()
    const supertype = (req.query.supertype as string | undefined)?.trim()
    const langFilter =
      lang === 'ja' ? { OR: [
        { externalId: { startsWith: 'tcgdex_ja_' } },
        { externalId: { startsWith: 'pkmncardgame_ja_' } },
      ] } :
      lang === 'ko' ? { nameKo: { not: null } } :
      {}
    const where = {
      ...(tcgType   ? { tcgType }   : {}),
      ...(supertype ? { supertype: { contains: supertype, mode: 'insensitive' as const } } : {}),
      ...langFilter,
    }

    const [sets, rarities, supertypes] = await prisma.$transaction([
      prisma.card.groupBy({
        by: ['setName'],
        where,
        _count: { _all: true },
        orderBy: { _count: { setName: 'desc' } },
        take: 200,
      }),
      prisma.card.groupBy({
        by: ['rarity'],
        where,
        _count: { _all: true },
        orderBy: { _count: { rarity: 'desc' } },
        take: 80,
      }),
      prisma.card.groupBy({
        by: ['supertype'],
        where: { ...where, supertype: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { supertype: 'desc' } },
      }),
    ])

    res.json({
      sets:       sets.map(s => ({ name: s.setName, count: (s._count as { _all: number })._all })),
      rarities:   rarities.map(r => ({ name: r.rarity, count: (r._count as { _all: number })._all })),
      supertypes: supertypes.map(s => ({ name: s.supertype!, count: (s._count as { _all: number })._all })),
    })
  } catch (err) {
    console.error('[getCardMeta]', err)
    res.status(500).json({ message: '메타 정보 조회 중 오류가 발생했습니다.' })
  }
}

// ── GET /cards/rank ────────────────────────────────────────────────────────────
// 카드 랭킹 (거래량/가격)

export async function getCardRank(req: Request, res: Response) {
  try {
    const mode    = (req.query.mode as string | undefined) ?? 'listings'  // listings | price
    const tcgType = parseTcgType(req.query.tcgType)
    const limit   = Math.min(50, Math.max(1, Number(req.query.limit ?? 20)))

    const where = {
      ...(tcgType ? { tcgType } : {}),
      status: 'ACTIVE' as const,
    }

    if (mode === 'price') {
      // 최고가 카드 (즉시구매 기준)
      const topByPrice = await prisma.listing.findMany({
        where: { ...where, listingType: 'BUY_NOW', buyNowPrice: { not: null } },
        select: {
          buyNowPrice: true,
          card: {
            select: {
              id: true, name: true, nameKo: true, nameJa: true,
              tcgType: true, setName: true, rarity: true, imageUrl: true,
              cardTypes: true, supertype: true, hp: true,
            },
          },
        },
        orderBy: { buyNowPrice: 'desc' },
        take: limit,
      })

      res.json({
        mode,
        rank: topByPrice.map((l, i) => ({
          rank: i + 1,
          price: l.buyNowPrice,
          card: l.card,
        })),
      })
    } else {
      // 거래 많은 카드 (리스팅 수 기준)
      const topByListings = await prisma.card.findMany({
        where: tcgType ? { tcgType, listings: { some: { status: 'ACTIVE' } } } : { listings: { some: { status: 'ACTIVE' } } },
        select: {
          id: true, name: true, nameKo: true, nameJa: true,
          tcgType: true, setName: true, rarity: true, imageUrl: true,
          cardTypes: true, supertype: true, hp: true,
          _count: { select: { listings: true } },
        },
        orderBy: { listings: { _count: 'desc' } },
        take: limit,
      })

      res.json({
        mode,
        rank: topByListings.map((c, i) => ({
          rank: i + 1,
          listingCount: c._count.listings,
          card: c,
        })),
      })
    }
  } catch (err) {
    console.error('[getCardRank]', err)
    res.status(500).json({ message: '랭킹 조회 중 오류가 발생했습니다.' })
  }
}

// ── GET /cards/:id ─────────────────────────────────────────────────────────────
// 카드 상세 + 현재 시세 통계

export async function getCard(req: Request, res: Response) {
  try {
    const { id } = req.params as { id: string }

    const card = await prisma.card.findUnique({
      where: { id },
      select: {
        id: true, name: true, nameKo: true, nameJa: true,
        tcgType: true, setName: true, setCode: true,
        cardNumber: true, rarity: true, imageUrl: true, description: true,
        supertype: true, subtypes: true, cardTypes: true, hp: true,
        attacks: true, abilities: true, weaknesses: true, resistances: true,
        retreatCost: true, artist: true, flavorText: true,
        createdAt: true,
        _count: {
          select: {
            listings: true,
            oripaItems: true,
          },
        },
      },
    })

    if (!card) {
      res.status(404).json({ message: '카드를 찾을 수 없습니다.' })
      return
    }

    // 활성 리스팅 가격 집계 (즉시구매 기준)
    const activeListings = await prisma.listing.findMany({
      where: { cardId: id, status: 'ACTIVE' },
      select: {
        listingType: true,
        buyNowPrice: true,
        currentPrice: true,
        minOfferPrice: true,
      },
    })

    const prices: number[] = activeListings.flatMap(l => {
      if (l.listingType === 'BUY_NOW'  && l.buyNowPrice != null)    return [l.buyNowPrice]
      if (l.listingType === 'AUCTION'  && l.currentPrice != null)   return [l.currentPrice]
      if (l.listingType === 'OFFER'    && l.minOfferPrice != null)  return [l.minOfferPrice]
      return []
    })

    const marketStats = prices.length > 0 ? {
      activeCount: activeListings.length,
      minPrice:    Math.min(...prices),
      maxPrice:    Math.max(...prices),
      avgPrice:    Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
      byType: {
        BUY_NOW:  activeListings.filter(l => l.listingType === 'BUY_NOW').length,
        AUCTION:  activeListings.filter(l => l.listingType === 'AUCTION').length,
        OFFER:    activeListings.filter(l => l.listingType === 'OFFER').length,
      },
    } : null

    res.json({ ...card, marketStats })
  } catch (err) {
    console.error('[getCard]', err)
    res.status(500).json({ message: '카드 조회 중 오류가 발생했습니다.' })
  }
}

// ── GET /cards/:id/price-history ──────────────────────────────────────────────
// 카드 체결 가격 히스토리 (최근 N일, 일별 집계)

export async function getCardPriceHistory(req: Request, res: Response) {
  const { id } = req.params as { id: string }
  const days   = Math.min(180, Math.max(7, Number(req.query.days ?? 30)))

  try {
    const since = new Date(Date.now() - days * 86400 * 1000)

    // 카드 존재 여부만 체크 (가볍게)
    const exists = await prisma.card.findUnique({ where: { id }, select: { id: true } })
    if (!exists) { res.status(404).json({ message: '카드를 찾을 수 없습니다.' }); return }

    // 체결된 거래만 (COMPLETED / AUTO_COMPLETED)
    const txns = await prisma.transaction.findMany({
      where: {
        listing: { cardId: id },
        txStatus: { in: ['COMPLETED', 'AUTO_COMPLETED'] },
        completedAt: { gte: since },
      },
      select: {
        finalPrice: true,
        completedAt: true,
        listing: { select: { listingType: true } },
      },
      orderBy: { completedAt: 'asc' },
    })

    if (txns.length === 0) {
      res.json({ history: [], summary: null, days })
      return
    }

    // 일별 집계
    const byDay = new Map<string, { prices: number[]; types: string[] }>()
    for (const tx of txns) {
      const key = tx.completedAt!.toISOString().slice(0, 10)  // YYYY-MM-DD
      if (!byDay.has(key)) byDay.set(key, { prices: [], types: [] })
      byDay.get(key)!.prices.push(tx.finalPrice)
      byDay.get(key)!.types.push(tx.listing.listingType)
    }

    const history = Array.from(byDay.entries()).map(([date, { prices, types }]) => ({
      date,
      avg:   Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
      min:   Math.min(...prices),
      max:   Math.max(...prices),
      count: prices.length,
      types: types.reduce<Record<string, number>>((acc, t) => { acc[t] = (acc[t] ?? 0) + 1; return acc }, {}),
    }))

    const allPrices = txns.map(t => t.finalPrice)
    const summary = {
      totalTrades: txns.length,
      avgPrice:    Math.round(allPrices.reduce((a, b) => a + b, 0) / allPrices.length),
      minPrice:    Math.min(...allPrices),
      maxPrice:    Math.max(...allPrices),
      days,
    }

    res.json({ history, summary, days })
  } catch (err) {
    console.error('[getCardPriceHistory]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// ── GET /cards/:id/listings ───────────────────────────────────────────────────
// 특정 카드의 활성 리스팅 목록

export async function getCardListings(req: Request, res: Response) {
  try {
    const { id }  = req.params as { id: string }
    const sort    = (req.query.sort as string | undefined) ?? 'newest'
    const type    = req.query.type as string | undefined
    const page    = Math.max(1, Number(req.query.page ?? 1))
    const limit   = 12
    const skip    = (page - 1) * limit

    const orderBy: object[] =
      sort === 'price_asc'  ? [{ buyNowPrice: { nulls: 'last' } }, { currentPrice: { nulls: 'last' } }] :
      sort === 'price_desc' ? [{ buyNowPrice: { sort: 'desc', nulls: 'last' } }, { currentPrice: { sort: 'desc', nulls: 'last' } }] :
      sort === 'ending'     ? [{ auctionEndsAt: { sort: 'asc', nulls: 'last' } }] :
      /* newest */            [{ createdAt: 'desc' }]

    const where = {
      cardId: id,
      status: 'ACTIVE' as const,
      ...(type ? { listingType: type as any } : {}),
    }

    const [listings, total] = await prisma.$transaction([
      prisma.listing.findMany({
        where,
        include: {
          card: {
            select: {
              id: true, name: true, nameKo: true, tcgType: true,
              setName: true, cardNumber: true, rarity: true, imageUrl: true,
            },
          },
          seller: { select: { id: true, nickname: true, avatarUrl: true } },
          _count:  { select: { bids: true, offers: true } },
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.listing.count({ where }),
    ])

    res.json({ listings, total, page, totalPages: Math.ceil(total / limit) })
  } catch (err) {
    console.error('[getCardListings]', err)
    res.status(500).json({ message: '리스팅 조회 중 오류가 발생했습니다.' })
  }
}

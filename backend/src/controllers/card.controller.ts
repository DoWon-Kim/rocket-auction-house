import { Request, Response } from 'express'
import { Prisma, TcgType } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { SNKRDUNK_PRODUCT_URL } from '../services/snkrdunk.service'
import { buildPriceReference, TRADE_WINDOW_DAYS } from '../lib/priceReference'
import { cardLangOf, cardLangWhere, isCardLang } from '../lib/cardLang'

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
    const rarities  = (req.query.rarities as string | undefined)
      ?.split(',').map(r => r.trim()).filter(Boolean) ?? []
    const setName   = (req.query.setName as string | undefined)?.trim()
    const lang      = (req.query.lang as string | undefined)?.trim()
    const supertype = (req.query.supertype as string | undefined)?.trim()  // Pokémon / Trainer / Energy
    const cardType  = (req.query.cardType as string | undefined)?.trim()   // Fire / Water / Grass ...
    const hpMin     = req.query.hpMin ? Number(req.query.hpMin) : undefined
    const hpMax     = req.query.hpMax ? Number(req.query.hpMax) : undefined
    const parallel  = (req.query.parallel as string | undefined) === 'true'
    const sort      = (req.query.sort as string | undefined) ?? 'name'
    const page      = Math.max(1, Number(req.query.page ?? 1))
    const limit     = Math.min(60, Math.max(1, Number(req.query.limit ?? 24)))
    const skip      = (page - 1) * limit

    // [EB03-003] 형식 괄호 파싱: 대괄호 안의 텍스트를 카드번호로 직접 검색
    const bracketMatches = q ? [...q.matchAll(/\[([^\]]+)\]/g)] : []
    const bracketNumbers = bracketMatches.map(m => m[1])
    const cleanQ = q ? q.replace(/\[([^\]]+)\]/g, '').trim() : undefined

    const langFilter =
      lang === 'ja' ? { OR: [
        { externalId: { startsWith: 'tcgdex_ja_' } },
        { externalId: { startsWith: 'pkmncardgame_ja_' } },
        { nameJa: { not: null } },
      ] } :
      lang === 'ko' ? { nameKo: { not: null } } :
      {}

    const buildTextOR = (term: string) => [
      { name:       { contains: term, mode: 'insensitive' as const } },
      { nameKo:     { contains: term, mode: 'insensitive' as const } },
      { nameJa:     { contains: term, mode: 'insensitive' as const } },
      { setName:    { contains: term, mode: 'insensitive' as const } },
      { setCode:    { contains: term, mode: 'insensitive' as const } },
      { cardNumber: { contains: term, mode: 'insensitive' as const } },
      { artist:     { contains: term, mode: 'insensitive' as const } },
    ]

    // 새 필터: 일러스트레이터 · 레귤레이션 · 진화 단계 · 정확한 세트(세트 도감) · 도감번호(#25)
    const artist     = (req.query.artist as string | undefined)?.trim()
    const regulation = (req.query.regulation as string | undefined)?.split(',').map(r => r.trim().toUpperCase()).filter(Boolean) ?? []
    const stages     = (req.query.stage as string | undefined)?.split(',').map(r => r.trim()).filter(Boolean) ?? []
    const setCode    = (req.query.setCode as string | undefined)?.trim()
    const setLang    = isCardLang(req.query.setLang) ? req.query.setLang : undefined
    const dexMatch   = q?.match(/^(?:no\.?|#)\s*(\d{1,4})$/i)
    const dexId      = dexMatch ? Number(dexMatch[1]) : (req.query.dexId ? Number(req.query.dexId) : undefined)

    const speciesHits = q && !dexMatch && /[가-힣]/.test(q)
      ? (await prisma.pokemonSpecies.findMany({ where: { nameKo: { contains: cleanQ || q } }, select: { dexId: true }, take: 20 })).map(s => s.dexId)
      : []

    // 조건은 AND 배열로 합친다 (OR 키가 여러 개면 뒤의 것이 앞을 덮어쓰던 문제 방지)
    const and: Prisma.CardWhereInput[] = []
    if (q && !dexMatch) {
      and.push({ OR: [
        ...(speciesHits.length ? [{ dexIds: { hasSome: speciesHits } }] : []),
        // 괄호 제거한 텍스트로 일반 검색 (cleanQ가 있을 때만)
        ...(cleanQ ? buildTextOR(cleanQ) : []),
        // [XXX] 안의 텍스트를 카드번호로 직접 검색
        ...bracketNumbers.map(n => ({ cardNumber: { contains: n, mode: 'insensitive' as const } })),
        // 원본 q 전체로도 검색 (괄호 없이 입력한 경우 대비)
        ...(bracketNumbers.length === 0 ? [] : buildTextOR(q)),
      ] })
    }
    if (tcgType) and.push({ tcgType })
    if (rarities.length > 0) and.push({ OR: rarities.map(r => ({ rarity: { contains: r, mode: 'insensitive' as const } })) })
    else if (rarity) and.push({ rarity: { contains: rarity, mode: 'insensitive' as const } })
    if (setName)   and.push({ setName: { contains: setName, mode: 'insensitive' as const } })
    if (setCode)   and.push({ setCode: { equals: setCode, mode: 'insensitive' as const } })
    if (setLang)   and.push(cardLangWhere(setLang))
    if (supertype) and.push({ supertype: { contains: supertype, mode: 'insensitive' as const } })
    if (cardType)  and.push({ cardTypes: { contains: cardType, mode: 'insensitive' as const } })
    if (hpMin !== undefined) and.push({ hp: { gte: hpMin } })
    if (hpMax !== undefined) and.push({ hp: { lte: hpMax } })
    if (artist)    and.push({ artist: { contains: artist, mode: 'insensitive' as const } })
    if (regulation.length) and.push({ regulationMark: { in: regulation } })
    if (stages.length) and.push({ stage: { in: stages } })
    if (dexId !== undefined && Number.isInteger(dexId)) and.push({ dexIds: { has: dexId } })
    if (Object.keys(langFilter).length) and.push(langFilter)
    if (parallel) and.push({ OR: [
      { cardNumber: { contains: '_p1' } },
      { cardNumber: { contains: '_p2' } },
      { cardNumber: { contains: '_p3' } },
    ] })
    const where: Prisma.CardWhereInput = and.length ? { AND: and } : {}

    const orderBy: Prisma.CardOrderByWithRelationInput[] =
      sort === 'newest'
        ? [{ createdAt: 'desc' }]
        : sort === 'popular'
        ? [{ listings: { _count: 'desc' } }, { nameKo: { sort: 'asc', nulls: 'last' } }]
        : sort === 'hp_desc'
        ? [{ hp: { sort: 'desc', nulls: 'last' } }]
        : sort === 'hp_asc'
        ? [{ hp: { sort: 'asc', nulls: 'last' } }]
        : sort === 'price_desc'
        ? [{ snkrdunkPrice: { sort: 'desc', nulls: 'last' } }, { name: 'asc' }]
        : sort === 'price_asc'
        ? [{ snkrdunkPrice: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }]
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
          stage: true, regulationMark: true, dexIds: true, snkrdunkPrice: true,
          _count: { select: { listings: true } },
          listings: {
            where: { status: 'ACTIVE', listingType: 'BUY_NOW', buyNowPrice: { not: null } },
            select: { buyNowPrice: true },
            orderBy: { buyNowPrice: 'asc' },
            take: 1,
          },
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.card.count({ where }),
    ])

    const formattedCards = cards.map(({ listings: cheapest, ...c }) => ({
      ...c,
      minPrice: cheapest[0]?.buyNowPrice ?? null,
    }))

    res.json({ cards: formattedCards, total, page, totalPages: Math.ceil(total / limit), limit })
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
        { nameJa: { not: null } },
      ] } :
      lang === 'ko' ? { nameKo: { not: null } } :
      {}
    const where = {
      ...(tcgType   ? { tcgType }   : {}),
      ...(supertype ? { supertype: { contains: supertype, mode: 'insensitive' as const } } : {}),
      ...langFilter,
    }

    const [sets, rarities, supertypes, regulations, stages, artists] = await prisma.$transaction([
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
      prisma.card.groupBy({
        by: ['regulationMark'], where: { ...where, regulationMark: { not: null } },
        _count: { _all: true }, orderBy: { regulationMark: 'desc' },
      }),
      prisma.card.groupBy({
        by: ['stage'], where: { ...where, stage: { not: null } },
        _count: { _all: true }, orderBy: { _count: { stage: 'desc' } }, take: 20,
      }),
      prisma.card.groupBy({
        by: ['artist'], where: { ...where, artist: { not: null } },
        _count: { _all: true }, orderBy: { _count: { artist: 'desc' } }, take: 80,
      }),
    ])

    res.json({
      sets:       sets.map(s => ({ name: s.setName, count: (s._count as { _all: number })._all })),
      rarities:   rarities.map(r => ({ name: r.rarity, count: (r._count as { _all: number })._all })),
      supertypes: supertypes.map(s => ({ name: s.supertype!, count: (s._count as { _all: number })._all })),
      regulations: regulations.map(r => ({ name: r.regulationMark!, count: (r._count as { _all: number })._all })),
      stages:     stages.map(r => ({ name: r.stage!, count: (r._count as { _all: number })._all })),
      artists:    artists.map(r => ({ name: r.artist!, count: (r._count as { _all: number })._all })),
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
        stage: true, evolvesFrom: true, dexIds: true, regulationMark: true, externalId: true,
        stats: true, textKo: true, textKoSource: true,
        snkrdunkPrice: true, snkrdunkListings: true, snkrdunkUpdatedAt: true,
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

    const { externalId, ...cardOut } = card
    const lang = cardLangOf(externalId)
    const set = card.setCode
      ? await prisma.cardSet.findUnique({
          where: { tcgType_lang_code: { tcgType: card.tcgType, lang, code: card.setCode } },
          select: { name: true, series: true, releaseDate: true, logoUrl: true, symbolUrl: true, officialCount: true, totalCount: true },
        })
      : null

    const species = card.dexIds.length
      ? await prisma.pokemonSpecies.findMany({
          where: { dexId: { in: card.dexIds } },
          select: { dexId: true, nameKo: true, genusKo: true, flavorKo: true, heightDm: true, weightHg: true, types: true, generation: true },
        })
      : []

    res.json({ ...cardOut, lang, set, species, marketStats })
  } catch (err) {
    console.error('[getCard]', err)
    res.status(500).json({ message: '카드 조회 중 오류가 발생했습니다.' })
  }
}

// ── GET /cards/:id/variants ────────────────────────────────────────────────────
// 같은 카드번호의 다른 버전 (패러렐, SEC 등)

export async function getCardVariants(req: Request, res: Response) {
  try {
    const { id } = req.params as { id: string }

    const card = await prisma.card.findUnique({
      where: { id },
      select: { cardNumber: true, tcgType: true, setCode: true },
    })

    if (!card || !card.cardNumber) { res.json([]); return }

    // _p1, _p2 등 패러렐 접미사 제거해 기본 카드번호 추출
    const baseNum = card.cardNumber.replace(/_p\d+$/i, '')

    const variants = await prisma.card.findMany({
      where: {
        tcgType: card.tcgType,
        id: { not: id },
        // 포켓몬 등은 번호가 세트마다 반복되므로 같은 세트로 한정
        ...(card.setCode ? { setCode: { equals: card.setCode, mode: 'insensitive' as const } } : {}),
        OR: [
          { cardNumber: baseNum },
          { cardNumber: { startsWith: `${baseNum}_` } },
        ],
      },
      select: {
        id: true, name: true, nameKo: true,
        cardNumber: true, rarity: true, imageUrl: true,
        _count: { select: { listings: true } },
      },
      orderBy: { cardNumber: 'asc' },
    })

    res.json(variants)
  } catch (err) {
    console.error('[getCardVariants]', err)
    res.status(500).json({ message: '버전 조회 중 오류가 발생했습니다.' })
  }
}

// ── GET /cards/:id/price-history ──────────────────────────────────────────────
// 카드 체결 가격 히스토리 (최근 N일, 일별 집계)

export async function getCardPriceHistory(req: Request, res: Response) {
  const { id } = req.params as { id: string }
  const days   = Math.min(365, Math.max(7, Number(req.query.days) || 30))

  try {
    const since = new Date(Date.now() - days * 86400 * 1000)

    // 카드 존재 여부만 체크 (가볍게)
    const exists = await prisma.card.findUnique({ where: { id }, select: { id: true } })
    if (!exists) { res.status(404).json({ message: '카드를 찾을 수 없습니다.' }); return }

    // 외부 시세 (스니덩 최저 호가 일일 스냅샷) — 체결 내역이 없어도 표시
    const [snapshots, cheapestLink] = await Promise.all([
      prisma.cardPriceSnapshot.findMany({
        where: { cardId: id, source: 'SNKRDUNK', date: { gte: new Date(since.toISOString().slice(0, 10)) } },
        select: { date: true, price: true, listings: true },
        orderBy: { date: 'asc' },
      }),
      prisma.cardSourceItem.findFirst({
        where: { cardId: id, source: 'SNKRDUNK', status: 'LINKED', price: { gt: 0 } },
        orderBy: { price: 'asc' }, select: { externalId: true },
      }),
    ])
    const market = {
      source: 'SNKRDUNK' as const,
      label: '스니덩 최저 호가',
      url: cheapestLink ? SNKRDUNK_PRODUCT_URL(cheapestLink.externalId) : null,
      history: snapshots.map(s => ({ date: s.date.toISOString().slice(0, 10), price: s.price, listings: s.listings })),
    }

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
      res.json({ history: [], summary: null, days, market })
      return
    }

    // 일별 집계
    const byDay = new Map<string, { prices: number[]; types: string[] }>()
    for (const tx of txns) {
      const key = new Date(tx.completedAt!.getTime() + 9 * 3600_000).toISOString().slice(0, 10)  // KST YYYY-MM-DD
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

    res.json({ history, summary, days, market })
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

// ── GET /cards/:id/price-reference ── 판매 등록용 참고 시세 (그레이딩 제외) ─────
export async function getCardPriceReference(req: Request, res: Response) {
  const id = String(req.params.id)
  try {
    const card = await prisma.card.findUnique({
      where: { id },
      select: { id: true, snkrdunkPrice: true, snkrdunkListings: true, snkrdunkUpdatedAt: true },
    })
    if (!card) { res.status(404).json({ message: '카드를 찾을 수 없습니다.' }); return }

    const since = new Date(Date.now() - TRADE_WINDOW_DAYS * 86400_000)
    const [txns, active, cheapestLink] = await Promise.all([
      prisma.transaction.findMany({
        where: {
          listing: { cardId: id, gradingCompany: null },
          txStatus: { in: ['COMPLETED', 'AUTO_COMPLETED'] },
          completedAt: { gte: since },
        },
        select: { finalPrice: true, completedAt: true },
        orderBy: { completedAt: 'desc' },
        take: 50,
      }),
      prisma.listing.aggregate({
        where: { cardId: id, status: 'ACTIVE', listingType: 'BUY_NOW', gradingCompany: null },
        _min: { buyNowPrice: true }, _count: { _all: true },
      }),
      prisma.cardSourceItem.findFirst({
        where: { cardId: id, source: 'SNKRDUNK', status: 'LINKED', price: { gt: 0 } },
        orderBy: { price: 'asc' }, select: { externalId: true },
      }),
    ])

    res.json(buildPriceReference({
      trades: txns.filter(t => t.completedAt).map(t => ({ price: t.finalPrice, date: t.completedAt! })),
      activeMinBuyNow: active._min.buyNowPrice,
      activeCount: active._count._all,
      market: {
        price: card.snkrdunkPrice, listings: card.snkrdunkListings, updatedAt: card.snkrdunkUpdatedAt,
        url: cheapestLink ? SNKRDUNK_PRODUCT_URL(cheapestLink.externalId) : null,
      },
    }))
  } catch (err) {
    console.error('[getCardPriceReference]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// ── GET /cards/:id/related ── 버전·언어판 / 진화 라인 / 같은 포켓몬 ─────────────

const relatedSelect = {
  id: true, name: true, nameKo: true, nameJa: true, setName: true, setCode: true, cardNumber: true,
  rarity: true, imageUrl: true, stage: true, snkrdunkPrice: true, externalId: true,
  _count: { select: { listings: { where: { status: 'ACTIVE' as const } } } },
} satisfies Prisma.CardSelect
type RelatedRow = Prisma.CardGetPayload<{ select: typeof relatedSelect }>
const brief = ({ externalId, _count, ...c }: RelatedRow) => ({ ...c, lang: cardLangOf(externalId), activeListings: _count.listings })

export async function getCardRelated(req: Request, res: Response) {
  try {
    const id = String(req.params.id)
    const card = await prisma.card.findUnique({
      where: { id },
      select: { id: true, name: true, tcgType: true, setCode: true, cardNumber: true, externalId: true, evolvesFrom: true, dexIds: true },
    })
    if (!card) { res.status(404).json({ message: '카드를 찾을 수 없습니다.' }); return }
    const lang = cardLangOf(card.externalId)
    const sameLang = cardLangWhere(lang)

    // 1) 같은 세트·같은 번호의 다른 버전(패러렐)과 다른 언어판
    const versions: RelatedRow[] = card.setCode && card.cardNumber
      ? await (() => {
          const base = card.cardNumber!.replace(/_p\d+$/i, '')
          const nums = new Set([base, base.replace(/^0+(?=\d)/, ''), base.padStart(3, '0')])
          return prisma.card.findMany({
            where: {
              tcgType: card.tcgType, id: { not: id },
              setCode: { equals: card.setCode!, mode: 'insensitive' },
              OR: [{ cardNumber: { in: [...nums] } }, { cardNumber: { startsWith: `${base}_` } }],
            },
            select: relatedSelect, take: 20,
          })
        })()
      : []

    // 2) 진화 라인 (같은 언어판 이름 기준, 같은 세트 카드 우선)
    const pickByName = async (name: string) =>
      (await prisma.card.findFirst({ where: { AND: [{ tcgType: card.tcgType, name, setCode: card.setCode }, sameLang] }, select: relatedSelect }))
      ?? prisma.card.findFirst({
        where: { AND: [{ tcgType: card.tcgType, name }, sameLang] },
        select: relatedSelect, orderBy: [{ snkrdunkPrice: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      })
    const ancestors: Array<{ name: string; card: ReturnType<typeof brief> | null }> = []
    let prevName = card.evolvesFrom
    for (let depth = 0; prevName && depth < 2; depth++) {
      const found = await pickByName(prevName)
      ancestors.unshift({ name: prevName, card: found ? brief(found) : null })
      prevName = found ? (await prisma.card.findUnique({ where: { id: found.id }, select: { evolvesFrom: true } }))?.evolvesFrom ?? null : null
    }
    const descendantsOf = async (name: string) => {
      const names = await prisma.card.groupBy({ by: ['name'], where: { AND: [{ tcgType: card.tcgType, evolvesFrom: name }, sameLang] }, orderBy: { name: 'asc' }, take: 8 })
      return Promise.all(names.map(async n => {
        const c = await pickByName(n.name)
        return { name: n.name, card: c ? brief(c) : null }
      }))
    }
    const children = await descendantsOf(card.name)
    const descendants = await Promise.all(children.map(async ch => ({ ...ch, children: await descendantsOf(ch.name) })))

    // 3) 같은 포켓몬(도감번호)의 다른 카드 — 같은 언어판 우선, 시세 높은 순
    let samePokemon: RelatedRow[] = []
    let samePokemonTotal = 0
    if (card.dexIds.length) {
      const where: Prisma.CardWhereInput = { AND: [{ tcgType: card.tcgType, id: { not: id }, dexIds: { hasSome: card.dexIds } }, sameLang] }
      ;[samePokemon, samePokemonTotal] = await Promise.all([
        prisma.card.findMany({ where, select: relatedSelect, orderBy: [{ snkrdunkPrice: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }], take: 18 }),
        prisma.card.count({ where }),
      ])
    }

    res.json({
      lang,
      versions: versions.map(brief).sort((a, b) => (a.lang === lang ? 0 : 1) - (b.lang === lang ? 0 : 1)),
      evolution: { ancestors, current: card.name, descendants },
      samePokemon: { total: samePokemonTotal, cards: samePokemon.map(brief) },
    })
  } catch (err) {
    console.error('[getCardRelated]', err)
    res.status(500).json({ message: '관련 카드를 불러오지 못했습니다.' })
  }
}

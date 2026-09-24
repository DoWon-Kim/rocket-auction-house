import { Request, Response } from 'express'
import { Prisma, TcgType } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { CARD_LANG_SQL, cardLangWhere, isCardLang, type CardLang } from '../lib/cardLang'

// ── 세트(확장팩) 도감 ─────────────────────────────────────────────────────────
// 세트 단위 = (TCG, 언어판, 세트코드). 목록은 실제 DB에 있는 카드 기준으로 만들고
// CardSet(발매일·로고·공식 카드 수)이 있으면 붙인다.

const TCG_TYPES = Object.values(TcgType)
const parseTcg = (v: unknown) => (TCG_TYPES.includes(v as TcgType) ? (v as TcgType) : undefined)
const natural = (a: string | null, b: string | null) => (a ?? '').localeCompare(b ?? '', undefined, { numeric: true, sensitivity: 'base' })

interface SetRow { tcgType: TcgType; lang: CardLang; code: string; name: string; cardCount: number; pricedCount: number }

export async function listSets(req: Request, res: Response) {
  try {
    const tcgType = parseTcg(req.query.tcgType)
    const lang = isCardLang(req.query.lang) ? req.query.lang : undefined
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase().slice(0, 60) : ''

    const rows = await prisma.$queryRaw<SetRow[]>`
      SELECT c."tcgType", ${CARD_LANG_SQL} AS lang, c."setCode" AS code, MIN(c."setName") AS name,
             COUNT(*)::int AS "cardCount", COUNT(*) FILTER (WHERE c."snkrdunkPrice" > 0)::int AS "pricedCount"
      FROM "Card" c
      WHERE c."setCode" IS NOT NULL ${tcgType ? Prisma.sql`AND c."tcgType" = ${tcgType}::"TcgType"` : Prisma.empty}
      GROUP BY 1, 2, 3`

    const metas = await prisma.cardSet.findMany({ where: tcgType ? { tcgType } : {} })
    const metaMap = new Map(metas.map(m => [`${m.tcgType}|${m.lang}|${m.code.toLowerCase()}`, m]))

    const langCounts: Record<string, number> = {}
    const sets = rows
      .map(r => {
        const m = metaMap.get(`${r.tcgType}|${r.lang}|${r.code.toLowerCase()}`)
        return {
          tcgType: r.tcgType, lang: r.lang, code: r.code,
          name: m?.name ?? r.name, cardCount: r.cardCount, pricedCount: r.pricedCount,
          series: m?.series ?? null, releaseDate: m?.releaseDate ?? null,
          logoUrl: m?.logoUrl ?? null, symbolUrl: m?.symbolUrl ?? null,
          officialCount: m?.officialCount ?? null, totalCount: m?.totalCount ?? null,
        }
      })
      .filter(s => {
        langCounts[s.lang] = (langCounts[s.lang] ?? 0) + 1
        if (lang && s.lang !== lang) return false
        return !q || s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q) || (s.series ?? '').toLowerCase().includes(q)
      })
      .sort((a, b) =>
        (b.releaseDate?.getTime() ?? 0) - (a.releaseDate?.getTime() ?? 0) || natural(a.name, b.name))
      .slice(0, 1500)

    res.json({ sets, langCounts })
  } catch (err) {
    console.error('[listSets]', err)
    res.status(500).json({ message: '세트 목록을 불러오지 못했습니다.' })
  }
}

export async function getSet(req: Request, res: Response) {
  try {
    const tcgType = parseTcg(req.params.tcgType)
    const lang = req.params.lang
    const code = String(req.params.code)
    if (!tcgType || !isCardLang(lang)) { res.status(400).json({ message: '잘못된 세트 주소입니다.' }); return }

    const cards = await prisma.card.findMany({
      where: { AND: [{ tcgType, setCode: { equals: code, mode: 'insensitive' } }, cardLangWhere(lang)] },
      select: {
        id: true, name: true, nameKo: true, nameJa: true, setName: true, setCode: true, cardNumber: true,
        rarity: true, imageUrl: true, supertype: true, stage: true, cardTypes: true, hp: true, artist: true,
        snkrdunkPrice: true,
        listings: {
          where: { status: 'ACTIVE', listingType: 'BUY_NOW', buyNowPrice: { not: null } },
          select: { buyNowPrice: true }, orderBy: { buyNowPrice: 'asc' }, take: 1,
        },
        _count: { select: { listings: { where: { status: 'ACTIVE' } } } },
      },
    })
    if (!cards.length) { res.status(404).json({ message: '세트를 찾을 수 없습니다.' }); return }

    const meta = await prisma.cardSet.findFirst({ where: { tcgType, lang, code: { equals: code, mode: 'insensitive' } } })
    const sorted = cards
      .map(({ listings, _count, ...c }) => ({ ...c, minPrice: listings[0]?.buyNowPrice ?? null, activeListings: _count.listings }))
      .sort((a, b) => natural(a.cardNumber, b.cardNumber))

    // 레어도 구성 (많은 순)
    const rarityMap = new Map<string, number>()
    for (const c of sorted) rarityMap.set(c.rarity, (rarityMap.get(c.rarity) ?? 0) + 1)
    const rarities = [...rarityMap].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)

    // 시세 요약 (스니덩 최저 호가 기준)
    const priced = sorted.filter(c => (c.snkrdunkPrice ?? 0) > 0)
    const market = {
      pricedCount: priced.length,
      totalValue: priced.reduce((s, c) => s + (c.snkrdunkPrice ?? 0), 0),
      top: [...priced].sort((a, b) => (b.snkrdunkPrice ?? 0) - (a.snkrdunkPrice ?? 0)).slice(0, 5)
        .map(c => ({ id: c.id, name: c.nameKo ?? c.name, cardNumber: c.cardNumber, rarity: c.rarity, imageUrl: c.imageUrl, price: c.snkrdunkPrice })),
      activeListings: sorted.reduce((s, c) => s + c.activeListings, 0),
    }

    res.json({
      set: {
        tcgType, lang, code: cards[0].setCode, name: meta?.name ?? cards[0].setName,
        series: meta?.series ?? null, releaseDate: meta?.releaseDate ?? null,
        logoUrl: meta?.logoUrl ?? null, symbolUrl: meta?.symbolUrl ?? null,
        officialCount: meta?.officialCount ?? null, totalCount: meta?.totalCount ?? null,
        cardCount: cards.length,
      },
      rarities, market, cards: sorted,
    })
  } catch (err) {
    console.error('[getSet]', err)
    res.status(500).json({ message: '세트 정보를 불러오지 못했습니다.' })
  }
}

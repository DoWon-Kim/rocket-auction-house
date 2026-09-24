import { Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { cardLangOf } from '../lib/cardLang'

// ── 한국어 포켓몬 도감 ────────────────────────────────────────────────────────

const speciesSelect = {
  dexId: true, nameKo: true, nameJa: true, nameEn: true, genusKo: true, flavorKo: true,
  heightDm: true, weightHg: true, types: true, generation: true, evolvesFromDexId: true,
} satisfies Prisma.PokemonSpeciesSelect

// 도감번호별 카드 수 (전 언어판)
async function cardCountsByDex(): Promise<Map<number, number>> {
  const rows = await prisma.$queryRaw<Array<{ dex: number; n: number }>>`
    SELECT d AS dex, COUNT(*)::int AS n FROM "Card", unnest("dexIds") AS d GROUP BY d`
  return new Map(rows.map(r => [r.dex, r.n]))
}

export async function listPokedex(req: Request, res: Response) {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
    const gen = Number(req.query.gen) || undefined
    const type = typeof req.query.type === 'string' ? req.query.type : undefined
    const onlyWithCards = req.query.hasCards === '1'

    const dexNum = q.match(/^(?:no\.?|#)?\s*(\d{1,4})$/i)
    const where: Prisma.PokemonSpeciesWhereInput = {
      ...(gen ? { generation: gen } : {}),
      ...(type ? { types: { has: type } } : {}),
      ...(q ? (dexNum ? { dexId: Number(dexNum[1]) } : { OR: [
        { nameKo: { contains: q } }, { nameJa: { contains: q } }, { nameEn: { contains: q, mode: 'insensitive' } },
      ] }) : {}),
    }
    const [species, counts] = await Promise.all([
      prisma.pokemonSpecies.findMany({ where, select: { dexId: true, nameKo: true, nameJa: true, nameEn: true, genusKo: true, types: true, generation: true }, orderBy: { dexId: 'asc' } }),
      cardCountsByDex(),
    ])
    const list = species.map(s => ({ ...s, cardCount: counts.get(s.dexId) ?? 0 })).filter(s => !onlyWithCards || s.cardCount > 0)
    res.json({ species: list, total: list.length })
  } catch (err) {
    console.error('[listPokedex]', err)
    res.status(500).json({ message: '도감을 불러오지 못했습니다.' })
  }
}

export async function getPokedexEntry(req: Request, res: Response) {
  try {
    const dexId = Number(req.params.dexId)
    if (!Number.isInteger(dexId)) { res.status(400).json({ message: '잘못된 도감 번호입니다.' }); return }
    const species = await prisma.pokemonSpecies.findUnique({ where: { dexId }, select: speciesSelect })
    if (!species) { res.status(404).json({ message: '도감에 없는 포켓몬입니다.' }); return }

    // 진화 가족: 뿌리까지 올라간 뒤 아래로 전부
    let root = species
    for (let i = 0; i < 3 && root.evolvesFromDexId; i++) {
      const up = await prisma.pokemonSpecies.findUnique({ where: { dexId: root.evolvesFromDexId }, select: speciesSelect })
      if (!up) break
      root = up
    }
    const family = [root]
    for (let frontier = [root.dexId], depth = 0; frontier.length && depth < 3; depth++) {
      const next = await prisma.pokemonSpecies.findMany({ where: { evolvesFromDexId: { in: frontier } }, select: speciesSelect, orderBy: { dexId: 'asc' } })
      family.push(...next)
      frontier = next.map(n => n.dexId)
    }

    const cards = await prisma.card.findMany({
      where: { dexIds: { has: dexId } },
      select: {
        id: true, name: true, nameKo: true, nameJa: true, tcgType: true, setName: true, setCode: true, cardNumber: true,
        rarity: true, imageUrl: true, stage: true, regulationMark: true, snkrdunkPrice: true, externalId: true, createdAt: true,
        _count: { select: { listings: { where: { status: 'ACTIVE' } } } },
      },
      orderBy: [{ snkrdunkPrice: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: 300,
    })
    const counts = await cardCountsByDex()

    res.json({
      species,
      family: family.map(f => ({ dexId: f.dexId, nameKo: f.nameKo, evolvesFromDexId: f.evolvesFromDexId, cardCount: counts.get(f.dexId) ?? 0 })),
      cards: cards.map(({ externalId, _count, ...c }) => ({ ...c, lang: cardLangOf(externalId), activeListings: _count.listings })),
      cardTotal: counts.get(dexId) ?? 0,
    })
  } catch (err) {
    console.error('[getPokedexEntry]', err)
    res.status(500).json({ message: '도감 정보를 불러오지 못했습니다.' })
  }
}

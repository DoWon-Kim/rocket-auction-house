import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { TcgType } from '@prisma/client'

const TCG_TYPE_VALUES = Object.values(TcgType)

// ── 세트별 수집 현황 요약 ─────────────────────────────────────────────────────

export async function getMyCollectionSummary(req: AuthRequest, res: Response) {
  try {
    // 두 독립 쿼리를 병렬 실행
    const [totals, ownedInventory] = await Promise.all([
      prisma.card.groupBy({
        by: ['tcgType', 'setName'],
        _count: { _all: true },
      }),
      // card 관계를 include해 별도 findMany 제거 (IN 절 불필요)
      prisma.inventoryItem.findMany({
        where: { userId: req.userId! },
        select: {
          cardId: true,
          card: { select: { tcgType: true, setName: true } },
        },
        distinct: ['cardId'],
      }),
    ])

    const ownedCountMap = new Map<string, number>()
    for (const inv of ownedInventory) {
      const key = `${inv.card.tcgType}::${inv.card.setName}`
      ownedCountMap.set(key, (ownedCountMap.get(key) ?? 0) + 1)
    }

    const sets = totals.map(t => {
      const key = `${t.tcgType}::${t.setName}`
      const ownedCount = ownedCountMap.get(key) ?? 0
      const totalCount = (t._count as { _all: number })._all
      return {
        tcgType: t.tcgType,
        setName: t.setName,
        ownedCount,
        totalCount,
        percentage: totalCount > 0 ? Math.round((ownedCount / totalCount) * 1000) / 10 : 0,
      }
    }).sort((a, b) => b.percentage - a.percentage || b.totalCount - a.totalCount)

    const overall = {
      totalSets: sets.length,
      completedSets: sets.filter(s => s.ownedCount >= s.totalCount && s.totalCount > 0).length,
      totalCardsOwned: ownedInventory.length,   // 고유 카드 종류 수
      totalCardsAvailable: totals.reduce((sum, t) => sum + (t._count as { _all: number })._all, 0),
    }

    res.json({ sets, overall })
  } catch (err) {
    console.error('[getMyCollectionSummary]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// ── 특정 세트 카드 목록 (소유 여부 포함) ──────────────────────────────────────

export async function getMyCollectionSet(req: AuthRequest, res: Response) {
  try {
    const tcgTypeRaw = String(req.params['tcgType'])
    const setName    = decodeURIComponent(String(req.params['setName']))

    // 런타임 enum 검증 (as 캐스팅만으로는 Prisma가 500 던짐)
    if (!TCG_TYPE_VALUES.includes(tcgTypeRaw as TcgType)) {
      res.status(400).json({ message: '유효하지 않은 TCG 타입입니다.' }); return
    }
    const tcgType = tcgTypeRaw as TcgType

    const cards = await prisma.card.findMany({
      where: { tcgType, setName },
      select: {
        id: true, name: true, nameKo: true, cardNumber: true,
        rarity: true, imageUrl: true,
      },
      orderBy: [{ cardNumber: 'asc' }, { name: 'asc' }],
    })

    const owned = await prisma.inventoryItem.groupBy({
      by: ['cardId'],
      where: { userId: req.userId!, cardId: { in: cards.map(c => c.id) } },
      _sum: { quantity: true },
    })
    const ownedMap = new Map(owned.map(o => [o.cardId, o._sum.quantity ?? 0]))

    const result = cards.map(card => ({
      ...card,
      owned: ownedMap.has(card.id),
      quantity: ownedMap.get(card.id) ?? 0,
    }))

    res.json({
      tcgType, setName,
      cards: result,
      ownedCount: result.filter(c => c.owned).length,
      totalCount: result.length,
    })
  } catch (err) {
    console.error('[getMyCollectionSet]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

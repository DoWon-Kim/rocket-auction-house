import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'

// 아이템 가중치 계산: weight > 0 이면 커스텀, 아니면 등급 기반 기본값
function getWeight(item: { grade: number; weight: number }): number {
  if (item.weight > 0) return item.weight
  return item.grade === 3 ? 1 : item.grade === 2 ? 10 : 89
}

export async function getOripaList(_req: AuthRequest, res: Response) {
  try {
    const oripas = await prisma.oripa.findMany({
      where: { isActive: true },
      include: {
        items: {
          include: { card: { select: { id: true, name: true, rarity: true, imageUrl: true, tcgType: true } } },
        },
        _count: { select: { purchases: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    // 각 오리파에 확률 정보 계산해서 포함
    const withProb = oripas.map((oripa) => {
      const totalWeight = oripa.items.reduce((s, i) => s + getWeight(i), 0)
      const items = oripa.items.map((item) => ({
        ...item,
        probability: totalWeight > 0 ? getWeight(item) / totalWeight : 0,
      }))
      return { ...oripa, items }
    })

    res.json(withProb)
  } catch (err) {
    console.error('[getOripaList]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

export async function getOripa(req: AuthRequest, res: Response) {
  try {
    const oripa = await prisma.oripa.findUnique({
      where: { id: String(req.params['id']) },
      include: {
        items: {
          include: { card: { select: { id: true, name: true, imageUrl: true, rarity: true, tcgType: true, setName: true, nameKo: true } } },
          orderBy: { grade: 'desc' },
        },
        _count: { select: { purchases: true } },
      },
    })
    if (!oripa) {
      res.status(404).json({ message: '오리파를 찾을 수 없습니다.' })
      return
    }

    // 확률 계산
    const totalWeight = oripa.items.reduce((s, i) => s + getWeight(i), 0)
    const items = oripa.items.map((item) => ({
      ...item,
      probability: totalWeight > 0 ? getWeight(item) / totalWeight : 0,
    }))

    res.json({ ...oripa, items, totalWeight })
  } catch (err) {
    console.error('[getOripa]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

export async function getOripaHistory(req: AuthRequest, res: Response) {
  const limit = Math.min(30, Number(req.query.limit ?? '20'))
  try {
    const purchases = await prisma.oripaPurchase.findMany({
      where: { oripaId: String(req.params['id']) },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { user: { select: { nickname: true } } },
    })
    res.json(purchases)
  } catch (err) {
    console.error('[getOripaHistory]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

export async function drawOripa(req: AuthRequest, res: Response) {
  const { draws = 1 } = req.body
  const drawCount = Math.min(Math.max(Number(draws), 1), 10)

  try {
    const oripa = await prisma.oripa.findUnique({
      where: { id: String(req.params['id']) },
      include: { items: { include: { card: true } } },
    })
    if (!oripa || !oripa.isActive) {
      res.status(404).json({ message: '오리파를 찾을 수 없습니다.' })
      return
    }
    if (oripa.remainSlots < drawCount) {
      res.status(400).json({ message: `남은 슬롯(${oripa.remainSlots})보다 많이 뽑을 수 없습니다.` })
      return
    }

    const totalCost = oripa.pricePerDraw * drawCount

    // 가중치 기반 뽑기 풀 구성
    type PoolEntry = { card: typeof oripa.items[0]['card']; grade: number; isLastOne: boolean }
    const pool: PoolEntry[] = []
    for (const item of oripa.items) {
      const w = getWeight(item)
      for (let i = 0; i < w; i++) {
        pool.push({ card: item.card, grade: item.grade, isLastOne: item.isLastOne })
      }
    }
    if (pool.length === 0) {
      res.status(400).json({ message: '수록 카드가 없습니다.' })
      return
    }

    // 일반 뽑기 결과 생성
    const results: PoolEntry[] = Array.from({ length: drawCount }, () => {
      const picked = pool[Math.floor(Math.random() * pool.length)]
      return { card: picked.card, grade: picked.grade, isLastOne: false }
    })

    // ── 라스트 원 처리: 이 뽑기로 슬롯이 0이 되면 마지막 결과를 보장 아이템으로 교체
    const isLastDraw = oripa.remainSlots - drawCount <= 0
    if (isLastDraw) {
      const lastOneItem = oripa.items.find((i) => i.isLastOne)
        ?? oripa.items.reduce((a, b) => (a.grade > b.grade ? a : b)) // fallback: 최고 등급
      results[results.length - 1] = {
        card: lastOneItem.card,
        grade: lastOneItem.grade,
        isLastOne: true,
      }
    }

    // 잔액·슬롯 차감 + 구매·인벤토리 기록을 단일 트랜잭션으로 처리
    // 중간 실패 시 Prisma가 전체를 롤백하므로 수동 복구 불필요
    let purchase: { id: string } | null = null
    try {
      purchase = await prisma.$transaction(async (tx) => {
        const balanceDeducted = await tx.user.updateMany({
          where: { id: req.userId!, balance: { gte: totalCost } },
          data: { balance: { decrement: totalCost } },
        })
        if (balanceDeducted.count === 0) throw Object.assign(new Error('INSUFFICIENT_BALANCE'), { expose: true, status: 400, message: '잔액이 부족합니다.' })

        const slotsDeducted = await tx.oripa.updateMany({
          where: { id: oripa.id, remainSlots: { gte: drawCount }, isActive: true },
          data: { remainSlots: { decrement: drawCount } },
        })
        if (slotsDeducted.count === 0) throw Object.assign(new Error('INSUFFICIENT_SLOTS'), { expose: true, status: 400, message: '남은 슬롯이 부족합니다.' })

        const p = await tx.oripaPurchase.create({
          data: { oripaId: oripa.id, userId: req.userId!, draws: drawCount, results, totalPaid: totalCost },
        })
        await tx.inventoryItem.createMany({
          data: results.map((r) => ({
            userId: req.userId!, cardId: r.card.id, quantity: 1,
            source: 'ORIPA' as const, sourceId: p.id,
          })),
        })
        return p
      })
    } catch (err) {
      const e = err as { expose?: boolean; status?: number; message?: string }
      if (e.expose) {
        res.status(e.status ?? 400).json({ message: e.message })
        return
      }
      throw err
    }

    res.json({ results, totalPaid: totalCost, isLastDraw })
  } catch (err) {
    console.error('[drawOripa]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

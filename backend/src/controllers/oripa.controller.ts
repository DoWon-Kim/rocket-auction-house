// 오리파 (공개): 목록 · 상세 · 당첨 현황 · 뽑기 — 봉인된 티켓 순서대로 1장씩 꺼내는 비복원 추첨
import { Response } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { getIo } from '../lib/socketio'
import { maskName } from '../lib/oripaFair'

const CARD_SEL = { id: true, name: true, nameKo: true, imageUrl: true, rarity: true, tcgType: true, setName: true, snkrdunkPrice: true } as const
const ITEM_SEL = {
  id: true, prizeType: true, pointAmount: true, label: true, grade: true, quantity: true, remaining: true,
  exchangeValue: true, isLastOne: true, sortOrder: true, card: { select: CARD_SEL },
} satisfies Prisma.OripaItemSelect

// 결과 한 줄 (구매 기록 results JSON 에 저장)
export interface DrawResult {
  ticketNo: number | null // 몇 번째 티켓인지 (라스트원상은 null)
  itemId: string
  grade: number
  prizeType: 'CARD' | 'POINT'
  pointAmount: number | null
  exchangeValue: number | null
  label: string | null
  isLastOne: boolean
  card: { id: string; name: string; nameKo: string | null; imageUrl: string | null; rarity: string } | null
}

const prizeName = (r: Pick<DrawResult, 'label' | 'prizeType' | 'pointAmount' | 'card'>) =>
  r.label || (r.prizeType === 'POINT' ? `${(r.pointAmount ?? 0).toLocaleString()}P` : r.card?.nameKo ?? r.card?.name ?? '상품')

// 공개용 오리파 (완판 전에는 시드·티켓 순서를 절대 내보내지 않음)
function publicOripa<T extends { status: string; serverSeed: string | null; ticketOrder: string[] }>(o: T) {
  const { serverSeed, ticketOrder, ...rest } = o
  return o.status === 'SOLD_OUT' ? { ...rest, serverSeed, ticketOrder } : rest
}

export async function getOripaList(req: AuthRequest, res: Response) {
  try {
    const filter = String(req.query.status ?? 'live')
    const where: Prisma.OripaWhereInput = filter === 'soldout' ? { status: 'SOLD_OUT' } : filter === 'all' ? { status: { in: ['LIVE', 'SOLD_OUT'] } } : { status: 'LIVE' }
    const oripas = await prisma.oripa.findMany({
      where,
      orderBy: [{ status: 'asc' }, { startedAt: 'desc' }],
      take: 60,
      select: {
        id: true, title: true, description: true, imageUrl: true, tcgType: true, pricePerDraw: true, totalSlots: true,
        remainSlots: true, maxPerDraw: true, status: true, startedAt: true, soldOutAt: true,
        items: { select: ITEM_SEL, orderBy: [{ grade: 'desc' }, { sortOrder: 'asc' }] },
        _count: { select: { purchases: true } },
      },
    })
    res.json(oripas.map(o => ({ ...o, items: o.items.filter(i => i.grade >= 3 || i.isLastOne).slice(0, 6), prizeCount: o.items.length })))
  } catch (err) {
    console.error('[getOripaList]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

export async function getOripa(req: AuthRequest, res: Response) {
  try {
    const oripa = await prisma.oripa.findUnique({
      where: { id: String(req.params['id']) },
      include: { items: { select: ITEM_SEL, orderBy: [{ grade: 'desc' }, { sortOrder: 'asc' }] }, _count: { select: { purchases: true } } },
    })
    if (!oripa || oripa.status === 'DRAFT') { res.status(404).json({ message: '오리파를 찾을 수 없습니다.' }); return }
    res.json(publicOripa(oripa))
  } catch (err) {
    console.error('[getOripa]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// 당첨 현황: 최근 뽑힌 티켓 (닉네임 가림)
export async function getOripaHistory(req: AuthRequest, res: Response) {
  const limit = Math.min(50, Number(req.query.limit ?? 30))
  try {
    const purchases = await prisma.oripaPurchase.findMany({
      where: { oripaId: String(req.params['id']) },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, draws: true, results: true, createdAt: true, user: { select: { nickname: true } } },
    })
    res.json(purchases.map(p => ({
      id: p.id, draws: p.draws, createdAt: p.createdAt, nickname: maskName(p.user.nickname),
      results: (p.results as unknown as DrawResult[]).map(r => ({ ...r, name: prizeName(r) })),
    })))
  } catch (err) {
    console.error('[getOripaHistory]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// 전체 오리파의 최근 대박 당첨 (상위상 이상·라스트원상) — 목록 상단 전광판
export async function getRecentHits(_req: AuthRequest, res: Response) {
  try {
    const purchases = await prisma.oripaPurchase.findMany({
      orderBy: { createdAt: 'desc' }, take: 200,
      select: { createdAt: true, results: true, user: { select: { nickname: true } }, oripa: { select: { id: true, title: true } } },
    })
    const hits = purchases.flatMap(p => (p.results as unknown as DrawResult[])
      .filter(r => r.grade >= 3 || r.isLastOne)
      .map(r => ({ at: p.createdAt, nickname: maskName(p.user.nickname), oripaId: p.oripa.id, oripaTitle: p.oripa.title, grade: r.grade, isLastOne: r.isLastOne, name: prizeName(r), imageUrl: r.card?.imageUrl ?? null })))
      .slice(0, 20)
    res.json(hits)
  } catch (err) {
    console.error('[getRecentHits]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// ── 뽑기 ──────────────────────────────────────────────────────────────────────

class DrawError extends Error { constructor(public status: number, message: string) { super(message) } }

export async function drawOripa(req: AuthRequest, res: Response) {
  const oripaId = String(req.params['id'])
  const requested = Math.floor(Number(req.body?.draws ?? 1))
  if (!Number.isFinite(requested) || requested < 1) { res.status(400).json({ message: '뽑기 수를 확인해주세요.' }); return }

  try {
    const outcome = await prisma.$transaction(async tx => {
      // 같은 오리파 동시 뽑기는 줄 세워서 처리 (티켓이 겹치지 않게)
      await tx.$queryRaw`SELECT id FROM "Oripa" WHERE id = ${oripaId} FOR UPDATE`
      const oripa = await tx.oripa.findUnique({ where: { id: oripaId }, include: { items: { select: { ...ITEM_SEL } } } })
      if (!oripa || oripa.status === 'DRAFT') throw new DrawError(404, '오리파를 찾을 수 없습니다.')
      if (oripa.status === 'SOLD_OUT' || oripa.remainSlots <= 0) throw new DrawError(400, '완판된 오리파예요.')
      if (oripa.status !== 'LIVE') throw new DrawError(400, '지금은 판매가 잠시 멈춰 있어요.')
      const n = Math.min(requested, oripa.maxPerDraw, oripa.remainSlots)
      const cost = oripa.pricePerDraw * n

      const paid = await tx.user.updateMany({ where: { id: req.userId!, balance: { gte: cost } }, data: { balance: { decrement: cost } } })
      if (paid.count === 0) throw new DrawError(400, '포인트가 부족해요.')

      // 봉인된 순서에서 다음 n장
      const start = oripa.ticketOrder.length - oripa.remainSlots
      const ids = oripa.ticketOrder.slice(start, start + n)
      const byId = new Map(oripa.items.map(i => [i.id, i]))
      const toResult = (id: string, ticketNo: number | null, isLastOne = false): DrawResult => {
        const it = byId.get(id)!
        return {
          ticketNo, itemId: id, grade: it.grade, prizeType: it.prizeType, pointAmount: it.pointAmount, exchangeValue: it.exchangeValue,
          label: it.label, isLastOne,
          card: it.card ? { id: it.card.id, name: it.card.name, nameKo: it.card.nameKo, imageUrl: it.card.imageUrl, rarity: it.card.rarity } : null,
        }
      }
      const results = ids.map((id, k) => toResult(id, start + k + 1))

      // 남은 수 차감
      const counts = new Map<string, number>()
      for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1)
      for (const [id, c] of counts) await tx.oripaItem.update({ where: { id }, data: { remaining: { decrement: c } } })

      // 마지막 1장을 뽑았으면 라스트원상 추가 지급 + 완판 처리
      const soldOut = oripa.remainSlots - n <= 0
      const lastOne = soldOut ? oripa.items.find(i => i.isLastOne && i.remaining > 0) : undefined
      if (lastOne) {
        results.push(toResult(lastOne.id, null, true))
        await tx.oripaItem.update({ where: { id: lastOne.id }, data: { remaining: 0 } })
      }
      await tx.oripa.update({
        where: { id: oripa.id },
        data: { remainSlots: { decrement: n }, ...(soldOut ? { status: 'SOLD_OUT', soldOutAt: new Date() } : {}) },
      })

      const purchase = await tx.oripaPurchase.create({
        data: { oripaId: oripa.id, userId: req.userId!, draws: n, results: results as unknown as Prisma.InputJsonValue, totalPaid: cost },
      })

      // 포인트 상품은 즉시 지급, 카드는 보관함으로
      const pointWin = results.filter(r => r.prizeType === 'POINT').reduce((s, r) => s + (r.pointAmount ?? 0), 0)
      if (pointWin > 0) await tx.user.update({ where: { id: req.userId! }, data: { balance: { increment: pointWin } } })
      const cards = results.filter(r => r.prizeType === 'CARD' && r.card)
      const inventoryIds: Record<number, string> = {}
      for (let k = 0; k < results.length; k++) {
        const r = results[k]
        if (r.prizeType !== 'CARD' || !r.card) continue
        const inv = await tx.inventoryItem.create({
          data: { userId: req.userId!, cardId: r.card.id, quantity: 1, source: 'ORIPA', sourceId: purchase.id, exchangeValue: r.exchangeValue },
          select: { id: true },
        })
        inventoryIds[k] = inv.id
      }
      const user = await tx.user.findUnique({ where: { id: req.userId! }, select: { balance: true, nickname: true } })
      return { oripa, n, cost, results, soldOut, pointWin, cards: cards.length, inventoryIds, balance: user!.balance, nickname: user!.nickname }
    }, { timeout: 15_000 })

    // 실시간: 이 오리파 화면에 남은 수 갱신 + 대박 알림
    const fresh = await prisma.oripa.findUnique({ where: { id: oripaId }, select: { remainSlots: true, status: true, items: { select: { id: true, remaining: true } } } })
    const hits = outcome.results.filter(r => r.grade >= 3 || r.isLastOne).map(r => ({ grade: r.grade, isLastOne: r.isLastOne, name: prizeName(r), imageUrl: r.card?.imageUrl ?? null }))
    getIo()?.to(`oripa:${oripaId}`).emit('oripa:update', { oripaId, remainSlots: fresh?.remainSlots, status: fresh?.status, items: fresh?.items, drawn: outcome.n, nickname: maskName(outcome.nickname), hits })
    if (hits.length) getIo()?.emit('oripa:hit', { oripaId, oripaTitle: outcome.oripa.title, nickname: maskName(outcome.nickname), hits, at: new Date() })

    res.json({
      results: outcome.results.map((r, k) => ({ ...r, name: prizeName(r), inventoryItemId: outcome.inventoryIds[k] ?? null })),
      draws: outcome.n, totalPaid: outcome.cost, pointWin: outcome.pointWin, soldOut: outcome.soldOut, balance: outcome.balance,
    })
  } catch (err) {
    if (err instanceof DrawError) { res.status(err.status).json({ message: err.message }); return }
    console.error('[drawOripa]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

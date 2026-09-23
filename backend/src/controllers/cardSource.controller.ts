import { Response } from 'express'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { findCandidates, refreshCardPrice, rematchPending, SNKRDUNK_PRODUCT_URL } from '../services/snkrdunk.service'
import { runSnkrdunkSync, requestCancel, SyncBusyError } from '../services/syncRun.service'
import { snkrdunkSchedule } from '../jobs/snkrdunkSync'

// ── 관리자: 외부 소스 상품 ↔ 카드 매칭 검수 ───────────────────────────────────

const STATUSES = ['PENDING', 'LINKED', 'IGNORED'] as const
const TCG_TYPES = ['POKEMON', 'YUGIOH', 'MTG', 'DIGIMON', 'ONEPIECE', 'WEISS', 'OTHER'] as const

const cardBrief = {
  id: true, name: true, nameJa: true, nameKo: true, setName: true, setCode: true,
  cardNumber: true, rarity: true, imageUrl: true, tcgType: true,
} satisfies Prisma.CardSelect

export async function listCardSourceItems(req: AuthRequest, res: Response) {
  try {
    const status = STATUSES.find(s => s === req.query.status) ?? 'PENDING'
    const tcgType = TCG_TYPES.find(t => t === req.query.tcgType)
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : ''
    const page = Math.max(1, Number(req.query.page) || 1)
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20))

    // 연결된 카드가 삭제된 항목(cardId SetNull)은 다시 검수 대기로
    await prisma.cardSourceItem.updateMany({ where: { status: 'LINKED', cardId: null }, data: { status: 'PENDING', matchMethod: null } })

    const base: Prisma.CardSourceItemWhereInput = { source: 'SNKRDUNK', ...(tcgType ? { tcgType } : {}) }
    const where: Prisma.CardSourceItemWhereInput = {
      ...base, status,
      ...(q ? { OR: [
        { rawName: { contains: q, mode: 'insensitive' } },
        { setCode: { contains: q, mode: 'insensitive' } },
        { cardNumber: { contains: q, mode: 'insensitive' } },
        { productCode: { contains: q, mode: 'insensitive' } },
      ] } : {}),
    }

    const [items, total, grouped] = await Promise.all([
      prisma.cardSourceItem.findMany({
        where,
        // 대기: 시세가 있는(매물 많은) 상품부터 / 연결·무시: 최근 처리순
        orderBy: status === 'PENDING' ? [{ price: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }] : [{ updatedAt: 'desc' }],
        skip: (page - 1) * limit, take: limit,
        include: { card: { select: cardBrief } },
      }),
      prisma.cardSourceItem.count({ where }),
      prisma.cardSourceItem.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
    ])

    const counts = Object.fromEntries(STATUSES.map(s => [s, grouped.find(g => g.status === s)?._count._all ?? 0]))

    // 대기 항목엔 추천 후보 3개
    const withCandidates = await Promise.all(items.map(async item => ({
      ...item,
      productUrl: SNKRDUNK_PRODUCT_URL(item.externalId),
      candidates: item.status === 'PENDING'
        ? (await findCandidates(item, { fuzzy: true, limit: 3 })).map(c => ({
            card: { ...c.card, externalId: undefined },
            score: c.score, setMatch: c.setMatch, numberMatch: c.numberMatch, langMatch: c.langMatch,
          }))
        : [],
    })))

    res.json({ items: withCandidates, total, counts })
  } catch (err) {
    console.error('[listCardSourceItems]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// 기존 카드에 연결
export async function linkCardSourceItem(req: AuthRequest, res: Response) {
  const parsed = z.object({ cardId: z.string().min(1) }).safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ message: 'cardId가 필요합니다.' }); return }
  try {
    const item = await prisma.cardSourceItem.findUnique({ where: { id: String(req.params.id) } })
    if (!item) { res.status(404).json({ message: '항목을 찾을 수 없습니다.' }); return }
    const card = await prisma.card.findUnique({ where: { id: parsed.data.cardId }, select: { id: true, tcgType: true, imageUrl: true } })
    if (!card) { res.status(404).json({ message: '카드를 찾을 수 없습니다.' }); return }
    if (card.tcgType !== item.tcgType) { res.status(400).json({ message: 'TCG 종류가 다른 카드에는 연결할 수 없습니다.' }); return }

    await prisma.cardSourceItem.update({
      where: { id: item.id },
      data: { status: 'LINKED', cardId: card.id, matchMethod: 'MANUAL', resolvedById: req.userId, resolvedAt: new Date() },
    })
    if (!card.imageUrl && item.imageUrl) await prisma.card.update({ where: { id: card.id }, data: { imageUrl: item.imageUrl } })
    await refreshCardPrice(card.id)
    if (item.cardId && item.cardId !== card.id) await refreshCardPrice(item.cardId)
    res.json({ ok: true })
  } catch (err) {
    console.error('[linkCardSourceItem]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// 신규 카드로 등록 후 연결
export async function createCardFromSourceItem(req: AuthRequest, res: Response) {
  try {
    const item = await prisma.cardSourceItem.findUnique({ where: { id: String(req.params.id) } })
    if (!item) { res.status(404).json({ message: '항목을 찾을 수 없습니다.' }); return }
    if (item.status === 'LINKED' && item.cardId) { res.status(409).json({ message: '이미 카드에 연결된 항목입니다.' }); return }

    const externalId = `snkrdunk_${item.externalId}`
    const card = await prisma.card.upsert({
      where: { externalId },
      create: {
        externalId,
        name: item.name,
        tcgType: item.tcgType,
        setName: item.setName ?? 'Unknown',
        setCode: item.setCode,
        cardNumber: item.cardNumber,
        rarity: item.rarity ?? 'Unknown',
        imageUrl: item.imageUrl,
      },
      update: {},
      select: { id: true },
    })
    await prisma.cardSourceItem.update({
      where: { id: item.id },
      data: { status: 'LINKED', cardId: card.id, matchMethod: 'CREATED', resolvedById: req.userId, resolvedAt: new Date() },
    })
    await refreshCardPrice(card.id)
    res.status(201).json({ ok: true, cardId: card.id })
  } catch (err) {
    console.error('[createCardFromSourceItem]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// 일괄 처리: 무시 / 다시 검수(연결 해제 포함). 이후 자동 매칭하지 않고 수동 처리만 받는다.
export async function bulkUpdateCardSourceItems(req: AuthRequest, res: Response) {
  const parsed = z.object({
    ids: z.array(z.string().min(1)).min(1).max(200),
    action: z.enum(['ignore', 'reopen']),
  }).safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ message: '잘못된 요청입니다.' }); return }
  try {
    const { ids, action } = parsed.data
    const items = await prisma.cardSourceItem.findMany({ where: { id: { in: ids } }, select: { id: true, cardId: true } })
    await prisma.cardSourceItem.updateMany({
      where: { id: { in: items.map(i => i.id) } },
      data: {
        status: action === 'ignore' ? 'IGNORED' : 'PENDING',
        cardId: null, matchMethod: null,
        // 관리자가 처리한 항목은 이후 자동 매칭 대상에서 제외 (연결 해제한 카드에 다시 붙지 않도록)
        resolvedById: req.userId, resolvedAt: new Date(),
      },
    })
    // 연결이 풀린 카드의 표시 가격 재계산
    for (const cardId of new Set(items.map(i => i.cardId).filter((v): v is string => !!v))) await refreshCardPrice(cardId)
    res.json({ ok: true, updated: items.length })
  } catch (err) {
    console.error('[bulkUpdateCardSourceItems]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// 대기 항목 다시 자동 매칭 (새 세트 임포트 후)
export async function rematchCardSourceItems(req: AuthRequest, res: Response) {
  const parsed = z.object({ ids: z.array(z.string().min(1)).max(200).optional() }).safeParse(req.body ?? {})
  if (!parsed.success) { res.status(400).json({ message: '잘못된 요청입니다.' }); return }
  try {
    res.json(await rematchPending(parsed.data.ids))
  } catch (err) {
    console.error('[rematchCardSourceItems]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// ── 동기화 상태 / 수동 실행 / 취소 ───────────────────────────────────────────

export async function getSyncStatus(_req: AuthRequest, res: Response) {
  try {
    const runs = await prisma.syncRun.findMany({ where: { source: 'SNKRDUNK' }, orderBy: { startedAt: 'desc' }, take: 10 })
    const [snapshotDays, snapshotCards] = await Promise.all([
      prisma.cardPriceSnapshot.groupBy({ by: ['date'], where: { source: 'SNKRDUNK' } }).then(r => r.length),
      prisma.card.count({ where: { snkrdunkPrice: { gt: 0 } } }),
    ])
    res.json({ schedule: snkrdunkSchedule(), runs, running: runs.find(r => r.status === 'RUNNING') ?? null, snapshotDays, snapshotCards })
  } catch (err) {
    console.error('[getSyncStatus]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// 백그라운드 실행 (브라우저를 닫아도 계속). 진행 상황은 getSyncStatus로 확인
export async function startSync(req: AuthRequest, res: Response) {
  let responded = false
  runSnkrdunkSync({
    trigger: 'MANUAL', triggeredById: req.userId,
    onStart: run => { responded = true; res.status(202).json({ runId: run.id }) },
  }).catch(err => {
    if (responded) { console.error('[startSync]', err); return }
    if (err instanceof SyncBusyError) res.status(409).json({ message: err.message, runId: err.running.id })
    else { console.error('[startSync]', err); res.status(500).json({ message: '동기화를 시작하지 못했습니다.' }) }
  })
}

export async function cancelSync(req: AuthRequest, res: Response) {
  const run = await prisma.syncRun.findUnique({ where: { id: String(req.params.runId) } }).catch(() => null)
  if (!run || run.status !== 'RUNNING') { res.status(404).json({ message: '실행 중인 동기화가 없습니다.' }); return }
  requestCancel(run.id)
  res.json({ ok: true })
}

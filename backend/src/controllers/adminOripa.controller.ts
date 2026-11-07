// 관리자 오리파: 준비(상품 구성) → 판매 시작(티켓 봉인) → 일시중지/재개 → 완판(시드 공개)
import { Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { sealTickets, returnRate } from '../lib/oripaFair'

class Fail extends Error { constructor(public status: number, message: string) { super(message) } }
const handle = (res: Response, tag: string) => (err: unknown) => {
  if (err instanceof Fail) { res.status(err.status).json({ message: err.message }); return }
  console.error(tag, err)
  res.status(500).json({ message: '서버 오류가 발생했습니다.' })
}

const TCG = ['POKEMON', 'YUGIOH', 'MTG', 'DIGIMON', 'ONEPIECE', 'WEISS', 'OTHER'] as const
const oripaSchema = z.object({
  title: z.string().trim().min(1).max(60),
  description: z.string().max(2000).nullable().optional(),
  imageUrl: z.string().url().nullable().optional().or(z.literal('')),
  tcgType: z.enum(TCG).default('POKEMON'),
  pricePerDraw: z.number().int().min(1).max(10_000_000),
  totalSlots: z.number().int().min(1).max(100_000),
  maxPerDraw: z.number().int().min(1).max(100).default(10),
})
const itemSchema = z.object({
  prizeType: z.enum(['CARD', 'POINT']).default('CARD'),
  cardId: z.string().uuid().nullable().optional(),
  pointAmount: z.number().int().min(1).nullable().optional(),
  label: z.string().trim().max(40).nullable().optional(),
  grade: z.number().int().min(1).max(4),
  quantity: z.number().int().min(1).max(100_000),
  exchangeValue: z.number().int().min(0).nullable().optional(),
  isLastOne: z.boolean().default(false),
  sortOrder: z.number().int().optional(),
})

// 준비 상태 점검: 티켓 수 합계 = 남은 티켓 수, 상품 구성 오류
function readiness(o: { remainSlots: number; items: Array<{ quantity: number; isLastOne: boolean; prizeType: string; cardId: string | null; pointAmount: number | null }> }) {
  const tickets = o.items.filter(i => !i.isLastOne).reduce((s, i) => s + i.quantity, 0)
  const problems: string[] = []
  if (o.items.filter(i => !i.isLastOne).length === 0) problems.push('상품을 1개 이상 추가해주세요.')
  if (tickets !== o.remainSlots) problems.push(`상품 수량 합계(${tickets})가 티켓 수(${o.remainSlots})와 같아야 해요.`)
  if (o.items.filter(i => i.isLastOne).length > 1) problems.push('라스트원상은 1개만 둘 수 있어요.')
  if (o.items.some(i => i.prizeType === 'CARD' && !i.cardId)) problems.push('카드 상품에 카드가 연결되지 않았어요.')
  if (o.items.some(i => i.prizeType === 'POINT' && !i.pointAmount)) problems.push('포인트 상품에 지급액이 없어요.')
  return { tickets, problems, ready: problems.length === 0 }
}

const withStats = async (id: string) => {
  const o = await prisma.oripa.findUnique({
    where: { id },
    include: {
      items: { include: { card: { select: { id: true, name: true, nameKo: true, imageUrl: true, rarity: true, setName: true, snkrdunkPrice: true } } }, orderBy: [{ grade: 'desc' }, { sortOrder: 'asc' }] },
      _count: { select: { purchases: true } },
    },
  })
  if (!o) throw new Fail(404, '오리파를 찾을 수 없습니다.')
  const revenue = await prisma.oripaPurchase.aggregate({ where: { oripaId: id }, _sum: { totalPaid: true } })
  const { serverSeed, ticketOrder, ...rest } = o
  return {
    ...rest,
    ...(o.status === 'SOLD_OUT' ? { serverSeed, ticketOrder } : { sealed: ticketOrder.length > 0 }), // 완판 전엔 관리자에게도 시드·순서 비공개
    readiness: readiness(o),
    economics: { ...returnRate(o.items, o.pricePerDraw, o.totalSlots), sold: o.totalSlots - o.remainSlots, earned: revenue._sum.totalPaid ?? 0 },
  }
}

export async function adminListOripas(_req: AuthRequest, res: Response) {
  try {
    const rows = await prisma.oripa.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, imageUrl: true, status: true, pricePerDraw: true, totalSlots: true, remainSlots: true, createdAt: true, startedAt: true, soldOutAt: true, _count: { select: { items: true, purchases: true } } },
    })
    const revenue = await prisma.oripaPurchase.groupBy({ by: ['oripaId'], _sum: { totalPaid: true } })
    const rev = new Map(revenue.map(r => [r.oripaId, r._sum.totalPaid ?? 0]))
    res.json(rows.map(r => ({ ...r, earned: rev.get(r.id) ?? 0 })))
  } catch (err) { handle(res, '[adminListOripas]')(err) }
}

export async function adminGetOripa(req: AuthRequest, res: Response) {
  withStats(String(req.params['id'])).then(o => res.json(o)).catch(handle(res, '[adminGetOripa]'))
}

export async function adminCreateOripa(req: AuthRequest, res: Response) {
  const p = oripaSchema.safeParse(req.body)
  if (!p.success) { res.status(400).json({ message: '입력값을 확인해주세요.', errors: p.error.flatten() }); return }
  try {
    const o = await prisma.oripa.create({ data: { ...p.data, imageUrl: p.data.imageUrl || null, remainSlots: p.data.totalSlots, status: 'DRAFT' } })
    res.status(201).json(o)
  } catch (err) { handle(res, '[adminCreateOripa]')(err) }
}

export async function adminUpdateOripa(req: AuthRequest, res: Response) {
  const p = oripaSchema.partial().safeParse(req.body)
  if (!p.success) { res.status(400).json({ message: '입력값을 확인해주세요.' }); return }
  try {
    const id = String(req.params['id'])
    const o = await prisma.oripa.findUnique({ where: { id }, select: { status: true, totalSlots: true, remainSlots: true } })
    if (!o) throw new Fail(404, '오리파를 찾을 수 없습니다.')
    const locked = o.status !== 'DRAFT'
    if (locked && (p.data.pricePerDraw !== undefined || p.data.totalSlots !== undefined)) throw new Fail(400, '판매를 시작한 뒤에는 가격·티켓 수를 바꿀 수 없어요.')
    const data = { ...p.data, ...(p.data.imageUrl !== undefined ? { imageUrl: p.data.imageUrl || null } : {}) }
    // 준비 중에 티켓 수를 바꾸면 남은 수도 함께 (이미 팔린 수는 유지)
    if (!locked && p.data.totalSlots !== undefined) Object.assign(data, { remainSlots: p.data.totalSlots - (o.totalSlots - o.remainSlots) })
    await prisma.oripa.update({ where: { id }, data })
    res.json(await withStats(id))
  } catch (err) { handle(res, '[adminUpdateOripa]')(err) }
}

async function draftOnly(oripaId: string) {
  const o = await prisma.oripa.findUnique({ where: { id: oripaId }, select: { status: true } })
  if (!o) throw new Fail(404, '오리파를 찾을 수 없습니다.')
  if (o.status !== 'DRAFT') throw new Fail(400, '판매를 시작한 뒤에는 상품 구성을 바꿀 수 없어요. (공정성 보장)')
}

function normalizeItem(d: z.infer<typeof itemSchema>) {
  return {
    prizeType: d.prizeType,
    cardId: d.prizeType === 'CARD' ? d.cardId ?? null : null,
    pointAmount: d.prizeType === 'POINT' ? d.pointAmount ?? null : null,
    label: d.label || null, grade: d.grade,
    quantity: d.isLastOne ? 1 : d.quantity,
    exchangeValue: d.prizeType === 'CARD' ? d.exchangeValue ?? null : null,
    isLastOne: d.isLastOne, sortOrder: d.sortOrder ?? 0,
  }
}

export async function adminAddOripaItem(req: AuthRequest, res: Response) {
  const p = itemSchema.safeParse(req.body)
  if (!p.success) { res.status(400).json({ message: '상품 정보를 확인해주세요.' }); return }
  try {
    const oripaId = String(req.params['id'])
    await draftOnly(oripaId)
    if (p.data.prizeType === 'CARD' && !p.data.cardId) throw new Fail(400, '카드를 선택해주세요.')
    if (p.data.prizeType === 'POINT' && !p.data.pointAmount) throw new Fail(400, '지급 포인트를 입력해주세요.')
    await prisma.oripaItem.create({ data: { oripaId, ...normalizeItem(p.data) } })
    res.status(201).json(await withStats(oripaId))
  } catch (err) { handle(res, '[adminAddOripaItem]')(err) }
}

export async function adminUpdateOripaItem(req: AuthRequest, res: Response) {
  const p = itemSchema.safeParse(req.body)
  if (!p.success) { res.status(400).json({ message: '상품 정보를 확인해주세요.' }); return }
  try {
    const oripaId = String(req.params['id'])
    await draftOnly(oripaId)
    await prisma.oripaItem.update({ where: { id: String(req.params['itemId']), oripaId }, data: normalizeItem(p.data) })
    res.json(await withStats(oripaId))
  } catch (err) { handle(res, '[adminUpdateOripaItem]')(err) }
}

export async function adminDeleteOripaItem(req: AuthRequest, res: Response) {
  try {
    const oripaId = String(req.params['id'])
    await draftOnly(oripaId)
    await prisma.oripaItem.delete({ where: { id: String(req.params['itemId']), oripaId } })
    res.json(await withStats(oripaId))
  } catch (err) { handle(res, '[adminDeleteOripaItem]')(err) }
}

// 판매 시작: 티켓 순서를 비밀 시드로 섞어 봉인하고, 시드 해시를 공개
export async function adminStartOripa(req: AuthRequest, res: Response) {
  try {
    const id = String(req.params['id'])
    const o = await prisma.oripa.findUnique({ where: { id }, include: { items: true } })
    if (!o) throw new Fail(404, '오리파를 찾을 수 없습니다.')
    if (o.status !== 'DRAFT') throw new Fail(400, '준비 중인 오리파만 판매를 시작할 수 있어요.')
    const r = readiness(o)
    if (!r.ready) throw new Fail(400, r.problems.join(' '))
    const { seed, seedHash, order } = sealTickets(o.items)
    const drawn = o.totalSlots - o.remainSlots // 예전 방식으로 일부 팔린 오리파
    await prisma.$transaction([
      ...o.items.map(i => prisma.oripaItem.update({ where: { id: i.id }, data: { remaining: i.isLastOne ? 1 : i.quantity } })),
      prisma.oripa.update({
        where: { id },
        // 이미 팔린 수만큼 앞자리를 비워 두어 "다음 티켓 = 길이 - 남은 수" 계산이 맞도록
        data: { status: 'LIVE', serverSeed: seed, seedHash, ticketOrder: [...Array<string>(drawn).fill(''), ...order], startedAt: new Date() },
      }),
    ])
    res.json(await withStats(id))
  } catch (err) { handle(res, '[adminStartOripa]')(err) }
}

export async function adminSetOripaPaused(req: AuthRequest, res: Response) {
  try {
    const id = String(req.params['id'])
    const pause = req.path.endsWith('/pause')
    const o = await prisma.oripa.findUnique({ where: { id }, select: { status: true } })
    if (!o) throw new Fail(404, '오리파를 찾을 수 없습니다.')
    if (pause && o.status !== 'LIVE') throw new Fail(400, '판매 중인 오리파만 멈출 수 있어요.')
    if (!pause && o.status !== 'PAUSED') throw new Fail(400, '멈춘 오리파만 다시 열 수 있어요.')
    await prisma.oripa.update({ where: { id }, data: { status: pause ? 'PAUSED' : 'LIVE' } })
    res.json(await withStats(id))
  } catch (err) { handle(res, '[adminSetOripaPaused]')(err) }
}

export async function adminDeleteOripa(req: AuthRequest, res: Response) {
  try {
    const id = String(req.params['id'])
    const o = await prisma.oripa.findUnique({ where: { id }, select: { status: true, _count: { select: { purchases: true } } } })
    if (!o) throw new Fail(404, '오리파를 찾을 수 없습니다.')
    if (o.status !== 'DRAFT' || o._count.purchases > 0) throw new Fail(400, '판매 기록이 없는 준비 중 오리파만 삭제할 수 있어요.')
    await prisma.oripa.delete({ where: { id } })
    res.json({ message: '삭제했어요.' })
  } catch (err) { handle(res, '[adminDeleteOripa]')(err) }
}

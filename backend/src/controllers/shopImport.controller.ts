// 관리자 샵: 포케히트 상품 가져오기 — 상품명·종류·가격만 '초안'으로 등록 (사진·설명은 관리자가 직접)
import { Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { fetchPokehitList, suggestPrice, POKEHIT_DEFAULT_LIST } from '../lib/pokehitImport'

const SITE = 'pokehit'
const fail = (res: Response, err: unknown, tag: string) => {
  const e = err as { status?: number; message?: string }
  if (e.status) { res.status(e.status).json({ message: e.message }); return }
  console.error(tag, err)
  res.status(500).json({ message: '서버 오류가 발생했습니다.' })
}

// 미리보기: 목록 + 이미 가져온 상품 표시
export async function previewPokehit(req: AuthRequest, res: Response) {
  try {
    const url = String(req.query.url || POKEHIT_DEFAULT_LIST)
    const items = await fetchPokehitList(url)
    const existing = await prisma.shopItem.findMany({
      where: { sourceSite: SITE, sourceId: { in: items.map(i => i.sourceId) } },
      select: { id: true, sourceId: true, price: true, isActive: true, name: true },
    })
    const bySource = new Map(existing.map(e => [e.sourceId, e]))
    res.json({
      url,
      fetchedAt: new Date(),
      items: items.map(i => ({ ...i, suggestedPrice: suggestPrice(i.price), existing: bySource.get(i.sourceId) ?? null })),
    })
  } catch (err) { fail(res, err, '[previewPokehit]') }
}

const importSchema = z.object({
  url: z.string().optional(),
  items: z.array(z.object({
    sourceId: z.string().min(1).max(20),
    name: z.string().trim().min(1).max(120),
    price: z.number().int().min(1),
    category: z.enum(['BOOSTER_BOX', 'STARTER_DECK', 'SINGLE_PACK', 'GIFT_SET', 'SPECIAL', 'OTHER']),
    tcgType: z.enum(['POKEMON', 'YUGIOH', 'MTG', 'DIGIMON', 'ONEPIECE', 'WEISS', 'OTHER']),
  })).min(1).max(100),
})

// 선택한 상품을 비공개 초안으로 등록 (외부가는 서버가 다시 읽어서 기록)
export async function importPokehit(req: AuthRequest, res: Response) {
  const parsed = importSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ message: '가져올 상품을 선택해주세요.' }); return }
  try {
    const source = new Map((await fetchPokehitList(parsed.data.url || POKEHIT_DEFAULT_LIST)).map(i => [i.sourceId, i]))
    const now = new Date()
    let created = 0, skipped = 0
    for (const it of parsed.data.items) {
      const src = source.get(it.sourceId)
      if (!src) { skipped++; continue }
      const exists = await prisma.shopItem.findUnique({ where: { sourceSite_sourceId: { sourceSite: SITE, sourceId: it.sourceId } }, select: { id: true } })
      if (exists) { skipped++; continue }
      await prisma.shopItem.create({
        data: {
          name: it.name, tcgType: it.tcgType, category: it.category, price: it.price,
          stock: 0, isActive: false, // 사진·설명·재고를 채운 뒤 관리자가 판매를 켠다
          sourceSite: SITE, sourceId: it.sourceId, sourceUrl: src.url,
          refPrice: src.price, refSoldOut: src.soldOut, refCheckedAt: now,
        },
      })
      created++
    }
    res.status(201).json({ created, skipped, message: `${created}개를 비공개 초안으로 등록했어요.${skipped ? ` (${skipped}개는 이미 있거나 목록에 없어 건너뜀)` : ''}` })
  } catch (err) { fail(res, err, '[importPokehit]') }
}

// 가져온 상품들의 외부 가격·품절 여부 다시 확인
export async function refreshPokehitRefs(req: AuthRequest, res: Response) {
  try {
    const url = String(req.body?.url || POKEHIT_DEFAULT_LIST)
    const source = new Map((await fetchPokehitList(url)).map(i => [i.sourceId, i]))
    const ours = await prisma.shopItem.findMany({ where: { sourceSite: SITE }, select: { id: true, name: true, sourceId: true, refPrice: true, refSoldOut: true } })
    const now = new Date()
    const changes: Array<{ id: string; name: string; before: number | null; after: number; soldOut: boolean }> = []
    let checked = 0, missing = 0
    for (const o of ours) {
      const src = o.sourceId ? source.get(o.sourceId) : undefined
      if (!src) { missing++; continue }
      checked++
      if (src.price !== o.refPrice || src.soldOut !== o.refSoldOut) changes.push({ id: o.id, name: o.name, before: o.refPrice, after: src.price, soldOut: src.soldOut })
      await prisma.shopItem.update({ where: { id: o.id }, data: { refPrice: src.price, refSoldOut: src.soldOut, refCheckedAt: now } })
    }
    res.json({ checked, missing, changes, message: `${checked}개 확인 · 변동 ${changes.length}개${missing ? ` · 목록에서 사라진 상품 ${missing}개` : ''}` })
  } catch (err) { fail(res, err, '[refreshPokehitRefs]') }
}

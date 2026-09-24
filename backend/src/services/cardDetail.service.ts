import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { fetchWithRetry, ExternalApiError } from '../lib/fetchWithRetry'
import { cardLangWhere, type CardLang } from '../lib/cardLang'

// ── 카드 상세·세트 메타데이터 보강 ────────────────────────────────────────────
// 세트 목록만으로 임포트한 카드(TCGdex 일판·한판 등)는 레어도·HP·기술·진화 정보가 비어 있다.
// - TCGdex 카드: 카드별 상세 API (/v2/{lang}/cards/{id})
// - pokemontcg.io 카드: 세트 단위로 진화·도감번호·레귤레이션만 보강 (나머지는 임포트 때 채워짐)
// - 세트 메타: 발매일·로고·심볼·카드 수

const TCGDEX = 'https://api.tcgdex.net/v2'
const PTCG = 'https://api.pokemontcg.io/v2'
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

const ptcgHeaders = (): Record<string, string> =>
  process.env.POKEMONTCG_API_KEY ? { 'X-Api-Key': process.env.POKEMONTCG_API_KEY } : {}

// ── TCGdex 응답 → 카드 필드 (순수 함수) ──────────────────────────────────────

export interface TcgdexCardDetail {
  id: string
  localId: string
  name: string
  image?: string
  category?: string
  illustrator?: string
  rarity?: string
  hp?: number
  types?: string[]
  evolveFrom?: string
  description?: string
  stage?: string
  suffix?: string
  trainerType?: string
  energyType?: string
  effect?: string
  abilities?: Array<{ type?: string; name: string; effect?: string }>
  attacks?: Array<{ cost?: string[]; name: string; effect?: string; damage?: number | string }>
  weaknesses?: Array<{ type: string; value?: string }>
  resistances?: Array<{ type: string; value?: string }>
  retreat?: number
  regulationMark?: string
  dexId?: number[]
}

export function normalizeStage(stage: string | null | undefined): string | null {
  if (!stage) return null
  const m = stage.match(/^stage\s*(\d)$/i)
  return m ? `Stage ${m[1]}` : stage
}

const SUPERTYPE: Record<string, string> = { Pokemon: 'Pokémon', Trainer: 'Trainer', Energy: 'Energy' }
const EMPTY_RARITY = new Set(['', 'unknown', 'none'])

// 기존 카드 값과 합쳐 업데이트할 필드 (이미 있는 이미지·레어도는 유지)
export function mapTcgdexDetail(
  c: TcgdexCardDetail,
  existing: { rarity: string; imageUrl: string | null; description: string | null },
): Prisma.CardUpdateInput {
  const stage = normalizeStage(c.stage)
  const subtypes = [stage, c.suffix, c.trainerType, c.energyType].filter(Boolean).join(',')
  return {
    ...(EMPTY_RARITY.has(existing.rarity.toLowerCase()) && c.rarity && !EMPTY_RARITY.has(c.rarity.toLowerCase()) ? { rarity: c.rarity } : {}),
    ...(!existing.imageUrl && c.image ? { imageUrl: `${c.image}/high.webp` } : {}),
    ...(!existing.description && c.effect ? { description: c.effect } : {}),
    supertype: c.category ? SUPERTYPE[c.category] ?? c.category : null,
    subtypes: subtypes || null,
    cardTypes: c.types?.length ? c.types.join(',') : null,
    hp: typeof c.hp === 'number' ? c.hp : null,
    stage,
    evolvesFrom: c.evolveFrom ?? null,
    dexIds: c.dexId ?? [],
    regulationMark: c.regulationMark ?? null,
    artist: c.illustrator ?? null,
    flavorText: c.description ?? null,
    retreatCost: typeof c.retreat === 'number' ? c.retreat : null,
    // 화면은 pokemontcg.io 형식({ name, cost, damage, text })으로 렌더링
    attacks: c.attacks?.length
      ? c.attacks.map(a => ({ name: a.name, cost: a.cost ?? [], damage: a.damage != null ? String(a.damage) : '', text: a.effect ?? '' }))
      : Prisma.DbNull,
    abilities: c.abilities?.length
      ? c.abilities.map(a => ({ name: a.name, text: a.effect ?? '', type: a.type ?? 'Ability' }))
      : Prisma.DbNull,
    weaknesses: c.weaknesses?.length ? c.weaknesses : Prisma.DbNull,
    resistances: c.resistances?.length ? c.resistances : Prisma.DbNull,
    detailSyncedAt: new Date(),
  }
}

// pokemontcg.io 카드 → 진화·도감번호·레귤레이션
export interface PtcgCardExtra { id: string; subtypes?: string[]; evolvesFrom?: string; nationalPokedexNumbers?: number[]; regulationMark?: string }
const STAGE_SUBTYPES = ['Basic', 'Stage 1', 'Stage 2', 'VMAX', 'VSTAR', 'BREAK', 'MEGA', 'Level-Up', 'Restored', 'V-UNION']
export function mapPtcgExtra(c: PtcgCardExtra): { stage: string | null; evolvesFrom: string | null; dexIds: number[]; regulationMark: string | null; detailSyncedAt: Date } {
  return {
    stage: c.subtypes?.find(s => STAGE_SUBTYPES.includes(s)) ?? null,
    evolvesFrom: c.evolvesFrom ?? null,
    dexIds: c.nationalPokedexNumbers ?? [],
    regulationMark: c.regulationMark ?? null,
    detailSyncedAt: new Date(),
  }
}

// ── 세트 메타 ────────────────────────────────────────────────────────────────

interface TcgdexSetBrief { id: string; name: string; logo?: string; symbol?: string; cardCount?: { total?: number; official?: number } }
interface TcgdexSetDetail extends TcgdexSetBrief { releaseDate?: string; serie?: { name?: string } }
interface PtcgSet { id: string; name: string; series?: string; printedTotal?: number; total?: number; releaseDate?: string; images?: { symbol?: string; logo?: string } }

// DB에 카드가 있는 세트만 메타데이터를 가져온다
async function setCodesInDb(where: Prisma.CardWhereInput): Promise<Set<string>> {
  const rows = await prisma.card.groupBy({ by: ['setCode'], where: { tcgType: 'POKEMON', setCode: { not: null }, ...where } })
  return new Set(rows.map(r => r.setCode!).filter(Boolean))
}

export async function syncPokemonSetMeta(onEvent: (e: object) => void = () => {}, isCancelled = () => false) {
  let upserted = 0
  for (const lang of ['ja', 'ko', 'en'] as CardLang[]) {
    if (isCancelled()) break
    const codes = await setCodesInDb({ AND: [cardLangWhere(lang), { externalId: { startsWith: 'tcgdex_' } }] })
    if (!codes.size) continue
    const list = await fetchWithRetry<TcgdexSetBrief[]>(`${TCGDEX}/${lang}/sets`, { timeoutMs: 15_000 })
    for (const s of list.filter(s => codes.has(s.id))) {
      if (isCancelled()) break
      try {
        const d = await fetchWithRetry<TcgdexSetDetail>(`${TCGDEX}/${lang}/sets/${encodeURIComponent(s.id)}`, { timeoutMs: 15_000 })
        const data = {
          name: d.name, series: d.serie?.name ?? null,
          releaseDate: d.releaseDate ? new Date(d.releaseDate) : null,
          logoUrl: d.logo ? `${d.logo}.webp` : null, symbolUrl: d.symbol ? `${d.symbol}.webp` : null,
          officialCount: d.cardCount?.official ?? null, totalCount: d.cardCount?.total ?? null, source: 'TCGDEX',
        }
        await prisma.cardSet.upsert({ where: { tcgType_lang_code: { tcgType: 'POKEMON', lang, code: s.id } }, create: { tcgType: 'POKEMON', lang, code: s.id, ...data }, update: data })
        upserted++
      } catch (err) {
        onEvent({ type: 'set-error', lang, setId: s.id, reason: String(err) })
      }
      await sleep(80)
    }
    onEvent({ type: 'sets-done', source: 'TCGDEX', lang, upserted })
  }

  // pokemontcg.io (영문 pokemon_ 카드)
  const enCodes = await setCodesInDb({ externalId: { startsWith: 'pokemon_' } })
  if (enCodes.size && !isCancelled()) {
    try {
      const { data } = await fetchWithRetry<{ data: PtcgSet[] }>(`${PTCG}/sets?pageSize=250`, { timeoutMs: 20_000, headers: ptcgHeaders() })
      for (const s of data.filter(s => enCodes.has(s.id))) {
        const meta = {
          name: s.name, series: s.series ?? null,
          releaseDate: s.releaseDate ? new Date(s.releaseDate.replace(/\//g, '-')) : null,
          logoUrl: s.images?.logo ?? null, symbolUrl: s.images?.symbol ?? null,
          officialCount: s.printedTotal ?? null, totalCount: s.total ?? null, source: 'POKEMONTCG',
        }
        await prisma.cardSet.upsert({ where: { tcgType_lang_code: { tcgType: 'POKEMON', lang: 'en', code: s.id } }, create: { tcgType: 'POKEMON', lang: 'en', code: s.id, ...meta }, update: meta })
        upserted++
      }
      onEvent({ type: 'sets-done', source: 'POKEMONTCG', upserted })
    } catch (err) {
      onEvent({ type: 'set-error', source: 'POKEMONTCG', reason: String(err) })
    }
  }
  return upserted
}

// ── 카드 상세 보강 ───────────────────────────────────────────────────────────

export interface EnrichTotals { tcgdex: number; ptcg: number; notFound: number; errors: number }

export async function enrichCardDetails(opts: {
  maxCards?: number
  concurrency?: number
  onEvent?: (e: object) => void
  isCancelled?: () => boolean
} = {}): Promise<EnrichTotals> {
  const { maxCards = Infinity, concurrency = 4, onEvent = () => {}, isCancelled = () => false } = opts
  const totals: EnrichTotals = { tcgdex: 0, ptcg: 0, notFound: 0, errors: 0 }
  let consecutiveErrors = 0
  let cursor = ''   // id 순으로 한 번씩만 (네트워크 오류로 남은 카드는 다음 실행에서 재시도)

  // 1) TCGdex 카드 (카드별 상세)
  while (!isCancelled() && totals.tcgdex + totals.notFound < maxCards && consecutiveErrors < 20) {
    const batch = await prisma.card.findMany({
      where: { detailSyncedAt: null, externalId: { startsWith: 'tcgdex_' }, id: { gt: cursor } },
      select: { id: true, externalId: true, rarity: true, imageUrl: true, description: true },
      orderBy: { id: 'asc' },
      take: Math.min(100, maxCards - totals.tcgdex - totals.notFound),
    })
    if (!batch.length) break
    cursor = batch[batch.length - 1].id

    for (let i = 0; i < batch.length && !isCancelled(); i += concurrency) {
      await Promise.all(batch.slice(i, i + concurrency).map(async card => {
        const m = card.externalId!.match(/^tcgdex_([a-z]{2})_(.+)$/)
        if (!m) return
        try {
          const d = await fetchWithRetry<TcgdexCardDetail>(`${TCGDEX}/${m[1]}/cards/${encodeURIComponent(m[2])}`, { timeoutMs: 15_000, retries: 2 })
          await prisma.card.update({ where: { id: card.id }, data: mapTcgdexDetail(d, card) })
          totals.tcgdex++
          consecutiveErrors = 0
        } catch (err) {
          if (err instanceof ExternalApiError && err.status === 404) {
            // TCGdex에 상세가 없는 카드 — 다시 조회하지 않도록 표시
            await prisma.card.update({ where: { id: card.id }, data: { detailSyncedAt: new Date() } })
            totals.notFound++
          } else {
            totals.errors++
            consecutiveErrors++
          }
        }
      }))
      await sleep(100)
    }
    onEvent({ type: 'progress', ...totals })
  }
  if (consecutiveErrors >= 20) onEvent({ type: 'error', reason: 'TCGdex 연속 오류 20회 — 중단했습니다. 잠시 후 다시 시도하세요.' })

  // 2) pokemontcg.io 카드 (세트 단위)
  if (!isCancelled() && totals.tcgdex + totals.notFound < maxCards) {
    const sets = await prisma.card.groupBy({
      by: ['setCode'],
      where: { detailSyncedAt: null, externalId: { startsWith: 'pokemon_' }, setCode: { not: null } },
    })
    for (const { setCode } of sets) {
      if (isCancelled() || totals.ptcg >= maxCards) break
      try {
        const extras: PtcgCardExtra[] = []
        for (let page = 1; ; page++) {
          const body = await fetchWithRetry<{ data: PtcgCardExtra[]; totalCount: number }>(
            `${PTCG}/cards?q=set.id:${encodeURIComponent(setCode!)}&pageSize=250&page=${page}&select=id,subtypes,evolvesFrom,nationalPokedexNumbers,regulationMark`,
            { timeoutMs: 30_000, retries: 2, headers: ptcgHeaders() },
          )
          extras.push(...body.data)
          if (extras.length >= body.totalCount || !body.data.length) break
        }
        const byId = new Map(extras.map(e => [`pokemon_${e.id}`, e]))
        const cards = await prisma.card.findMany({ where: { setCode, externalId: { startsWith: 'pokemon_' }, detailSyncedAt: null }, select: { id: true, externalId: true } })
        for (const c of cards) {
          const e = byId.get(c.externalId!)
          await prisma.card.update({ where: { id: c.id }, data: e ? mapPtcgExtra(e) : { detailSyncedAt: new Date() } })
          if (e) totals.ptcg++; else totals.notFound++
        }
      } catch (err) {
        totals.errors++
        onEvent({ type: 'set-error', source: 'POKEMONTCG', setId: setCode, reason: String(err) })
      }
      onEvent({ type: 'progress', ...totals })
      await sleep(300)
    }
  }
  return totals
}

// ── 실행 (한 프로세스에서 한 번에 하나) ───────────────────────────────────────

let running = false
export class CardDetailBusyError extends Error { constructor() { super('카드 정보 보강이 이미 실행 중입니다.') } }

export async function runCardDetailSync(opts: { maxCards?: number; onEvent?: (e: object) => void; isCancelled?: () => boolean } = {}) {
  if (running) throw new CardDetailBusyError()
  running = true
  try {
    const onEvent = opts.onEvent ?? (() => {})
    const sets = await syncPokemonSetMeta(onEvent, opts.isCancelled)
    const totals = await enrichCardDetails({ ...opts, onEvent })
    return { sets, ...totals }
  } finally {
    running = false
  }
}

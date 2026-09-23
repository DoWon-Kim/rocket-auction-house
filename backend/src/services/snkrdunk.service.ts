import { Prisma, TcgType, CardMatchMethod } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { nodeRequest } from '../lib/nodeRequest'
import { cardNumberVariants, pickAutoLink, rankCandidates, type ScoredCandidate } from '../lib/cardMatch'

// ── 스니덩 (snkrdunk.com) 상품 → 카드 연결 동기화 ─────────────────────────────
// 비공식 API라 형식 변경·차단 가능성이 있어 파싱 실패 항목은 버리지 않고 검수함에 남긴다.

const API = 'https://snkrdunk.com/en/v1/trading-cards'
const PRICE_STALE_DAYS = 7
export const SNKRDUNK_PRODUCT_URL = (externalId: string) => `https://snkrdunk.com/en/trading-cards/${externalId}`

export const SNKRDUNK_BRANDS: Array<{ brandId: string; tcgType: TcgType }> = [
  { brandId: 'pokemon',  tcgType: 'POKEMON' },
  { brandId: 'yu-gi-oh', tcgType: 'YUGIOH' },
]

export interface SnkrdunkCard {
  id: number
  productNumber: string
  name: string
  minPrice: number
  listingCount: string
  thumbnailUrl: string
}

export interface SourceItemInput {
  externalId: string
  tcgType: TcgType
  lang: string | null
  productCode: string
  rawName: string
  name: string
  setName: string | null
  setCode: string | null
  cardNumber: string | null
  rarity: string | null
  imageUrl: string | null
  price: number | null
  listings: string | null
}

// ── 파싱 ────────────────────────────────────────────────────────────────────

// 박스·팩·세트 등 봉인 제품 제외
const SEALED_RE = /\b(Box|Pack|Set|Deck|Bundle|Display|Case|Starter|Booster|Collection|Tin|Sealed)\b/i

export function isSingleCard(name: string): boolean {
  // 세트명 괄호 안의 "Pack"/"Set"은 봉인 제품 판단에서 제외
  const head = name.replace(/\(.*$/s, '')
  if (SEALED_RE.test(head)) return false
  return /\[[^\]]*\d[^\]]*\]/.test(name)
}

// "Pikachu ex SAR :Promo [SV3a-079](Raging Surf)" → { cardName, bracket, setName }
export function parseProductName(raw: string): { cardName: string; bracket: string | null; setName: string | null } {
  const noVariant = raw.replace(/\s*:[^[(]+(?=[[(]|$)/, '').trim()
  const bracket   = noVariant.match(/\[([^\]]+)\]/)?.[1] ?? null
  const setRaw    = (noVariant.match(/\]\s*\((.+)\)\s*$/s) ?? noVariant.match(/\((.+)\)\s*$/s))?.[1] ?? null
  const cardName  = noVariant.replace(/\s*\[.*$/s, '').trim() || raw
  const setName   = setRaw ? setRaw.replace(/^[^"]*"([^"]+)"[^"]*$/, '$1').trim() : null
  return { cardName, bracket, setName }
}

// 상품 코드 → 언어·세트 코드·카드 번호
//   pkmn-tcg-SV3a-079        → ja, SV3a, 079
//   pkmn-tcg-en-SVI-001      → en, SVI, 001
//   pkmn-tcg-KR-M-P-001      → ko, M-P, 001
//   YGO-OCG-TCG-MZMI-JP001   → ja, MZMI, MZMI-JP001 (DB의 유희왕 번호는 세트코드 포함 표기)
export function parseProductCode(code: string, tcgType: TcgType, bracket: string | null):
  { lang: string | null; setCode: string | null; cardNumber: string | null } {
  if (tcgType === 'POKEMON') {
    let rest = code.replace(/^pkmn-tcg-/i, '')
    let lang = 'ja'
    if (/^en-/i.test(rest)) { lang = 'en'; rest = rest.slice(3) }
    else if (/^kr-/i.test(rest)) { lang = 'ko'; rest = rest.slice(3) }
    const m = rest.match(/^(.+)-(\d{3})$/)
    if (m) return { lang, setCode: m[1], cardNumber: m[2] }
    // 상품 코드가 비정형이면 이름의 [SET NUM/TOTAL] 또는 [NUM/SET] 사용
    const b1 = bracket?.match(/^([A-Za-z0-9-]+)\s+([A-Za-z]*\d+[A-Za-z]?)\/[\w-]+$/)
    if (b1) return { lang, setCode: b1[1], cardNumber: b1[2] }
    const b2 = bracket?.match(/^(\d+)\/([A-Za-z][\w-]*)$/)
    if (b2) return { lang, setCode: b2[2], cardNumber: b2[1] }
    // 특수 번호([M6a R/RGB])는 세트만 인식 → 같은 세트 후보를 검수 화면에 띄우기 위함
    const b3 = bracket?.match(/^([A-Za-z0-9-]*\d[A-Za-z0-9-]*)\s+\S+\/\S+$/)
    return { lang, setCode: b3?.[1] ?? null, cardNumber: null }
  }
  if (tcgType === 'YUGIOH') {
    const m = code.match(/^YGO-OCG-TCG-([A-Z0-9]+)-([A-Z]{0,3}\d+[A-Z]?)$/i)
      ?? bracket?.match(/^([A-Z0-9]+)-([A-Z]{0,3}\d+[A-Z]?)$/i)
    if (m) return { lang: 'ja', setCode: m[1].toUpperCase(), cardNumber: `${m[1]}-${m[2]}`.toUpperCase() }
    return { lang: 'ja', setCode: null, cardNumber: null }
  }
  return { lang: null, setCode: null, cardNumber: null }
}

// 카드명 끝의 레어도 약어
export function parseRarity(cardName: string): string | null {
  const m = cardName.match(/\b(SAR|SSR|KCSR|HR|UR|SR|RRR|RR|PSE|SCR|SEC|AC|CHR|CSR|AR|PR|PROMO)\b/i)
  return m ? m[1].toUpperCase() : null
}

export function toSourceItem(card: SnkrdunkCard, tcgType: TcgType): SourceItemInput {
  const { cardName, bracket, setName } = parseProductName(card.name)
  const { lang, setCode, cardNumber } = parseProductCode(card.productNumber, tcgType, bracket)
  return {
    externalId: String(card.id),
    tcgType, lang,
    productCode: card.productNumber,
    rawName: card.name,
    name: cardName,
    setName, setCode, cardNumber,
    rarity: parseRarity(cardName),
    imageUrl: card.thumbnailUrl ? card.thumbnailUrl.replace(/\?size=\w+$/, '?size=l') : null,
    price: Number.isFinite(card.minPrice) ? card.minPrice : null,
    listings: card.listingCount ?? null,
  }
}

// ── 후보 검색 ────────────────────────────────────────────────────────────────

const candidateSelect = {
  id: true, tcgType: true, name: true, nameJa: true, nameKo: true, setName: true,
  setCode: true, cardNumber: true, rarity: true, imageUrl: true, externalId: true,
} satisfies Prisma.CardSelect
export type CandidateCard = Prisma.CardGetPayload<{ select: typeof candidateSelect }>

type Matchable = Pick<SourceItemInput, 'tcgType' | 'lang' | 'name' | 'setCode' | 'cardNumber'>

function setCodeVariants(code: string): string[] {
  const out = new Set([code])
  out.add(code.replace(/^([A-Za-z]+)(\d)(?!\d)/, '$10$2'))   // sv1 → sv01
  out.add(code.replace(/^([A-Za-z]+)0(\d)/, '$1$2'))         // sv01 → sv1
  return [...out]
}

// fuzzy=false: 세트+번호 일치 후보만 (동기화용, 가벼움)
// fuzzy=true : 같은 세트·비슷한 이름 후보까지 (검수 화면 추천용)
export async function findCandidates(item: Matchable, { fuzzy = false, limit = 5 } = {}): Promise<ScoredCandidate<CandidateCard>[]> {
  const pools: CandidateCard[][] = []
  const setOr = item.setCode
    ? setCodeVariants(item.setCode).map(v => ({ setCode: { equals: v, mode: 'insensitive' as const } }))
    : null

  if (setOr && item.cardNumber) {
    const nums = cardNumberVariants(item.cardNumber)
    const base = item.cardNumber.split('/')[0]
    pools.push(await prisma.card.findMany({
      where: {
        tcgType: item.tcgType,
        OR: setOr,
        AND: [{ OR: [{ cardNumber: { in: nums } }, { cardNumber: { startsWith: `${base}/` } }] }],
      },
      select: candidateSelect, take: 20,
    }))
  }

  if (fuzzy) {
    // 이름에서 가장 긴 단어 (레어도 약어 제외)로 부분 검색
    const word = item.name.split(/[\s:()[\]"'-]+/)
      .filter(w => w.length >= 3 && !parseRarity(w))
      .sort((a, b) => b.length - a.length)[0]
    const or: Prisma.CardWhereInput[] = []
    if (word) or.push({ name: { contains: word, mode: 'insensitive' } })
    if (setOr && item.cardNumber) {
      // 같은 세트 안에서 번호만 다른 경우 (표기 차이) 대비
      or.push({ AND: [{ OR: setOr }, { cardNumber: { contains: item.cardNumber.replace(/^0+/, '') } }] })
    }
    if (or.length) {
      pools.push(await prisma.card.findMany({ where: { tcgType: item.tcgType, OR: or }, select: candidateSelect, take: 40 }))
    }
  }

  return rankCandidates(item, pools.flat(), limit)
}

// ── 가격 반영 ────────────────────────────────────────────────────────────────

// 카드에 연결된 스니덩 상품들 중 최저 호가(매물 있는 것 우선)를 카드 표시용 필드에 반영
export async function refreshCardPrice(cardId: string) {
  const items = await prisma.cardSourceItem.findMany({
    where: { cardId, source: 'SNKRDUNK', status: 'LINKED' },
    select: { price: true, listings: true, priceUpdatedAt: true },
  })
  // 7일 넘게 목록에서 안 보인 상품(판매 종료 등)의 가격은 쓰지 않음
  const freshSince = Date.now() - PRICE_STALE_DAYS * 86400_000
  const priced = items.filter(i => i.price != null && i.priceUpdatedAt && i.priceUpdatedAt.getTime() >= freshSince)
  const inStock = priced.filter(i => (i.price ?? 0) > 0).sort((a, b) => (a.price ?? 0) - (b.price ?? 0))
  const best = inStock[0] ?? priced[0] ?? null
  const updatedAt = priced.reduce<Date | null>((m, i) => (i.priceUpdatedAt && (!m || i.priceUpdatedAt > m) ? i.priceUpdatedAt : m), null)
  await prisma.card.update({
    where: { id: cardId },
    data: {
      snkrdunkPrice: best?.price ?? null,
      snkrdunkListings: best?.listings ?? null,
      snkrdunkUpdatedAt: best ? updatedAt : null,
    },
  }).catch(() => { /* 카드가 삭제된 경우 무시 */ })

  // 오늘(KST) 시세 스냅샷: 매물이 있을 때만 기록, 없어지면 오늘 기록 제거
  const date = kstDay()
  const key = { cardId_source_date: { cardId, source: 'SNKRDUNK' as const, date } }
  const top = inStock[0]
  if (top?.price) {
    await prisma.cardPriceSnapshot.upsert({
      where: key,
      create: { cardId, source: 'SNKRDUNK', date, price: top.price, listings: top.listings },
      update: { price: top.price, listings: top.listings },
    }).catch(() => { /* 카드 삭제 경합 무시 */ })
  } else {
    await prisma.cardPriceSnapshot.deleteMany({ where: { cardId, source: 'SNKRDUNK', date } })
  }
}

// KST 기준 오늘 날짜 (DATE 컬럼용 UTC 자정 Date)
export function kstDay(now = new Date()): Date {
  const k = new Date(now.getTime() + 9 * 3600 * 1000)
  return new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()))
}

// 연결 시 카드에 이미지가 없으면 스니덩 이미지로 채움 (공식 소스 이미지 우선)
async function fillImageIfEmpty(cardId: string, imageUrl: string | null) {
  if (!imageUrl) return
  await prisma.card.updateMany({ where: { id: cardId, imageUrl: null }, data: { imageUrl } })
}

// ── 동기화 ───────────────────────────────────────────────────────────────────

export type SyncOutcome = 'updated' | 'linked' | 'queued' | 'ignored'

type ExistingRow = { id: string; status: string; cardId: string | null; resolvedById: string | null }

export async function upsertSourceItem(item: SourceItemInput, existing?: ExistingRow | null): Promise<SyncOutcome> {
  const now = new Date()
  const { externalId, ...snapshot } = item
  const data = { ...snapshot, priceUpdatedAt: now }
  const key = { source_externalId: { source: 'SNKRDUNK' as const, externalId } }
  const row = existing !== undefined
    ? existing
    : await prisma.cardSourceItem.findUnique({ where: key, select: { id: true, status: true, cardId: true, resolvedById: true } })

  // 1) 이미 연결됨 → 가격만 갱신
  if (row?.status === 'LINKED' && row.cardId) {
    await prisma.cardSourceItem.update({ where: { id: row.id }, data })
    await refreshCardPrice(row.cardId)
    return 'updated'
  }
  // 2) 관리자가 무시 처리 → 데이터만 갱신
  if (row?.status === 'IGNORED') {
    await prisma.cardSourceItem.update({ where: { id: row.id }, data })
    return 'ignored'
  }
  // 2-1) 관리자가 연결 해제·다시 검수로 돌린 항목 → 자동 매칭하지 않고 대기 유지
  if (row?.resolvedById) {
    await prisma.cardSourceItem.update({ where: { id: row.id }, data: { ...data, status: 'PENDING', cardId: null, matchMethod: null } })
    return 'queued'
  }

  // 3) 이전 임포터가 만든 snkrdunk_* 카드
  const legacy = await prisma.card.findUnique({ where: { externalId: `snkrdunk_${externalId}` }, select: { id: true } })
  // 4) 세트+번호 확실한 매칭
  const auto = legacy ? null : pickAutoLink(await findCandidates(item, { limit: 20 }))
  const cardId = legacy?.id ?? auto?.card.id ?? null
  const matchMethod: CardMatchMethod | null = legacy ? 'LEGACY' : auto ? 'AUTO' : null

  const linkData = cardId
    ? { status: 'LINKED' as const, cardId, matchMethod }
    : { status: 'PENDING' as const, cardId: null, matchMethod: null }
  await prisma.cardSourceItem.upsert({
    where: key,
    create: { source: 'SNKRDUNK', externalId, ...data, ...linkData },
    update: { ...data, ...linkData },
  })
  if (!cardId) return 'queued'
  if (auto) await fillImageIfEmpty(cardId, item.imageUrl)
  await refreshCardPrice(cardId)
  return legacy ? 'updated' : 'linked'
}

export interface SyncEvent { type: string; [k: string]: unknown }

export interface SyncTotals { fetched: number; updated: number; linked: number; queued: number; ignored: number; skipped: number }

async function fetchPage(brandId: string, page: number): Promise<SnkrdunkCard[]> {
  const { ok, status, body } = await nodeRequest(
    `${API}?brandId=${brandId}&page=${page}&perPage=100`,
    { method: 'GET', headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' }, timeoutMs: 20_000 },
  )
  if (!ok) throw new Error(`HTTP ${status}`)
  const parsed = JSON.parse(body) as { tradingCards?: SnkrdunkCard[] }
  if (!Array.isArray(parsed.tradingCards)) throw new Error('예상과 다른 응답 형식 (tradingCards 없음)')
  return parsed.tradingCards
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// 전체 동기화. 페이지 요청은 실패 시 2회 재시도하고, 연속 실패하면 해당 브랜드만 중단한다.
export async function syncSnkrdunk(opts: {
  brands?: typeof SNKRDUNK_BRANDS
  maxPages?: number
  onEvent?: (e: SyncEvent) => void
  isCancelled?: () => boolean
} = {}): Promise<SyncTotals> {
  const { brands = SNKRDUNK_BRANDS, maxPages = Infinity, onEvent = () => {}, isCancelled = () => false } = opts
  const totals: SyncTotals = { fetched: 0, updated: 0, linked: 0, queued: 0, ignored: 0, skipped: 0 }

  for (const { brandId, tcgType } of brands) {
    if (isCancelled()) break
    onEvent({ type: 'brand-start', brand: brandId, tcgType })
    const brand: SyncTotals = { fetched: 0, updated: 0, linked: 0, queued: 0, ignored: 0, skipped: 0 }
    const seen = new Set<number>()

    for (let page = 1; page <= maxPages && !isCancelled(); page++) {
      let cards: SnkrdunkCard[] | null = null
      for (let attempt = 0; attempt < 3 && !cards; attempt++) {
        try { cards = await fetchPage(brandId, page) } catch (err) {
          if (attempt === 2) onEvent({ type: 'error', brand: brandId, page, reason: String(err) })
          else await sleep(1000 * (attempt + 1))
        }
      }
      if (!cards) break
      const fresh = cards.filter(c => !seen.has(c.id))
      if (!fresh.length) break
      fresh.forEach(c => seen.add(c.id))

      const singles = fresh.filter(c => isSingleCard(c.name))
      brand.skipped += fresh.length - singles.length
      const items = singles.map(c => toSourceItem(c, tcgType))
      // 페이지 단위로 기존 행을 한 번에 조회
      const rows = await prisma.cardSourceItem.findMany({
        where: { source: 'SNKRDUNK', externalId: { in: items.map(i => i.externalId) } },
        select: { id: true, status: true, cardId: true, resolvedById: true, externalId: true },
      })
      const byExt = new Map(rows.map(r => [r.externalId, r]))

      for (const item of items) {
        if (isCancelled()) break
        try {
          brand[await upsertSourceItem(item, byExt.get(item.externalId) ?? null)]++
          brand.fetched++
        } catch (err) {
          onEvent({ type: 'item-error', brand: brandId, externalId: item.externalId, reason: String(err) })
        }
      }
      onEvent({ type: 'page-done', brand: brandId, page, singles: singles.length, ...brand })
      await sleep(300)
    }

    for (const k of Object.keys(totals) as Array<keyof SyncTotals>) totals[k] += brand[k]
    onEvent({ type: 'brand-done', brand: brandId, tcgType, ...brand })
  }
  return totals
}

// 대기 항목 다시 매칭 (새 세트를 임포트한 뒤 등).
// ids 없이 전체 실행하면 관리자가 손댄 항목은 제외, ids를 지정하면 관리자 요청이므로 포함.
export async function rematchPending(ids?: string[]): Promise<{ checked: number; linked: number }> {
  // 전체 실행 시엔 카드 DB에 같은 세트가 있는 항목만 (대기가 수만 건이어도 빠르게)
  const candidateIds = ids?.length ? ids : (await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT i."id" FROM "CardSourceItem" i
    WHERE i."source" = 'SNKRDUNK' AND i."status" = 'PENDING' AND i."resolvedById" IS NULL
      AND i."setCode" IS NOT NULL AND i."cardNumber" IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM "Card" c
        WHERE c."tcgType" = i."tcgType"
          AND regexp_replace(lower(c."setCode"), '(^|[^0-9])0+([0-9])', '\\1\\2', 'g')
            = regexp_replace(lower(i."setCode"), '(^|[^0-9])0+([0-9])', '\\1\\2', 'g')
      )`).map(r => r.id)
  const rows = await prisma.cardSourceItem.findMany({
    where: { source: 'SNKRDUNK', status: 'PENDING', id: { in: candidateIds } },
    select: { id: true, tcgType: true, lang: true, name: true, setCode: true, cardNumber: true, imageUrl: true },
  })
  let linked = 0
  for (const r of rows) {
    const auto = pickAutoLink(await findCandidates(r, { limit: 20 }))
    if (!auto) continue
    await prisma.cardSourceItem.update({ where: { id: r.id }, data: { status: 'LINKED', cardId: auto.card.id, matchMethod: 'AUTO' } })
    await fillImageIfEmpty(auto.card.id, r.imageUrl)
    await refreshCardPrice(auto.card.id)
    linked++
  }
  return { checked: rows.length, linked }
}

import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { fetchWithRetry } from '../lib/fetchWithRetry'

// ── 포켓몬 외 TCG 카드 상세·한국어 ────────────────────────────────────────────
// - 유희왕: YGOProDeck (영문 상세 + language=ko 공식 한국어 이름·효과)
// - 디지몬: digimoncard.io (레벨·DP·코스트·효과)
// - MTG: Scryfall (오라클 텍스트·마나·P/T, 한국어판 인쇄본의 공식 한국어 이름·텍스트를 같은 카드에 공유)

type Emit = (e: object) => void
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const chunk = <T,>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n))

// ── 유희왕 ────────────────────────────────────────────────────────────────────

interface YgoCard {
  id: number; name: string; type?: string; frameType?: string; desc?: string; race?: string; attribute?: string
  atk?: number; def?: number; level?: number; linkval?: number; scale?: number; archetype?: string; typeline?: string[]
  card_sets?: Array<{ set_name: string; set_code: string; set_rarity?: string }>
  card_images?: Array<{ image_url_small?: string }>
}
const YGO = 'https://db.ygoprodeck.com/api/v7/cardinfo.php'

async function ygoAll(lang?: 'ko'): Promise<YgoCard[]> {
  const out: YgoCard[] = []
  for (let offset = 0; ; offset += 500) {
    const body = await fetchWithRetry<{ data: YgoCard[]; meta?: { total_rows: number } }>(
      `${YGO}?num=500&offset=${offset}${lang ? `&language=${lang}` : ''}`, { timeoutMs: 60_000, retries: 2 },
    )
    out.push(...body.data)
    if (!body.meta || out.length >= body.meta.total_rows || body.data.length < 500) break
    await sleep(150)
  }
  return out
}

export function ygoStats(c: YgoCard) {
  return {
    type: c.type ?? null, frameType: c.frameType ?? null, race: c.race ?? null, attribute: c.attribute ?? null,
    atk: c.atk ?? null, def: c.def ?? null, level: c.level ?? null, linkval: c.linkval ?? null,
    scale: c.scale ?? null, archetype: c.archetype ?? null, typeline: c.typeline ?? null,
  }
}

export async function syncYugioh(opts: { importMissing?: boolean; emit?: Emit } = {}) {
  const { importMissing = true, emit = () => {} } = opts
  const en = await ygoAll()
  emit({ type: 'ygo-fetched', lang: 'en', count: en.length })
  let ko: YgoCard[] = []
  try { ko = await ygoAll('ko') } catch (err) { emit({ type: 'ygo-error', reason: `한국어 조회 실패: ${String(err)}` }) }
  const koMap = new Map(ko.map(c => [c.id, c]))
  emit({ type: 'ygo-fetched', lang: 'ko', count: ko.length })

  const existing = new Set((await prisma.card.findMany({ where: { tcgType: 'YUGIOH' }, select: { externalId: true } })).map(c => c.externalId))
  let updated = 0, created = 0
  for (const group of chunk(en, 200)) {
    const toCreate: Prisma.CardCreateManyInput[] = []
    await prisma.$transaction(group.map(c => {
      const k = koMap.get(c.id)
      const data = {
        stats: ygoStats(c) as Prisma.InputJsonValue,
        description: c.desc ?? null,
        nameKo: k?.name ?? undefined,
        textKo: k?.desc ? ({ effect: k.desc } as Prisma.InputJsonValue) : undefined,
        textKoSource: k?.desc ? 'OFFICIAL' : undefined,
        detailSyncedAt: new Date(),
      }
      if (importMissing) {
        for (const s of c.card_sets ?? []) {
          const externalId = `yugioh_${c.id}_${s.set_code}`
          if (existing.has(externalId)) continue
          existing.add(externalId)
          toCreate.push({
            externalId, name: c.name, tcgType: 'YUGIOH', setName: s.set_name,
            setCode: s.set_code?.replace(/-.*/, '') ?? null, cardNumber: s.set_code ?? null,
            rarity: s.set_rarity ?? 'Unknown', imageUrl: c.card_images?.[0]?.image_url_small ?? null,
            ...data, nameKo: data.nameKo ?? null, textKo: data.textKo ?? Prisma.DbNull, textKoSource: data.textKoSource ?? null,
          })
        }
      }
      return prisma.card.updateMany({ where: { externalId: { startsWith: `yugioh_${c.id}_` } }, data })
    })).then(rs => { updated += rs.reduce((s, r) => s + r.count, 0) })
    if (toCreate.length) created += (await prisma.card.createMany({ data: toCreate, skipDuplicates: true })).count
    emit({ type: 'ygo-progress', updated, created })
  }
  return { cards: en.length, korean: ko.length, updated, created }
}

// ── 디지몬 ────────────────────────────────────────────────────────────────────

interface DigimonCard {
  id: string; name: string; type?: string; level?: number | null; play_cost?: number | null; evolution_cost?: number | null
  evolution_color?: string | null; evolution_level?: number | null; color?: string | null; color2?: string | null
  digi_type?: string | null; form?: string | null; dp?: number | null; attribute?: string | null; rarity?: string | null
  stage?: string | null; artist?: string | null; main_effect?: string | null; source_effect?: string | null
  set_name?: string[] | null
}

// digimoncard.io 공식 이미지 CDN (Limitless CDN은 외부 접근이 403으로 막혀 있음)
const digimonImage = (id: string) => `https://images.digimoncard.io/images/cards/${encodeURIComponent(id)}.webp`

export async function syncDigimon(opts: { importMissing?: boolean; emit?: Emit } = {}) {
  const { importMissing = true, emit = () => {} } = opts
  const cards = await fetchWithRetry<DigimonCard[]>('https://digimoncard.io/api-public/search.php?series=Digimon%20Card%20Game', { timeoutMs: 90_000, retries: 2 })
  const unique = [...new Map(cards.map(c => [c.id, c])).values()]
  emit({ type: 'digimon-fetched', count: unique.length })
  let updated = 0, created = 0
  for (const group of chunk(unique, 200)) {
    const rows = group.map(c => ({
      c,
      data: {
        stats: {
          type: c.type ?? null, level: c.level ?? null, dp: c.dp ?? null, playCost: c.play_cost ?? null,
          evolutionCost: c.evolution_cost ?? null, evolutionColor: c.evolution_color ?? null, evolutionLevel: c.evolution_level ?? null,
          color: [c.color, c.color2].filter(Boolean), form: c.form ?? null, attribute: c.attribute ?? null,
          digiType: c.digi_type ?? null, stage: c.stage ?? null,
        } as Prisma.InputJsonValue,
        description: [c.main_effect, c.source_effect && `【진화원 효과】 ${c.source_effect}`].filter(Boolean).join('\n\n') || null,
        artist: c.artist ?? null,
        detailSyncedAt: new Date(),
      },
    }))
    const rs = await prisma.$transaction(rows.map(r => prisma.card.updateMany({ where: { externalId: `digimon_${r.c.id}` }, data: r.data })))
    updated += rs.reduce((s, r) => s + r.count, 0)
    if (importMissing) {
      const missing = rows.filter((_, i) => rs[i].count === 0)
      if (missing.length) {
        created += (await prisma.card.createMany({
          skipDuplicates: true,
          data: missing.map(({ c, data }) => ({
            externalId: `digimon_${c.id}`, name: c.name, tcgType: 'DIGIMON' as const,
            setName: c.set_name?.[0] ?? 'Unknown', setCode: c.id.replace(/-\d+$/, ''), cardNumber: c.id,
            rarity: c.rarity ?? 'Unknown', imageUrl: digimonImage(c.id), ...data,
          })),
        })).count
      }
    }
    emit({ type: 'digimon-progress', updated, created })
  }
  return { cards: unique.length, updated, created }
}

// ── MTG ───────────────────────────────────────────────────────────────────────

interface ScryCard {
  id: string; oracle_id?: string; lang?: string; mana_cost?: string; cmc?: number; type_line?: string; oracle_text?: string
  power?: string; toughness?: string; loyalty?: string; colors?: string[]; artist?: string; flavor_text?: string
  printed_name?: string; printed_text?: string; printed_type_line?: string
  card_faces?: Array<{ oracle_text?: string; printed_text?: string; mana_cost?: string; type_line?: string }>
}
const SCRY_HEADERS = { 'User-Agent': 'RocketAuctionHouse/1.0 contact@rocketauction.kr', Accept: 'application/json', 'Content-Type': 'application/json' }
const faceText = (c: ScryCard, f: 'oracle_text' | 'printed_text') =>
  c[f] ?? (c.card_faces?.map(x => x[f]).filter(Boolean).join('\n//\n') || undefined)

export async function syncMtg(opts: { emit?: Emit; isCancelled?: () => boolean } = {}) {
  const { emit = () => {}, isCancelled = () => false } = opts
  // 1) 공식 한국어 인쇄본 (오라클 ID별 한국어 이름·텍스트)
  const koByOracle = new Map<string, { name?: string; text?: string; typeLine?: string }>()
  let next: string | null = 'https://api.scryfall.com/cards/search?q=lang%3Ako&unique=prints'
  while (next && !isCancelled()) {
    const page: { data: ScryCard[]; has_more: boolean; next_page?: string } =
      await fetchWithRetry(next, { headers: SCRY_HEADERS, timeoutMs: 30_000, retries: 2 })
    for (const c of page.data) {
      if (c.oracle_id && (c.printed_name || c.printed_text) && !koByOracle.has(c.oracle_id)) {
        koByOracle.set(c.oracle_id, { name: c.printed_name, text: faceText(c, 'printed_text'), typeLine: c.printed_type_line })
      }
    }
    next = page.has_more ? page.next_page ?? null : null
    await sleep(110)
  }
  emit({ type: 'mtg-korean', oracles: koByOracle.size })

  // 2) DB의 MTG 카드 상세 (75장씩 컬렉션 조회)
  const cards = await prisma.card.findMany({ where: { tcgType: 'MTG', externalId: { startsWith: 'mtg_' } }, select: { id: true, externalId: true } })
  const idOf = (ext: string) => ext.replace(/^mtg_(?:[a-z]{2}_)?/, '')
  let updated = 0, korean = 0
  for (const group of chunk(cards, 75)) {
    if (isCancelled()) break
    const body = await fetchWithRetry<{ data: ScryCard[] }>('https://api.scryfall.com/cards/collection', {
      method: 'POST', headers: SCRY_HEADERS, timeoutMs: 30_000, retries: 2,
      body: JSON.stringify({ identifiers: group.map(c => ({ id: idOf(c.externalId!) })) }),
    })
    const byId = new Map(body.data.map(c => [c.id, c]))
    await prisma.$transaction(group.flatMap(card => {
      const c = byId.get(idOf(card.externalId!))
      if (!c) return []
      const ko = c.lang === 'ko' && (c.printed_name || c.printed_text)
        ? { name: c.printed_name, text: faceText(c, 'printed_text'), typeLine: c.printed_type_line }
        : c.oracle_id ? koByOracle.get(c.oracle_id) : undefined
      if (ko) korean++
      return [prisma.card.update({
        where: { id: card.id },
        data: {
          stats: { oracleId: c.oracle_id ?? null, manaCost: c.mana_cost ?? c.card_faces?.[0]?.mana_cost ?? null, cmc: c.cmc ?? null,
            typeLine: c.type_line ?? null, power: c.power ?? null, toughness: c.toughness ?? null, loyalty: c.loyalty ?? null, colors: c.colors ?? [] },
          description: faceText(c, 'oracle_text') ?? null,
          artist: c.artist ?? null, flavorText: c.flavor_text ?? null,
          ...(ko ? {
            nameKo: ko.name ?? undefined,
            textKo: { effect: ko.text ?? null, typeLine: ko.typeLine ?? null },
            textKoSource: 'OFFICIAL',
          } : {}),
          detailSyncedAt: new Date(),
        },
      })]
    }))
    updated += group.length
    emit({ type: 'mtg-progress', updated, korean })
    await sleep(110)
  }
  return { cards: cards.length, updated, korean, koreanOracles: koByOracle.size }
}

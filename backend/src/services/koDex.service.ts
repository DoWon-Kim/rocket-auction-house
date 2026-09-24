import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { fetchWithRetry } from '../lib/fetchWithRetry'
import { cardLangOf } from '../lib/cardLang'
import {
  KoDict, normKey, minePairs, tallyEntries, translatePokemonCard,
  type DictEntry, type KoText, type AttackIn, type AbilityIn,
} from '../lib/koTranslate'

// ── 한국인을 위한 포켓몬 도감 ─────────────────────────────────────────────────
// 1) PokeAPI: 전국도감 한국어 이름·분류·도감 설명 + 게임 기술·특성 이름 사전
// 2) TCGdex 한판·일판 공식 카드 짝 → 카드명·기술·효과 문장 사전
// 3) 일판·영문판 카드에 한국어 이름·텍스트 적용 (공식 한판 짝이 있으면 그대로)

const POKEAPI_GQL = 'https://beta.pokeapi.co/graphql/v1beta'
const TCGDEX = 'https://api.tcgdex.net/v2'
const LANG_ID = { jaHrkt: 1, ko: 3, en: 9, ja: 11 } as const
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
type Emit = (e: object) => void

async function gql<T>(query: string): Promise<T> {
  const body = await fetchWithRetry<{ data?: T; errors?: unknown }>(POKEAPI_GQL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }), timeoutMs: 60_000, retries: 2,
  })
  if (!body.data) throw new Error(`PokeAPI GraphQL 오류: ${JSON.stringify(body.errors).slice(0, 300)}`)
  return body.data
}

interface NameRow { name: string; language_id: number; genus?: string }

// ── 1) PokeAPI ────────────────────────────────────────────────────────────────

export async function syncPokeApi(emit: Emit = () => {}) {
  const langs = `[${Object.values(LANG_ID).join(',')}]`
  const data = await gql<{
    species: Array<{
      id: number; name: string; generation_id: number | null; evolves_from_species_id: number | null
      pokemon_v2_pokemonspeciesnames: NameRow[]
      pokemon_v2_pokemonspeciesflavortexts: Array<{ flavor_text: string }>
      pokemon_v2_pokemons: Array<{ height: number; weight: number; pokemon_v2_pokemontypes: Array<{ pokemon_v2_type: { name: string } }> }>
    }>
  }>(`query {
    species: pokemon_v2_pokemonspecies(order_by: {id: asc}) {
      id name generation_id evolves_from_species_id
      pokemon_v2_pokemonspeciesnames(where: {language_id: {_in: ${langs}}}) { name genus language_id }
      pokemon_v2_pokemonspeciesflavortexts(where: {language_id: {_eq: ${LANG_ID.ko}}}, order_by: {version_id: desc}, limit: 1) { flavor_text }
      pokemon_v2_pokemons(where: {is_default: {_eq: true}}) { height weight pokemon_v2_pokemontypes { pokemon_v2_type { name } } }
    }
  }`)

  const entries: DictEntry[] = []
  let upserted = 0
  for (const s of data.species) {
    const byLang = (id: number) => s.pokemon_v2_pokemonspeciesnames.find(n => n.language_id === id)
    const ko = byLang(LANG_ID.ko)
    if (!ko) continue
    const ja = byLang(LANG_ID.jaHrkt) ?? byLang(LANG_ID.ja)
    const en = byLang(LANG_ID.en)
    const mon = s.pokemon_v2_pokemons[0]
    const row = {
      nameKo: ko.name, nameJa: ja?.name ?? null, nameEn: en?.name ?? s.name,
      genusKo: ko.genus || null,
      flavorKo: s.pokemon_v2_pokemonspeciesflavortexts[0]?.flavor_text.replace(/\s*\n\s*/g, ' ').trim() ?? null,
      heightDm: mon?.height ?? null, weightHg: mon?.weight ?? null,
      types: mon?.pokemon_v2_pokemontypes.map(t => t.pokemon_v2_type.name) ?? [],
      generation: s.generation_id, evolvesFromDexId: s.evolves_from_species_id,
    }
    await prisma.pokemonSpecies.upsert({ where: { dexId: s.id }, create: { dexId: s.id, ...row }, update: row })
    upserted++
    for (const id of [LANG_ID.jaHrkt, LANG_ID.ja]) {
      const n = byLang(id)
      if (n) entries.push({ kind: 'POKEMON', srcLang: 'ja', src: normKey(n.name), ko: ko.name })
    }
    if (en) entries.push({ kind: 'POKEMON', srcLang: 'en', src: normKey(en.name), ko: ko.name })
  }
  emit({ type: 'species-done', upserted })

  // 게임 기술·특성 이름 (TCG 기술 이름이 게임 기술과 같은 경우가 많음)
  for (const [kind, table] of [['MOVE', 'pokemon_v2_movename'], ['ABILITY', 'pokemon_v2_abilityname']] as const) {
    const idField = kind === 'MOVE' ? 'move_id' : 'ability_id'
    const rows = (await gql<Record<string, Array<NameRow & Record<string, number>>>>(
      `query { rows: ${table}(where: {language_id: {_in: ${langs}}}) { ${idField} name language_id } }`,
    )).rows
    const byId = new Map<number, NameRow[]>()
    for (const r of rows) byId.set(r[idField], [...(byId.get(r[idField]) ?? []), r])
    for (const names of byId.values()) {
      const ko = names.find(n => n.language_id === LANG_ID.ko)
      if (!ko) continue
      for (const n of names) {
        if (n.language_id === LANG_ID.ko) continue
        entries.push({ kind, srcLang: n.language_id === LANG_ID.en ? 'en' : 'ja', src: normKey(n.name), ko: ko.name })
      }
    }
    emit({ type: 'dict-done', kind, count: byId.size })
  }

  const written = await replaceDict('POKEAPI', entries)
  return { species: upserted, dict: written }
}

// 같은 출처의 사전 항목을 통째로 교체 (다른 출처 항목은 유지, 겹치면 기존 것 우선)
async function replaceDict(source: string, entries: DictEntry[]) {
  const tallied = tallyEntries(entries)
  await prisma.koDictEntry.deleteMany({ where: { source } })
  let written = 0
  for (let i = 0; i < tallied.length; i += 2000) {
    const r = await prisma.koDictEntry.createMany({
      data: tallied.slice(i, i + 2000).map(e => ({ kind: e.kind, srcLang: e.srcLang, src: e.src, ko: e.ko, source, hits: e.hits })),
      skipDuplicates: true,
    })
    written += r.count
  }
  return written
}

// ── 2) 공식 한판·일판 짝 → 사전 ───────────────────────────────────────────────

type Attack = { name: string; text?: string; cost?: string[]; damage?: string }
type Ability = { name: string; text?: string; type?: string }
const asAttacks = (v: Prisma.JsonValue | null): AttackIn[] => (Array.isArray(v) ? (v as unknown as Attack[]) : [])
const asAbilities = (v: Prisma.JsonValue | null): AbilityIn[] => (Array.isArray(v) ? (v as unknown as Ability[]) : [])

const textSelect = { id: true, externalId: true, name: true, attacks: true, abilities: true, description: true, flavorText: true } satisfies Prisma.CardSelect

export async function mineOfficialPairs(emit: Emit = () => {}) {
  const entries: DictEntry[] = []
  let pairs = 0
  let cursor = ''
  for (;;) {
    const ko = await prisma.card.findMany({
      where: { externalId: { startsWith: 'tcgdex_ko_' }, detailSyncedAt: { not: null }, id: { gt: cursor } },
      select: textSelect, orderBy: { id: 'asc' }, take: 1000,
    })
    if (!ko.length) break
    cursor = ko[ko.length - 1].id
    const twins = await prisma.card.findMany({
      where: { externalId: { in: ko.map(k => k.externalId!.replace('tcgdex_ko_', 'tcgdex_ja_')) }, detailSyncedAt: { not: null } },
      select: textSelect,
    })
    const byExt = new Map(twins.map(t => [t.externalId, t]))
    for (const k of ko) {
      const j = byExt.get(k.externalId!.replace('tcgdex_ko_', 'tcgdex_ja_'))
      if (!j) continue
      entries.push(...minePairs(
        { name: j.name, attacks: asAttacks(j.attacks), abilities: asAbilities(j.abilities), description: j.description },
        { name: k.name, attacks: asAttacks(k.attacks), abilities: asAbilities(k.abilities), description: k.description },
      ))
      pairs++
    }
  }
  const written = await replaceDict('TCGDEX_KO', entries)
  emit({ type: 'mine-done', pairs, entries: written })
  return { pairs, entries: written }
}

// ── 3) 카드에 한국어 적용 ─────────────────────────────────────────────────────

export async function loadKoDict() {
  const rows = await prisma.koDictEntry.findMany({ select: { kind: true, srcLang: true, src: true, ko: true } })
  return new KoDict(rows as DictEntry[])
}

interface StoredKoText extends KoText { nameSource?: 'OFFICIAL' | 'DICT' }

export async function applyKorean(opts: { emit?: Emit; isCancelled?: () => boolean } = {}) {
  const { emit = () => {}, isCancelled = () => false } = opts
  const dict = await loadKoDict()
  const species = new Map((await prisma.pokemonSpecies.findMany({ select: { dexId: true, flavorKo: true } })).map(s => [s.dexId, s.flavorKo]))
  const totals = { scanned: 0, official: 0, dict: 0, partial: 0, none: 0, updated: 0 }

  let cursor = ''
  while (!isCancelled()) {
    const cards = await prisma.card.findMany({
      where: { tcgType: 'POKEMON', id: { gt: cursor }, NOT: { externalId: { startsWith: 'tcgdex_ko_' } } },
      select: { ...textSelect, nameKo: true, dexIds: true, textKo: true, textKoSource: true },
      orderBy: { id: 'asc' }, take: 500,
    })
    if (!cards.length) break
    cursor = cards[cards.length - 1].id

    // 공식 한판 짝 (TCGdex 같은 카드 ID)
    const twinIds = cards.filter(c => c.externalId?.startsWith('tcgdex_ja_')).map(c => c.externalId!.replace('tcgdex_ja_', 'tcgdex_ko_'))
    const twins = new Map((await prisma.card.findMany({
      where: { externalId: { in: twinIds }, detailSyncedAt: { not: null } }, select: textSelect,
    })).map(t => [t.externalId, t]))

    for (const c of cards) {
      totals.scanned++
      const lang = cardLangOf(c.externalId)
      if (lang === 'ko') continue
      const flavorKo = c.dexIds[0] != null ? species.get(c.dexIds[0]) ?? null : null
      const twin = c.externalId ? twins.get(c.externalId.replace('tcgdex_ja_', 'tcgdex_ko_')) : undefined

      let nameKo: string | null
      let textKo: StoredKoText
      let source: string | null
      if (twin) {
        nameKo = twin.name
        textKo = {
          nameSource: 'OFFICIAL',
          ...(asAttacks(twin.attacks).length ? { attacks: asAttacks(twin.attacks).map(a => ({ name: a.name, text: a.text || null })) } : {}),
          ...(asAbilities(twin.abilities).length ? { abilities: asAbilities(twin.abilities).map(a => ({ name: a.name, text: a.text || null })) } : {}),
          ...(twin.description ? { effect: twin.description } : {}),
          flavor: twin.flavorText ?? flavorKo,
        }
        source = 'OFFICIAL'
        totals.official++
      } else {
        const r = translatePokemonCard(
          { name: c.name, attacks: asAttacks(c.attacks), abilities: asAbilities(c.abilities), description: c.description },
          lang, dict, flavorKo,
        )
        nameKo = r.nameKo
        textKo = { ...r.textKo, ...(r.nameKo ? { nameSource: 'DICT' as const } : {}) }
        source = r.translated === 0 ? null : r.translated === r.total ? 'DICT' : 'PARTIAL'
        totals[source === 'DICT' ? 'dict' : source === 'PARTIAL' ? 'partial' : 'none']++
      }

      // 한국어 이름은 비어 있었거나 이 작업이 채운 이름일 때만 관리 (한판 병합 등 기존 이름 보호)
      const prev = c.textKo as StoredKoText | null
      const managed = !c.nameKo || !!prev?.nameSource
      const nextName = managed ? nameKo : c.nameKo
      if (!managed || !nameKo) delete textKo.nameSource

      const changed = nextName !== c.nameKo || source !== c.textKoSource || JSON.stringify(textKo) !== JSON.stringify(c.textKo)
      if (changed) {
        await prisma.card.update({
          where: { id: c.id },
          data: { nameKo: nextName, textKo: textKo as Prisma.InputJsonValue, textKoSource: source },
        })
        totals.updated++
      }
    }
    emit({ type: 'apply-progress', ...totals })
  }
  return totals
}

// ── 4) 포켓몬 일판·한판 전 세트 카드 임포트 ────────────────────────────────────

interface TcgdexSetBrief { id: string; name: string }
interface TcgdexSetDetail { id: string; name: string; cards: Array<{ id: string; localId: string; name: string; image?: string }> }

// pokemontcg.io(sv1) ↔ TCGdex(sv01) 세트 코드 변형
function setCodeVariants(code: string): string[] {
  const lower = code.toLowerCase()
  return [...new Set([lower, lower.replace(/^([a-z]+)(\d)(?!\d)/, '$10$2'), lower.replace(/^([a-z]+)0(\d)/, '$1$2')])]
}

export async function importPokemonLang(lang: 'ja' | 'ko', opts: { emit?: Emit; isCancelled?: () => boolean } = {}) {
  const { emit = () => {}, isCancelled = () => false } = opts
  const nameField = lang === 'ja' ? 'nameJa' : 'nameKo'
  const sets = await fetchWithRetry<TcgdexSetBrief[]>(`${TCGDEX}/${lang}/sets`, { timeoutMs: 20_000 })
  let created = 0, merged = 0, failed = 0

  for (const s of sets) {
    if (isCancelled()) break
    try {
      const d = await fetchWithRetry<TcgdexSetDetail>(`${TCGDEX}/${lang}/sets/${encodeURIComponent(s.id)}`, { timeoutMs: 20_000, retries: 2 })
      if (!d.cards?.length) continue
      // 언어 전용 레코드가 아닌 기본(영문) 카드와 같은 세트·번호면 이름만 병합 (기존 임포터와 같은 규칙)
      const base = await prisma.card.findMany({
        where: {
          tcgType: 'POKEMON',
          OR: setCodeVariants(d.id).map(v => ({ setCode: { equals: v, mode: 'insensitive' as const } })),
          NOT: { OR: ['tcgdex_ko_', 'tcgdex_ja_', 'pkmncardgame_ja_', 'snkrdunk_'].map(p => ({ externalId: { startsWith: p } })) },
        },
        select: { id: true, cardNumber: true, nameJa: true, nameKo: true },
      })
      const byNum = new Map(base.map(b => [b.cardNumber, b]))
      const toCreate: Prisma.CardCreateManyInput[] = []
      for (const c of d.cards) {
        const ex = byNum.get(c.localId)
        if (ex) {
          if (!ex[nameField]) { await prisma.card.update({ where: { id: ex.id }, data: { [nameField]: c.name } }); merged++ }
          continue
        }
        toCreate.push({
          externalId: `tcgdex_${lang}_${c.id}`, name: c.name, [nameField]: c.name,
          tcgType: 'POKEMON', setName: d.name, setCode: d.id, cardNumber: c.localId, rarity: 'Unknown',
          imageUrl: c.image ? `${c.image}/low.webp` : null,
        })
      }
      if (toCreate.length) created += (await prisma.card.createMany({ data: toCreate, skipDuplicates: true })).count
      emit({ type: 'import-set', lang, setId: s.id, cards: d.cards.length, created, merged })
      await sleep(120)
    } catch (err) {
      failed++
      emit({ type: 'import-error', lang, setId: s.id, reason: String(err) })
    }
  }
  return { lang, sets: sets.length, created, merged, failed }
}

// ── 전체 파이프라인 (관리자 수동 실행 / 자동 잡) ──────────────────────────────

let pipelineRunning = false
export class KoDexBusyError extends Error { constructor() { super('도감 데이터 구축이 이미 실행 중입니다.') } }

export async function runKoreanDexPipeline(opts: {
  importCards?: boolean      // 일판·한판 전 세트 카드 임포트 포함 여부
  maxDetailCards?: number
  emit?: Emit
  isCancelled?: () => boolean
} = {}) {
  if (pipelineRunning) throw new KoDexBusyError()
  pipelineRunning = true
  const { importCards = true, emit = () => {}, isCancelled = () => false } = opts
  const step = (name: string) => emit({ type: 'step', step: name })
  try {
    const { runCardDetailSync } = await import('./cardDetail.service')
    step('PokeAPI 도감·사전')
    const pokeapi = await syncPokeApi(emit)
    const imported = []
    if (importCards) {
      for (const lang of ['ja', 'ko'] as const) {
        if (isCancelled()) break
        step(`${lang === 'ja' ? '일판' : '한판'} 전 세트 카드 임포트`)
        imported.push(await importPokemonLang(lang, { emit, isCancelled }))
      }
    }
    step('카드 상세 보강')
    const details = isCancelled() ? null : await runCardDetailSync({ maxCards: opts.maxDetailCards, onEvent: emit, isCancelled })
    step('공식 한판 문장 사전')
    const mined = isCancelled() ? null : await mineOfficialPairs(emit)
    step('한국어 적용')
    const applied = isCancelled() ? null : await applyKorean({ emit, isCancelled })
    return { pokeapi, imported, details, mined, applied }
  } finally {
    pipelineRunning = false
  }
}

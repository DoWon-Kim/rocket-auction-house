/**
 * 전체 TCG 카드 데이터 일괄 임포트 스크립트
 *
 * 실행: npx ts-node src/scripts/importAll.ts [pokemon|yugioh|mtg|digimon|onepiece|all]
 * 예)  npx ts-node src/scripts/importAll.ts all
 *      npx ts-node src/scripts/importAll.ts pokemon yugioh
 */

import 'dotenv/config'
import { prisma } from '../lib/prisma'
import { fetchWithRetry, ExternalApiError } from '../lib/fetchWithRetry'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

const SCRYFALL_HEADERS = {
  'User-Agent': 'RocketAuctionHouse/1.0 contact@rocketauction.kr',
  Accept: 'application/json',
}
const LANG_PREFIXES = ['tcgdex_ko_', 'tcgdex_ja_', 'mtg_ko_', 'mtg_ja_']
const SET_CACHE = 5 * 60 * 1000

// ── 유틸 ─────────────────────────────────────────────────────────────────────

function log(tcg: string, msg: string) {
  process.stdout.write(`[${new Date().toISOString().slice(11, 19)}] [${tcg.padEnd(8)}] ${msg}\n`)
}

function pokemonSetCodeVariants(code: string): string[] {
  if (!code) return []
  const lower = code.toLowerCase()
  const variants = new Set<string>([lower])
  const padded = lower.replace(/^([a-z]+)(\d+)/, (_, p, n) => `${p}${parseInt(n, 10) < 10 ? '0' + parseInt(n, 10) : parseInt(n, 10)}`)
  variants.add(padded)
  const unpadded = lower.replace(/^([a-z]+)0(\d)(.*)$/, '$1$2$3')
  variants.add(unpadded)
  return [...variants].filter(Boolean)
}

function normalizeCardNumber(num: string): string[] {
  const n = num.trim()
  const variants = new Set<string>([n])
  const slashIdx = n.indexOf('/')
  if (slashIdx > 0) {
    const base = n.slice(0, slashIdx).trim()
    variants.add(base)
    if (/^\d+$/.test(base)) {
      const int = parseInt(base, 10)
      variants.add(String(int))
      variants.add(String(int).padStart(2, '0'))
      variants.add(String(int).padStart(3, '0'))
    }
  }
  if (/^\d+$/.test(n)) {
    const int = parseInt(n, 10)
    variants.add(String(int))
    variants.add(String(int).padStart(2, '0'))
    variants.add(String(int).padStart(3, '0'))
  }
  return [...variants].filter(Boolean)
}

// ── 타입 ─────────────────────────────────────────────────────────────────────

interface PokemonSet { id: string; name: string; total: number; releaseDate: string }
interface PokemonCard {
  id: string; name: string; number: string; rarity?: string
  set: { id: string; name: string }
  images?: { small?: string }
}
interface TcgdexSet { id: string; name: string }
interface TcgdexCard { id: string; localId: string; name: string; rarity?: string; image?: string }
interface TcgdexSetDetail extends TcgdexSet { cards: TcgdexCard[] }
interface YgoCard {
  id: number; name: string
  card_sets?: Array<{ set_name: string; set_code: string; set_rarity: string }>
  card_images?: Array<{ image_url_small: string }>
}
interface YgoBulkMeta { total_rows: number; next_page_offset?: number }
interface ScryfallCard {
  id: string; name: string
  set: string; set_name: string
  collector_number: string; rarity: string; oracle_text?: string
  image_uris?: { normal?: string }
  card_faces?: Array<{ image_uris?: { normal?: string } }>
}
interface DigimonCard { id: string; name: string; rarity?: string; set_name?: string[] }
interface OpCard { number: string; name: string; rarity: string; imageUrl: string | null }

// ── 1. 포켓몬 EN (pokemontcg.io HQ) ─────────────────────────────────────────

async function importPokemonEN() {
  log('POKEMON', '▶ pokemontcg.io 세트 목록 조회 중...')
  const { data: sets } = await fetchWithRetry<{ data: PokemonSet[] }>(
    'https://api.pokemontcg.io/v2/sets?orderBy=-releaseDate&pageSize=250',
    { cacheTtlMs: SET_CACHE, timeoutMs: 30_000, retries: 3 },
  )
  log('POKEMON', `총 ${sets.length}개 세트 발견`)

  let totalImported = 0, totalSkipped = 0, errors = 0

  for (let i = 0; i < sets.length; i++) {
    const set = sets[i]
    try {
      const all: PokemonCard[] = []
      let pg = 1
      while (true) {
        const body = await fetchWithRetry<{ data: PokemonCard[]; totalCount: number }>(
          `https://api.pokemontcg.io/v2/cards?q=set.id:${set.id}&pageSize=250&page=${pg}`,
          { timeoutMs: 30_000, retries: 3 },
        )
        all.push(...body.data)
        if (all.length >= body.totalCount) break
        pg++
        await sleep(80)
      }
      const records = all.map(c => ({
        externalId: `pokemon_${c.id}`, name: c.name, tcgType: 'POKEMON' as const,
        setName: c.set.name, setCode: c.set.id,
        cardNumber: c.number, rarity: c.rarity ?? 'Unknown',
        imageUrl: c.images?.small ?? null,
      }))
      const result = await prisma.card.createMany({ data: records, skipDuplicates: true })
      totalImported += result.count
      totalSkipped += records.length - result.count
      log('POKEMON', `[${i + 1}/${sets.length}] ${set.name} (${set.id}): +${result.count}장 (스킵 ${records.length - result.count})`)
      await sleep(100)
    } catch (err) {
      errors++
      log('POKEMON', `[${i + 1}/${sets.length}] ${set.id} 오류: ${err}`)
    }
  }
  log('POKEMON', `✅ EN 완료 — 임포트 ${totalImported}, 스킵 ${totalSkipped}, 오류 ${errors}`)
}

// ── 2. 포켓몬 KO (TCGdex) ────────────────────────────────────────────────────

async function importPokemonLang(lang: 'ko' | 'ja') {
  const label = lang === 'ko' ? 'KO' : 'JA'
  const field = lang === 'ko' ? 'nameKo' : 'nameJa'
  const langPfx = `tcgdex_${lang}_`

  log(`PKMN-${label}`, `▶ TCGdex ${label} 세트 목록 조회 중...`)
  const sets = await fetchWithRetry<TcgdexSet[]>(
    `https://api.tcgdex.net/v2/${lang}/sets`,
    { cacheTtlMs: SET_CACHE, timeoutMs: 12_000 },
  )
  log(`PKMN-${label}`, `총 ${sets.length}개 세트`)

  let totalMerged = 0, totalCreated = 0

  for (let i = 0; i < sets.length; i++) {
    const set = sets[i]
    try {
      const data = await fetchWithRetry<TcgdexSetDetail>(
        `https://api.tcgdex.net/v2/${lang}/sets/${set.id}`,
        { timeoutMs: 12_000, retries: 2 },
      )
      const codeVariants = pokemonSetCodeVariants(data.id)

      // 기존 EN 카드에 이름 merge (normalizeCardNumber로 번호 불일치 흡수)
      const existingCards = await prisma.card.findMany({
        where: {
          tcgType: 'POKEMON',
          setCode: { in: codeVariants },
          [field]: null,
          NOT: { OR: LANG_PREFIXES.map(p => ({ externalId: { startsWith: p } })) },
        },
        select: { id: true, cardNumber: true },
      })

      if (existingCards.length > 0) {
        const byNum = new Map<string, string>()
        for (const c of data.cards) {
          if (!c.name) continue
          for (const v of normalizeCardNumber(c.localId)) byNum.set(v.toLowerCase(), c.name)
        }

        const toUpdate = existingCards
          .map(ec => {
            if (!ec.cardNumber) return null
            const name = normalizeCardNumber(ec.cardNumber)
              .reduce((found: string | undefined, v) => found ?? byNum.get(v.toLowerCase()), undefined)
            return name ? { id: ec.id, name } : null
          })
          .filter((x): x is { id: string; name: string } => x !== null)

        const CHUNK = 100
        for (let j = 0; j < toUpdate.length; j += CHUNK) {
          const chunk = toUpdate.slice(j, j + CHUNK)
          await prisma.$transaction(
            chunk.map(u => prisma.card.update({ where: { id: u.id }, data: { [field]: u.name } })),
          )
        }
        totalMerged += toUpdate.length
      }

      // EN에 없는 카드는 lang 전용 레코드로 생성
      const existingIds = new Set(existingCards.map(c => c.cardNumber))
      const toCreate = data.cards
        .filter(c => !existingIds.has(c.localId))
        .map(c => ({
          externalId: `${langPfx}${c.id}`,
          name: c.name,
          nameKo: lang === 'ko' ? c.name : undefined,
          nameJa: lang === 'ja' ? c.name : undefined,
          tcgType: 'POKEMON' as const,
          setName: data.name, setCode: data.id,
          cardNumber: c.localId,
          rarity: c.rarity ?? 'Unknown',
          imageUrl: c.image ? `${c.image}/low.webp` : null,
        }))

      if (toCreate.length > 0) {
        const result = await prisma.card.createMany({ data: toCreate, skipDuplicates: true })
        totalCreated += result.count
      }

      log(`PKMN-${label}`, `[${i + 1}/${sets.length}] ${data.name}: 병합 ${totalMerged}, 생성 ${toCreate.length}`)
      await sleep(120)
    } catch (err) {
      log(`PKMN-${label}`, `[${i + 1}/${sets.length}] ${set.id} 오류: ${err}`)
    }
  }
  log(`PKMN-${label}`, `✅ ${label} 완료 — 병합 ${totalMerged}, 생성 ${totalCreated}`)
}

// ── 3. 유희왕 (YGOProDeck 전체 bulk) ─────────────────────────────────────────

async function importYugioh() {
  log('YUGIOH', '▶ YGOProDeck 전체 카드 가져오기 (500건씩 페이지네이션)...')
  const PAGE = 500
  let offset = 0, totalRows = 0, imported = 0, skipped = 0

  while (true) {
    try {
      const body = await fetchWithRetry<{ data: YgoCard[]; meta: YgoBulkMeta }>(
        `https://db.ygoprodeck.com/api/v7/cardinfo.php?num=${PAGE}&offset=${offset}`,
        { timeoutMs: 30_000, retries: 3 },
      )
      totalRows = body.meta.total_rows

      const records = body.data.flatMap(c => {
        const seen = new Set<string>()
        return (c.card_sets ?? []).filter(s => {
          const k = `yugioh_${c.id}_${s.set_code}`
          if (seen.has(k)) return false
          seen.add(k)
          return true
        }).map(s => ({
          externalId: `yugioh_${c.id}_${s.set_code}`,
          name: c.name, tcgType: 'YUGIOH' as const,
          setName: s.set_name,
          setCode: s.set_code?.replace(/-.*/, '') ?? null,
          cardNumber: s.set_code ?? null,
          rarity: s.set_rarity ?? 'Unknown',
          imageUrl: c.card_images?.[0]?.image_url_small ?? null,
        }))
      })

      if (records.length > 0) {
        const unique = [...new Map(records.map(r => [r.externalId, r])).values()]
        const result = await prisma.card.createMany({ data: unique, skipDuplicates: true })
        imported += result.count
        skipped += unique.length - result.count
      }

      offset += body.data.length
      log('YUGIOH', `진행 ${offset}/${totalRows} — 임포트 ${imported}건`)
      if (offset >= totalRows || body.data.length < PAGE) break
      await sleep(300)
    } catch (err) {
      log('YUGIOH', `오류: ${err}`)
      break
    }
  }
  log('YUGIOH', `✅ 완료 — 임포트 ${imported}, 스킵 ${skipped}, 총 ${totalRows}`)
}

// ── 4. MTG (Scryfall) ─────────────────────────────────────────────────────────

async function importMtg(maxSets = 80) {
  log('MTG', `▶ Scryfall 세트 목록 조회 중 (최대 ${maxSets}개)...`)
  const { data: allSets } = await fetchWithRetry<{ data: Array<{ code: string; name: string; set_type: string; released_at: string; card_count: number }> }>(
    'https://api.scryfall.com/sets',
    { headers: SCRYFALL_HEADERS, cacheTtlMs: SET_CACHE, timeoutMs: 15_000 },
  )
  const INCLUDE = ['core', 'expansion', 'masters', 'draft_innovation', 'commander', 'starter']
  const sets = allSets
    .filter(s => INCLUDE.includes(s.set_type) && s.released_at && s.card_count > 0)
    .sort((a, b) => b.released_at.localeCompare(a.released_at))
    .slice(0, maxSets)
  log('MTG', `${sets.length}개 세트 가져오기 시작`)

  let totalImported = 0, totalSkipped = 0, errors = 0

  for (let i = 0; i < sets.length; i++) {
    const set = sets[i]
    try {
      const all: ScryfallCard[] = []
      let next: string | null = `https://api.scryfall.com/cards/search?q=set:${set.code}&unique=cards&order=set`
      while (next) {
        let body: { data: ScryfallCard[]; has_more: boolean; next_page?: string }
        try {
          body = await fetchWithRetry<typeof body>(next, {
            headers: SCRYFALL_HEADERS, timeoutMs: 15_000, retries: 2,
          })
        } catch (e) {
          if (e instanceof ExternalApiError && e.status === 404) break
          throw e
        }
        all.push(...body.data)
        next = body.has_more ? (body.next_page ?? null) : null
        if (next) await sleep(120)
      }

      if (all.length > 0) {
        const records = all.map(c => ({
          externalId: `mtg_${c.id}`, name: c.name, tcgType: 'MTG' as const,
          setName: c.set_name, setCode: c.set.toUpperCase(),
          cardNumber: c.collector_number, rarity: c.rarity,
          imageUrl: c.image_uris?.normal ?? c.card_faces?.[0]?.image_uris?.normal ?? null,
          description: c.oracle_text ?? null,
        }))
        const result = await prisma.card.createMany({ data: records, skipDuplicates: true })
        totalImported += result.count
        totalSkipped += records.length - result.count
        log('MTG', `[${i + 1}/${sets.length}] ${set.name} (${set.code}): +${result.count}장`)
      }
      await sleep(120)
    } catch (err) {
      errors++
      log('MTG', `[${i + 1}/${sets.length}] ${set.code} 오류: ${err}`)
    }
  }
  log('MTG', `✅ 완료 — 임포트 ${totalImported}, 스킵 ${totalSkipped}, 오류 ${errors}`)
}

// ── 5. 디지몬 (digimoncard.io) ────────────────────────────────────────────────

async function importDigimon() {
  log('DIGIMON', '▶ digimoncard.io 전체 카드 가져오기 (약 9MB)...')
  const all = await fetchWithRetry<DigimonCard[]>(
    'https://digimoncard.io/api-public/search.php?series=Digimon+Card+Game',
    { timeoutMs: 60_000, retries: 2 },
  )
  const records = all.map(c => ({
    externalId: `digimon_${c.id}`, name: c.name, tcgType: 'DIGIMON' as const,
    setName: c.set_name?.[0] ?? 'Unknown',
    setCode: c.id.replace(/-\d+$/, ''),
    cardNumber: c.id, rarity: c.rarity ?? 'Unknown', imageUrl: null,
  }))
  const unique = [...new Map(records.map(r => [r.externalId, r])).values()]
  const result = await prisma.card.createMany({ data: unique, skipDuplicates: true })
  log('DIGIMON', `✅ 완료 — 임포트 ${result.count}, 스킵 ${unique.length - result.count} (총 ${unique.length}건)`)
}

// ── 6. 원피스 (공식 Bandai 사이트 + 폴백) ────────────────────────────────────

const OP_SITE_EN = 'https://en.onepiece-cardgame.com'
const OP_SITE_JA = 'https://www.onepiece-cardgame.com'
const OP_SITE_KO = 'https://asia-en.onepiece-cardgame.com'

interface OpSet {
  id: string
  name: string           // 영어명
  nameJa?: string        // 일본어 세트명
  nameKo?: string        // 한국어 세트명
  total: number
}

const OP_KNOWN_SETS: OpSet[] = [
  { id: 'OP-01', name: 'Romance Dawn',                           nameJa: 'ROMANCE DAWN',             nameKo: '로맨스 던',           total: 121 },
  { id: 'OP-02', name: 'Paramount War',                          nameJa: 'PARAMOUNT WAR',            nameKo: '파라마운트 워',        total: 121 },
  { id: 'OP-03', name: 'Pillars of Strength',                    nameJa: 'PILLARS OF STRENGTH',      nameKo: '필라스 오브 스트렝스', total: 121 },
  { id: 'OP-04', name: 'Kingdoms of Intrigue',                   nameJa: 'KINGDOMS OF INTRIGUE',     nameKo: '킹덤스 오브 인트리그', total: 122 },
  { id: 'OP-05', name: 'Awakening of the New Era',               nameJa: 'AWAKENING OF THE NEW ERA', nameKo: '어웨이크닝 오브 뉴 에라', total: 120 },
  { id: 'OP-06', name: 'Wings of the Captain',                   nameJa: 'WINGS OF THE CAPTAIN',     nameKo: '윙스 오브 더 캡틴',   total: 120 },
  { id: 'OP-07', name: 'Five Hundred Years in the Future',       nameJa: '500年後の未来',              nameKo: '500년 후의 미래',     total: 119 },
  { id: 'OP-08', name: 'Two Legends',                            nameJa: 'TWO LEGENDS',              nameKo: '투 레전드',           total: 120 },
  { id: 'OP-09', name: 'Emperors in the New World',              nameJa: '新たなる皇帝',               nameKo: '새로운 황제',         total: 100 },
  { id: 'OP-10', name: 'Royal Blood',                            nameJa: 'ROYAL BLOOD',              nameKo: '로얄 블러드',         total: 100 },
  { id: 'OP-11', name: 'Pillars of the Earth',                   nameJa: '大地の柱',                  nameKo: '대지의 기둥',         total: 100 },
  { id: 'EB-01', name: 'Memorial Collection',                    nameJa: 'メモリアルコレクション',       nameKo: '메모리얼 컬렉션',     total: 61  },
  { id: 'EB-02', name: 'Memorial Collection Vol.2',              nameJa: 'メモリアルコレクション Vol.2', nameKo: '메모리얼 컬렉션 Vol.2', total: 55 },
  { id: 'EB-03', name: 'Heroines Edition',                       nameJa: 'ヒロインズエディション',       nameKo: '히로인즈 에디션',     total: 60  },
  { id: 'ST-01', name: 'Straw Hat Crew',                         total: 17  },
  { id: 'ST-02', name: 'Worst Generation',                       total: 17  },
  { id: 'ST-03', name: 'The Seven Warlords of the Sea',          total: 17  },
  { id: 'ST-04', name: 'Animal Kingdom Pirates',                 total: 17  },
  { id: 'ST-05', name: 'FILM Edition',                           total: 18  },
  { id: 'ST-06', name: 'Absolute Justice',                       total: 18  },
  { id: 'ST-07', name: 'Big Mom Pirates',                        total: 17  },
  { id: 'ST-08', name: 'Monkey D. Luffy',                        total: 17  },
  { id: 'ST-09', name: 'Yamato',                                 total: 17  },
  { id: 'ST-10', name: 'Bond Episode: Zoro & Sanji',             total: 43  },
  { id: 'ST-11', name: 'Uta',                                    total: 17  },
  { id: 'ST-12', name: 'Zoro and Sanji',                         total: 42  },
  { id: 'ST-13', name: 'The Three Captains',                     total: 42  },
  { id: 'ST-14', name: 'Big Secret Treasure of the Seven Seas!', total: 43  },
  { id: 'ST-15', name: 'Red Purple Luffy',                       total: 43  },
  { id: 'ST-16', name: 'Green Yellow Charlotte Linlin',          total: 43  },
  { id: 'ST-17', name: 'Black Yellow Nico Robin',                total: 43  },
  { id: 'ST-18', name: 'Purple Blue Monkey D. Garp',             total: 43  },
  { id: 'ST-19', name: 'Blue Black Monkey D. Luffy',             total: 43  },
  { id: 'ST-20', name: 'Red Blue Sabo',                          total: 43  },
]

function parseOpHtml(html: string, setId: string, site: string): OpCard[] {
  const seen = new Set<string>()
  const prefix = setId.replace('-', '')
  const imgRe = /\/images\/card\/([A-Z0-9-]+(?:_p\d+)?)\.(?:png|jpg|webp)/gi
  let m: RegExpExecArray | null
  while ((m = imgRe.exec(html)) !== null) {
    const num = m[1].toUpperCase()
    if (!seen.has(num) && num.startsWith(prefix)) seen.add(num)
  }
  return [...seen].map(num => {
    const esc = num.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const nameMt = new RegExp(`${esc}[\\s\\S]{0,600}<p[^>]*class="[^"]*name[^"]*"[^>]*>\\s*([^<]+)\\s*<\\/p>`, 'i').exec(html)
    const rarityMt = new RegExp(`${esc}[\\s\\S]{0,400}<p[^>]*class="[^"]*rarity[^"]*"[^>]*>\\s*([^<]+)\\s*<\\/p>`, 'i').exec(html)
    return {
      number: num,
      name: nameMt ? nameMt[1].trim() : num,
      rarity: rarityMt ? rarityMt[1].trim() : 'Unknown',
      imageUrl: `${site}/images/card/${num}.png`,
    }
  })
}

async function fetchOpCards(site: string, setId: string): Promise<OpCard[]> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 20_000)
  const body = new URLSearchParams({ 'series[]': setId })
  const res = await fetch(`${site}/cardlist/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (compatible; RocketAuctionHouse/1.0)',
      Accept: 'text/html,application/xhtml+xml,*/*',
      Referer: `${site}/cardlist/`,
    },
    body: body.toString(),
    signal: ctrl.signal,
  })
  clearTimeout(timer)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const html = await res.text()
  const cards = parseOpHtml(html, setId, site)
  if (cards.length === 0) throw new Error('파싱 결과 0건')
  return cards
}

function opFallback(setId: string, total: number): OpCard[] {
  const prefix = setId.replace('-', '')
  return Array.from({ length: total }, (_, i) => {
    const num = `${prefix}-${String(i + 1).padStart(3, '0')}`
    return { number: num, name: num, rarity: 'Unknown', imageUrl: `${OP_SITE_EN}/images/card/${num}.png` }
  })
}

async function importOnePiece() {
  log('ONEPIECE', `▶ 원피스 ${OP_KNOWN_SETS.length}개 세트 가져오기 중...`)
  let totalImported = 0, totalSkipped = 0, totalJa = 0, totalKo = 0

  for (let i = 0; i < OP_KNOWN_SETS.length; i++) {
    const set = OP_KNOWN_SETS[i]
    let cards: OpCard[]
    let usedFallback = false

    // 1단계: 영어 사이트에서 기본 데이터 가져오기
    try {
      cards = await fetchOpCards(OP_SITE_EN, set.id)
    } catch {
      cards = opFallback(set.id, set.total)
      usedFallback = true
    }

    const setNameKo = set.nameKo ?? set.name
    const setNameJa = set.nameJa ?? set.name

    const records = cards.map(c => ({
      externalId: `onepiece_${c.number}`,
      name: c.name,
      nameJa: null as string | null,
      nameKo: null as string | null,
      tcgType: 'ONEPIECE' as const,
      setName: setNameKo,
      setCode: set.id,
      cardNumber: c.number,
      rarity: c.rarity,
      imageUrl: c.imageUrl,
    }))
    const result = await prisma.card.createMany({ data: records, skipDuplicates: true })
    totalImported += result.count
    totalSkipped += records.length - result.count
    log('ONEPIECE', `[${i + 1}/${OP_KNOWN_SETS.length}] ${set.name}: +${result.count}장${usedFallback ? ' (폴백)' : ''}`)

    // 2단계: 일본어 이름 가져오기
    try {
      const jaCards = await fetchOpCards(OP_SITE_JA, set.id)
      const jaMap = new Map(jaCards.map(c => [c.number, c.name]))
      const dbCards = await prisma.card.findMany({
        where: { tcgType: 'ONEPIECE', setCode: set.id, nameJa: null },
        select: { id: true, cardNumber: true },
      })
      const toUpdateJa = dbCards.filter(c => c.cardNumber && jaMap.has(c.cardNumber))
      if (toUpdateJa.length > 0) {
        await prisma.$transaction(
          toUpdateJa.map(c => prisma.card.update({
            where: { id: c.id },
            data: { nameJa: jaMap.get(c.cardNumber!) },
          }))
        )
        totalJa += toUpdateJa.length
        log('ONEPIECE', `  └ 일본어명 업데이트: ${toUpdateJa.length}장 (${setNameJa})`)
      }
    } catch {
      log('ONEPIECE', `  └ 일본어 사이트 접근 실패, 스킵`)
    }
    await sleep(300)

    // 3단계: 한국어 이름 가져오기 시도
    try {
      const koCards = await fetchOpCards(OP_SITE_KO, set.id)
      const koMap = new Map(koCards.map(c => [c.number, c.name]))
      const dbCards = await prisma.card.findMany({
        where: { tcgType: 'ONEPIECE', setCode: set.id, nameKo: null },
        select: { id: true, cardNumber: true },
      })
      const toUpdateKo = dbCards.filter(c => c.cardNumber && koMap.has(c.cardNumber))
      if (toUpdateKo.length > 0) {
        await prisma.$transaction(
          toUpdateKo.map(c => prisma.card.update({
            where: { id: c.id },
            data: { nameKo: koMap.get(c.cardNumber!) },
          }))
        )
        totalKo += toUpdateKo.length
        log('ONEPIECE', `  └ 한국어명 업데이트: ${toUpdateKo.length}장`)
      }
    } catch {
      // 한국어 사이트 없으면 일본어명을 nameKo로 복사 (raw SQL)
      await prisma.$executeRaw`
        UPDATE "Card"
        SET "nameKo" = "nameJa"
        WHERE "tcgType" = 'ONEPIECE'
          AND "setCode" = ${set.id}
          AND "nameKo" IS NULL
          AND "nameJa" IS NOT NULL
      `
    }
    await sleep(500)
  }
  log('ONEPIECE', `✅ 완료 — 임포트 ${totalImported}, 스킵 ${totalSkipped}, 일본어 ${totalJa}건, 한국어 ${totalKo}건`)
}

// ── 메인 ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2).map(a => a.toLowerCase())
  const run = (target: string) =>
    args.length === 0 || args.includes('all') || args.includes(target)

  const start = Date.now()
  log('MAIN', `=== 전체 카드 데이터 임포트 시작 (대상: ${args.length === 0 || args.includes('all') ? '전체' : args.join(', ')}) ===`)

  // DB 현재 카드 수 확인
  const before = await prisma.card.count()
  log('MAIN', `현재 DB 카드 수: ${before.toLocaleString()}장`)

  const safeRun = async (label: string, fn: () => Promise<void>) => {
    try { await fn() }
    catch (err) { log('MAIN', `⚠️  ${label} 오류 발생, 다음 단계로 계속: ${err}`) }
  }

  if (run('pokemon')) {
    await safeRun('POKEMON-EN', importPokemonEN)
    await safeRun('POKEMON-KO', () => importPokemonLang('ko'))
    await safeRun('POKEMON-JA', () => importPokemonLang('ja'))
  }

  if (run('yugioh')) {
    await safeRun('YUGIOH', importYugioh)
  }

  if (run('mtg')) {
    await safeRun('MTG', () => importMtg(80))
  }

  if (run('digimon')) {
    await safeRun('DIGIMON', importDigimon)
  }

  if (run('onepiece')) {
    await safeRun('ONEPIECE', importOnePiece)
  }

  const after = await prisma.card.count()
  const elapsed = Math.round((Date.now() - start) / 1000)
  log('MAIN', `=== 완료! 신규 카드 +${(after - before).toLocaleString()}장 (총 ${after.toLocaleString()}장) — ${Math.floor(elapsed / 60)}분 ${elapsed % 60}초 소요 ===`)
}

main()
  .catch(err => { console.error('❌ 임포트 오류:', err); process.exit(1) })
  .finally(() => prisma.$disconnect())

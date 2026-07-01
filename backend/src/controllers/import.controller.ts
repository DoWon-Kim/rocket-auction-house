import { Response } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { fetchWithRetry, ExternalApiError } from '../lib/fetchWithRetry'

// ── 공통 ────────────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// 세트 목록: 5분 캐시 / 카드 상세: 캐시 없음
const SET_CACHE   = 5 * 60 * 1000
const CARD_CACHE  = 0

const SCRYFALL_HEADERS = {
  'User-Agent': 'RocketAuctionHouse/1.0 contact@rocketauction.kr',
  'Accept': 'application/json',
}

const LANG_PREFIXES = ['tcgdex_ko_', 'tcgdex_ja_', 'mtg_ko_', 'mtg_ja_']

// pokemontcg.io (sv1, swsh1) ↔ TCGdex (sv01, swsh01) 세트 코드 교차 변환
function pokemonSetCodeVariants(code: string): string[] {
  if (!code) return []
  const lower = code.toLowerCase()
  const variants = new Set<string>([lower])

  // sv1 → sv01, sm3pt5 → sm03pt5 (한 자리 숫자에 0 패딩)
  const padded = lower.replace(/^([a-z]+)(\d+)/, (_, prefix, num) => {
    const n = parseInt(num, 10)
    return `${prefix}${n < 10 ? '0' + n : n}`
  })
  variants.add(padded)

  // sv01 → sv1, sm03pt5 → sm3pt5 (0 패딩 제거)
  const unpadded = lower.replace(/^([a-z]+)0(\d)(.*)$/, '$1$2$3')
  variants.add(unpadded)

  return [...variants].filter(Boolean)
}

// 카드 번호 정규화: 양쪽 API의 표기 차이를 흡수해 다양한 변형을 반환
// pokemontcg.io "TG01/TG30" ↔ TCGdex "TG01"
// pokemontcg.io "001" ↔ TCGdex "1"
function normalizeCardNumber(num: string): string[] {
  const n = num.trim()
  const variants = new Set<string>([n])

  // "TG01/TG30" → "TG01" (슬래시 뒤 총 수량 제거)
  const slashIdx = n.indexOf('/')
  if (slashIdx > 0) {
    const base = n.slice(0, slashIdx).trim()
    variants.add(base)
    // base가 순수 숫자이면 패딩 변형도 추가
    if (/^\d+$/.test(base)) {
      const int = parseInt(base, 10)
      variants.add(String(int))
      variants.add(String(int).padStart(2, '0'))
      variants.add(String(int).padStart(3, '0'))
    }
  }

  // 순수 숫자: 패딩 변형
  if (/^\d+$/.test(n)) {
    const int = parseInt(n, 10)
    variants.add(String(int))           // "001" → "1"
    variants.add(String(int).padStart(2, '0'))  // "1" → "01"
    variants.add(String(int).padStart(3, '0'))  // "1" → "001"
  }

  return [...variants].filter(Boolean)
}

// ── TCGdex (포켓몬 EN / KO / JA) ─────────────────────────────────────────────

interface TcgdexSet { id: string; name: string; cardCount?: { total?: number; official?: number }; releaseDate?: string }
interface TcgdexCard { id: string; localId: string; name: string; image?: string; rarity?: string }
interface TcgdexSetDetail extends TcgdexSet { cards: TcgdexCard[] }

export async function getTcgdexSets(req: AuthRequest, res: Response) {
  const lang = (req.query.lang as string) || 'en'
  try {
    const data = await fetchWithRetry<TcgdexSet[]>(
      `https://api.tcgdex.net/v2/${lang}/sets`,
      { cacheTtlMs: SET_CACHE, timeoutMs: 12_000 },
    )
    res.json(data.map(s => ({
      id: s.id,
      name: s.name,
      total: s.cardCount?.official ?? s.cardCount?.total,
      releaseDate: s.releaseDate,
    })))
  } catch (err) {
    console.error('[getTcgdexSets]', err)
    res.status(502).json({ message: `TCGdex(${lang}) 세트 목록을 불러오지 못했습니다.` })
  }
}

export async function importTcgdex(req: AuthRequest, res: Response) {
  const { setId, lang = 'en' } = req.body as { setId?: string; lang?: string }
  if (!setId) { res.status(400).json({ message: 'setId가 필요합니다.' }); return }

  try {
    const data = await fetchWithRetry<TcgdexSetDetail>(
      `https://api.tcgdex.net/v2/${lang}/sets/${setId}`,
      { timeoutMs: 15_000 },
    )

    // EN: 단순 생성 (중복 스킵)
    if (lang === 'en') {
      const records = data.cards.map(c => ({
        externalId: `tcgdex_${lang}_${c.id}`,
        name: c.name,
        tcgType: 'POKEMON' as const,
        setName: data.name,
        setCode: data.id,
        cardNumber: c.localId,
        rarity: c.rarity ?? 'Unknown',
        imageUrl: c.image ? `${c.image}/low.webp` : null,
      }))
      const result = await prisma.card.createMany({ data: records, skipDuplicates: true })
      res.json({ imported: result.count, merged: 0, total: records.length, skipped: records.length - result.count })
      return
    }

    // KO/JA: 기존 EN 카드에 이름 병합 우선
    // pokemontcg.io(sv1)와 TCGdex(sv01)의 세트 코드가 달라 양쪽 형식 모두 검색
    const field = lang === 'ko' ? 'nameKo' : 'nameJa'
    const setCodeVariants = pokemonSetCodeVariants(data.id)

    const existingCards = await prisma.card.findMany({
      where: {
        tcgType: 'POKEMON',
        setCode: { in: setCodeVariants },
        NOT: { OR: LANG_PREFIXES.map(p => ({ externalId: { startsWith: p } })) },
      },
      select: { id: true, cardNumber: true, nameKo: true, nameJa: true },
    })
    const byNumber = new Map(existingCards.map(c => [c.cardNumber, c]))

    let merged = 0, created = 0, skipped = 0
    const toCreate: Prisma.CardCreateManyInput[] = []

    for (const c of data.cards) {
      const existing = byNumber.get(c.localId)
      if (existing) {
        const already = lang === 'ko' ? existing.nameKo : existing.nameJa
        if (!already && c.name) {
          await prisma.card.update({ where: { id: existing.id }, data: { [field]: c.name } })
          merged++
        } else {
          skipped++
        }
      } else {
        toCreate.push({
          externalId: `tcgdex_${lang}_${c.id}`,
          name: c.name,
          nameKo: lang === 'ko' ? c.name : undefined,
          nameJa: lang === 'ja' ? c.name : undefined,
          tcgType: 'POKEMON' as const,
          setName: data.name,
          setCode: data.id,
          cardNumber: c.localId,
          rarity: c.rarity ?? 'Unknown',
          imageUrl: c.image ? `${c.image}/low.webp` : null,
        })
      }
    }

    if (toCreate.length > 0) {
      const result = await prisma.card.createMany({ data: toCreate, skipDuplicates: true })
      created = result.count
    }

    res.json({ imported: created, merged, total: data.cards.length, skipped })
  } catch (err) {
    console.error('[importTcgdex]', err)
    const msg = err instanceof ExternalApiError
      ? `TCGdex API 오류 (${err.status}): ${setId}`
      : `TCGdex(${lang}) 카드 가져오기에 실패했습니다.`
    res.status(502).json({ message: msg })
  }
}

// ── 포켓몬 TCG API (EN 고화질, api.pokemontcg.io) ─────────────────────────────

interface PokemonSet { id: string; name: string; total: number; releaseDate: string }
interface PokemonCard {
  id: string; name: string; number: string; rarity?: string
  set: { id: string; name: string }
  images?: { small?: string; large?: string }
}

export async function getPokemonSets(_req: AuthRequest, res: Response) {
  try {
    const { data } = await fetchWithRetry<{ data: PokemonSet[] }>(
      'https://api.pokemontcg.io/v2/sets?orderBy=-releaseDate&pageSize=250',
      { cacheTtlMs: SET_CACHE, timeoutMs: 12_000 },
    )
    res.json(data.map(s => ({ id: s.id, name: s.name, total: s.total, releaseDate: s.releaseDate })))
  } catch (err) {
    console.error('[getPokemonSets]', err)
    res.status(502).json({ message: '포켓몬 세트 목록을 불러오지 못했습니다.' })
  }
}

export async function importPokemon(req: AuthRequest, res: Response) {
  const { setId } = req.body as { setId?: string }
  if (!setId) { res.status(400).json({ message: 'setId가 필요합니다.' }); return }

  try {
    const all: PokemonCard[] = []
    let page = 1
    while (true) {
      const body = await fetchWithRetry<{ data: PokemonCard[]; totalCount: number }>(
        `https://api.pokemontcg.io/v2/cards?q=set.id:${setId}&pageSize=250&page=${page}`,
        { timeoutMs: 20_000, retries: 3 },
      )
      all.push(...body.data)
      if (all.length >= body.totalCount) break
      page++
    }

    const records = all.map(c => ({
      externalId: `pokemon_${c.id}`,
      name: c.name,
      tcgType: 'POKEMON' as const,
      setName: c.set.name,
      setCode: c.set.id,
      cardNumber: c.number,
      rarity: c.rarity ?? 'Unknown',
      imageUrl: c.images?.small ?? null,
    }))

    const result = await prisma.card.createMany({ data: records, skipDuplicates: true })

    // 같은 세트의 기존 TCGdex KO/JA 레코드에서 이름 복사
    // (TCGdex KO → pokemontcg.io EN 순으로 임포트한 경우 자동 보강)
    const setCodeVars = pokemonSetCodeVariants(setId)
    const langCards = await prisma.card.findMany({
      where: {
        tcgType: 'POKEMON',
        setCode: { in: setCodeVars },
        OR: [
          { externalId: { startsWith: 'tcgdex_ko_' } },
          { externalId: { startsWith: 'tcgdex_ja_' } },
        ],
      },
      select: { cardNumber: true, nameKo: true, nameJa: true, externalId: true },
    })

    let enriched = 0
    if (langCards.length > 0) {
      const koByNum = new Map<string, string>()
      const jaByNum = new Map<string, string>()
      for (const lc of langCards) {
        if (lc.cardNumber && lc.externalId?.startsWith('tcgdex_ko_') && lc.nameKo) koByNum.set(lc.cardNumber, lc.nameKo)
        if (lc.cardNumber && lc.externalId?.startsWith('tcgdex_ja_') && lc.nameJa) jaByNum.set(lc.cardNumber, lc.nameJa)
      }

      const newCards = await prisma.card.findMany({
        where: {
          tcgType: 'POKEMON',
          setCode: setId,
          externalId: { startsWith: 'pokemon_' },
          OR: [{ nameKo: null }, { nameJa: null }],
        },
        select: { id: true, cardNumber: true, nameKo: true, nameJa: true },
      })

      for (const card of newCards) {
        if (!card.cardNumber) continue
        const nameKo = !card.nameKo ? koByNum.get(card.cardNumber) : undefined
        const nameJa = !card.nameJa ? jaByNum.get(card.cardNumber) : undefined
        if (nameKo || nameJa) {
          await prisma.card.update({
            where: { id: card.id },
            data: { ...(nameKo ? { nameKo } : {}), ...(nameJa ? { nameJa } : {}) },
          })
          enriched++
        }
      }
    }

    res.json({
      imported: result.count,
      merged: 0,
      enriched,
      total: records.length,
      skipped: records.length - result.count,
    })
  } catch (err) {
    console.error('[importPokemon]', err)
    const msg = err instanceof ExternalApiError
      ? `PokemonTCG API 오류 (${err.status}): ${setId}`
      : '포켓몬 카드 가져오기에 실패했습니다.'
    res.status(502).json({ message: msg })
  }
}

// ── 포켓몬 이름 보강 (KO / JA) — SSE 스트리밍 ───────────────────────────────
// 개선 내역:
//   1) SSE 스트리밍으로 HTTP 타임아웃 방지 + 실시간 진행 상황 전달
//   2) normalizeCardNumber()로 "TG01/TG30"↔"TG01", "001"↔"1" 불일치 해소
//   3) 전략 1: TCGdex API (세트 코드 변형 순서대로 시도)
//   4) 전략 2: 우리 DB의 기존 tcgdex_{lang}_* 레코드에서 이름 보충
//   5) 세트당 배치 업데이트 (prisma.$transaction, 청크 100건)
//   6) TCGdex 미지원 세트와 매칭 실패를 별도 카운터로 분리

async function enrichPokemonNames(lang: 'ko' | 'ja', req: AuthRequest, res: Response) {
  const field = lang === 'ko' ? 'nameKo' : 'nameJa'

  // SSE 헤더 설정
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  let closed = false
  req.on('close', () => { closed = true })

  const send = (data: Record<string, unknown>) => {
    if (!closed && !res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  const heartbeat = setInterval(() => {
    if (!closed && !res.writableEnded) res.write(': heartbeat\n\n')
  }, 15_000)

  try {
    // 이름 없는 기본(EN) 포켓몬 카드 전체 조회 (언어 전용 레코드 제외)
    const cards = await prisma.card.findMany({
      where: {
        tcgType: 'POKEMON',
        setCode:    { not: null },
        cardNumber: { not: null },
        [field]: null,
        NOT: { OR: LANG_PREFIXES.map(p => ({ externalId: { startsWith: p } })) },
      },
      select: { id: true, setCode: true, cardNumber: true },
    })

    if (cards.length === 0) {
      send({ type: 'done', updated: 0, failed: 0, notInTcgdex: 0, total: 0, message: '보강할 카드가 없습니다.' })
      return
    }

    // 세트별 그룹화
    const bySet = new Map<string, Array<{ id: string; cardNumber: string }>>()
    for (const card of cards) {
      if (!card.setCode || !card.cardNumber) continue
      const arr = bySet.get(card.setCode) ?? []
      arr.push({ id: card.id, cardNumber: card.cardNumber })
      bySet.set(card.setCode, arr)
    }

    send({ type: 'start', total: cards.length, sets: bySet.size })

    let totalUpdated = 0, totalFailed = 0, totalNotInTcgdex = 0

    for (const [setCode, setCards] of bySet) {
      if (closed) break

      const codeVariants = pokemonSetCodeVariants(setCode)

      // ── 전략 1: TCGdex API ──────────────────────────────────────────────
      let tcgdexCards: TcgdexCard[] | null = null
      for (const code of codeVariants) {
        if (closed) break
        try {
          const data = await fetchWithRetry<TcgdexSetDetail>(
            `https://api.tcgdex.net/v2/${lang}/sets/${code}`,
            { timeoutMs: 10_000, retries: 1, cacheTtlMs: SET_CACHE },
          )
          if (Array.isArray(data.cards) && data.cards.length > 0) {
            tcgdexCards = data.cards
            break
          }
        } catch { /* 다음 변형 */ }
      }

      if (tcgdexCards) {
        // 정규화된 카드번호 맵 구성
        const byNum = new Map<string, string>() // normalizedNum → name
        for (const c of tcgdexCards) {
          if (!c.name) continue
          for (const v of normalizeCardNumber(c.localId)) {
            byNum.set(v.toLowerCase(), c.name)
          }
        }

        const toUpdate: Array<{ id: string; name: string }> = []
        let setFailed = 0

        for (const card of setCards) {
          const name = normalizeCardNumber(card.cardNumber)
            .reduce((found: string | undefined, v) => found ?? byNum.get(v.toLowerCase()), undefined)
          if (name) {
            toUpdate.push({ id: card.id, name })
          } else {
            setFailed++
          }
        }

        // 청크 단위 배치 업데이트
        const CHUNK = 100
        for (let i = 0; i < toUpdate.length; i += CHUNK) {
          const chunk = toUpdate.slice(i, i + CHUNK)
          await prisma.$transaction(
            chunk.map(u => prisma.card.update({ where: { id: u.id }, data: { [field]: u.name } }))
          )
        }

        totalUpdated  += toUpdate.length
        totalFailed   += setFailed
        send({
          type: 'set-done', strategy: 'tcgdex', setCode,
          updated: toUpdate.length, failed: setFailed,
        })
        await sleep(120)
        continue
      }

      // ── 전략 2: 우리 DB의 기존 언어 레코드에서 이름 보충 ───────────────
      const langPrefix = `tcgdex_${lang}_`
      const dbLangCards = await prisma.card.findMany({
        where: {
          tcgType: 'POKEMON',
          externalId: { startsWith: langPrefix },
          setCode: { in: codeVariants },
          nameKo: lang === 'ko' ? { not: null } : undefined,
          nameJa: lang === 'ja' ? { not: null } : undefined,
        },
        select: { cardNumber: true, nameKo: true, nameJa: true },
      })

      if (dbLangCards.length > 0) {
        const byNum = new Map<string, string>()
        for (const c of dbLangCards) {
          const name = lang === 'ko' ? c.nameKo : c.nameJa
          if (!name || !c.cardNumber) continue
          for (const v of normalizeCardNumber(c.cardNumber)) {
            byNum.set(v.toLowerCase(), name)
          }
        }

        const toUpdate: Array<{ id: string; name: string }> = []
        let setFailed = 0

        for (const card of setCards) {
          const name = normalizeCardNumber(card.cardNumber)
            .reduce((found: string | undefined, v) => found ?? byNum.get(v.toLowerCase()), undefined)
          if (name) {
            toUpdate.push({ id: card.id, name })
          } else {
            setFailed++
          }
        }

        const CHUNK = 100
        for (let i = 0; i < toUpdate.length; i += CHUNK) {
          const chunk = toUpdate.slice(i, i + CHUNK)
          await prisma.$transaction(
            chunk.map(u => prisma.card.update({ where: { id: u.id }, data: { [field]: u.name } }))
          )
        }

        totalUpdated  += toUpdate.length
        totalFailed   += setFailed
        send({
          type: 'set-done', strategy: 'db', setCode,
          updated: toUpdate.length, failed: setFailed,
        })
        await sleep(50)
        continue
      }

      // ── 두 전략 모두 실패: TCGdex 미지원 세트 ──────────────────────────
      totalNotInTcgdex += setCards.length
      send({ type: 'set-skip', setCode, count: setCards.length })
      await sleep(50)
    }

    send({ type: 'done', updated: totalUpdated, failed: totalFailed, notInTcgdex: totalNotInTcgdex, total: cards.length })
  } catch (err) {
    console.error('[enrichPokemonNames]', err)
    send({ type: 'error', message: String(err) })
  } finally {
    clearInterval(heartbeat)
    res.end()
  }
}

export async function enrichPokemonKoNames(req: AuthRequest, res: Response) { await enrichPokemonNames('ko', req, res) }
export async function enrichPokemonJaNames(req: AuthRequest, res: Response) { await enrichPokemonNames('ja', req, res) }

// ── 유희왕 YGOProDeck ─────────────────────────────────────────────────────────

interface YgoSetInfo { set_name: string; set_code: string; set_rarity: string }
interface YgoCard {
  id: number; name: string
  card_sets?: YgoSetInfo[]
  card_images?: Array<{ image_url_small: string }>
}

export async function getYugiohSets(_req: AuthRequest, res: Response) {
  try {
    const data = await fetchWithRetry<Array<{ set_name: string; set_code: string; num_of_cards: number; tcg_date: string }>>(
      'https://db.ygoprodeck.com/api/v7/cardsets.php',
      { cacheTtlMs: SET_CACHE, timeoutMs: 15_000 },
    )
    res.json(
      data
        .filter(s => s.tcg_date)
        .sort((a, b) => b.tcg_date.localeCompare(a.tcg_date))
        .map(s => ({ id: s.set_name, name: s.set_name, code: s.set_code, total: s.num_of_cards, releaseDate: s.tcg_date }))
    )
  } catch (err) {
    console.error('[getYugiohSets]', err)
    res.status(502).json({ message: '유희왕 세트 목록을 불러오지 못했습니다.' })
  }
}

export async function importYugioh(req: AuthRequest, res: Response) {
  const { setName } = req.body as { setName?: string }
  if (!setName) { res.status(400).json({ message: 'setName이 필요합니다.' }); return }

  try {
    const { data } = await fetchWithRetry<{ data: YgoCard[] }>(
      `https://db.ygoprodeck.com/api/v7/cardinfo.php?cardset=${encodeURIComponent(setName)}`,
      { timeoutMs: 20_000, retries: 2 },
    )
    const records = data.map(c => {
      const setInfo = c.card_sets?.find(s => s.set_name === setName) ?? c.card_sets?.[0]
      return {
        externalId: `yugioh_${c.id}_${setInfo?.set_code ?? 'unknown'}`,
        name: c.name,
        tcgType: 'YUGIOH' as const,
        setName,
        setCode: setInfo?.set_code?.replace(/-.*/, '') ?? null,
        cardNumber: setInfo?.set_code ?? null,
        rarity: setInfo?.set_rarity ?? 'Unknown',
        imageUrl: c.card_images?.[0]?.image_url_small ?? null,
      }
    })
    const result = await prisma.card.createMany({ data: records, skipDuplicates: true })
    res.json({ imported: result.count, merged: 0, total: records.length, skipped: records.length - result.count })
  } catch (err) {
    console.error('[importYugioh]', err)
    const msg = err instanceof ExternalApiError
      ? `YGOProDeck API 오류 (${err.status}): ${setName}`
      : '유희왕 카드 가져오기에 실패했습니다.'
    res.status(502).json({ message: msg })
  }
}

// ── MTG Scryfall (EN / KO / JA) ──────────────────────────────────────────────

interface ScryfallCard {
  id: string; name: string; printed_name?: string
  set: string; set_name: string; printed_set_name?: string
  collector_number: string; rarity: string; oracle_text?: string
  image_uris?: { normal?: string }
  card_faces?: Array<{ image_uris?: { normal?: string } }>
}

export async function getMtgSets(_req: AuthRequest, res: Response) {
  try {
    const { data } = await fetchWithRetry<{ data: Array<{ code: string; name: string; card_count: number; released_at: string; set_type: string }> }>(
      'https://api.scryfall.com/sets',
      { headers: SCRYFALL_HEADERS, cacheTtlMs: SET_CACHE, timeoutMs: 12_000 },
    )
    const INCLUDE = ['core', 'expansion', 'masters', 'draft_innovation', 'commander', 'starter', 'funny']
    res.json(
      data
        .filter(s => INCLUDE.includes(s.set_type) && s.released_at)
        .sort((a, b) => b.released_at.localeCompare(a.released_at))
        .map(s => ({ id: s.code, name: s.name, total: s.card_count, releaseDate: s.released_at }))
    )
  } catch (err) {
    console.error('[getMtgSets]', err)
    res.status(502).json({ message: 'MTG 세트 목록을 불러오지 못했습니다.' })
  }
}

export async function importMtg(req: AuthRequest, res: Response) {
  const { setCode, lang = 'en' } = req.body as { setCode?: string; lang?: string }
  if (!setCode) { res.status(400).json({ message: 'setCode가 필요합니다.' }); return }

  try {
    const langFilter = lang !== 'en' ? `+lang:${lang}` : ''
    const all: ScryfallCard[] = []
    let next: string | null = `https://api.scryfall.com/cards/search?q=set:${setCode}${langFilter}&unique=cards&order=set`

    while (next) {
      let body: { data: ScryfallCard[]; has_more: boolean; next_page?: string }
      try {
        body = await fetchWithRetry<typeof body>(next, {
          headers: SCRYFALL_HEADERS,
          timeoutMs: 15_000,
          retries: 2,
        })
      } catch (e) {
        if (e instanceof ExternalApiError && e.status === 404) break
        throw e
      }
      all.push(...body.data)
      next = body.has_more ? (body.next_page ?? null) : null
      if (next) await sleep(120)
    }

    if (all.length === 0) {
      res.json({ imported: 0, merged: 0, total: 0, skipped: 0, message: `${setCode} 세트에 ${lang.toUpperCase()} 카드가 없습니다.` })
      return
    }

    if (lang === 'en') {
      const records = all.map(c => ({
        externalId: `mtg_${c.id}`,
        name: c.name,
        tcgType: 'MTG' as const,
        setName: c.set_name,
        setCode: c.set.toUpperCase(),
        cardNumber: c.collector_number,
        rarity: c.rarity,
        imageUrl: c.image_uris?.normal ?? c.card_faces?.[0]?.image_uris?.normal ?? null,
        description: c.oracle_text ?? null,
      }))
      const result = await prisma.card.createMany({ data: records, skipDuplicates: true })
      res.json({ imported: result.count, merged: 0, total: records.length, skipped: records.length - result.count })
      return
    }

    const field = lang === 'ko' ? 'nameKo' : 'nameJa'
    const setCodeUpper = setCode.toUpperCase()

    const existingCards = await prisma.card.findMany({
      where: {
        tcgType: 'MTG',
        setCode: setCodeUpper,
        NOT: { OR: LANG_PREFIXES.map(p => ({ externalId: { startsWith: p } })) },
      },
      select: { id: true, cardNumber: true, nameKo: true, nameJa: true },
    })
    const byNumber = new Map(existingCards.map(c => [c.cardNumber, c]))

    let merged = 0, created = 0, skipped = 0
    const toCreate: Prisma.CardCreateManyInput[] = []

    for (const c of all) {
      const existing = byNumber.get(c.collector_number)
      const langName = c.printed_name ?? null

      if (existing) {
        const already = lang === 'ko' ? existing.nameKo : existing.nameJa
        if (!already && langName) {
          await prisma.card.update({ where: { id: existing.id }, data: { [field]: langName } })
          merged++
        } else {
          skipped++
        }
      } else {
        toCreate.push({
          externalId: `mtg_${lang}_${c.id}`,
          name: c.name,
          nameKo: lang === 'ko' ? langName : undefined,
          nameJa: lang === 'ja' ? langName : undefined,
          tcgType: 'MTG' as const,
          setName: c.printed_set_name ?? c.set_name,
          setCode: setCodeUpper,
          cardNumber: c.collector_number,
          rarity: c.rarity,
          imageUrl: c.image_uris?.normal ?? c.card_faces?.[0]?.image_uris?.normal ?? null,
          description: c.oracle_text ?? null,
        })
      }
    }

    if (toCreate.length > 0) {
      const result = await prisma.card.createMany({ data: toCreate, skipDuplicates: true })
      created = result.count
    }

    res.json({ imported: created, merged, total: all.length, skipped })
  } catch (err) {
    console.error('[importMtg]', err)
    const msg = err instanceof ExternalApiError
      ? `Scryfall API 오류 (${err.status}): ${setCode}`
      : 'MTG 카드 가져오기에 실패했습니다.'
    res.status(502).json({ message: msg })
  }
}

// ── 디지몬 (digimoncard.io) ───────────────────────────────────────────────────

interface DigimonIoCard {
  id: string; name: string; rarity?: string; type?: string
  set_name?: string[]
}

export async function importDigimon(_req: AuthRequest, res: Response) {
  // digimoncard.io는 페이지네이션 파라미터를 무시하고 전체 카드를 한번에 반환함
  try {
    const all = await fetchWithRetry<DigimonIoCard[]>(
      'https://digimoncard.io/api-public/search.php?series=Digimon+Card+Game',
      { timeoutMs: 30_000, retries: 2 },
    )

    const records = all.map(c => ({
      externalId: `digimon_${c.id}`,
      name: c.name,
      tcgType: 'DIGIMON' as const,
      setName: c.set_name?.[0] ?? 'Unknown',
      setCode: c.id.replace(/-\d+$/, ''),
      cardNumber: c.id,
      rarity: c.rarity ?? 'Unknown',
      imageUrl: null,
    }))

    const unique = [...new Map(records.map(r => [r.externalId, r])).values()]
    const result = await prisma.card.createMany({ data: unique, skipDuplicates: true })
    res.json({ imported: result.count, merged: 0, total: unique.length, skipped: unique.length - result.count })
  } catch (err) {
    console.error('[importDigimon]', err)
    res.status(502).json({ message: '디지몬 카드 가져오기에 실패했습니다.' })
  }
}

// ── 유희왕 전체 카드 bulk import (YGOProDeck 페이지네이션) ───────────────────

interface YgoMeta { total_rows: number; next_page_offset?: number }
interface YgoBulkResponse { data: YgoCard[]; meta: YgoMeta }

export async function importYugiohAll(_req: AuthRequest, res: Response) {
  const PAGE = 500
  let offset = 0
  let totalRows = 0
  let imported = 0
  let skipped = 0

  try {
    while (true) {
      const url = `https://db.ygoprodeck.com/api/v7/cardinfo.php?num=${PAGE}&offset=${offset}`
      const body = await fetchWithRetry<YgoBulkResponse>(url, { timeoutMs: 30_000, retries: 3 })

      totalRows = body.meta.total_rows

      const records = body.data.flatMap(c => {
        const seen = new Set<string>()
        return (c.card_sets ?? []).filter(s => {
          const key = `yugioh_${c.id}_${s.set_code}`
          if (seen.has(key)) return false
          seen.add(key)
          return true
        }).map(s => ({
          externalId: `yugioh_${c.id}_${s.set_code}`,
          name: c.name,
          tcgType: 'YUGIOH' as const,
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
      if (offset >= totalRows || body.data.length < PAGE) break
      await sleep(300)
    }

    res.json({ imported, merged: 0, total: totalRows, skipped })
  } catch (err) {
    console.error('[importYugiohAll]', err)
    res.status(502).json({ message: '유희왕 전체 카드 가져오기에 실패했습니다.' })
  }
}

// ── 원피스 카드 게임 (Official Bandai Site) ───────────────────────────────────

const OP_SITE = 'https://en.onepiece-cardgame.com'

// 알려진 세트 목록 (세트가 추가될 때 여기에 추가)
export const OP_KNOWN_SETS = [
  // 부스터 팩
  { id: 'OP-01', name: 'Romance Dawn',                            total: 121, releaseDate: '2022-12-02' },
  { id: 'OP-02', name: 'Paramount War',                           total: 121, releaseDate: '2023-03-10' },
  { id: 'OP-03', name: 'Pillars of Strength',                     total: 121, releaseDate: '2023-06-30' },
  { id: 'OP-04', name: 'Kingdoms of Intrigue',                    total: 122, releaseDate: '2023-09-22' },
  { id: 'OP-05', name: 'Awakening of the New Era',                total: 120, releaseDate: '2023-12-08' },
  { id: 'OP-06', name: 'Wings of the Captain',                    total: 120, releaseDate: '2024-03-08' },
  { id: 'OP-07', name: 'Five Hundred Years in the Future',        total: 119, releaseDate: '2024-06-28' },
  { id: 'OP-08', name: 'Two Legends',                             total: 120, releaseDate: '2024-10-25' },
  { id: 'OP-09', name: 'Emperors in the New World',               total: 100, releaseDate: '2025-01-24' },
  { id: 'OP-10', name: 'Royal Blood',                             total: 100, releaseDate: '2025-04-25' },
  // 이벤트 / 기념 부스터
  { id: 'EB-01', name: 'Memorial Collection',                     total: 61,  releaseDate: '2024-08-08' },
  { id: 'EB-02', name: 'Memorial Collection Vol.2',               total: 55,  releaseDate: '2025-04-25' },
  // 스타터 덱
  { id: 'ST-01', name: 'Straw Hat Crew',                          total: 17,  releaseDate: '2022-12-02' },
  { id: 'ST-02', name: 'Worst Generation',                        total: 17,  releaseDate: '2022-12-02' },
  { id: 'ST-03', name: 'The Seven Warlords of the Sea',           total: 17,  releaseDate: '2022-12-02' },
  { id: 'ST-04', name: 'Animal Kingdom Pirates',                  total: 17,  releaseDate: '2023-03-10' },
  { id: 'ST-05', name: 'FILM Edition',                            total: 18,  releaseDate: '2023-03-10' },
  { id: 'ST-06', name: 'Absolute Justice',                        total: 18,  releaseDate: '2023-06-30' },
  { id: 'ST-07', name: 'Big Mom Pirates',                         total: 17,  releaseDate: '2023-06-30' },
  { id: 'ST-08', name: 'Monkey D. Luffy',                         total: 17,  releaseDate: '2023-09-22' },
  { id: 'ST-09', name: 'Yamato',                                  total: 17,  releaseDate: '2023-09-22' },
  { id: 'ST-10', name: 'Bond Episode: Zoro & Sanji',              total: 43,  releaseDate: '2023-09-22' },
  { id: 'ST-11', name: 'Uta',                                     total: 17,  releaseDate: '2023-09-22' },
  { id: 'ST-12', name: 'Zoro and Sanji',                          total: 42,  releaseDate: '2023-12-08' },
  { id: 'ST-13', name: 'The Three Captains',                      total: 42,  releaseDate: '2024-03-08' },
  { id: 'ST-14', name: 'Big Secret Treasure of the Seven Seas!',  total: 43,  releaseDate: '2024-06-28' },
  { id: 'ST-15', name: 'Red Purple Luffy',                        total: 43,  releaseDate: '2024-10-25' },
  { id: 'ST-16', name: 'Green Yellow Charlotte Linlin',           total: 43,  releaseDate: '2024-10-25' },
  { id: 'ST-17', name: 'Black Yellow Nico Robin',                 total: 43,  releaseDate: '2024-10-25' },
  { id: 'ST-18', name: 'Purple Blue Monkey D. Garp',              total: 43,  releaseDate: '2025-01-24' },
  { id: 'ST-19', name: 'Blue Black Monkey D. Luffy',              total: 43,  releaseDate: '2025-01-24' },
  { id: 'ST-20', name: 'Red Blue Sabo',                           total: 43,  releaseDate: '2025-04-25' },
]

interface ParsedOpCard { number: string; name: string; rarity: string; imageUrl: string | null }

// 공식 사이트 HTML에서 카드 파싱 (여러 HTML 구조 대응)
function parseOpHtml(html: string): ParsedOpCard[] {
  const cards: ParsedOpCard[] = []
  const seen = new Set<string>()

  // 이미지 경로에서 카드 번호 추출: /images/card/OP01-001.png
  const imgRe = /\/images\/card\/([A-Z0-9-]+(?:_p\d+)?)\.(?:png|jpg|webp)/gi
  let m: RegExpExecArray | null
  while ((m = imgRe.exec(html)) !== null) {
    const num = m[1].toUpperCase()
    if (!seen.has(num)) seen.add(num)
  }

  for (const num of seen) {
    const esc = num.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

    // 카드 이름: 카드번호 주변 500자 이내에서 name 클래스 탐색
    const nameRe = new RegExp(`${esc}[\\s\\S]{0,600}<p[^>]*class="[^"]*name[^"]*"[^>]*>\\s*([^<]+)\\s*<\\/p>`, 'i')
    // 희귀도
    const rarityRe = new RegExp(`${esc}[\\s\\S]{0,400}<p[^>]*class="[^"]*rarity[^"]*"[^>]*>\\s*([^<]+)\\s*<\\/p>`, 'i')

    const nameMt = nameRe.exec(html)
    const rarityMt = rarityRe.exec(html)

    cards.push({
      number: num,
      name:   nameMt   ? nameMt[1].trim()   : num,
      rarity: rarityMt ? rarityMt[1].trim() : 'Unknown',
      imageUrl: `${OP_SITE}/images/card/${num}.png`,
    })
  }

  return cards
}

// 공식 사이트로부터 특정 세트 카드 데이터 취득
async function fetchOpCardsFromSite(setId: string): Promise<ParsedOpCard[]> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 20_000)

  try {
    const body = new URLSearchParams({ 'series[]': setId })
    const res = await fetch(`${OP_SITE}/cardlist/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent':   'Mozilla/5.0 (compatible; RocketAuctionHouse/1.0)',
        'Accept':       'text/html,application/xhtml+xml,*/*',
        'Referer':      `${OP_SITE}/cardlist/`,
      },
      body: body.toString(),
      signal: ctrl.signal,
    })
    clearTimeout(timer)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return parseOpHtml(await res.text())
  } catch {
    clearTimeout(timer)
    throw new Error(`원피스 공식 사이트 취득 실패: ${setId}`)
  }
}

// 세트 정보에서 카드 번호를 생성해 기본 레코드 구성 (파싱 실패 대비 폴백)
function generateOpFallbackCards(setId: string, total: number): ParsedOpCard[] {
  // OP-01 → OP01, ST-01 → ST01, EB-01 → EB01
  const prefix = setId.replace('-', '')
  const cards: ParsedOpCard[] = []
  for (let i = 1; i <= total; i++) {
    const num = `${prefix}-${String(i).padStart(3, '0')}`
    cards.push({ number: num, name: num, rarity: 'Unknown', imageUrl: `${OP_SITE}/images/card/${num}.png` })
  }
  return cards
}

export async function getOnePieceSets(_req: AuthRequest, res: Response) {
  res.json(OP_KNOWN_SETS)
}

export async function importOnePiece(req: AuthRequest, res: Response) {
  const { setId } = req.body as { setId?: string }
  if (!setId) { res.status(400).json({ message: 'setId가 필요합니다.' }); return }

  const setInfo = OP_KNOWN_SETS.find(s => s.id === setId)
  if (!setInfo) { res.status(404).json({ message: '알려지지 않은 원피스 TCG 세트입니다.' }); return }

  try {
    let cards: ParsedOpCard[]
    let usedFallback = false

    try {
      cards = await fetchOpCardsFromSite(setId)
      if (cards.length === 0) throw new Error('파싱 결과 0건')
    } catch {
      // 공식 사이트 파싱 실패 → 카드 번호 기반 폴백 레코드 생성
      cards = generateOpFallbackCards(setId, setInfo.total)
      usedFallback = true
    }

    const records = cards.map(c => ({
      externalId: `onepiece_${c.number}`,
      name:       c.name,
      tcgType:    'ONEPIECE' as const,
      setName:    setInfo.name,
      setCode:    setId,
      cardNumber: c.number,
      rarity:     c.rarity,
      imageUrl:   c.imageUrl,
    }))

    const result = await prisma.card.createMany({ data: records, skipDuplicates: true })
    res.json({
      imported: result.count,
      total:    records.length,
      skipped:  records.length - result.count,
      fallback: usedFallback,
      message:  usedFallback ? '공식 사이트 파싱 실패 — 카드 번호 기반 기본 레코드 생성' : undefined,
    })
  } catch (err) {
    console.error('[importOnePiece]', err)
    res.status(502).json({ message: '원피스 카드 가져오기에 실패했습니다.' })
  }
}

// ── 전체 일괄 가져오기 (SSE 스트리밍) ───────────────────────────────────────
// SSE 형식: data: <JSON>\n\n

export async function importAll(req: AuthRequest, res: Response) {
  const {
    types = ['POKEMON', 'YUGIOH', 'MTG', 'DIGIMON', 'ONEPIECE'],
    pokemonSrc = 'both',  // 'hq' | 'ko' | 'ja' | 'both' | 'all'
    mtgMaxSets = 50,
    recentMonths = 36,    // 포켓몬/MTG 최근 N개월 (0=전체)
  } = req.body as {
    types?: string[]
    pokemonSrc?: string
    mtgMaxSets?: number
    recentMonths?: number
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  let closed = false
  req.on('close', () => { closed = true })

  type EventData = Record<string, unknown>
  const send = (data: EventData) => {
    if (!closed) res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  const heartbeat = setInterval(() => {
    if (!closed) res.write(': heartbeat\n\n')
  }, 15000)

  const totals: Record<string, { imported: number; merged: number; skipped: number; errors: number }> = {}
  const initTcg = (tcg: string) => { totals[tcg] = { imported: 0, merged: 0, skipped: 0, errors: 0 } }

  try {
    const cutoff = recentMonths > 0 ? new Date(Date.now() - recentMonths * 30 * 86400 * 1000) : null

    // ── 포켓몬 ────────────────────────────────────────────────────────────────
    if (types.includes('POKEMON') && !closed) {
      initTcg('POKEMON')
      send({ type: 'tcg-start', tcg: 'POKEMON' })

      if ((pokemonSrc === 'hq' || pokemonSrc === 'both') && !closed) {
        send({ type: 'info', tcg: 'POKEMON', message: 'pokemontcg.io 세트 목록 조회 중...' })
        try {
          const { data: sets } = await fetchWithRetry<{ data: PokemonSet[] }>(
            'https://api.pokemontcg.io/v2/sets?orderBy=-releaseDate&pageSize=250',
            { cacheTtlMs: SET_CACHE, timeoutMs: 15_000 },
          )
          const targetSets = cutoff ? sets.filter(s => new Date(s.releaseDate) >= cutoff) : sets
          send({ type: 'info', tcg: 'POKEMON', message: `HQ EN: ${targetSets.length}개 세트` })

          for (const set of targetSets) {
            if (closed) break
            try {
              send({ type: 'set-start', tcg: 'POKEMON', setId: set.id, setName: set.name })
              const all: PokemonCard[] = []
              let pg = 1
              while (!closed) {
                const body = await fetchWithRetry<{ data: PokemonCard[]; totalCount: number }>(
                  `https://api.pokemontcg.io/v2/cards?q=set.id:${set.id}&pageSize=250&page=${pg}`,
                  { timeoutMs: 20_000, retries: 2 },
                )
                all.push(...body.data)
                if (all.length >= body.totalCount) break
                pg++
              }
              const records = all.map(c => ({
                externalId: `pokemon_${c.id}`, name: c.name, tcgType: 'POKEMON' as const,
                setName: c.set.name, setCode: c.set.id, cardNumber: c.number,
                rarity: c.rarity ?? 'Unknown', imageUrl: c.images?.small ?? null,
              }))
              const result = await prisma.card.createMany({ data: records, skipDuplicates: true })
              totals['POKEMON'].imported += result.count
              totals['POKEMON'].skipped += records.length - result.count
              send({ type: 'set-done', tcg: 'POKEMON', setId: set.id, setName: set.name, imported: result.count, total: records.length })
            } catch {
              totals['POKEMON'].errors++
              send({ type: 'set-error', tcg: 'POKEMON', setId: set.id, setName: set.name })
            }
          }
        } catch (err) {
          send({ type: 'error', tcg: 'POKEMON', message: `pokemontcg.io 오류: ${String(err)}` })
        }
      }

      if ((pokemonSrc === 'ko' || pokemonSrc === 'both' || pokemonSrc === 'all') && !closed) {
        send({ type: 'info', tcg: 'POKEMON', message: 'TCGdex KO 한국어 이름 병합 중...' })
        try {
          const koSets = await fetchWithRetry<TcgdexSet[]>(
            'https://api.tcgdex.net/v2/ko/sets',
            { cacheTtlMs: SET_CACHE, timeoutMs: 12_000 },
          )

          for (const set of koSets) {
            if (closed) break
            try {
              const data = await fetchWithRetry<TcgdexSetDetail>(
                `https://api.tcgdex.net/v2/ko/sets/${set.id}`,
                { timeoutMs: 10_000, retries: 1 },
              )
              const vars = pokemonSetCodeVariants(data.id)
              const existing = await prisma.card.findMany({
                where: { tcgType: 'POKEMON', setCode: { in: vars }, nameKo: null,
                  NOT: { OR: LANG_PREFIXES.map(p => ({ externalId: { startsWith: p } })) } },
                select: { id: true, cardNumber: true },
              })
              const byNum = new Map(existing.map(c => [c.cardNumber, c]))
              for (const c of data.cards) {
                const ex = byNum.get(c.localId)
                if (ex && c.name) {
                  await prisma.card.update({ where: { id: ex.id }, data: { nameKo: c.name } })
                  totals['POKEMON'].merged++
                }
              }
              send({ type: 'set-done', tcg: 'POKEMON-KO', setId: set.id, setName: set.name, merged: totals['POKEMON'].merged })
              await sleep(100)
            } catch { /* 이 세트 스킵 */ }
          }
        } catch (err) {
          send({ type: 'error', tcg: 'POKEMON', message: `TCGdex KO 오류: ${String(err)}` })
        }
      }

      // ── 포켓몬 JA ────────────────────────────────────────────────────────────
      if ((pokemonSrc === 'ja' || pokemonSrc === 'all') && !closed) {
        send({ type: 'info', tcg: 'POKEMON', message: 'TCGdex JA 일본어 이름 병합 중...' })
        try {
          const jaSets = await fetchWithRetry<TcgdexSet[]>(
            'https://api.tcgdex.net/v2/ja/sets',
            { cacheTtlMs: SET_CACHE, timeoutMs: 12_000 },
          )

          for (const set of jaSets) {
            if (closed) break
            try {
              const data = await fetchWithRetry<TcgdexSetDetail>(
                `https://api.tcgdex.net/v2/ja/sets/${set.id}`,
                { timeoutMs: 10_000, retries: 1 },
              )
              const vars = pokemonSetCodeVariants(data.id)
              const existing = await prisma.card.findMany({
                where: { tcgType: 'POKEMON', setCode: { in: vars }, nameJa: null,
                  NOT: { OR: LANG_PREFIXES.map(p => ({ externalId: { startsWith: p } })) } },
                select: { id: true, cardNumber: true },
              })
              const byNum = new Map(existing.map(c => [c.cardNumber, c]))
              let setMerged = 0
              for (const c of data.cards) {
                const ex = byNum.get(c.localId)
                if (ex && c.name) {
                  await prisma.card.update({ where: { id: ex.id }, data: { nameJa: c.name } })
                  totals['POKEMON'].merged++
                  setMerged++
                }
              }
              send({ type: 'set-done', tcg: 'POKEMON-JA', setId: set.id, setName: set.name, merged: setMerged })
              await sleep(100)
            } catch { /* 이 세트 스킵 */ }
          }
        } catch (err) {
          send({ type: 'error', tcg: 'POKEMON', message: `TCGdex JA 오류: ${String(err)}` })
        }
      }

      send({ type: 'tcg-done', tcg: 'POKEMON', ...totals['POKEMON'] })
    }

    // ── 유희왕 ────────────────────────────────────────────────────────────────
    if (types.includes('YUGIOH') && !closed) {
      initTcg('YUGIOH')
      send({ type: 'tcg-start', tcg: 'YUGIOH', message: '유희왕 전체 카드 가져오기 중...' })
      const PAGE = 500
      let offset = 0
      let totalRows = 0

      while (!closed) {
        try {
          const body = await fetchWithRetry<YgoBulkResponse>(
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
            totals['YUGIOH'].imported += result.count
            totals['YUGIOH'].skipped += unique.length - result.count
          }

          offset += body.data.length
          send({ type: 'progress', tcg: 'YUGIOH', offset, total: totalRows, imported: totals['YUGIOH'].imported })
          if (offset >= totalRows || body.data.length < PAGE) break
          await sleep(300)
        } catch (err) {
          totals['YUGIOH'].errors++
          send({ type: 'error', tcg: 'YUGIOH', message: String(err) })
          break
        }
      }

      send({ type: 'tcg-done', tcg: 'YUGIOH', ...totals['YUGIOH'], total: totalRows })
    }

    // ── MTG ──────────────────────────────────────────────────────────────────
    if (types.includes('MTG') && !closed) {
      initTcg('MTG')
      send({ type: 'tcg-start', tcg: 'MTG', message: 'Scryfall 세트 목록 조회 중...' })
      try {
        const { data: sets } = await fetchWithRetry<{ data: Array<{ code: string; name: string; set_type: string; released_at: string; card_count: number }> }>(
          'https://api.scryfall.com/sets',
          { headers: SCRYFALL_HEADERS, cacheTtlMs: SET_CACHE, timeoutMs: 12_000 },
        )
        const INCLUDE = ['core', 'expansion', 'masters', 'draft_innovation', 'commander', 'starter']
        const targetSets = sets
          .filter(s => INCLUDE.includes(s.set_type) && s.released_at && s.card_count > 0)
          .sort((a, b) => b.released_at.localeCompare(a.released_at))
          .slice(0, mtgMaxSets)
        send({ type: 'info', tcg: 'MTG', message: `${targetSets.length}개 세트 가져오기 시작` })

        for (const set of targetSets) {
          if (closed) break
          try {
            send({ type: 'set-start', tcg: 'MTG', setId: set.code, setName: set.name })
            const all: ScryfallCard[] = []
            let next: string | null = `https://api.scryfall.com/cards/search?q=set:${set.code}&unique=cards&order=set`
            while (next && !closed) {
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
              totals['MTG'].imported += result.count
              totals['MTG'].skipped += records.length - result.count
              send({ type: 'set-done', tcg: 'MTG', setId: set.code, setName: set.name, imported: result.count, total: records.length })
            }
          } catch {
            totals['MTG'].errors++
            send({ type: 'set-error', tcg: 'MTG', setId: set.code, setName: set.name })
          }
        }
      } catch (err) {
        send({ type: 'error', tcg: 'MTG', message: String(err) })
      }
      send({ type: 'tcg-done', tcg: 'MTG', ...totals['MTG'] })
    }

    // ── 디지몬 ───────────────────────────────────────────────────────────────
    if (types.includes('DIGIMON') && !closed) {
      initTcg('DIGIMON')
      send({ type: 'tcg-start', tcg: 'DIGIMON', message: '디지몬 전체 카드 가져오기 중...' })
      try {
        const r = await fetch('https://digimoncard.io/api-public/search.php?series=Digimon+Card+Game')
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const all = await r.json() as DigimonIoCard[]
        const records = all.map(c => ({
          externalId: `digimon_${c.id}`, name: c.name, tcgType: 'DIGIMON' as const,
          setName: c.set_name?.[0] ?? 'Unknown',
          setCode: c.id.replace(/-\d+$/, ''), cardNumber: c.id,
          rarity: c.rarity ?? 'Unknown', imageUrl: null,
        }))
        const unique = [...new Map(records.map(r => [r.externalId, r])).values()]
        const result = await prisma.card.createMany({ data: unique, skipDuplicates: true })
        totals['DIGIMON'].imported = result.count
        totals['DIGIMON'].skipped = unique.length - result.count
      } catch (err) {
        totals['DIGIMON'].errors++
        send({ type: 'error', tcg: 'DIGIMON', message: String(err) })
      }
      send({ type: 'tcg-done', tcg: 'DIGIMON', ...totals['DIGIMON'] })
    }

    // ── 원피스 ───────────────────────────────────────────────────────────────
    if (types.includes('ONEPIECE') && !closed) {
      initTcg('ONEPIECE')
      send({ type: 'tcg-start', tcg: 'ONEPIECE', message: `원피스 ${OP_KNOWN_SETS.length}개 세트 가져오기 중...` })
      for (const set of OP_KNOWN_SETS) {
        if (closed) break
        try {
          send({ type: 'set-start', tcg: 'ONEPIECE', setId: set.id, setName: set.name })
          let cards: ParsedOpCard[]
          try {
            cards = await fetchOpCardsFromSite(set.id)
            if (cards.length === 0) throw new Error('파싱 0건')
          } catch {
            cards = generateOpFallbackCards(set.id, set.total)
          }
          const records = cards.map(c => ({
            externalId: `onepiece_${c.number}`,
            name: c.name, tcgType: 'ONEPIECE' as const,
            setName: set.name, setCode: set.id,
            cardNumber: c.number, rarity: c.rarity, imageUrl: c.imageUrl,
          }))
          const result = await prisma.card.createMany({ data: records, skipDuplicates: true })
          totals['ONEPIECE'].imported += result.count
          totals['ONEPIECE'].skipped  += records.length - result.count
          send({ type: 'set-done', tcg: 'ONEPIECE', setId: set.id, setName: set.name, imported: result.count, total: records.length })
          await sleep(300)
        } catch (err) {
          totals['ONEPIECE'].errors++
          send({ type: 'set-error', tcg: 'ONEPIECE', setId: set.id, setName: set.name })
        }
      }
      send({ type: 'tcg-done', tcg: 'ONEPIECE', ...totals['ONEPIECE'] })
    }

    send({ type: 'done', totals })
  } catch (err) {
    console.error('[importAll]', err)
    send({ type: 'fatal', error: String(err) })
  } finally {
    clearInterval(heartbeat)
    res.end()
  }
}

// ── 언어 중복 카드 병합 ───────────────────────────────────────────────────────
// 별도 레코드로 저장된 KO/JA 카드들을 EN 기본 카드에 병합
// pokemontcg.io(sv1)↔TCGdex(sv01) 세트 코드 불일치도 처리

export async function mergeLanguageDuplicates(_req: AuthRequest, res: Response) {
  try {
    const langCards = await prisma.card.findMany({
      where: { OR: LANG_PREFIXES.map(p => ({ externalId: { startsWith: p } })) },
      select: {
        id: true, externalId: true, tcgType: true,
        setCode: true, cardNumber: true,
        nameKo: true, nameJa: true,
        _count: { select: { listings: true } },
      },
    })

    let merged = 0, skipped = 0, notFound = 0, movedListings = 0, movedItems = 0

    const BATCH = 50
    for (let i = 0; i < langCards.length; i += BATCH) {
      const batch = langCards.slice(i, i + BATCH)

      await Promise.all(batch.map(async (card) => {
        if (!card.setCode || !card.cardNumber || !card.externalId) { skipped++; return }

        const eid = card.externalId
        const lang = (eid.startsWith('tcgdex_ko_') || eid.startsWith('mtg_ko_')) ? 'ko' : 'ja'
        const field = lang === 'ko' ? 'nameKo' : 'nameJa'
        const langName = lang === 'ko' ? card.nameKo : card.nameJa

        if (!langName) { skipped++; return }

        // 포켓몬은 세트 코드 양쪽 형식 모두 검색 (pokemontcg.io ↔ TCGdex 불일치 대응)
        const setCodeVars = card.tcgType === 'POKEMON'
          ? pokemonSetCodeVariants(card.setCode)
          : [card.setCode]

        const baseCard = await prisma.card.findFirst({
          where: {
            tcgType: card.tcgType,
            setCode: { in: setCodeVars },
            cardNumber: card.cardNumber,
            id: { not: card.id },
            NOT: { OR: LANG_PREFIXES.map(p => ({ externalId: { startsWith: p } })) },
          },
          select: { id: true, nameKo: true, nameJa: true },
        })

        if (!baseCard) { notFound++; return }

        const alreadyHasName = lang === 'ko' ? !!baseCard.nameKo : !!baseCard.nameJa
        const listingCount = card._count.listings
        const itemCount = await prisma.oripaItem.count({ where: { cardId: card.id } })
        const inventoryCount = await prisma.inventoryItem.count({ where: { cardId: card.id } })

        await prisma.$transaction(async (tx) => {
          if (listingCount > 0) await tx.listing.updateMany({ where: { cardId: card.id }, data: { cardId: baseCard.id } })
          if (itemCount > 0) await tx.oripaItem.updateMany({ where: { cardId: card.id }, data: { cardId: baseCard.id } })
          if (inventoryCount > 0) await tx.inventoryItem.updateMany({ where: { cardId: card.id }, data: { cardId: baseCard.id } })
          if (!alreadyHasName) await tx.card.update({ where: { id: baseCard.id }, data: { [field]: langName } })
          await tx.card.delete({ where: { id: card.id } })
        })

        movedListings += listingCount
        movedItems += itemCount
        merged++
      }))
    }

    res.json({
      merged,
      skipped,
      notFound,
      movedListings,
      movedItems,
      message: `${merged}개 카드 병합 완료. 리스팅 ${movedListings}건 이전, 오리파 아이템 ${movedItems}건 이전.`,
    })
  } catch (err) {
    console.error('[mergeLanguageDuplicates]', err)
    res.status(500).json({ message: '병합 중 오류가 발생했습니다.' })
  }
}

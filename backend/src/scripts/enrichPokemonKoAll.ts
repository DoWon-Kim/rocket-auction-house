/**
 * TCGdex KO API로 모든 포켓몬 카드에 한국어 이름 추가
 * 실행: npx ts-node src/scripts/enrichPokemonKoAll.ts
 */
import 'dotenv/config'
import { prisma } from '../lib/prisma'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function log(msg: string) {
  process.stdout.write(`[${new Date().toISOString().slice(11, 19)}] ${msg}\n`)
}

interface TcgdexSet { id: string; name: string }
interface TcgdexCard { id: string; localId: string; name: string }
interface TcgdexSetDetail extends TcgdexSet { cards: TcgdexCard[] }

function pokemonSetCodeVariants(code: string): string[] {
  const lower = code.toLowerCase()
  const variants = new Set<string>([lower])
  const padded = lower.replace(/^([a-z]+)(\d+)/, (_, p, n) => {
    const num = parseInt(n, 10)
    return `${p}${num < 10 ? '0' + num : num}`
  })
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

async function main() {
  // 1) TCGdex KO API에서 모든 한국어 세트 목록 조회
  log('TCGdex KO 세트 목록 조회 중...')
  const koSetsRes = await fetch('https://api.tcgdex.net/v2/ko/sets')
  const koSets: TcgdexSet[] = await koSetsRes.json() as TcgdexSet[]
  log(`KO 세트 수: ${koSets.length}개`)

  // 2) DB에서 nameKo가 없는 포켓몬 카드 세트 목록
  const dbSets = await prisma.card.groupBy({
    by: ['setCode'],
    where: {
      tcgType: 'POKEMON',
      nameKo: null,
      setCode: { not: null },
      NOT: {
        OR: [
          { externalId: { startsWith: 'tcgdex_ko_' } },
          { externalId: { startsWith: 'tcgdex_ja_' } },
          { externalId: { startsWith: 'pkmncardgame_ja_' } },
        ],
      },
    },
    _count: { _all: true },
    orderBy: { _count: { setCode: 'desc' } },
  })
  log(`한국어 이름 없는 포켓몬 세트: ${dbSets.length}개`)

  let totalUpdated = 0, setsUpdated = 0

  for (const setRow of dbSets) {
    const setCode = setRow.setCode!
    const codeVariants = pokemonSetCodeVariants(setCode)

    // TCGdex KO API에서 세트 상세 조회 (코드 변형 시도)
    let tcgdexCards: TcgdexCard[] | null = null
    for (const code of codeVariants) {
      try {
        const res = await fetch(`https://api.tcgdex.net/v2/ko/sets/${code}`)
        if (!res.ok) continue
        const data = await res.json() as TcgdexSetDetail
        if (Array.isArray(data.cards) && data.cards.length > 0) {
          tcgdexCards = data.cards
          break
        }
      } catch { /* 다음 변형 */ }
    }

    if (!tcgdexCards || tcgdexCards.length === 0) {
      await sleep(80)
      continue
    }

    // 카드번호 → 한국어 이름 맵
    const byNum = new Map<string, string>()
    for (const c of tcgdexCards) {
      if (!c.name) continue
      for (const v of normalizeCardNumber(c.localId)) {
        byNum.set(v.toLowerCase(), c.name)
      }
    }

    // DB 카드에 한국어 이름 매핑
    const dbCards = await prisma.card.findMany({
      where: {
        tcgType: 'POKEMON',
        setCode: { in: codeVariants },
        nameKo: null,
        NOT: {
          OR: [
            { externalId: { startsWith: 'tcgdex_ko_' } },
            { externalId: { startsWith: 'tcgdex_ja_' } },
            { externalId: { startsWith: 'pkmncardgame_ja_' } },
          ],
        },
      },
      select: { id: true, cardNumber: true },
    })

    const toUpdate: Array<{ id: string; nameKo: string }> = []
    for (const card of dbCards) {
      if (!card.cardNumber) continue
      const ko = normalizeCardNumber(card.cardNumber)
        .reduce((found: string | undefined, v) => found ?? byNum.get(v.toLowerCase()), undefined)
      if (ko) toUpdate.push({ id: card.id, nameKo: ko })
    }

    if (toUpdate.length > 0) {
      const CHUNK = 100
      for (let i = 0; i < toUpdate.length; i += CHUNK) {
        const chunk = toUpdate.slice(i, i + CHUNK)
        await prisma.$transaction(
          chunk.map(u => prisma.card.update({ where: { id: u.id }, data: { nameKo: u.nameKo } }))
        )
      }
      totalUpdated += toUpdate.length
      setsUpdated++
      log(`  ${setCode}: +${toUpdate.length}개 KO 이름`)
    }

    await sleep(100)
  }

  log(`\n✅ 완료 — 세트 ${setsUpdated}개, 총 ${totalUpdated}장 한국어 이름 추가`)

  const koCount = await prisma.card.count({ where: { tcgType: 'POKEMON', nameKo: { not: null } } })
  log(`포켓몬 한국어 이름 보유: ${koCount}장`)
}

main().catch(console.error).finally(() => prisma.$disconnect())

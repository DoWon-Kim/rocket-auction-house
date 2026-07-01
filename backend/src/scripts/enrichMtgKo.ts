/**
 * Scryfall lang=ko로 모든 MTG 세트의 한국어 카드명 추가
 * 실행: npx ts-node src/scripts/enrichMtgKo.ts
 */
import 'dotenv/config'
import { prisma } from '../lib/prisma'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function log(msg: string) {
  process.stdout.write(`[${new Date().toISOString().slice(11, 19)}] ${msg}\n`)
}

const SCRYFALL_HEADERS = {
  'User-Agent': 'RocketAuctionHouse/1.0 contact@rocketauction.kr',
  'Accept': 'application/json',
}

interface ScryfallCard {
  id: string
  name: string
  printed_name?: string
  set: string
  collector_number: string
}

interface ScryfallList {
  data: ScryfallCard[]
  has_more: boolean
  next_page?: string
}

async function fetchAllKoCards(setCode: string): Promise<ScryfallCard[]> {
  const all: ScryfallCard[] = []
  let next: string | null =
    `https://api.scryfall.com/cards/search?q=set:${setCode}+lang:ko&unique=cards&order=set`

  while (next) {
    try {
      const res = await fetch(next, { headers: SCRYFALL_HEADERS })
      if (res.status === 404) break // 해당 세트에 KO 카드 없음
      if (!res.ok) {
        await sleep(1000)
        break
      }
      const body = await res.json() as ScryfallList
      all.push(...body.data)
      next = body.has_more ? (body.next_page ?? null) : null
      if (next) await sleep(100)
    } catch {
      break
    }
  }
  return all
}

async function main() {
  // 1) DB에서 한국어 이름 없는 MTG 카드가 있는 세트 목록 조회
  const setsWithMissing = await prisma.card.groupBy({
    by: ['setCode'],
    where: { tcgType: 'MTG', nameKo: null, setCode: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { setCode: 'desc' } },
  })

  log(`한국어 이름 없는 MTG 세트: ${setsWithMissing.length}개`)

  let totalUpdated = 0, totalSkipped = 0, setsWithKo = 0

  for (const setRow of setsWithMissing) {
    const setCode = setRow.setCode!.toLowerCase()
    const koCards = await fetchAllKoCards(setCode)

    if (koCards.length === 0) {
      await sleep(80)
      continue
    }

    setsWithKo++

    // collector_number → printed_name 맵
    const koByNum = new Map<string, string>()
    for (const c of koCards) {
      if (c.printed_name) koByNum.set(c.collector_number, c.printed_name)
    }

    // DB에서 해당 세트 카드 조회
    const dbCards = await prisma.card.findMany({
      where: { tcgType: 'MTG', setCode: setRow.setCode!, nameKo: null },
      select: { id: true, cardNumber: true },
    })

    const toUpdate: Array<{ id: string; nameKo: string }> = []
    for (const card of dbCards) {
      if (!card.cardNumber) continue
      const ko = koByNum.get(card.cardNumber)
      if (ko) toUpdate.push({ id: card.id, nameKo: ko })
    }

    if (toUpdate.length > 0) {
      await prisma.$transaction(
        toUpdate.map(u => prisma.card.update({ where: { id: u.id }, data: { nameKo: u.nameKo } }))
      )
      totalUpdated += toUpdate.length
      log(`  ${setRow.setCode}: +${toUpdate.length}개 한국어 이름 추가`)
    }
    totalSkipped += dbCards.length - toUpdate.length

    await sleep(120)
  }

  log(`\n✅ 완료 — 세트 ${setsWithKo}개, 업데이트 ${totalUpdated}장, 한국어 없음 ${totalSkipped}장`)

  const koCount = await prisma.card.count({ where: { tcgType: 'MTG', nameKo: { not: null } } })
  log(`MTG 한국어 이름 보유: ${koCount}장`)
}

main().catch(console.error).finally(() => prisma.$disconnect())

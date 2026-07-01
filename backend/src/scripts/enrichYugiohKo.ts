/**
 * YGOProDeck API language=ko로 모든 유희왕 카드에 한국어 이름 추가
 * language=ko 시 name 필드가 한국어 이름으로 반환됨
 * 실행: npx ts-node src/scripts/enrichYugiohKo.ts
 */
import 'dotenv/config'
import { prisma } from '../lib/prisma'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function log(msg: string) {
  process.stdout.write(`[${new Date().toISOString().slice(11, 19)}] ${msg}\n`)
}

interface YgoCard {
  id: number
  name: string  // language=ko 시 한국어 이름
}
interface YgoBulkResponse {
  data: YgoCard[]
  meta: { total_rows: number }
}

async function main() {
  const PAGE = 500
  // cardId → 한국어 이름
  const krMap = new Map<number, string>()

  log('YGOProDeck language=ko 전체 카드 수집 중...')

  let offset = 0
  let totalRows = 0

  while (true) {
    const url = `https://db.ygoprodeck.com/api/v7/cardinfo.php?num=${PAGE}&offset=${offset}&language=ko`
    const res = await fetch(url, { headers: { 'User-Agent': 'RocketAuctionHouse/1.0' } })

    if (!res.ok) {
      log(`ERR ${res.status}: ${await res.text().catch(() => '')}`)
      break
    }

    const body = await res.json() as YgoBulkResponse
    totalRows = body.meta.total_rows

    for (const c of body.data) {
      krMap.set(c.id, c.name)
    }

    offset += body.data.length
    const pct = ((offset / totalRows) * 100).toFixed(1)
    if (offset % 2000 < PAGE) log(`[${pct}%] ${offset}/${totalRows}개 수집 (한국어 ${krMap.size}개)`)

    if (offset >= totalRows || body.data.length < PAGE) break
    await sleep(150)
  }

  log(`\n총 한국어 이름 수집: ${krMap.size}개 (전체 ${totalRows}개 중)`)

  if (krMap.size === 0) {
    log('한국어 이름이 없습니다. YGOProDeck API가 ko를 지원하지 않을 수 있습니다.')
    return
  }

  // DB에서 기존 YGO 카드 조회
  log('DB 유희왕 카드 조회 중...')
  const dbCards = await prisma.card.findMany({
    where: { tcgType: 'YUGIOH', nameKo: null },
    select: { id: true, externalId: true },
  })
  log(`DB 유희왕 카드 (nameKo 없음): ${dbCards.length}장`)

  // externalId "yugioh_{id}_{setCode}" 에서 숫자 id 추출
  const toUpdate: Array<{ id: string; nameKo: string }> = []
  let notFound = 0

  for (const card of dbCards) {
    if (!card.externalId) continue
    const m = card.externalId.match(/^yugioh_(\d+)_/)
    if (!m) continue
    const nameKo = krMap.get(Number(m[1]))
    if (nameKo) {
      toUpdate.push({ id: card.id, nameKo })
    } else {
      notFound++
    }
  }

  log(`업데이트 대상: ${toUpdate.length}장, 한국어 없음: ${notFound}장`)

  const CHUNK = 200
  for (let i = 0; i < toUpdate.length; i += CHUNK) {
    const chunk = toUpdate.slice(i, i + CHUNK)
    await prisma.$transaction(
      chunk.map(u => prisma.card.update({ where: { id: u.id }, data: { nameKo: u.nameKo } }))
    )
    if (i % (CHUNK * 20) === 0) {
      const pct = (((i + CHUNK) / toUpdate.length) * 100).toFixed(1)
      log(`[${pct}%] DB 업데이트 ${Math.min(i + CHUNK, toUpdate.length)}/${toUpdate.length}`)
    }
  }

  log(`\n✅ 완료 — 업데이트: ${toUpdate.length}장, 한국어 없음: ${notFound}장`)

  const koCount = await prisma.card.count({ where: { tcgType: 'YUGIOH', nameKo: { not: null } } })
  log(`유희왕 한국어 이름 보유: ${koCount}장`)
}

main().catch(console.error).finally(() => prisma.$disconnect())

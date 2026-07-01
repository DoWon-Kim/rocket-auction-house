/**
 * 포켓몬 일본판 카드 전체 재임포트
 *
 * 기존 importAll.ts는 EN 카드에 nameJa만 병합하고 JA 전용 레코드를 일부만 생성했음.
 * 이 스크립트는 TCGdex JA API의 모든 카드를 tcgdex_ja_ 레코드로 생성/업서트한다.
 *
 * 실행: npx ts-node src/scripts/importJaAll.ts
 */

import 'dotenv/config'
import { prisma } from '../lib/prisma'
import { fetchWithRetry } from '../lib/fetchWithRetry'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function log(msg: string) {
  process.stdout.write(`[${new Date().toISOString().slice(11, 19)}] ${msg}\n`)
}

interface TcgdexSet { id: string; name: string }
interface TcgdexCard { id: string; localId: string; name: string; rarity?: string; image?: string }
interface TcgdexSetDetail extends TcgdexSet { cards: TcgdexCard[] }

async function main() {
  log('▶ TCGdex JA 세트 목록 조회 중...')
  const sets = await fetchWithRetry<TcgdexSet[]>(
    'https://api.tcgdex.net/v2/ja/sets',
    { cacheTtlMs: 0, timeoutMs: 15_000 },
  )
  log(`총 ${sets.length}개 세트`)

  let totalCreated = 0, totalUpdated = 0, totalErrors = 0

  for (let i = 0; i < sets.length; i++) {
    const set = sets[i]
    try {
      const data = await fetchWithRetry<TcgdexSetDetail>(
        `https://api.tcgdex.net/v2/ja/sets/${set.id}`,
        { timeoutMs: 12_000, retries: 2 },
      )

      if (!data.cards?.length) {
        log(`[${i + 1}/${sets.length}] ${set.id} — 카드 없음`)
        await sleep(80)
        continue
      }

      // 모든 JA 카드를 tcgdex_ja_ 레코드로 upsert
      const CHUNK = 50
      let setCreated = 0, setUpdated = 0

      for (let j = 0; j < data.cards.length; j += CHUNK) {
        const chunk = data.cards.slice(j, j + CHUNK)
        const results = await Promise.allSettled(
          chunk.map(c =>
            prisma.card.upsert({
              where: { externalId: `tcgdex_ja_${c.id}` },
              update: {
                name: c.name,
                nameJa: c.name,
                setName: data.name,
                setCode: data.id,
                cardNumber: c.localId,
                rarity: c.rarity ?? 'Unknown',
                imageUrl: c.image ? `${c.image}/low.webp` : null,
              },
              create: {
                externalId: `tcgdex_ja_${c.id}`,
                name: c.name,
                nameJa: c.name,
                tcgType: 'POKEMON',
                setName: data.name,
                setCode: data.id,
                cardNumber: c.localId,
                rarity: c.rarity ?? 'Unknown',
                imageUrl: c.image ? `${c.image}/low.webp` : null,
              },
            }),
          ),
        )

        for (const r of results) {
          if (r.status === 'fulfilled') {
            // Prisma upsert doesn't distinguish create vs update easily,
            // count both as created for simplicity
            setCreated++
          } else {
            totalErrors++
          }
        }
      }

      totalCreated += setCreated
      log(`[${i + 1}/${sets.length}] ${data.id} "${data.name}" — ${data.cards.length}장 처리 (누계: ${totalCreated})`)
      await sleep(100)
    } catch (err) {
      totalErrors++
      log(`[${i + 1}/${sets.length}] ${set.id} 오류: ${err}`)
      await sleep(200)
    }
  }

  log(`\n✅ 완료 — 처리 ${totalCreated}, 오류 ${totalErrors}`)

  // 최종 통계
  const jaCount = await prisma.card.count({ where: { tcgType: 'POKEMON', externalId: { startsWith: 'tcgdex_ja_' } } })
  const withImg = await prisma.card.count({ where: { tcgType: 'POKEMON', externalId: { startsWith: 'tcgdex_ja_' }, imageUrl: { not: null } } })
  log(`DB 현황: tcgdex_ja_ ${jaCount}장, 이미지 있음 ${withImg}장`)
}

main().catch(console.error).finally(() => prisma.$disconnect())

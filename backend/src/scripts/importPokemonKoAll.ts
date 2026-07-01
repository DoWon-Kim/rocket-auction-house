/**
 * TCGdex KO API로 한국어 포켓몬 카드 전체 임포트 (tcgdex_ko_ 레코드 생성)
 * 실행: npx ts-node src/scripts/importPokemonKoAll.ts
 */
import 'dotenv/config'
import { prisma } from '../lib/prisma'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function log(msg: string) {
  process.stdout.write(`[${new Date().toISOString().slice(11, 19)}] ${msg}\n`)
}

interface TcgdexSet { id: string; name: string }
interface TcgdexCard { id: string; localId: string; name: string; image?: string; rarity?: string }
interface TcgdexSetDetail extends TcgdexSet { cards: TcgdexCard[] }

async function main() {
  // 1) 전체 KO 세트 목록
  log('TCGdex KO 세트 목록 조회...')
  const setsRes = await fetch('https://api.tcgdex.net/v2/ko/sets')
  const sets: TcgdexSet[] = await setsRes.json() as TcgdexSet[]
  log(`총 ${sets.length}개 KO 세트`)

  let totalCreated = 0, totalUpdated = 0, totalSkipped = 0
  let setsDone = 0

  for (const set of sets) {
    // 세트 상세 조회
    let data: TcgdexSetDetail | null = null
    try {
      const res = await fetch(`https://api.tcgdex.net/v2/ko/sets/${set.id}`)
      if (!res.ok) { await sleep(150); continue }
      data = await res.json() as TcgdexSetDetail
    } catch { await sleep(150); continue }

    if (!data?.cards?.length) { await sleep(100); continue }

    const records = data.cards.map(c => ({
      externalId: `tcgdex_ko_${c.id}`,
      name:       c.name,
      nameKo:     c.name,
      tcgType:    'POKEMON' as const,
      setName:    data!.name,
      setCode:    data!.id,
      cardNumber: c.localId,
      rarity:     c.rarity ?? 'Unknown',
      imageUrl:   c.image ? `${c.image}/low.webp` : null,
    }))

    // createMany(skipDuplicates) 로 신규 삽입
    const result = await prisma.card.createMany({ data: records, skipDuplicates: true })
    totalCreated += result.count
    totalSkipped += records.length - result.count

    // 기존 EN 카드에도 nameKo 보강 시도 (카드번호 기준 매핑)
    // pokemontcg.io 세트코드 변형 (sv01↔sv1 등) 없이 localId로만 직접 매핑
    const byLocalId = new Map(data.cards.map(c => [c.localId, c.name]))
    const enCards = await prisma.card.findMany({
      where: {
        tcgType: 'POKEMON',
        setCode: set.id,
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

    const toUpdate = enCards
      .filter(c => c.cardNumber && byLocalId.has(c.cardNumber))
      .map(c => ({ id: c.id, nameKo: byLocalId.get(c.cardNumber!)! }))

    if (toUpdate.length > 0) {
      await prisma.$transaction(
        toUpdate.map(u => prisma.card.update({ where: { id: u.id }, data: { nameKo: u.nameKo } }))
      )
      totalUpdated += toUpdate.length
    }

    setsDone++
    if (setsDone % 10 === 0) {
      log(`[${setsDone}/${sets.length}] 세트 처리 중 - 신규: ${totalCreated}, 보강: ${totalUpdated}`)
    }

    await sleep(120)
  }

  log(`\n✅ 완료 — 세트 ${setsDone}개`)
  log(`신규 KO 레코드: ${totalCreated}장 | EN 카드 KO 이름 보강: ${totalUpdated}장 | 기존 스킵: ${totalSkipped}장`)

  const koTotal = await prisma.card.count({ where: { tcgType: 'POKEMON', nameKo: { not: null } } })
  const koRecords = await prisma.card.count({ where: { externalId: { startsWith: 'tcgdex_ko_' } } })
  log(`포켓몬 KO 이름 있는 카드: ${koTotal}장 (tcgdex_ko_ 레코드: ${koRecords}장)`)
}

main().catch(console.error).finally(() => prisma.$disconnect())

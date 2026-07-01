import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const p = new PrismaClient()

async function main() {
  const total    = await p.card.count({ where: { tcgType: 'POKEMON' } })
  const enHq     = await p.card.count({ where: { tcgType: 'POKEMON', externalId: { startsWith: 'pokemon_' } } })
  const tcgdexJa = await p.card.count({ where: { tcgType: 'POKEMON', externalId: { startsWith: 'tcgdex_ja_' } } })
  const tcgdexEn = await p.card.count({ where: { tcgType: 'POKEMON', externalId: { startsWith: 'tcgdex_en_' } } })
  const hasJa    = await p.card.count({ where: { tcgType: 'POKEMON', nameJa: { not: null } } })
  const hasKo    = await p.card.count({ where: { tcgType: 'POKEMON', nameKo: { not: null } } })

  console.log('=== 포켓몬 카드 현황 ===')
  console.log(`전체:              ${total}`)
  console.log(`EN HQ (pokemontcg.io): ${enHq}`)
  console.log(`TCGdex EN:         ${tcgdexEn}`)
  console.log(`TCGdex JA 전용:    ${tcgdexJa}`)
  console.log(`nameJa 보유:       ${hasJa}`)
  console.log(`nameKo 보유:       ${hasKo}`)

  // TCGdex JA 전용 레코드 샘플
  const jaSamples = await p.card.findMany({
    where: { tcgType: 'POKEMON', externalId: { startsWith: 'tcgdex_ja_' } },
    take: 5,
    select: { name: true, nameJa: true, setCode: true, setName: true, cardNumber: true, imageUrl: true },
  })
  console.log('\nTCGdex JA 샘플:')
  jaSamples.forEach(c => console.log(`  ${c.setCode}/${c.cardNumber} ${c.name} / JA:${c.nameJa} img:${c.imageUrl?.slice(0,60)}`))

  // EN HQ 중 nameJa 있는 샘플
  const enWithJa = await p.card.findMany({
    where: { tcgType: 'POKEMON', externalId: { startsWith: 'pokemon_' }, nameJa: { not: null } },
    take: 5,
    select: { name: true, nameJa: true, setCode: true, cardNumber: true },
  })
  console.log('\nEN HQ + nameJa 샘플:')
  enWithJa.forEach(c => console.log(`  ${c.setCode}/${c.cardNumber} ${c.name} → ${c.nameJa}`))
}

main().catch(console.error).finally(() => p.$disconnect())

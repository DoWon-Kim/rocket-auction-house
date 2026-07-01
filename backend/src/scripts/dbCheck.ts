import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const p = new PrismaClient()
p.card.groupBy({ by: ['tcgType'], _count: { id: true } })
  .then(rows => {
    console.log('=== 현재 DB 카드 현황 ===')
    let total = 0
    for (const r of rows) {
      console.log(`  ${r.tcgType.padEnd(10)}: ${r._count.id.toLocaleString()}장`)
      total += r._count.id
    }
    console.log(`  ${'합계'.padEnd(10)}: ${total.toLocaleString()}장`)
  })
  .finally(() => p.$disconnect())

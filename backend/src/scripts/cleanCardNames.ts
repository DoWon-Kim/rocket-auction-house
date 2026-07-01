/**
 * pkmncardgame_ja_ 레코드의 이름에서 HTML 태그를 제거
 * 실행: npx ts-node src/scripts/cleanCardNames.ts
 */
import 'dotenv/config'
import { prisma } from '../lib/prisma'

function stripHtml(text: string | null): string | null {
  if (!text) return text
  // HTML 태그 제거
  const stripped = text.replace(/<[^>]+>/g, '').trim()
  return stripped || text
}

async function main() {
  const dirty = await prisma.card.findMany({
    where: {
      externalId: { startsWith: 'pkmncardgame_ja_' },
      OR: [
        { name: { contains: '<' } },
        { nameJa: { contains: '<' } },
      ],
    },
    select: { id: true, name: true, nameJa: true },
  })

  console.log(`HTML 태그가 있는 카드: ${dirty.length}장`)

  if (dirty.length === 0) {
    console.log('정리할 카드 없음')
    return
  }

  let fixed = 0
  for (const card of dirty) {
    const cleanName = stripHtml(card.name)
    const cleanNameJa = stripHtml(card.nameJa)
    if (cleanName !== card.name || cleanNameJa !== card.nameJa) {
      await prisma.card.update({
        where: { id: card.id },
        data: { name: cleanName ?? card.name, nameJa: cleanNameJa },
      })
      fixed++
    }
  }

  console.log(`✅ ${fixed}장 정리 완료`)
}

main().catch(console.error).finally(() => prisma.$disconnect())

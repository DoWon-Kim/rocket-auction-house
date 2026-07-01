/**
 * 기존 포켓몬 EN 카드(pokemon_ prefix)에 상세 TCG 스탯 보강
 * HP, 에너지 타입, 기술, 특성, 약점, 저항력, 후퇴비용, 일러스트레이터
 * 실행: npx ts-node src/scripts/enrichPokemonDetails.ts
 */
import 'dotenv/config'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function log(msg: string) {
  process.stdout.write(`[${new Date().toISOString().slice(11, 19)}] ${msg}\n`)
}

interface PkmnAttack {
  name: string
  cost: string[]
  convertedEnergyCost: number
  damage: string
  text: string
}

interface PkmnAbility {
  name: string
  text: string
  type: string
}

interface PkmnWeakness {
  type: string
  value: string
}

interface PkmnResistance {
  type: string
  value: string
}

interface PkmnCardDetail {
  id: string
  hp?: string
  types?: string[]
  supertype?: string
  subtypes?: string[]
  attacks?: PkmnAttack[]
  abilities?: PkmnAbility[]
  weaknesses?: PkmnWeakness[]
  resistances?: PkmnResistance[]
  convertedRetreatCost?: number
  artist?: string
  flavorText?: string
}

async function fetchCard(cardId: string): Promise<PkmnCardDetail | null> {
  const key = process.env.POKEMONTCG_API_KEY
  const headers: Record<string, string> = key ? { 'X-Api-Key': key } : {}
  try {
    const res = await fetch(`https://api.pokemontcg.io/v2/cards/${cardId}`, { headers })
    if (!res.ok) return null
    const body = await res.json() as { data: PkmnCardDetail }
    return body.data
  } catch {
    return null
  }
}

async function main() {
  // pokemon_ prefix 카드 전체 조회 (아직 supertype이 없는 것만)
  const cards = await prisma.card.findMany({
    where: {
      externalId: { startsWith: 'pokemon_' },
      supertype: null,
    },
    select: { id: true, externalId: true },
  })

  log(`보강 대상: ${cards.length}장 (supertype 없는 pokemon_ 카드)`)

  let updated = 0, failed = 0
  const BATCH = 50

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i]
    // externalId: "pokemon_sv1-1" → API id: "sv1-1"
    const apiId = card.externalId!.replace('pokemon_', '')

    const detail = await fetchCard(apiId)
    if (!detail) {
      failed++
      if (failed <= 5) log(`  ✗ ${apiId} - 404 또는 오류`)
    } else {
      await prisma.card.update({
        where: { id: card.id },
        data: {
          supertype:   detail.supertype ?? null,
          subtypes:    detail.subtypes?.join(',') ?? null,
          cardTypes:   detail.types?.join(',') ?? null,
          hp:          detail.hp ? parseInt(detail.hp) : null,
          attacks:     (detail.attacks ?? Prisma.JsonNull) as unknown as Prisma.InputJsonValue,
          abilities:   (detail.abilities ?? Prisma.JsonNull) as unknown as Prisma.InputJsonValue,
          weaknesses:  (detail.weaknesses ?? Prisma.JsonNull) as unknown as Prisma.InputJsonValue,
          resistances: (detail.resistances ?? Prisma.JsonNull) as unknown as Prisma.InputJsonValue,
          retreatCost: detail.convertedRetreatCost ?? null,
          artist:      detail.artist ?? null,
          flavorText:  detail.flavorText ?? null,
        },
      })
      updated++
    }

    if ((i + 1) % BATCH === 0) {
      log(`[${i + 1}/${cards.length}] 완료: ${updated}장 / 실패: ${failed}장`)
    }

    // API rate limit 준수 (pokemontcg.io: 키 없으면 1000/day, 키 있으면 20000/day)
    await sleep(process.env.POKEMONTCG_API_KEY ? 60 : 250)
  }

  log(`\n✅ 완료: 업데이트 ${updated}장 / 실패 ${failed}장`)

  const stats = await prisma.card.groupBy({
    by: ['supertype'],
    where: { externalId: { startsWith: 'pokemon_' } },
    _count: true,
  })
  log('포켓몬 supertype 분포:')
  for (const s of stats) {
    log(`  ${s.supertype ?? '(null)'}: ${s._count}장`)
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())

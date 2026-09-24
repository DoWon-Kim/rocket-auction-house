import { Prisma } from '@prisma/client'

// 카드 레코드의 언어판 (externalId 접두어 기준)
// - 세트 도감은 (TCG, 언어, 세트코드) 단위: 일판·한판이 같은 세트코드를 쓰는 경우가 있어 언어로 구분

export type CardLang = 'ja' | 'ko' | 'en'
export const CARD_LANGS: CardLang[] = ['ja', 'ko', 'en']

const JA_PREFIXES = ['tcgdex_ja_', 'pkmncardgame_ja_', 'mtg_ja_', 'snkrdunk_']   // 스니덩 신규 등록 카드는 일본 시장 상품
const KO_PREFIXES = ['tcgdex_ko_', 'mtg_ko_']

export function cardLangOf(externalId: string | null | undefined): CardLang {
  const e = externalId ?? ''
  if (JA_PREFIXES.some(p => e.startsWith(p))) return 'ja'
  if (KO_PREFIXES.some(p => e.startsWith(p))) return 'ko'
  return 'en'
}

export function isCardLang(v: unknown): v is CardLang {
  return typeof v === 'string' && (CARD_LANGS as string[]).includes(v)
}

// Prisma where 조건
export function cardLangWhere(lang: CardLang): Prisma.CardWhereInput {
  if (lang === 'ja') return { OR: JA_PREFIXES.map(p => ({ externalId: { startsWith: p } })) }
  if (lang === 'ko') return { OR: KO_PREFIXES.map(p => ({ externalId: { startsWith: p } })) }
  return { NOT: { OR: [...JA_PREFIXES, ...KO_PREFIXES].map(p => ({ externalId: { startsWith: p } })) } }
}

// 원시 SQL용 언어 판별식 (Card 테이블 별칭 c)
const likeAny = (prefixes: string[]) => prefixes.map(p => `c."externalId" LIKE '${p.replace(/_/g, '\\_')}%'`).join(' OR ')
export const CARD_LANG_SQL = Prisma.raw(`CASE WHEN ${likeAny(JA_PREFIXES)} THEN 'ja' WHEN ${likeAny(KO_PREFIXES)} THEN 'ko' ELSE 'en' END`)

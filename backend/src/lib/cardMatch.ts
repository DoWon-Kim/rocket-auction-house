// 외부 소스 상품 ↔ 카드 매칭 (DB 비의존 순수 함수)
//
// 원칙: 자동 연결은 "세트 코드 + 카드 번호가 정확히 일치하고 후보가 하나로 좁혀질 때"만.
// 이름 유사도는 언어가 달라(스니덩 영문명 ↔ 일판 일본어명) 신뢰할 수 없으므로 후보 정렬에만 쓴다.

export interface MatchItem {
  tcgType: string
  lang?: string | null
  name: string
  setCode?: string | null
  cardNumber?: string | null
}

export interface MatchCard {
  id: string
  tcgType: string
  name: string
  nameJa?: string | null
  nameKo?: string | null
  setCode?: string | null
  cardNumber?: string | null
  externalId?: string | null
}

export interface ScoredCandidate<C extends MatchCard = MatchCard> {
  card: C
  score: number          // 0~100
  setMatch: boolean
  numberMatch: boolean
  nameScore: number      // 0~1
  langMatch: boolean     // 같은 언어판 (예: 일판 상품 ↔ tcgdex_ja_ 카드)
}

// 세트 코드 비교 키: 대소문자·공백 무시, 숫자 앞 0 패딩 무시 (sv01 ≡ sv1)
export function setCodeKey(code: string | null | undefined): string {
  if (!code) return ''
  return code.trim().toLowerCase().replace(/\s+/g, '').replace(/(^|[^0-9])0+(?=\d)/g, '$1')
}

// 카드 번호 비교 키: "/총수량" 제거, 숫자 앞 0 제거, 대문자화
// "079" ≡ "79" ≡ "079/062", "TG01/TG30" ≡ "TG1", "MZMI-JP001" ≡ "MZMI-JP1"
export function cardNumberKey(num: string | null | undefined): string {
  if (!num) return ''
  const base = num.trim().split('/')[0].trim().toUpperCase().replace(/\s+/g, '')
  return base.replace(/(^|[^0-9])0+(?=\d)/g, '$1')
}

// DB 검색용 카드 번호 표기 변형 ("079" → 079, 79, 079/..., 등은 startsWith로 따로 처리)
export function cardNumberVariants(num: string | null | undefined): string[] {
  if (!num) return []
  const base = num.trim().split('/')[0].trim()
  const out = new Set<string>([num.trim(), base])
  if (/^\d+$/.test(base)) {
    const n = String(parseInt(base, 10))
    out.add(n); out.add(n.padStart(2, '0')); out.add(n.padStart(3, '0'))
  }
  return [...out].filter(Boolean)
}

// 이름 비교 키: 유니코드 정규화 후 문자·숫자만
export function nameKey(name: string | null | undefined): string {
  if (!name) return ''
  return name.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
}

// 바이그램 Dice 유사도 (0~1)
export function nameSimilarity(a: string, b: string): number {
  const x = nameKey(a), y = nameKey(b)
  if (!x || !y) return 0
  if (x === y) return 1
  if (x.length < 2 || y.length < 2) return x.includes(y) || y.includes(x) ? 0.5 : 0
  const grams = (s: string) => {
    const m = new Map<string, number>()
    for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) ?? 0) + 1) }
    return m
  }
  const gx = grams(x), gy = grams(y)
  let inter = 0
  for (const [g, n] of gx) inter += Math.min(n, gy.get(g) ?? 0)
  return (2 * inter) / (x.length - 1 + y.length - 1)
}

function langOf(card: MatchCard): string | null {
  const ext = card.externalId ?? ''
  if (ext.startsWith('tcgdex_ja_')) return 'ja'
  if (ext.startsWith('tcgdex_ko_')) return 'ko'
  return null
}

export function scoreCandidate<C extends MatchCard>(item: MatchItem, card: C): ScoredCandidate<C> {
  const setMatch = !!item.setCode && setCodeKey(item.setCode) === setCodeKey(card.setCode)
  const numberMatch = !!item.cardNumber && cardNumberKey(item.cardNumber) === cardNumberKey(card.cardNumber)
  const nameScore = Math.max(
    nameSimilarity(item.name, card.name),
    nameSimilarity(item.name, card.nameJa ?? ''),
    nameSimilarity(item.name, card.nameKo ?? ''),
  )
  // 같은 언어판 우선 (스니덩 일판 상품 → tcgdex_ja_ 카드)
  const langMatch = !!item.lang && langOf(card) === item.lang
  const score = Math.min(100, (setMatch ? 50 : 0) + (numberMatch ? 35 : 0) + Math.round(nameScore * 10) + (langMatch ? 5 : 0))
  return { card, score, setMatch, numberMatch, nameScore, langMatch }
}

export function rankCandidates<C extends MatchCard>(item: MatchItem, cards: C[], limit = 5): ScoredCandidate<C>[] {
  const seen = new Set<string>()
  return cards
    .filter(c => c.tcgType === item.tcgType && !seen.has(c.id) && seen.add(c.id))
    .map(c => scoreCandidate(item, c))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

// 자동 연결 대상: 세트+번호가 일치하는 카드가 하나뿐일 때.
// 여러 개면 같은 언어판이 정확히 하나일 때만 그 카드로 (이름 점수 차이로는 고르지 않음 → 검수)
export function pickAutoLink<C extends MatchCard>(ranked: ScoredCandidate<C>[]): ScoredCandidate<C> | null {
  const exact = ranked.filter(c => c.setMatch && c.numberMatch)
  if (exact.length === 1) return exact[0]
  const sameLang = exact.filter(c => c.langMatch)
  return sameLang.length === 1 ? sameLang[0] : null
}

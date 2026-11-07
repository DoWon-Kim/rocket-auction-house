// 오리파 공정성: 티켓 순서를 비밀 시드로 섞어 봉인하고, 시드의 해시만 먼저 공개한다.
// 완판되면 시드를 공개 → 누구나 같은 방법으로 섞어서 실제 뽑힌 순서와 같은지 확인할 수 있다.
// (프론트 src/lib/oripaFair.ts 와 알고리즘이 반드시 같아야 함)
import { createHash, randomBytes } from 'crypto'

export const sha256Hex = (s: string) => createHash('sha256').update(s).digest('hex')
export const generateSeed = () => randomBytes(32).toString('hex')

interface PrizeLike { id: string; quantity: number; isLastOne: boolean }

// 정렬된 기본 티켓 목록: 상품 id 오름차순, 수량만큼 반복 (라스트원상 제외)
export function baseTickets(items: PrizeLike[]): string[] {
  return [...items]
    .filter(i => !i.isLastOne && i.quantity > 0)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .flatMap(i => Array<string>(i.quantity).fill(i.id))
}

// 시드 기반 피셔–예이츠: j = sha256("<seed>:<i>") 앞 12자리(48비트) % (i+1)
export function shuffleTickets(tickets: string[], seed: string): string[] {
  const out = [...tickets]
  for (let i = out.length - 1; i > 0; i--) {
    const j = parseInt(sha256Hex(`${seed}:${i}`).slice(0, 12), 16) % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// 판매 시작 시 봉인
export function sealTickets(items: PrizeLike[]) {
  const seed = generateSeed()
  const order = shuffleTickets(baseTickets(items), seed)
  return { seed, seedHash: sha256Hex(seed), order }
}

// 등급 이름
export const GRADE_LABEL: Record<number, string> = { 4: '최상위상', 3: '상위상', 2: '중위상', 1: '하위상' }

// 환원율: 전체 상품 가치 합 / 전체 판매 금액 (라스트원상 포함)
export function returnRate(items: Array<PrizeLike & { exchangeValue: number | null; pointAmount: number | null; prizeType: string }>, pricePerDraw: number, slots: number) {
  const value = items.reduce((s, i) => s + (i.prizeType === 'POINT' ? (i.pointAmount ?? 0) : (i.exchangeValue ?? 0)) * (i.isLastOne ? 1 : i.quantity), 0)
  const revenue = pricePerDraw * slots
  return { value, revenue, rate: revenue > 0 ? value / revenue : 0 }
}

// 닉네임 가리기: 앞 2글자 + ***
export const maskName = (n: string) => (n.length <= 2 ? `${n[0] ?? ''}*` : `${n.slice(0, 2)}${'*'.repeat(Math.min(3, n.length - 2))}`)

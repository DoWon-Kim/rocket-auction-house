// 샵 가격·배송비 계산 (DB 비의존 순수 함수)

export interface ShippingPolicy { fee: number; freeOver: number }   // freeOver 이상 구매 시 무료 (0이면 항상 무료 아님)
export const DEFAULT_SHIPPING: ShippingPolicy = { fee: 3000, freeOver: 50000 }

export function shippingFeeFor(itemsTotal: number, policy: ShippingPolicy): number {
  if (itemsTotal <= 0) return 0
  if (policy.freeOver > 0 && itemsTotal >= policy.freeOver) return 0
  return policy.fee
}

// 정가 대비 할인율 (정가가 없거나 판매가보다 낮으면 0)
export function discountRate(price: number, originalPrice: number | null | undefined): number {
  if (!originalPrice || originalPrice <= price) return 0
  return Math.round((1 - price / originalPrice) * 100)
}

// 주문 라인 합계 (같은 상품은 수량을 합친다)
export function mergeLines(lines: Array<{ shopItemId: string; quantity: number }>) {
  const m = new Map<string, number>()
  for (const l of lines) m.set(l.shopItemId, (m.get(l.shopItemId) ?? 0) + l.quantity)
  return [...m].map(([shopItemId, quantity]) => ({ shopItemId, quantity }))
}

// 고객용 주문번호: S + YYMMDD(KST) + '-' + 6자리 (혼동되는 0/O/1/I 제외)
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
export function makeOrderNo(now = new Date(), rand: () => number = Math.random): string {
  const k = new Date(now.getTime() + 9 * 3600_000)
  const ymd = `${String(k.getUTCFullYear()).slice(2)}${String(k.getUTCMonth() + 1).padStart(2, '0')}${String(k.getUTCDate()).padStart(2, '0')}`
  let tail = ''
  for (let i = 0; i < 6; i++) tail += ALPHABET[Math.floor(rand() * ALPHABET.length)]
  return `S${ymd}-${tail}`
}

// 후기 평점 요약
export function ratingSummary(ratings: number[]) {
  const dist = [0, 0, 0, 0, 0]
  for (const r of ratings) if (r >= 1 && r <= 5) dist[r - 1]++
  const count = ratings.length
  return { count, avg: count ? Math.round((ratings.reduce((a, b) => a + b, 0) / count) * 10) / 10 : 0, dist }
}

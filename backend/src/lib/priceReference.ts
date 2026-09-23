// 판매 등록 시 참고 시세 계산 (DB 비의존 순수 함수)
//
// 추천가 우선순위
//   1) 최근 90일 체결 3건 이상 → 최근 10건 중앙값 (우리 거래소 실거래가 가장 정확)
//   2) 외부 시세(스니덩 최저 호가)가 7일 이내 → 그 값
//   3) 체결 1~2건 → 중앙값 (표본이 적어 참고용)
// 그레이딩 카드는 가격대가 달라 제외하고 계산한다 (호출 측에서 필터).

export const TRADE_WINDOW_DAYS = 90
export const MARKET_FRESH_DAYS = 7
const MIN_TRADES_FOR_SUGGESTION = 3
const RECENT_TRADES_FOR_MEDIAN = 10

export interface TradeInput { price: number; date: Date }
export interface MarketInput { price: number | null; listings: string | null; updatedAt: Date | null; url: string | null }

export type SuggestionBasis = 'TRADES' | 'MARKET' | 'FEW_TRADES'

export interface PriceReference {
  trades: { count: number; median: number; avg: number; min: number; max: number; last: { price: number; date: string }; days: number } | null
  active: { count: number; minBuyNow: number } | null
  market: { source: 'SNKRDUNK'; price: number; listings: string | null; updatedAt: string; url: string | null; stale: boolean } | null
  suggested: { price: number; basis: SuggestionBasis } | null
}

export function median(values: number[]): number {
  if (!values.length) return 0
  const s = [...values].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}

// 금액대별로 보기 좋은 단위로 반올림 (추천가 표시용)
export function roundPrice(v: number): number {
  const unit = v < 10_000 ? 100 : v < 100_000 ? 500 : v < 1_000_000 ? 1_000 : 10_000
  return Math.max(unit, Math.round(v / unit) * unit)
}

export function buildPriceReference(input: {
  trades: TradeInput[]                // 최근 체결 (그레이딩 제외), 순서 무관
  activeMinBuyNow: number | null
  activeCount: number
  market: MarketInput | null
  now?: Date
}): PriceReference {
  const now = input.now ?? new Date()
  const since = now.getTime() - TRADE_WINDOW_DAYS * 86400_000
  const trades = input.trades.filter(t => t.date.getTime() >= since && t.price > 0).sort((a, b) => b.date.getTime() - a.date.getTime())

  const tradeRef = trades.length ? {
    count: trades.length,
    median: median(trades.slice(0, RECENT_TRADES_FOR_MEDIAN).map(t => t.price)),
    avg: Math.round(trades.reduce((s, t) => s + t.price, 0) / trades.length),
    min: Math.min(...trades.map(t => t.price)),
    max: Math.max(...trades.map(t => t.price)),
    last: { price: trades[0].price, date: trades[0].date.toISOString() },
    days: TRADE_WINDOW_DAYS,
  } : null

  const m = input.market
  const marketRef = m?.price && m.price > 0 && m.updatedAt ? {
    source: 'SNKRDUNK' as const,
    price: m.price, listings: m.listings, url: m.url,
    updatedAt: m.updatedAt.toISOString(),
    stale: now.getTime() - m.updatedAt.getTime() > MARKET_FRESH_DAYS * 86400_000,
  } : null

  let suggested: PriceReference['suggested'] = null
  if (tradeRef && tradeRef.count >= MIN_TRADES_FOR_SUGGESTION) suggested = { price: roundPrice(tradeRef.median), basis: 'TRADES' }
  else if (marketRef && !marketRef.stale) suggested = { price: roundPrice(marketRef.price), basis: 'MARKET' }
  else if (tradeRef) suggested = { price: roundPrice(tradeRef.median), basis: 'FEW_TRADES' }

  return {
    trades: tradeRef,
    active: input.activeCount > 0 && input.activeMinBuyNow ? { count: input.activeCount, minBuyNow: input.activeMinBuyNow } : null,
    market: marketRef,
    suggested,
  }
}

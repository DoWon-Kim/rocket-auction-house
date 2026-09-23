import { buildPriceReference, median, roundPrice } from '../lib/priceReference'

const now = new Date('2026-09-24T00:00:00Z')
const daysAgo = (d: number) => new Date(now.getTime() - d * 86400_000)
const market = (price: number | null, ageDays = 1) => ({ price, listings: '5', updatedAt: daysAgo(ageDays), url: 'https://snkrdunk.com/en/trading-cards/1' })

describe('참고 시세 계산', () => {
  it('중앙값·반올림', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([1, 2, 3, 4])).toBe(3)   // 2.5 → 반올림
    expect(roundPrice(8_640)).toBe(8_600)
    expect(roundPrice(43_780)).toBe(44_000)
    expect(roundPrice(110_680)).toBe(111_000)
    expect(roundPrice(2_844_806)).toBe(2_840_000)
    expect(roundPrice(30)).toBe(100)
  })

  it('체결 3건 이상이면 최근 체결 중앙값 추천', () => {
    const r = buildPriceReference({
      trades: [10000, 12000, 11000, 50000].map((p, i) => ({ price: p, date: daysAgo(i + 1) })),
      activeMinBuyNow: 13000, activeCount: 2, market: market(9000), now,
    })
    expect(r.suggested).toEqual({ price: 11500, basis: 'TRADES' })
    expect(r.trades).toMatchObject({ count: 4, min: 10000, max: 50000, last: { price: 10000 } })
    expect(r.active).toEqual({ count: 2, minBuyNow: 13000 })
  })

  it('체결이 적으면 최신 외부 시세 추천', () => {
    const r = buildPriceReference({ trades: [{ price: 20000, date: daysAgo(3) }], activeMinBuyNow: null, activeCount: 0, market: market(15680), now })
    expect(r.suggested).toEqual({ price: 15500, basis: 'MARKET' })
    expect(r.active).toBeNull()
  })

  it('외부 시세가 7일 넘게 오래되면 체결 1~2건 기준, 시세는 stale 표시', () => {
    const r = buildPriceReference({ trades: [{ price: 20000, date: daysAgo(3) }], activeMinBuyNow: null, activeCount: 0, market: market(15000, 10), now })
    expect(r.market?.stale).toBe(true)
    expect(r.suggested).toEqual({ price: 20000, basis: 'FEW_TRADES' })
  })

  it('90일 지난 체결·매물 없는 외부 시세(0)는 무시', () => {
    const r = buildPriceReference({ trades: [{ price: 99999, date: daysAgo(120) }], activeMinBuyNow: null, activeCount: 0, market: market(0), now })
    expect(r).toEqual({ trades: null, active: null, market: null, suggested: null })
  })
})

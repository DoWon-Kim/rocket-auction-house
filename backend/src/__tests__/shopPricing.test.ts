import { shippingFeeFor, discountRate, mergeLines, makeOrderNo, ratingSummary } from '../lib/shopPricing'

describe('샵 가격 계산', () => {
  it('배송비: 기준 금액 이상이면 무료', () => {
    const p = { fee: 3000, freeOver: 50000 }
    expect(shippingFeeFor(49999, p)).toBe(3000)
    expect(shippingFeeFor(50000, p)).toBe(0)
    expect(shippingFeeFor(0, p)).toBe(0)
    expect(shippingFeeFor(10000, { fee: 3000, freeOver: 0 })).toBe(3000)   // 무료 기준 없음
  })

  it('할인율: 정가가 판매가보다 높을 때만', () => {
    expect(discountRate(8000, 10000)).toBe(20)
    expect(discountRate(10000, 10000)).toBe(0)
    expect(discountRate(10000, null)).toBe(0)
    expect(discountRate(9990, 12000)).toBe(17)
  })

  it('같은 상품 줄은 수량 합치기', () => {
    expect(mergeLines([{ shopItemId: 'a', quantity: 1 }, { shopItemId: 'b', quantity: 2 }, { shopItemId: 'a', quantity: 3 }]))
      .toEqual([{ shopItemId: 'a', quantity: 4 }, { shopItemId: 'b', quantity: 2 }])
  })

  it('주문번호: KST 날짜 + 6자리', () => {
    const no = makeOrderNo(new Date('2026-09-24T16:00:00Z'), () => 0)   // KST 9/25 01:00
    expect(no).toBe('S260925-222222')
    expect(makeOrderNo()).toMatch(/^S\d{6}-[2-9A-HJ-NP-Z]{6}$/)
  })

  it('평점 요약', () => {
    expect(ratingSummary([5, 4, 5, 3])).toEqual({ count: 4, avg: 4.3, dist: [0, 0, 1, 1, 2] })
    expect(ratingSummary([])).toEqual({ count: 0, avg: 0, dist: [0, 0, 0, 0, 0] })
  })
})

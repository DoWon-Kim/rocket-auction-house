import { canBump, bumpAvailableAt, resolvePurchasePrice, acceptsOffers, txAmount, BUMP_COOLDOWN_MS } from '../lib/marketTrade'

const base = {
  sellerId: 'seller', listingType: 'BUY_NOW' as const, status: 'ACTIVE',
  buyNowPrice: 10000, reservedForId: null, reservedPrice: null,
}

describe('끌올', () => {
  it('24시간이 지나야 다시 끌올할 수 있다', () => {
    const bumped = new Date('2026-09-24T00:00:00Z')
    expect(canBump(bumped, new Date(bumped.getTime() + BUMP_COOLDOWN_MS - 1))).toBe(false)
    expect(canBump(bumped, new Date(bumped.getTime() + BUMP_COOLDOWN_MS))).toBe(true)
    expect(bumpAvailableAt(bumped).toISOString()).toBe('2026-09-25T00:00:00.000Z')
  })
})

describe('안전결제 금액', () => {
  it('판매중 즉시구매 상품은 판매가로 결제', () => {
    expect(resolvePurchasePrice(base, 'buyer')).toEqual({ ok: true, price: 10000 })
  })
  it('본인 상품은 구매 불가', () => {
    expect(resolvePurchasePrice(base, 'seller').ok).toBe(false)
  })
  it('예약중이면 예약된 구매자만, 합의가로 결제', () => {
    const reserved = { ...base, status: 'RESERVED', reservedForId: 'buyer', reservedPrice: 8000 }
    expect(resolvePurchasePrice(reserved, 'buyer')).toEqual({ ok: true, price: 8000 })
    expect(resolvePurchasePrice(reserved, 'other')).toEqual({ ok: false, message: '다른 구매자와 예약중인 상품입니다.' })
  })
  it('합의가 없이 예약된 즉시구매 상품은 판매가', () => {
    expect(resolvePurchasePrice({ ...base, status: 'RESERVED', reservedForId: 'buyer' }, 'buyer')).toEqual({ ok: true, price: 10000 })
  })
  it('가격제안 상품은 수락(예약) 전에는 결제 불가', () => {
    expect(resolvePurchasePrice({ ...base, listingType: 'OFFER', buyNowPrice: null }, 'buyer').ok).toBe(false)
    const accepted = { ...base, listingType: 'OFFER' as const, buyNowPrice: null, status: 'RESERVED', reservedForId: 'buyer', reservedPrice: 7000 }
    expect(resolvePurchasePrice(accepted, 'buyer')).toEqual({ ok: true, price: 7000 })
  })
  it('경매·판매완료 상품은 결제 불가', () => {
    expect(resolvePurchasePrice({ ...base, listingType: 'AUCTION' }, 'buyer').ok).toBe(false)
    expect(resolvePurchasePrice({ ...base, status: 'SOLD' }, 'buyer').ok).toBe(false)
  })
})

describe('가격 제안 허용', () => {
  it('가격제안 상품 또는 제안 가능 표시한 즉시구매 상품만', () => {
    expect(acceptsOffers({ listingType: 'OFFER', negotiable: false, status: 'ACTIVE' })).toBe(true)
    expect(acceptsOffers({ listingType: 'BUY_NOW', negotiable: true, status: 'ACTIVE' })).toBe(true)
    expect(acceptsOffers({ listingType: 'BUY_NOW', negotiable: false, status: 'ACTIVE' })).toBe(false)
    expect(acceptsOffers({ listingType: 'AUCTION', negotiable: true, status: 'ACTIVE' })).toBe(false)
    expect(acceptsOffers({ listingType: 'OFFER', negotiable: false, status: 'RESERVED' })).toBe(false)
  })
})

describe('정산 금액', () => {
  it('상품 금액 + 배송비', () => {
    expect(txAmount({ finalPrice: 10000, shippingFee: 3500 })).toBe(13500)
    expect(txAmount({ finalPrice: 10000 })).toBe(10000)
  })
})

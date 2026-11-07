// 번개장터식 C2C 거래 규칙 (순수 함수 — 컨트롤러·테스트 공용)

export const BUMP_COOLDOWN_MS = 24 * 3600 * 1000 // 끌올은 하루 1회

export function bumpAvailableAt(bumpedAt: Date): Date {
  return new Date(bumpedAt.getTime() + BUMP_COOLDOWN_MS)
}

export function canBump(bumpedAt: Date, now = new Date()): boolean {
  return now.getTime() >= bumpAvailableAt(bumpedAt).getTime()
}

interface PurchasableListing {
  sellerId: string
  listingType: 'BUY_NOW' | 'AUCTION' | 'OFFER'
  status: string
  buyNowPrice: number | null
  reservedForId: string | null
  reservedPrice: number | null
}

export type PurchaseCheck = { ok: true; price: number } | { ok: false; message: string }

// 안전결제 가능 여부 + 결제할 상품 금액
// - 판매중 즉시구매 상품: 판매가
// - 예약중 상품: 예약된 구매자만, 합의가(수락된 제안가) 또는 판매가
export function resolvePurchasePrice(listing: PurchasableListing, buyerId: string): PurchaseCheck {
  if (listing.sellerId === buyerId) return { ok: false, message: '본인 상품은 구매할 수 없습니다.' }
  if (listing.status === 'RESERVED') {
    if (listing.reservedForId !== buyerId) return { ok: false, message: '다른 구매자와 예약중인 상품입니다.' }
    const price = listing.reservedPrice ?? listing.buyNowPrice
    return price ? { ok: true, price } : { ok: false, message: '거래 금액이 정해지지 않았습니다. 판매자와 채팅으로 확인해주세요.' }
  }
  if (listing.status !== 'ACTIVE') return { ok: false, message: '판매가 끝난 상품입니다.' }
  if (listing.listingType === 'AUCTION') return { ok: false, message: '경매 상품은 입찰로 구매할 수 있습니다.' }
  if (listing.listingType === 'OFFER' || !listing.buyNowPrice) {
    return { ok: false, message: '가격 제안 후 판매자가 수락하면 결제할 수 있어요.' }
  }
  return { ok: true, price: listing.buyNowPrice }
}

// 가격 제안을 받을 수 있는 상품인지
export function acceptsOffers(listing: { listingType: string; negotiable: boolean; status: string }): boolean {
  if (listing.status !== 'ACTIVE') return false
  return listing.listingType === 'OFFER' || (listing.listingType === 'BUY_NOW' && listing.negotiable)
}

// 정산·환불 금액 = 상품 금액 + 구매자가 낸 배송비
export function txAmount(tx: { finalPrice: number; shippingFee?: number | null }): number {
  return tx.finalPrice + (tx.shippingFee ?? 0)
}

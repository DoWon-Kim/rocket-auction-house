'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'

// ── 쇼핑몰 공통 ───────────────────────────────────────────────────────────────

export const CATEGORY_LABELS: Record<string, string> = {
  BOOSTER_BOX: '부스터 박스', STARTER_DECK: '스타터 덱', SINGLE_PACK: '단품 팩',
  GIFT_SET: '기프트 세트', SPECIAL: '스페셜', OTHER: '기타',
}
export const CATEGORY_ICON: Record<string, string> = {
  BOOSTER_BOX: '📦', STARTER_DECK: '🃏', SINGLE_PACK: '🎴', GIFT_SET: '🎁', SPECIAL: '✨', OTHER: '🛍️',
}
export const SHIP_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING:   { label: '결제 완료', cls: 'bg-sky-500/15 text-sky-300' },
  PREPARING: { label: '상품 준비 중', cls: 'bg-amber-500/15 text-amber-300' },
  SHIPPED:   { label: '배송 중', cls: 'bg-violet-500/15 text-violet-300' },
  DELIVERED: { label: '배송 완료', cls: 'bg-emerald-500/15 text-emerald-300' },
}

export const P = (v: number) => `${v.toLocaleString()}P`

export interface ShopItemCard {
  id: string; name: string; tcgType: string; category: string; price: number; originalPrice: number | null
  stock: number; imageUrl: string | null; isSoldOut: boolean; isFeatured: boolean; soldCount: number; createdAt: string
  soldOut: boolean; discountRate: number; isNew: boolean; rating: number | null; reviewCount: number
}
export interface ShippingPolicy { fee: number; freeOver: number }

export interface CartLine {
  shopItemId: string; quantity: number; available: boolean; maxQuantity: number
  item: Omit<ShopItemCard, 'soldOut' | 'isNew' | 'rating' | 'reviewCount'> & { isActive: boolean }
}

export const shippingFeeFor = (itemsTotal: number, p: ShippingPolicy) =>
  itemsTotal <= 0 ? 0 : p.freeOver > 0 && itemsTotal >= p.freeOver ? 0 : p.fee

// 장바구니 (로그인 사용자만)
export function useCart() {
  const user = useAuthStore(s => s.user)
  return useQuery<{ items: CartLine[]; shipping: ShippingPolicy }>({
    queryKey: ['shop-cart'],
    queryFn: () => api.get('/shop/cart').then(r => r.data),
    enabled: !!user,
    staleTime: 30_000,
  })
}

export function useAddToCart() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { shopItemId: string; quantity: number }) => api.post<{ count: number; quantity: number }>('/shop/cart', v).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shop-cart'] }),
  })
}

// 주문서로 넘길 항목 (?items=id:수량,id:수량)
export const encodeItems = (lines: Array<{ shopItemId: string; quantity: number }>) =>
  lines.map(l => `${l.shopItemId}:${l.quantity}`).join(',')
export const decodeItems = (s: string | null) =>
  (s ?? '').split(',').map(x => x.split(':')).filter(([id, q]) => id && Number(q) > 0).map(([id, q]) => ({ shopItemId: id, quantity: Math.min(10, Number(q)) }))

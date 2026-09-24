'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Minus, Plus, X, Package, ShoppingCart } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore, useAuthHydrated } from '@/lib/store'
import { P, encodeItems, shippingFeeFor, useCart } from '@/lib/shop'
import { ShopTopBar } from '@/components/shop/ShopTopBar'

export default function CartPage() {
  const router = useRouter()
  const user = useAuthStore(s => s.user)
  const hydrated = useAuthHydrated()
  const qc = useQueryClient()
  const { data, isLoading } = useCart()
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set())

  useEffect(() => { if (hydrated && !user) router.replace('/login') }, [hydrated, user, router])

  const refresh = () => qc.invalidateQueries({ queryKey: ['shop-cart'] })
  const setQty = useMutation({ mutationFn: (v: { id: string; quantity: number }) => api.patch(`/shop/cart/${v.id}`, { quantity: v.quantity }), onSuccess: refresh })
  const remove = useMutation({ mutationFn: (ids: string[]) => api.delete('/shop/cart', { data: { ids } }), onSuccess: refresh })

  const lines = useMemo(() => data?.items ?? [], [data])
  const selected = useMemo(() => lines.filter(l => l.available && !unchecked.has(l.shopItemId)), [lines, unchecked])
  const itemsTotal = selected.reduce((s, l) => s + l.item.price * l.quantity, 0)
  const originalTotal = selected.reduce((s, l) => s + (l.item.originalPrice && l.item.originalPrice > l.item.price ? l.item.originalPrice : l.item.price) * l.quantity, 0)
  const shipping = data ? shippingFeeFor(itemsTotal, data.shipping) : 0
  const total = itemsTotal + shipping
  const allChecked = lines.filter(l => l.available).every(l => !unchecked.has(l.shopItemId))

  const toggle = (id: string) => setUnchecked(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  if (!user) return null

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <ShopTopBar />
      <h1 className="text-2xl font-bold text-fg flex items-center gap-2"><ShoppingCart size={22} />장바구니 <span className="text-base font-normal text-subtle">{lines.length}</span></h1>

      {isLoading ? <div className="h-64 rounded-2xl bg-surface animate-pulse" /> : lines.length === 0 ? (
        <div className="py-24 text-center space-y-3 rounded-3xl border border-line bg-surface">
          <Package size={40} className="mx-auto text-subtle" />
          <p className="text-muted">장바구니가 비어 있어요.</p>
          <Link href="/shop" className="inline-flex h-10 px-5 items-center rounded-full bg-accent text-sm font-semibold text-white">쇼핑하러 가기</Link>
        </div>
      ) : (
        <div className="grid lg:grid-cols-[1fr_340px] gap-6 items-start">
          <div className="rounded-2xl border border-line bg-surface overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-line text-sm">
              <label className="flex items-center gap-2 cursor-pointer text-fg-2">
                <input type="checkbox" checked={allChecked} onChange={() => setUnchecked(allChecked ? new Set(lines.map(l => l.shopItemId)) : new Set())} />
                전체 선택 ({selected.length}/{lines.filter(l => l.available).length})
              </label>
              <button onClick={() => remove.mutate(lines.filter(l => !l.available || !unchecked.has(l.shopItemId)).map(l => l.shopItemId))}
                className="text-xs text-muted hover:text-fg">선택 삭제</button>
            </div>
            <ul className="divide-y divide-line">
              {lines.map(l => (
                <li key={l.shopItemId} className={`flex gap-3 p-4 ${l.available ? '' : 'opacity-60'}`}>
                  <input type="checkbox" className="mt-1" disabled={!l.available} checked={l.available && !unchecked.has(l.shopItemId)} onChange={() => toggle(l.shopItemId)} aria-label="선택" />
                  <Link href={`/shop/${l.shopItemId}`} className="relative w-20 h-20 shrink-0 rounded-xl bg-sunken border border-line overflow-hidden">
                    {l.item.imageUrl ? <Image src={l.item.imageUrl} alt="" fill sizes="80px" className="object-contain p-1.5" /> : <Package className="m-auto mt-6 text-subtle" />}
                  </Link>
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-start gap-2">
                      <Link href={`/shop/${l.shopItemId}`} className="flex-1 text-sm text-fg hover:underline line-clamp-2">{l.item.name}</Link>
                      <button onClick={() => remove.mutate([l.shopItemId])} aria-label="삭제" className="text-subtle hover:text-fg"><X size={16} /></button>
                    </div>
                    {!l.available ? <p className="text-xs text-rose-300">품절되었거나 판매가 종료된 상품입니다.</p> : (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center rounded-lg border border-line">
                          <button onClick={() => setQty.mutate({ id: l.shopItemId, quantity: Math.max(1, l.quantity - 1) })} disabled={l.quantity <= 1} aria-label="수량 줄이기" className="w-8 h-8 flex items-center justify-center text-fg-3 disabled:opacity-30"><Minus size={12} /></button>
                          <span className="w-8 text-center text-sm tabular-nums">{l.quantity}</span>
                          <button onClick={() => setQty.mutate({ id: l.shopItemId, quantity: Math.min(l.maxQuantity, l.quantity + 1) })} disabled={l.quantity >= l.maxQuantity} aria-label="수량 늘리기" className="w-8 h-8 flex items-center justify-center text-fg-3 disabled:opacity-30"><Plus size={12} /></button>
                        </div>
                        <p className="text-right">
                          {l.item.discountRate > 0 && <span className="mr-1.5 text-xs text-rose-400 font-bold">{l.item.discountRate}%</span>}
                          <span className="font-bold text-fg tabular-nums">{P(l.item.price * l.quantity)}</span>
                        </p>
                      </div>
                    )}
                    {l.available && l.quantity > l.maxQuantity && <p className="text-xs text-orange-300">재고가 {l.maxQuantity}개 남았어요.</p>}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* 결제 요약 */}
          <aside className="rounded-2xl border border-line bg-surface p-5 space-y-3 lg:sticky lg:top-24">
            <h2 className="font-semibold text-fg">결제 예정 금액</h2>
            <dl className="text-sm space-y-2">
              <div className="flex justify-between"><dt className="text-muted">상품 금액</dt><dd className="tabular-nums">{P(originalTotal)}</dd></div>
              {originalTotal > itemsTotal && <div className="flex justify-between"><dt className="text-muted">할인</dt><dd className="text-rose-400 tabular-nums">-{P(originalTotal - itemsTotal)}</dd></div>}
              <div className="flex justify-between"><dt className="text-muted">배송비</dt><dd className="tabular-nums">{shipping ? P(shipping) : '무료'}</dd></div>
            </dl>
            {data && data.shipping.freeOver > 0 && itemsTotal > 0 && itemsTotal < data.shipping.freeOver && (
              <p className="text-xs text-sky-300">{P(data.shipping.freeOver - itemsTotal)} 더 담으면 무료배송</p>
            )}
            <div className="flex justify-between items-end border-t border-line pt-3">
              <span className="text-sm font-semibold text-fg">총 결제 금액</span>
              <span className="text-2xl font-extrabold text-fg tabular-nums">{P(total)}</span>
            </div>
            <p className={`text-xs text-right ${user.balance < total ? 'text-rose-300' : 'text-subtle'}`}>보유 포인트 {P(user.balance)}</p>
            <button disabled={!selected.length}
              onClick={() => router.push(`/shop/checkout?from=cart&items=${encodeItems(selected.map(l => ({ shopItemId: l.shopItemId, quantity: Math.min(l.quantity, l.maxQuantity) })))}`)}
              className="w-full h-12 rounded-xl bg-gradient-to-r from-accent to-accent-strong text-sm font-bold text-white disabled:opacity-40">
              {selected.length ? `${selected.length}개 상품 주문하기` : '주문할 상품을 선택하세요'}
            </button>
          </aside>
        </div>
      )}
    </div>
  )
}

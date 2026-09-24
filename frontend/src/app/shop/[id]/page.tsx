'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Minus, Plus, ShoppingCart, Truck, Package, ChevronRight, Check, RotateCcw } from 'lucide-react'
import { api } from '@/lib/api'
import { TCG_LABELS } from '@/lib/utils'
import { useAuthStore } from '@/lib/store'
import { CATEGORY_LABELS, P, encodeItems, useAddToCart, type ShippingPolicy, type ShopItemCard } from '@/lib/shop'
import { PriceBlock, ProductCard, Stars } from '@/components/shop/ProductCard'
import { ShopTopBar } from '@/components/shop/ShopTopBar'
import { RefundPolicyLink } from '@/components/policy/RefundPolicyModal'

interface Review { id: string; rating: number; content: string; createdAt: string; nickname: string }
interface Detail {
  id: string; name: string; description: string | null; tcgType: string; category: string
  price: number; originalPrice: number | null; stock: number; imageUrl: string | null; images: string[]
  soldOut: boolean; discountRate: number; soldCount: number
  rating: { count: number; avg: number; dist: number[] }
  reviews: Review[]; related: ShopItemCard[]; shipping: ShippingPolicy
}

type Tab = 'detail' | 'reviews' | 'shipping'

export default function ShopItemPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const user = useAuthStore(s => s.user)
  const [qty, setQty] = useState(1)
  const [img, setImg] = useState(0)
  const [tab, setTab] = useState<Tab>('detail')
  const [added, setAdded] = useState(false)
  const [error, setError] = useState('')
  const add = useAddToCart()

  const { data: item, isLoading, isError } = useQuery<Detail>({ queryKey: ['shop-item', id], queryFn: () => api.get(`/shop/${id}`).then(r => r.data) })
  const { data: allReviews } = useQuery<{ reviews: Review[]; total: number }>({
    queryKey: ['shop-reviews', id], queryFn: () => api.get(`/shop/${id}/reviews`).then(r => r.data), enabled: tab === 'reviews',
  })

  if (isLoading) return <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-8"><div className="aspect-square rounded-3xl bg-surface animate-pulse" /><div className="h-96 rounded-3xl bg-surface animate-pulse" /></div>
  if (isError || !item) return <div className="max-w-6xl mx-auto py-24 text-center text-muted">판매하지 않는 상품입니다. <Link href="/shop" className="text-accent-fg hover:underline">샵으로</Link></div>

  const gallery = [item.imageUrl, ...item.images].filter((v): v is string => !!v)
  const maxQty = Math.max(1, Math.min(10, item.stock))
  const itemsTotal = item.price * qty
  const freeLeft = item.shipping.freeOver > 0 ? item.shipping.freeOver - itemsTotal : Infinity

  function requireLogin() { if (!user) { router.push('/login'); return false } return true }
  function addCart() {
    if (!requireLogin()) return
    setError('')
    add.mutate({ shopItemId: item!.id, quantity: qty }, {
      onSuccess: () => { setAdded(true); setTimeout(() => setAdded(false), 2500) },
      onError: (e: unknown) => setError((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? '장바구니에 담지 못했습니다.'),
    })
  }
  function buyNow() {
    if (!requireLogin()) return
    router.push(`/shop/checkout?items=${encodeItems([{ shopItemId: item!.id, quantity: qty }])}`)
  }

  const tabBtn = (t: Tab, label: string) => (
    <button onClick={() => setTab(t)} className={`flex-1 h-12 text-sm border-b-2 transition-colors ${tab === t ? 'border-accent text-fg font-semibold' : 'border-transparent text-muted hover:text-fg'}`}>{label}</button>
  )

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-24 md:pb-0">
      <ShopTopBar />
      <nav className="flex items-center gap-1 text-xs text-muted">
        <Link href="/shop" className="hover:text-fg">샵</Link><ChevronRight size={12} />
        <Link href={`/shop?category=${item.category}#all`} className="hover:text-fg">{CATEGORY_LABELS[item.category]}</Link><ChevronRight size={12} />
        <span className="text-fg-2 truncate">{item.name}</span>
      </nav>

      <div className="grid md:grid-cols-2 gap-8">
        {/* 갤러리 */}
        <div className="space-y-3">
          <div className="relative aspect-square rounded-3xl border border-line bg-sunken overflow-hidden">
            {gallery[img] ? <Image src={gallery[img]} alt={item.name} fill sizes="(max-width:768px) 100vw, 50vw" className={`object-contain p-6 ${item.soldOut ? 'grayscale opacity-60' : ''}`} priority />
              : <div className="absolute inset-0 flex items-center justify-center text-subtle"><Package size={56} /></div>}
            {item.soldOut && <span className="absolute top-4 left-4 px-3 py-1 rounded-full bg-bg/80 border border-line-strong text-sm font-bold text-fg">품절</span>}
          </div>
          {gallery.length > 1 && (
            <div className="flex gap-2 overflow-x-auto">
              {gallery.map((g, n) => (
                <button key={n} onClick={() => setImg(n)} aria-label={`${n + 1}번 이미지`}
                  className={`relative w-20 h-20 shrink-0 rounded-xl border bg-sunken overflow-hidden ${n === img ? 'border-accent' : 'border-line hover:border-line-strong'}`}>
                  <Image src={g} alt="" fill sizes="80px" className="object-contain p-1.5" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 구매 정보 */}
        <div className="space-y-5">
          <div className="space-y-2">
            <p className="text-xs text-muted">{TCG_LABELS[item.tcgType]} · {CATEGORY_LABELS[item.category]}</p>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-fg leading-snug">{item.name}</h1>
            <button onClick={() => setTab('reviews')} className="flex items-center gap-2 text-sm text-muted hover:text-fg">
              <Stars value={item.rating.avg} size={14} />
              {item.rating.count > 0 ? <span>{item.rating.avg.toFixed(1)} · 후기 {item.rating.count}개</span> : <span>아직 후기가 없어요</span>}
              {item.soldCount > 0 && <span className="text-subtle">· {item.soldCount.toLocaleString()}개 판매</span>}
            </button>
          </div>

          <div className="rounded-2xl border border-line bg-surface p-5 space-y-4">
            <PriceBlock price={item.price} originalPrice={item.originalPrice} discountRate={item.discountRate} size="lg" />
            <div className="text-sm space-y-1.5 border-t border-line pt-4">
              <p className="flex gap-3"><span className="w-14 shrink-0 text-muted">배송비</span>
                <span className="text-fg-2"><Truck size={14} className="inline mr-1 -mt-0.5" />{P(item.shipping.fee)}{item.shipping.freeOver > 0 && <span className="text-muted"> ({P(item.shipping.freeOver)} 이상 구매 시 무료)</span>}</span></p>
              <p className="flex gap-3"><span className="w-14 shrink-0 text-muted">발송</span><span className="text-fg-2">결제 후 영업일 기준 1~2일 내 발송</span></p>
              <p className="flex gap-3"><span className="w-14 shrink-0 text-muted">재고</span>
                <span className={item.soldOut ? 'text-rose-300' : item.stock <= 5 ? 'text-orange-300' : 'text-fg-2'}>{item.soldOut ? '품절' : item.stock <= 5 ? `${item.stock}개 남음 · 품절 임박` : '구매 가능'}</span></p>
            </div>
          </div>

          {!item.soldOut && (
            <div className="rounded-2xl border border-line bg-surface p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted">수량</span>
                <div className="flex items-center rounded-xl border border-line">
                  <button onClick={() => setQty(q => Math.max(1, q - 1))} aria-label="수량 줄이기" className="w-10 h-10 flex items-center justify-center text-fg-3 hover:text-fg"><Minus size={14} /></button>
                  <span className="w-10 text-center font-semibold tabular-nums">{qty}</span>
                  <button onClick={() => setQty(q => Math.min(maxQty, q + 1))} aria-label="수량 늘리기" className="w-10 h-10 flex items-center justify-center text-fg-3 hover:text-fg"><Plus size={14} /></button>
                </div>
              </div>
              <div className="flex items-end justify-between border-t border-line pt-4">
                <span className="text-sm text-muted">총 상품 금액</span>
                <span className="text-2xl font-extrabold text-fg tabular-nums">{P(itemsTotal)}</span>
              </div>
              {freeLeft > 0 && freeLeft !== Infinity && <p className="text-xs text-sky-300">{P(freeLeft)} 더 담으면 무료배송이에요</p>}
              {freeLeft <= 0 && <p className="text-xs text-emerald-300">무료배송 대상이에요</p>}
              {user && user.balance < itemsTotal && <p className="text-xs text-rose-300">보유 포인트 {P(user.balance)} · <Link href="/charge" className="underline">충전하기</Link></p>}
              {error && <p className="text-xs text-rose-300">{error}</p>}
              <div className="hidden md:grid grid-cols-2 gap-2">
                <button onClick={addCart} disabled={add.isPending} className="h-13 py-3.5 rounded-xl border border-line-strong text-sm font-semibold text-fg hover:bg-surface-2 inline-flex items-center justify-center gap-1.5 disabled:opacity-50">
                  {added ? <><Check size={16} className="text-emerald-300" />담았어요</> : <><ShoppingCart size={16} />장바구니</>}
                </button>
                <button onClick={buyNow} className="py-3.5 rounded-xl bg-gradient-to-r from-accent to-accent-strong text-sm font-bold text-white shadow-[0_8px_28px_-6px_rgba(139,92,246,0.6)]">바로 구매</button>
              </div>
              {added && <Link href="/shop/cart" className="hidden md:block text-center text-xs text-accent-fg hover:underline">장바구니로 이동 →</Link>}
            </div>
          )}
        </div>
      </div>

      {/* 상세 탭 */}
      {/* overflow-hidden 없이 둬야 탭 바 sticky가 페이지 기준으로 동작 */}
      <section className="rounded-3xl border border-line bg-surface">
        <div className="flex border-b border-line sticky top-16 bg-surface z-10 rounded-t-3xl">
          {tabBtn('detail', '상품 상세')}
          {tabBtn('reviews', `구매 후기 ${item.rating.count}`)}
          {tabBtn('shipping', '배송·교환·환불')}
        </div>
        <div className="p-5 sm:p-8">
          {tab === 'detail' && (
            <div className="space-y-6">
              {item.description ? <p className="text-sm text-fg-2 leading-relaxed whitespace-pre-line">{item.description}</p> : <p className="text-sm text-muted">상세 설명이 없습니다.</p>}
              {item.images.map((g, n) => (
                <div key={n} className="relative w-full max-w-xl mx-auto aspect-square"><Image src={g} alt="" fill sizes="600px" className="object-contain" /></div>
              ))}
            </div>
          )}
          {tab === 'reviews' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row gap-6 sm:items-center">
                <div className="text-center sm:w-40">
                  <p className="text-4xl font-extrabold text-fg">{item.rating.avg.toFixed(1)}</p>
                  <Stars value={item.rating.avg} size={16} />
                  <p className="text-xs text-muted mt-1">후기 {item.rating.count}개</p>
                </div>
                <div className="flex-1 space-y-1">
                  {[5, 4, 3, 2, 1].map(s => {
                    const n = item.rating.dist[s - 1]
                    return (
                      <div key={s} className="flex items-center gap-2 text-xs text-muted">
                        <span className="w-6">{s}점</span>
                        <span className="flex-1 h-2 rounded-full bg-surface-2 overflow-hidden"><span className="block h-full bg-amber-400" style={{ width: `${item.rating.count ? (n / item.rating.count) * 100 : 0}%` }} /></span>
                        <span className="w-6 text-right tabular-nums">{n}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
              <p className="text-xs text-subtle">후기는 이 상품을 구매하고 발송된 뒤 <Link href="/shop/orders" className="text-accent-fg hover:underline">주문내역</Link>에서 작성할 수 있어요.</p>
              <ul className="divide-y divide-line">
                {(allReviews?.reviews ?? item.reviews).map(r => (
                  <li key={r.id} className="py-4 space-y-1.5">
                    <div className="flex items-center gap-2 text-xs text-muted"><Stars value={r.rating} /><span>{r.nickname}</span><span>· {new Date(r.createdAt).toLocaleDateString('ko-KR')}</span></div>
                    <p className="text-sm text-fg-2 whitespace-pre-line">{r.content}</p>
                  </li>
                ))}
                {item.rating.count === 0 && <li className="py-8 text-center text-sm text-muted">첫 후기를 남겨주세요.</li>}
              </ul>
            </div>
          )}
          {tab === 'shipping' && (
            <div className="space-y-4 text-sm text-fg-2 leading-relaxed">
              <div><p className="font-semibold text-fg mb-1 flex items-center gap-1.5"><Truck size={15} />배송 안내</p>
                <p>기본 배송비 {P(item.shipping.fee)}{item.shipping.freeOver > 0 && `, ${P(item.shipping.freeOver)} 이상 구매 시 무료배송`}입니다. 결제 후 영업일 기준 1~2일 안에 발송하며, 발송되면 주문내역에서 운송장 번호를 확인할 수 있어요.</p></div>
              <div><p className="font-semibold text-fg mb-1 flex items-center gap-1.5"><RotateCcw size={15} />교환·환불</p>
                <p>미개봉 상품은 수령 후 7일 안에 교환·환불을 요청할 수 있어요. 개봉한 카드 상품은 상품 특성상 교환·환불이 어렵습니다. 자세한 내용은 <RefundPolicyLink className="text-accent-fg hover:underline" />을 확인해주세요.</p></div>
            </div>
          )}
        </div>
      </section>

      {item.related.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-bold text-fg">함께 보면 좋은 상품</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">{item.related.slice(0, 5).map(r => <ProductCard key={r.id} item={r} />)}</div>
        </section>
      )}

      {/* 모바일 하단 구매 바 */}
      {!item.soldOut && (
        <div className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-line bg-bg/95 backdrop-blur px-4 py-3 flex gap-2">
          <button onClick={addCart} disabled={add.isPending} aria-label="장바구니 담기"
            className="w-14 h-12 shrink-0 rounded-xl border border-line-strong inline-flex items-center justify-center text-fg">{added ? <Check size={18} className="text-emerald-300" /> : <ShoppingCart size={18} />}</button>
          <button onClick={buyNow} className="flex-1 h-12 rounded-xl bg-gradient-to-r from-accent to-accent-strong text-sm font-bold text-white">{P(itemsTotal)} 바로 구매</button>
        </div>
      )}
    </div>
  )
}

'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { Package, MapPin, AlertCircle, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore, useAuthHydrated } from '@/lib/store'
import { P, decodeItems, shippingFeeFor, type ShippingPolicy } from '@/lib/shop'
import { ShopTopBar } from '@/components/shop/ShopTopBar'
import { RefundPolicyLink } from '@/components/policy/RefundPolicyModal'

interface ItemInfo { id: string; name: string; price: number; imageUrl: string | null; stock: number; soldOut: boolean; shipping: ShippingPolicy }
const EMPTY = { recipientName: '', recipientPhone: '', zipCode: '', address: '', addressDetail: '', shippingMemo: '' }
const MEMOS = ['', '문 앞에 놓아주세요', '경비실에 맡겨주세요', '배송 전 연락 부탁드립니다', '파손 주의 부탁드립니다']

function CheckoutContent() {
  const router = useRouter()
  const params = useSearchParams()
  const qc = useQueryClient()
  const user = useAuthStore(s => s.user)
  const hydrated = useAuthHydrated()
  const lines = useMemo(() => decodeItems(params.get('items')), [params])
  const fromCart = params.get('from') === 'cart'
  const [addr, setAddr] = useState(EMPTY)
  const [agree, setAgree] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { if (hydrated && !user) router.replace('/login') }, [hydrated, user, router])

  // 주문 상품 최신 정보 (가격·재고)
  const itemQs = useQueries({ queries: lines.map(l => ({ queryKey: ['shop-item', l.shopItemId], queryFn: () => api.get<ItemInfo>(`/shop/${l.shopItemId}`).then(r => r.data) })) })
  const { data: last } = useQuery<{ address: typeof EMPTY | null }>({ queryKey: ['shop-last-address'], queryFn: () => api.get('/shop/last-address').then(r => r.data), enabled: !!user })

  const loaded = itemQs.every(q => q.data)
  const items = lines.map((l, i) => ({ ...l, info: itemQs[i]?.data }))
  const itemsTotal = items.reduce((s, l) => s + (l.info?.price ?? 0) * l.quantity, 0)
  const policy = items.find(i => i.info)?.info?.shipping
  const shipping = policy ? shippingFeeFor(itemsTotal, policy) : 0
  const total = itemsTotal + shipping
  const unavailable = items.filter(i => i.info && (i.info.soldOut || i.info.stock < i.quantity))

  const pay = useMutation({
    mutationFn: () => api.post<{ orderNo: string }>('/shop/checkout', {
      items: lines, fromCart, expectedTotal: total, ...addr,
      addressDetail: addr.addressDetail || undefined, shippingMemo: addr.shippingMemo || undefined,
    }).then(r => r.data),
    onSuccess: r => {
      qc.invalidateQueries({ queryKey: ['shop-cart'] })
      qc.invalidateQueries({ queryKey: ['me'] })
      useAuthStore.setState(s => (s.user ? { user: { ...s.user, balance: s.user.balance - total } } : s))
      router.replace(`/shop/orders/${r.orderNo}?done=1`)
    },
    onError: (e: unknown) => setError((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? '결제에 실패했습니다.'),
  })

  if (!user) return null
  if (!lines.length) return <div className="max-w-3xl mx-auto py-24 text-center text-muted">주문할 상품이 없습니다. <Link href="/shop" className="text-accent-fg hover:underline">샵으로</Link></div>

  const addrValid = addr.recipientName.trim() && /^[0-9-]{9,20}$/.test(addr.recipientPhone.trim()) && addr.zipCode.trim() && addr.address.trim()
  const enough = user.balance >= total
  const field = 'w-full h-11 bg-sunken border border-line focus:border-accent/60 rounded-xl px-3 text-sm text-fg placeholder:text-subtle focus:outline-none'

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <ShopTopBar />
      <h1 className="text-2xl font-bold text-fg">주문서</h1>
      <div className="grid lg:grid-cols-[1fr_340px] gap-6 items-start">
        <div className="space-y-5">
          {/* 주문 상품 */}
          <section className="rounded-2xl border border-line bg-surface">
            <h2 className="px-5 py-3 border-b border-line text-sm font-semibold text-fg">주문 상품 {lines.length}개</h2>
            <ul className="divide-y divide-line">
              {items.map(l => (
                <li key={l.shopItemId} className="flex items-center gap-3 px-5 py-3">
                  <span className="relative w-14 h-14 shrink-0 rounded-lg bg-sunken border border-line overflow-hidden">
                    {l.info?.imageUrl ? <Image src={l.info.imageUrl} alt="" fill sizes="56px" className="object-contain p-1" /> : <Package size={20} className="m-auto mt-4 text-subtle" />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-fg truncate">{l.info?.name ?? '불러오는 중…'}</span>
                    <span className="block text-xs text-muted">{l.quantity}개 · 개당 {l.info ? P(l.info.price) : '-'}</span>
                  </span>
                  <span className="text-sm font-semibold tabular-nums">{l.info ? P(l.info.price * l.quantity) : ''}</span>
                </li>
              ))}
            </ul>
            {unavailable.length > 0 && <p className="px-5 py-3 text-xs text-rose-300 border-t border-line">품절되었거나 재고가 부족한 상품이 있어요. 수량을 조정해주세요.</p>}
          </section>

          {/* 배송지 */}
          <section className="rounded-2xl border border-line bg-surface p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-fg flex items-center gap-1.5"><MapPin size={15} />배송지</h2>
              {last?.address && (
                <button type="button" onClick={() => setAddr(a => ({ ...a, ...Object.fromEntries(Object.entries(last.address!).map(([k, v]) => [k, v ?? ''])) }))}
                  className="h-8 px-3 rounded-lg border border-line text-xs text-fg-2 hover:bg-surface-2">최근 배송지 불러오기</button>
              )}
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              <input className={field} placeholder="받는 분 이름" value={addr.recipientName} onChange={e => setAddr(a => ({ ...a, recipientName: e.target.value }))} />
              <input className={field} placeholder="연락처 (010-0000-0000)" inputMode="tel" value={addr.recipientPhone} onChange={e => setAddr(a => ({ ...a, recipientPhone: e.target.value }))} />
            </div>
            <div className="grid grid-cols-[120px_1fr] gap-2">
              <input className={field} placeholder="우편번호" inputMode="numeric" value={addr.zipCode} onChange={e => setAddr(a => ({ ...a, zipCode: e.target.value }))} />
              <input className={field} placeholder="기본 주소" value={addr.address} onChange={e => setAddr(a => ({ ...a, address: e.target.value }))} />
            </div>
            <input className={field} placeholder="상세 주소 (동·호수)" value={addr.addressDetail} onChange={e => setAddr(a => ({ ...a, addressDetail: e.target.value }))} />
            <select className={`${field} cursor-pointer`} value={MEMOS.includes(addr.shippingMemo) ? addr.shippingMemo : '__custom'}
              onChange={e => setAddr(a => ({ ...a, shippingMemo: e.target.value === '__custom' ? ' ' : e.target.value }))} aria-label="배송 메모">
              {MEMOS.map(m => <option key={m} value={m}>{m || '배송 메모 선택 (선택)'}</option>)}
              <option value="__custom">직접 입력</option>
            </select>
            {!MEMOS.includes(addr.shippingMemo) && (
              <input className={field} placeholder="배송 메모 직접 입력" value={addr.shippingMemo.trimStart()} onChange={e => setAddr(a => ({ ...a, shippingMemo: e.target.value }))} />
            )}
          </section>
        </div>

        {/* 결제 */}
        <aside className="rounded-2xl border border-line bg-surface p-5 space-y-3 lg:sticky lg:top-24">
          <h2 className="font-semibold text-fg">결제 정보</h2>
          <dl className="text-sm space-y-2">
            <div className="flex justify-between"><dt className="text-muted">상품 금액</dt><dd className="tabular-nums">{P(itemsTotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">배송비</dt><dd className="tabular-nums">{shipping ? P(shipping) : '무료'}</dd></div>
          </dl>
          <div className="flex justify-between items-end border-t border-line pt-3">
            <span className="text-sm font-semibold">총 결제 포인트</span>
            <span className="text-2xl font-extrabold text-fg tabular-nums">{P(total)}</span>
          </div>
          <div className="rounded-xl bg-sunken px-3 py-2 text-xs space-y-1">
            <p className="flex justify-between"><span className="text-muted">보유 포인트</span><span className="tabular-nums">{P(user.balance)}</span></p>
            <p className="flex justify-between"><span className="text-muted">결제 후 잔액</span><span className={`tabular-nums ${enough ? 'text-fg' : 'text-rose-300'}`}>{P(user.balance - total)}</span></p>
          </div>
          {!enough && <p className="text-xs text-rose-300">포인트가 {P(total - user.balance)} 부족해요. <Link href="/charge" className="underline">충전하기</Link></p>}
          <label className="flex items-start gap-2 text-xs text-muted cursor-pointer">
            <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} className="mt-0.5" />
            <span>주문 상품·결제 금액을 확인했으며, <RefundPolicyLink className="underline text-fg-2 hover:text-fg" />에 동의합니다.</span>
          </label>
          {error && <p className="flex items-start gap-1.5 text-xs text-rose-300"><AlertCircle size={13} className="shrink-0 mt-0.5" />{error}</p>}
          <button onClick={() => { setError(''); pay.mutate() }}
            disabled={!loaded || !addrValid || !agree || !enough || unavailable.length > 0 || pay.isPending}
            className="w-full h-12 rounded-xl bg-gradient-to-r from-accent to-accent-strong text-sm font-bold text-white disabled:opacity-40 inline-flex items-center justify-center gap-2">
            {pay.isPending && <Loader2 size={16} className="animate-spin" />}{P(total)} 결제하기
          </button>
          {!addrValid && <p className="text-[11px] text-subtle text-center">받는 분·연락처·주소를 입력하면 결제할 수 있어요.</p>}
        </aside>
      </div>
    </div>
  )
}

export default function CheckoutPage() {
  return <Suspense fallback={<div className="max-w-5xl mx-auto h-96 rounded-2xl bg-surface animate-pulse" />}><CheckoutContent /></Suspense>
}

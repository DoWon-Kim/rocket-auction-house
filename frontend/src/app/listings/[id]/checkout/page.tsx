'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useParams, useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, ChevronLeft, Loader2, ShieldCheck, Truck, PackageCheck, Wallet } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore, useAuthHydrated } from '@/lib/store'
import { CONDITION_LABELS } from '@/lib/utils'
import { type MarketListing, listingTitle, listingThumb } from '@/lib/market'
import { AddressForm, EMPTY_ADDRESS, isAddressValid, addressPayload } from '@/components/market/AddressForm'
import { RefundPolicyLink } from '@/components/policy/RefundPolicyModal'

interface CheckoutListing extends MarketListing {
  sellerId: string
  reservedForId: string | null
  reservedPrice: number | null
  seller: { id: string; nickname: string; avatarUrl?: string | null }
}

const P = (n: number) => `${n.toLocaleString()}P`

// 결제 금액 = 예약 합의가 또는 판매가 (+ 배송비)
function payablePrice(l: CheckoutListing, userId: string): number | null {
  if (l.status === 'RESERVED') return l.reservedForId === userId ? (l.reservedPrice ?? l.buyNowPrice ?? null) : null
  if (l.status === 'ACTIVE' && l.listingType === 'BUY_NOW') return l.buyNowPrice ?? null
  return null
}

export default function ListingCheckoutPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const qc = useQueryClient()
  const user = useAuthStore(s => s.user)
  const hydrated = useAuthHydrated()
  const [addr, setAddr] = useState(EMPTY_ADDRESS)
  const [agree, setAgree] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { if (hydrated && !user) router.replace('/login') }, [hydrated, user, router])

  const { data: listing, isLoading } = useQuery<CheckoutListing>({
    queryKey: ['listing', id], queryFn: () => api.get(`/listings/${id}`).then(r => r.data), enabled: !!user,
  })

  const price = listing && user ? payablePrice(listing, user.id) : null
  const shipping = listing?.shippingFee ?? 0
  const total = (price ?? 0) + shipping

  const pay = useMutation({
    mutationFn: () => api.post<{ roomId: string }>(`/listings/${id}/checkout`, { ...addressPayload(addr), expectedTotal: total }).then(r => r.data),
    onSuccess: r => {
      useAuthStore.setState(s => (s.user ? { user: { ...s.user, balance: s.user.balance - total } } : s))
      qc.invalidateQueries({ queryKey: ['listing', id] })
      qc.invalidateQueries({ queryKey: ['my-purchases'] })
      router.replace(`/chat/${r.roomId}?paid=1`)
    },
    onError: (e: unknown) => setError((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? '결제에 실패했습니다.'),
  })

  if (!user) return null
  if (isLoading) return <div className="max-w-4xl mx-auto h-96 rounded-2xl bg-surface animate-pulse" />
  if (!listing) return <div className="max-w-3xl mx-auto py-24 text-center text-muted">상품을 찾을 수 없습니다.</div>

  if (price == null) {
    const why = listing.sellerId === user.id ? '내 상품은 구매할 수 없어요.'
      : listing.status === 'RESERVED' ? '다른 구매자와 예약중인 상품이에요.'
      : listing.status !== 'ACTIVE' ? '판매가 끝난 상품이에요.'
      : listing.listingType === 'OFFER' ? '가격 제안 후 판매자가 수락하면 결제할 수 있어요.'
      : '이 상품은 안전결제로 구매할 수 없어요.'
    return (
      <div className="max-w-md mx-auto py-24 text-center space-y-4">
        <AlertCircle size={32} className="mx-auto text-subtle" />
        <p className="text-fg-2">{why}</p>
        <Link href={`/listings/${id}`} className="inline-flex items-center gap-1 text-sm text-accent-fg hover:underline"><ChevronLeft size={14} />상품으로 돌아가기</Link>
      </div>
    )
  }

  const thumb = listingThumb(listing)
  const enough = user.balance >= total
  const valid = isAddressValid(addr)

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link href={`/listings/${id}`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ChevronLeft size={15} />상품으로</Link>
      <div>
        <h1 className="text-2xl font-bold text-fg">안전결제</h1>
        <p className="text-sm text-muted mt-1">구매 확정 전까지 결제 대금은 로켓AH가 안전하게 보관해요.</p>
      </div>

      {/* 진행 단계 */}
      <ol className="grid grid-cols-4 gap-2 text-center">
        {[
          { icon: Wallet, label: '결제' },
          { icon: Truck, label: '판매자 발송' },
          { icon: PackageCheck, label: '수령 · 구매확정' },
          { icon: ShieldCheck, label: '판매자 정산' },
        ].map((s, i) => (
          <li key={s.label} className={`rounded-xl border px-2 py-2.5 ${i === 0 ? 'border-accent-line bg-accent-tint text-accent-soft' : 'border-line bg-surface text-muted'}`}>
            <s.icon size={16} className="mx-auto mb-1" />
            <span className="text-[11px] font-medium">{s.label}</span>
          </li>
        ))}
      </ol>

      <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
        <div className="space-y-5">
          <section className="rounded-2xl border border-line bg-surface p-4 flex gap-3">
            <span className="relative w-20 h-20 shrink-0 rounded-xl overflow-hidden bg-sunken border border-line">
              {thumb && <Image src={thumb} alt="" fill sizes="80px" className="object-cover" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-fg font-medium line-clamp-2">{listingTitle(listing)}</p>
              <p className="text-xs text-muted mt-0.5">{CONDITION_LABELS[listing.condition]} · 판매자 {listing.seller.nickname}</p>
              {listing.status === 'RESERVED' && <p className="text-[11px] text-emerald-400 mt-1">판매자와 합의한 금액으로 결제해요</p>}
              <p className="text-base font-bold text-fg mt-1 tabular-nums">{P(price)}</p>
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-surface p-5">
            <AddressForm value={addr} onChange={setAddr} />
          </section>
        </div>

        <aside className="rounded-2xl border border-line bg-surface p-5 space-y-3 lg:sticky lg:top-24">
          <h2 className="font-semibold text-fg">결제 금액</h2>
          <dl className="text-sm space-y-2">
            <div className="flex justify-between"><dt className="text-muted">상품 금액</dt><dd className="tabular-nums">{P(price)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">배송비</dt><dd className="tabular-nums">{shipping ? P(shipping) : '포함'}</dd></div>
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
            <span>상품 정보와 결제 금액을 확인했으며, <RefundPolicyLink className="underline text-fg-2 hover:text-fg" />에 동의합니다.</span>
          </label>
          {error && <p className="flex items-start gap-1.5 text-xs text-rose-300"><AlertCircle size={13} className="shrink-0 mt-0.5" />{error}</p>}
          <button onClick={() => { setError(''); pay.mutate() }} disabled={!valid || !agree || !enough || pay.isPending}
            className="w-full h-12 rounded-xl bg-gradient-to-r from-accent to-accent-strong text-sm font-bold text-white disabled:opacity-40 inline-flex items-center justify-center gap-2">
            {pay.isPending && <Loader2 size={16} className="animate-spin" />}{P(total)} 안전결제
          </button>
          {!valid && <p className="text-[11px] text-subtle text-center">받는 분·연락처·주소를 입력하면 결제할 수 있어요.</p>}
          <p className="text-[11px] text-subtle leading-relaxed">판매자가 3일 안에 발송하지 않으면 자동 취소·환불돼요. 발송 후 3일이 지나면 자동으로 구매 확정됩니다.</p>
        </aside>
      </div>
    </div>
  )
}

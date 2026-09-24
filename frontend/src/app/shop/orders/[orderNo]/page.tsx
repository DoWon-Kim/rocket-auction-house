'use client'

import { Suspense, useEffect } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, MapPin } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore, useAuthHydrated } from '@/lib/store'
import { P } from '@/lib/shop'
import { ShopTopBar } from '@/components/shop/ShopTopBar'
import { OrderLines, type OrderLine } from '@/components/shop/OrderLines'

interface Purchase {
  orderNo: string; itemsTotal: number; shippingFee: number; totalPaid: number; createdAt: string
  recipientName: string; recipientPhone: string; zipCode: string; address: string; addressDetail: string | null; shippingMemo: string | null
  orders: OrderLine[]
}

function OrderContent() {
  const { orderNo } = useParams<{ orderNo: string }>()
  const done = useSearchParams().get('done') === '1'
  const router = useRouter()
  const user = useAuthStore(s => s.user)
  const hydrated = useAuthHydrated()
  useEffect(() => { if (hydrated && !user) router.replace('/login') }, [hydrated, user, router])

  const { data: p, isLoading, isError } = useQuery<Purchase>({
    queryKey: ['shop-purchase', orderNo], queryFn: () => api.get(`/shop/purchases/${orderNo}`).then(r => r.data), enabled: !!user,
  })
  if (!user) return null
  if (isLoading) return <div className="max-w-3xl mx-auto h-72 rounded-2xl bg-surface animate-pulse" />
  if (isError || !p) return <div className="max-w-3xl mx-auto py-24 text-center text-muted">주문을 찾을 수 없습니다. <Link href="/shop/orders" className="text-accent-fg hover:underline">주문내역</Link></div>

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <ShopTopBar />
      {done && (
        <section className="rounded-3xl border border-emerald-400/30 bg-emerald-500/10 p-6 text-center space-y-2">
          <CheckCircle2 size={40} className="mx-auto text-emerald-300" />
          <h1 className="text-xl font-bold text-fg">주문이 완료되었어요</h1>
          <p className="text-sm text-muted">영업일 기준 1~2일 안에 발송해 드릴게요. 발송되면 운송장 번호를 여기서 확인할 수 있어요.</p>
        </section>
      )}
      <section className="rounded-2xl border border-line bg-surface p-5 space-y-1">
        <p className="text-xs text-muted">주문번호</p>
        <p className="font-mono text-lg font-bold text-fg">{p.orderNo}</p>
        <p className="text-xs text-subtle">{new Date(p.createdAt).toLocaleString('ko-KR')}</p>
      </section>
      <section className="rounded-2xl border border-line bg-surface px-5 py-3">
        <h2 className="text-sm font-semibold text-fg py-1">주문 상품</h2>
        <OrderLines lines={p.orders} />
      </section>
      <div className="grid sm:grid-cols-2 gap-4">
        <section className="rounded-2xl border border-line bg-surface p-5 space-y-1 text-sm">
          <h2 className="font-semibold text-fg flex items-center gap-1.5 mb-2"><MapPin size={14} />배송지</h2>
          <p className="text-fg-2">{p.recipientName} · {p.recipientPhone}</p>
          <p className="text-muted">({p.zipCode}) {p.address} {p.addressDetail}</p>
          {p.shippingMemo && <p className="text-subtle text-xs">메모: {p.shippingMemo}</p>}
        </section>
        <section className="rounded-2xl border border-line bg-surface p-5 text-sm space-y-2">
          <h2 className="font-semibold text-fg mb-2">결제 금액</h2>
          <p className="flex justify-between"><span className="text-muted">상품 금액</span><span className="tabular-nums">{P(p.itemsTotal)}</span></p>
          <p className="flex justify-between"><span className="text-muted">배송비</span><span className="tabular-nums">{p.shippingFee ? P(p.shippingFee) : '무료'}</span></p>
          <p className="flex justify-between border-t border-line pt-2 font-bold"><span>총 결제</span><span className="tabular-nums">{P(p.totalPaid)}</span></p>
        </section>
      </div>
      <div className="flex justify-center gap-2">
        <Link href="/shop/orders" className="h-11 px-5 inline-flex items-center rounded-full border border-line text-sm text-fg-2 hover:bg-surface-2">주문내역</Link>
        <Link href="/shop" className="h-11 px-5 inline-flex items-center rounded-full bg-accent text-sm font-semibold text-white">쇼핑 계속하기</Link>
      </div>
    </div>
  )
}

export default function OrderPage() {
  return <Suspense fallback={<div className="max-w-3xl mx-auto h-72 rounded-2xl bg-surface animate-pulse" />}><OrderContent /></Suspense>
}

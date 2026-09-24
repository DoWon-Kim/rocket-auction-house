'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Receipt, ChevronRight, ChevronLeft } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore, useAuthHydrated } from '@/lib/store'
import { P } from '@/lib/shop'
import { ShopTopBar } from '@/components/shop/ShopTopBar'
import { OrderLines, type OrderLine } from '@/components/shop/OrderLines'

interface Purchase { id: string; orderNo: string; itemsTotal: number; shippingFee: number; totalPaid: number; createdAt: string; orders: OrderLine[] }

export default function MyShopOrdersPage() {
  const router = useRouter()
  const user = useAuthStore(s => s.user)
  const hydrated = useAuthHydrated()
  const [page, setPage] = useState(1)
  useEffect(() => { if (hydrated && !user) router.replace('/login') }, [hydrated, user, router])

  const { data, isLoading } = useQuery<{ purchases: Purchase[]; total: number; legacyOrders: Array<OrderLine & { createdAt: string }> }>({
    queryKey: ['shop-purchases', page], queryFn: () => api.get('/shop/purchases', { params: { page } }).then(r => r.data), enabled: !!user,
  })
  const pages = data ? Math.ceil(data.total / 10) : 0
  if (!user) return null

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <ShopTopBar />
      <h1 className="text-2xl font-bold text-fg flex items-center gap-2"><Receipt size={22} />주문내역</h1>
      {isLoading ? <div className="h-48 rounded-2xl bg-surface animate-pulse" /> : !data?.purchases.length && !data?.legacyOrders.length ? (
        <div className="py-20 text-center rounded-3xl border border-line bg-surface text-muted space-y-3">
          <p>아직 주문한 상품이 없어요.</p>
          <Link href="/shop" className="inline-flex h-10 px-5 items-center rounded-full bg-accent text-sm font-semibold text-white">쇼핑하러 가기</Link>
        </div>
      ) : (
        <div className="space-y-4">
          {data.purchases.map(p => (
            <section key={p.id} className="rounded-2xl border border-line bg-surface px-5 py-3">
              <Link href={`/shop/orders/${p.orderNo}`} className="flex items-center justify-between py-1 group">
                <span className="text-sm"><b className="text-fg">{new Date(p.createdAt).toLocaleDateString('ko-KR')}</b> <span className="text-muted font-mono text-xs ml-1">{p.orderNo}</span></span>
                <span className="flex items-center gap-1 text-xs text-muted group-hover:text-fg">{P(p.totalPaid)} 결제 <ChevronRight size={14} /></span>
              </Link>
              <OrderLines lines={p.orders} />
            </section>
          ))}
          {data.legacyOrders.length > 0 && (
            <section className="rounded-2xl border border-line bg-surface px-5 py-3">
              <p className="text-xs text-muted py-1">이전 주문</p>
              <OrderLines lines={data.legacyOrders} />
            </section>
          )}
          {pages > 1 && (
            <div className="flex items-center justify-center gap-3 text-sm text-muted">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} aria-label="이전" className="w-9 h-9 rounded-lg border border-line inline-flex items-center justify-center disabled:opacity-30"><ChevronLeft size={16} /></button>
              <span>{page} / {pages}</span>
              <button disabled={page >= pages} onClick={() => setPage(p => p + 1)} aria-label="다음" className="w-9 h-9 rounded-lg border border-line inline-flex items-center justify-center disabled:opacity-30"><ChevronRight size={16} /></button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

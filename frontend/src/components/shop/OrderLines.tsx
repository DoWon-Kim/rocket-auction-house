'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Package, Star } from 'lucide-react'
import { api } from '@/lib/api'
import { P, SHIP_STATUS } from '@/lib/shop'

export interface OrderLine {
  id: string; quantity: number; unitPrice: number; totalPrice: number; shippingStatus: string
  courier: string | null; trackingNumber: string | null
  shopItem: { id: string; name: string; imageUrl: string | null }
  review: { id: string; rating: number } | null
}

// 후기 작성 (발송 이후 주문 상품 1건당 1개)
function ReviewForm({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const [rating, setRating] = useState(5)
  const [content, setContent] = useState('')
  const [error, setError] = useState('')
  const save = useMutation({
    mutationFn: () => api.post(`/shop/orders/${orderId}/review`, { rating, content }),
    onSuccess: onDone,
    onError: (e: unknown) => setError((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? '저장하지 못했습니다.'),
  })
  return (
    <div className="mt-3 rounded-xl border border-line bg-sunken p-3 space-y-2">
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map(i => (
          <button key={i} type="button" onClick={() => setRating(i)} aria-label={`${i}점`}>
            <Star size={20} className={i <= rating ? 'fill-amber-400 text-amber-400' : 'text-line-strong'} />
          </button>
        ))}
        <span className="ml-2 text-xs text-muted">{rating}점</span>
      </div>
      <textarea value={content} onChange={e => setContent(e.target.value)} rows={3} maxLength={1000} placeholder="상품은 어떠셨나요? (5자 이상)"
        className="w-full bg-surface border border-line focus:border-accent/60 rounded-lg px-3 py-2 text-sm text-fg placeholder:text-subtle focus:outline-none resize-none" />
      {error && <p className="text-xs text-rose-300">{error}</p>}
      <button onClick={() => save.mutate()} disabled={save.isPending || content.trim().length < 5}
        className="h-9 px-4 rounded-lg bg-accent text-xs font-semibold text-white disabled:opacity-40">후기 등록</button>
    </div>
  )
}

export function OrderLines({ lines }: { lines: OrderLine[] }) {
  const qc = useQueryClient()
  const [writing, setWriting] = useState<string | null>(null)
  return (
    <ul className="divide-y divide-line">
      {lines.map(o => {
        const st = SHIP_STATUS[o.shippingStatus] ?? { label: o.shippingStatus, cls: 'bg-surface-2 text-muted' }
        const canReview = !o.review && (o.shippingStatus === 'SHIPPED' || o.shippingStatus === 'DELIVERED')
        return (
          <li key={o.id} className="py-3">
            <div className="flex items-center gap-3">
              <Link href={`/shop/${o.shopItem.id}`} className="relative w-16 h-16 shrink-0 rounded-lg bg-sunken border border-line overflow-hidden">
                {o.shopItem.imageUrl ? <Image src={o.shopItem.imageUrl} alt="" fill sizes="64px" className="object-contain p-1" /> : <Package size={20} className="m-auto mt-5 text-subtle" />}
              </Link>
              <div className="flex-1 min-w-0">
                <Link href={`/shop/${o.shopItem.id}`} className="block text-sm text-fg truncate hover:underline">{o.shopItem.name}</Link>
                <p className="text-xs text-muted">{o.quantity}개 · {P(o.totalPrice)}</p>
                {o.trackingNumber && <p className="text-[11px] text-subtle">{o.courier ?? '택배'} {o.trackingNumber}</p>}
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${st.cls}`}>{st.label}</span>
                {o.review ? <span className="text-[11px] text-subtle">후기 작성 완료 ★{o.review.rating}</span>
                  : canReview && <button onClick={() => setWriting(w => (w === o.id ? null : o.id))} className="text-[11px] text-accent-fg hover:underline">후기 쓰기</button>}
              </div>
            </div>
            {writing === o.id && <ReviewForm orderId={o.id} onDone={() => { setWriting(null); qc.invalidateQueries({ queryKey: ['shop-purchases'] }); qc.invalidateQueries({ queryKey: ['shop-purchase'] }) }} />}
          </li>
        )
      })}
    </ul>
  )
}

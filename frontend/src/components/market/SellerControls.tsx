'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createPortal } from 'react-dom'
import { useMutation } from '@tanstack/react-query'
import { ArrowUpToLine, CalendarCheck, Pencil, Ban, MessageCircle, X, Loader2, Undo2 } from 'lucide-react'
import { api } from '@/lib/api'
import { CONDITION_LABELS } from '@/lib/utils'
import { timeAgo } from '@/lib/market'
import { PhotoPicker } from '@/components/market/PhotoPicker'

export interface OwnerListing {
  id: string
  status: string
  listingType: string
  condition: string
  title: string | null
  description: string | null
  imageUrls: string[]
  buyNowPrice: number | null
  minOfferPrice: number | null
  shippingFee: number
  negotiable: boolean
  bumpedAt: string
  reservedPrice: number | null
  reservedFor: { id: string; nickname: string } | null
  chatRooms?: Array<{ id: string; buyerId: string; lastMessageAt: string | null; buyer: { id: string; nickname: string } }>
  _count?: { bids?: number }
}

const errMsg = (e: unknown, fallback: string) => (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? fallback
const BUMP_MS = 24 * 3600 * 1000

// 판매자용 상품 관리: 끌올 · 예약 · 수정 · 판매중지
export function SellerControls({ listing, onChanged }: { listing: OwnerListing; onChanged: () => void }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [reserveOpen, setReserveOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [buyerId, setBuyerId] = useState('')
  const [price, setPrice] = useState(String(listing.buyNowPrice ?? ''))
  const done = (text: string) => { setMsg({ ok: true, text }); onChanged() }
  const failed = (fallback: string) => (e: unknown) => setMsg({ ok: false, text: errMsg(e, fallback) })

  const bump = useMutation({ mutationFn: () => api.post(`/listings/${listing.id}/bump`), onSuccess: () => done('목록 맨 위로 올렸어요.'), onError: failed('끌올에 실패했어요.') })
  const reserve = useMutation({
    mutationFn: () => api.post(`/listings/${listing.id}/reserve`, { buyerId, price: Number(price) || undefined }),
    onSuccess: () => { setReserveOpen(false); done('예약중으로 바꿨어요. 구매자에게 결제 안내를 보냈어요.') }, onError: failed('예약에 실패했어요.'),
  })
  const unreserve = useMutation({ mutationFn: () => api.delete(`/listings/${listing.id}/reserve`), onSuccess: () => done('다시 판매중으로 바꿨어요.'), onError: failed('예약 취소에 실패했어요.') })
  const stop = useMutation({ mutationFn: () => api.delete(`/my/listings/${listing.id}`), onSuccess: () => done('판매를 중지했어요.'), onError: failed('판매 중지에 실패했어요.') })

  const selling = listing.status === 'ACTIVE' || listing.status === 'RESERVED'
  const nextBump = new Date(new Date(listing.bumpedAt).getTime() + BUMP_MS)
  const bumpReady = Date.now() >= nextBump.getTime()
  const hoursLeft = Math.ceil((nextBump.getTime() - Date.now()) / 3600_000)
  const rooms = listing.chatRooms ?? []
  const btn = 'h-10 px-3 rounded-xl border border-line bg-surface hover:bg-surface-2 text-xs font-semibold text-fg-2 inline-flex items-center justify-center gap-1.5 disabled:opacity-40'

  return (
    <div className="rounded-3xl border border-accent-line/60 bg-accent-tint/40 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-fg">내 상품 관리</p>
        <span className="text-[11px] text-muted">{timeAgo(listing.bumpedAt)} 등록/끌올</span>
      </div>

      {listing.status === 'RESERVED' && listing.reservedFor && (
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-400/30 px-3 py-2.5 text-xs text-emerald-300 flex items-center justify-between gap-2">
          <span><b>{listing.reservedFor.nickname}</b>님과 {listing.reservedPrice?.toLocaleString()}P에 예약중 · 결제를 기다리고 있어요</span>
          <button onClick={() => unreserve.mutate()} disabled={unreserve.isPending} className="shrink-0 inline-flex items-center gap-1 text-emerald-200 hover:text-white"><Undo2 size={12} />예약 취소</button>
        </div>
      )}

      {selling ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button className={btn} onClick={() => bump.mutate()} disabled={!bumpReady || bump.isPending} title={bumpReady ? '목록 맨 위로' : `${hoursLeft}시간 후 가능`}>
            <ArrowUpToLine size={14} />{bumpReady ? '끌올' : `끌올 ${hoursLeft}h`}
          </button>
          {listing.listingType !== 'AUCTION' && listing.status === 'ACTIVE' && (
            <button className={btn} onClick={() => { setReserveOpen(v => !v); setBuyerId(rooms[0]?.buyerId ?? '') }} disabled={rooms.length === 0} title={rooms.length ? '' : '채팅한 구매자가 있어야 예약할 수 있어요'}>
              <CalendarCheck size={14} />예약하기
            </button>
          )}
          <button className={btn} onClick={() => setEditOpen(true)}><Pencil size={14} />수정</button>
          <button className={`${btn} hover:text-rose-300`} onClick={() => { if (confirm('판매를 중지할까요? 다시 되돌릴 수 없어요.')) stop.mutate() }} disabled={stop.isPending || (listing.listingType === 'AUCTION' && (listing._count?.bids ?? 0) > 0)}>
            <Ban size={14} />판매중지
          </button>
        </div>
      ) : (
        <p className="text-xs text-muted">판매가 끝난 상품이에요.</p>
      )}

      {reserveOpen && (
        <div className="rounded-xl border border-line bg-surface p-3 space-y-2">
          <p className="text-xs text-muted">채팅한 구매자 중 한 명과 예약하면, 그 구매자만 안전결제할 수 있어요.</p>
          <div className="grid grid-cols-[1fr_130px_auto] gap-2">
            <select value={buyerId} onChange={e => setBuyerId(e.target.value)} className="h-10 bg-sunken border border-line rounded-lg px-2 text-sm text-fg" aria-label="예약 구매자">
              {rooms.map(r => <option key={r.id} value={r.buyerId}>{r.buyer.nickname}</option>)}
            </select>
            <input type="number" min={1} value={price} onChange={e => setPrice(e.target.value)} placeholder="거래 금액" className="h-10 bg-sunken border border-line rounded-lg px-2 text-sm text-fg" aria-label="거래 금액" />
            <button onClick={() => reserve.mutate()} disabled={!buyerId || !Number(price) || reserve.isPending} className="h-10 px-4 rounded-lg bg-emerald-500 text-sm font-semibold text-white disabled:opacity-40">예약</button>
          </div>
        </div>
      )}

      {rooms.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] text-muted flex items-center gap-1"><MessageCircle size={12} />이 상품 채팅 {rooms.length}</p>
          <div className="flex flex-wrap gap-1.5">
            {rooms.slice(0, 8).map(r => (
              <Link key={r.id} href={`/chat/${r.id}`} className="h-8 px-3 rounded-full border border-line bg-surface text-xs text-fg-2 hover:text-fg hover:border-line-strong inline-flex items-center">{r.buyer.nickname}</Link>
            ))}
          </div>
        </div>
      )}

      {msg && <p className={`text-xs ${msg.ok ? 'text-emerald-400' : 'text-rose-300'}`}>{msg.text}</p>}
      {editOpen && <EditListingModal listing={listing} onClose={() => setEditOpen(false)} onSaved={() => { setEditOpen(false); done('상품 정보를 수정했어요.') }} />}
    </div>
  )
}

function EditListingModal({ listing, onClose, onSaved }: { listing: OwnerListing; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    title: listing.title ?? '', description: listing.description ?? '', condition: listing.condition,
    price: String(listing.listingType === 'OFFER' ? (listing.minOfferPrice ?? '') : (listing.buyNowPrice ?? '')),
    shippingFee: String(listing.shippingFee ?? 0), shipIncluded: !listing.shippingFee, negotiable: listing.negotiable, imageUrls: listing.imageUrls,
  })
  const [error, setError] = useState('')
  const save = useMutation({
    mutationFn: () => api.patch(`/listings/${listing.id}`, {
      title: f.title.trim() || null, description: f.description.trim() || null, condition: f.condition, imageUrls: f.imageUrls,
      shippingFee: f.shipIncluded ? 0 : Number(f.shippingFee) || 0,
      ...(listing.listingType === 'BUY_NOW' ? { buyNowPrice: Number(f.price), negotiable: f.negotiable } : {}),
      ...(listing.listingType === 'OFFER' ? { minOfferPrice: Number(f.price) } : {}),
    }),
    onSuccess: onSaved,
    onError: (e: unknown) => setError(errMsg(e, '수정에 실패했어요.')),
  })
  const field = 'w-full h-10 bg-sunken border border-line focus:border-accent/60 rounded-xl px-3 text-sm text-fg focus:outline-none'
  const label = 'text-xs font-semibold text-muted'

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm sm:p-6" onClick={onClose} role="dialog" aria-modal="true" aria-label="상품 수정">
      <div className="w-full sm:max-w-lg max-h-[90dvh] flex flex-col rounded-t-3xl sm:rounded-3xl border border-line bg-bg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="text-base font-bold text-fg">상품 수정</h2>
          <button onClick={onClose} aria-label="닫기" className="w-8 h-8 rounded-full flex items-center justify-center text-muted hover:text-fg hover:bg-surface-2"><X size={17} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="space-y-1.5"><p className={label}>사진</p><PhotoPicker value={f.imageUrls} onChange={imageUrls => setF({ ...f, imageUrls })} /></div>
          <div className="space-y-1.5">
            <p className={label}>제목 <span className="font-normal text-subtle">(비우면 카드 이름)</span></p>
            <input className={field} maxLength={60} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="예: 리자몽 ex SAR 미개봉급 판매합니다" />
          </div>
          {listing.listingType !== 'AUCTION' && (
            <div className="space-y-1.5">
              <p className={label}>{listing.listingType === 'OFFER' ? '최소 제안가' : '판매가'} (P)</p>
              <input className={field} type="number" min={1} value={f.price} onChange={e => setF({ ...f, price: e.target.value })} />
              {listing.listingType === 'BUY_NOW' && (
                <label className="flex items-center gap-2 text-sm text-fg-2 cursor-pointer pt-1">
                  <input type="checkbox" checked={f.negotiable} onChange={e => setF({ ...f, negotiable: e.target.checked })} />가격 제안 받기
                </label>
              )}
            </div>
          )}
          <div className="space-y-1.5">
            <p className={label}>상태</p>
            <select className={field} value={f.condition} onChange={e => setF({ ...f, condition: e.target.value })}>
              {Object.entries(CONDITION_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <p className={label}>배송비</p>
            <div className="flex items-center gap-3 text-sm text-fg-2">
              <label className="flex items-center gap-1.5 cursor-pointer"><input type="radio" checked={f.shipIncluded} onChange={() => setF({ ...f, shipIncluded: true })} />포함</label>
              <label className="flex items-center gap-1.5 cursor-pointer"><input type="radio" checked={!f.shipIncluded} onChange={() => setF({ ...f, shipIncluded: false, shippingFee: f.shippingFee === '0' ? '3500' : f.shippingFee })} />별도</label>
              {!f.shipIncluded && <input className={`${field} w-28`} type="number" min={0} value={f.shippingFee} onChange={e => setF({ ...f, shippingFee: e.target.value })} aria-label="배송비" />}
            </div>
          </div>
          <div className="space-y-1.5">
            <p className={label}>설명</p>
            <textarea className="w-full min-h-28 bg-sunken border border-line focus:border-accent/60 rounded-xl px-3 py-2 text-sm text-fg focus:outline-none" maxLength={3000}
              value={f.description} onChange={e => setF({ ...f, description: e.target.value })} placeholder="구성품, 하자 여부, 보관 상태 등을 적어주세요." />
          </div>
          {error && <p className="text-xs text-rose-300">{error}</p>}
        </div>
        <div className="px-5 py-3 border-t border-line flex justify-end gap-2">
          <button onClick={onClose} className="h-10 px-4 rounded-xl border border-line text-sm text-muted">취소</button>
          <button onClick={() => save.mutate()} disabled={save.isPending} className="h-10 px-5 rounded-xl bg-accent text-sm font-semibold text-white disabled:opacity-50 inline-flex items-center gap-1.5">
            {save.isPending && <Loader2 size={14} className="animate-spin" />}저장
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

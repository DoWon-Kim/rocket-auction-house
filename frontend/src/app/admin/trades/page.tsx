'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { createPortal } from 'react-dom'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import {
  ArrowLeftRight, Search, X, MapPin, Truck, MessageCircle, AlertTriangle, ShieldCheck, Undo2, Send,
  ExternalLink, EyeOff, Eye, Heart, Flag, Star, Loader2,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { listingTitle, listingThumb, timeAgo } from '@/lib/market'

const P = (n: number) => `${n.toLocaleString()}P`
const dt = (s: string | null | undefined) => (s ? format(new Date(s), 'MM/dd HH:mm') : '-')
const errMsg = (e: unknown, fb: string) => (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? fb

const TX_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING_SHIPMENT: { label: '발송 대기', cls: 'bg-accent-tint text-accent-soft' },
  SHIPPED: { label: '배송중', cls: 'bg-amber-500/15 text-amber-300' },
  COMPLETED: { label: '구매확정', cls: 'bg-emerald-500/15 text-emerald-300' },
  AUTO_COMPLETED: { label: '자동 확정', cls: 'bg-emerald-500/10 text-emerald-300/80' },
  CANCELLED: { label: '취소·환불', cls: 'bg-surface-2 text-muted' },
  AUTO_CANCELLED: { label: '자동취소', cls: 'bg-surface-2 text-muted' },
  DISPUTED: { label: '분쟁중', cls: 'bg-rose-500/15 text-rose-300' },
}
const FLAG: Record<string, { label: string; cls: string }> = {
  SHIP_OVERDUE: { label: '발송 기한 초과', cls: 'bg-rose-500/15 text-rose-300' },
  SHIP_DUE_SOON: { label: '발송 임박', cls: 'bg-amber-500/15 text-amber-300' },
  NO_ADDRESS: { label: '배송지 미입력', cls: 'bg-amber-500/15 text-amber-300' },
  ADDRESS_OVERDUE: { label: '배송지 기한 초과', cls: 'bg-rose-500/15 text-rose-300' },
  CONFIRM_WAITING: { label: '확정 대기', cls: 'bg-sky-500/10 text-sky-300' },
  DISPUTED: { label: '분쟁', cls: 'bg-rose-500/15 text-rose-300' },
}
const LISTING_STATUS: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: '판매중', cls: 'bg-accent-tint text-accent-soft' },
  RESERVED: { label: '예약중', cls: 'bg-emerald-500/15 text-emerald-300' },
  SOLD: { label: '판매완료', cls: 'bg-surface-2 text-muted' },
  CANCELLED: { label: '판매중지', cls: 'bg-surface-2 text-muted' },
  EXPIRED: { label: '유찰', cls: 'bg-surface-2 text-muted' },
  SUSPENDED: { label: '숨김', cls: 'bg-rose-500/15 text-rose-300' },
}
const Chip = ({ m }: { m?: { label: string; cls: string } }) => m ? <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap ${m.cls}`}>{m.label}</span> : null

interface MiniListing { id: string; title: string | null; imageUrls: string[]; card: { name: string; nameKo: string | null; imageUrl: string | null } }
interface TradeRow {
  id: string; txStatus: string; escrowStatus: string; finalPrice: number; shippingFee: number; total: number
  completedAt: string; shippedAt: string | null; address: string | null; flags: string[]
  shipDeadline: string | null; addressDeadline: string | null; autoConfirmAt: string | null; trackingCarrier: string | null; trackingNumber: string | null
  listing: MiniListing; buyer: { id: string; nickname: string }; seller: { id: string; nickname: string }
  chatRoom: { id: string } | null
}

function TradesContent() {
  const params = useSearchParams()
  const router = useRouter()
  const tab = params.get('tab') === 'listings' ? 'listings' : 'trades'
  const setParams = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(next)) { if (v) p.set(k, v); else p.delete(k) }
    router.replace(`/admin/trades?${p}`)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-fg flex items-center gap-2"><ArrowLeftRight size={19} className="text-accent-fg" />거래 관제</h1>
        <div className="flex gap-1 bg-surface border border-line rounded-full p-1 text-sm">
          {([['trades', '안전결제 거래'], ['listings', '마켓 상품']] as const).map(([v, label]) => (
            <button key={v} onClick={() => router.replace(v === 'trades' ? '/admin/trades' : '/admin/trades?tab=listings')}
              className={`px-3.5 py-1 rounded-full font-medium ${tab === v ? 'bg-accent-tint text-accent-soft' : 'text-muted hover:text-fg'}`}>{label}</button>
          ))}
        </div>
      </div>
      {tab === 'trades' ? <TradesTab params={params} setParams={setParams} /> : <ListingsTab params={params} setParams={setParams} />}
    </div>
  )
}

type TabProps = { params: URLSearchParams; setParams: (n: Record<string, string | null>) => void }

function TradesTab({ params, setParams }: TabProps) {
  const filter = params.get('filter') ?? ''
  const flag = params.get('flag') ?? ''
  const openId = params.get('id')
  const [q, setQ] = useState(params.get('q') ?? '')
  const page = Number(params.get('page') ?? 1)

  const { data, isLoading } = useQuery<{ trades: TradeRow[]; total: number; limit: number; counts: Record<string, number> }>({
    queryKey: ['admin', 'trades', filter, flag, params.get('q'), page],
    queryFn: () => api.get('/admin/trades', { params: { filter: filter || undefined, flag: flag || undefined, q: params.get('q') || undefined, page } }).then(r => r.data),
    refetchInterval: 30_000,
  })
  const c = data?.counts ?? {}
  const pages = data ? Math.ceil(data.total / data.limit) : 0

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        {([['', '전체', c.all], ['active', '진행중', c.active], ['shipping', '발송 대기', c.shipping], ['shipped', '배송중', c.shipped], ['disputed', '분쟁', c.disputed], ['done', '완료', c.done], ['cancelled', '취소', c.cancelled]] as const).map(([v, label, n]) => (
          <button key={v} onClick={() => setParams({ filter: v || null, flag: null, page: null })}
            className={`h-8 px-3 rounded-full text-xs font-semibold border ${filter === v && !flag ? 'bg-accent-tint border-accent-line text-accent-soft' : 'border-line text-muted hover:text-fg'}`}>
            {label} <span className="tabular-nums opacity-70">{n ?? 0}</span>
          </button>
        ))}
        <span className="w-px h-5 bg-line mx-1" />
        {(['SHIP_OVERDUE', 'SHIP_DUE_SOON', 'NO_ADDRESS'] as const).map(f => (
          <button key={f} onClick={() => setParams({ flag: flag === f ? null : f, filter: null, page: null })}
            className={`h-8 px-3 rounded-full text-xs font-semibold border ${flag === f ? 'border-rose-400/50 bg-rose-500/10 text-rose-300' : 'border-line text-muted hover:text-fg'}`}>{FLAG[f].label}</button>
        ))}
        <form onSubmit={e => { e.preventDefault(); setParams({ q: q.trim() || null, page: null }) }} className="ml-auto relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="닉네임·상품·운송장·거래ID" className="h-9 w-60 pl-8 pr-3 rounded-full bg-surface border border-line text-sm text-fg placeholder:text-subtle focus:outline-none focus:border-accent/50" />
        </form>
      </div>

      <div className="rounded-2xl border border-line bg-surface overflow-x-auto">
        <table className="w-full text-sm min-w-[860px]">
          <thead>
            <tr className="border-b border-line text-xs text-subtle">
              <th className="text-left font-semibold px-4 py-2.5">상품</th>
              <th className="text-left font-semibold px-3 py-2.5">구매자 → 판매자</th>
              <th className="text-right font-semibold px-3 py-2.5">결제액</th>
              <th className="text-left font-semibold px-3 py-2.5">상태</th>
              <th className="text-left font-semibold px-3 py-2.5">결제</th>
              <th className="text-left font-semibold px-3 py-2.5">다음 기한</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="px-4 py-10 text-center text-subtle">불러오는 중…</td></tr>}
            {data?.trades.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-subtle">해당하는 거래가 없어요.</td></tr>}
            {data?.trades.map(t => {
              const thumb = listingThumb(t.listing)
              const next = t.shipDeadline ? `발송 ${timeUntil(t.shipDeadline)}` : t.addressDeadline ? `배송지 ${timeUntil(t.addressDeadline)}` : t.autoConfirmAt ? `자동확정 ${timeUntil(t.autoConfirmAt)}` : '-'
              return (
                <tr key={t.id} onClick={() => setParams({ id: t.id })} className={`border-b border-line/60 cursor-pointer hover:bg-surface-2 ${openId === t.id ? 'bg-surface-2' : ''}`}>
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2.5 min-w-0">
                      <span className="relative w-9 h-9 shrink-0 rounded-md overflow-hidden bg-sunken border border-line">{thumb && <Image src={thumb} alt="" fill sizes="36px" className="object-cover" />}</span>
                      <span className="truncate max-w-[220px] text-fg-2">{listingTitle(t.listing)}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-muted whitespace-nowrap">{t.buyer.nickname} → {t.seller.nickname}</td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-fg">{P(t.total)}</td>
                  <td className="px-3 py-2.5"><span className="flex flex-wrap gap-1"><Chip m={TX_STATUS[t.txStatus]} />{t.flags.filter(f => f !== 'CONFIRM_WAITING').map(f => <Chip key={f} m={FLAG[f]} />)}</span></td>
                  <td className="px-3 py-2.5 text-xs text-muted whitespace-nowrap">{dt(t.completedAt)}</td>
                  <td className={`px-3 py-2.5 text-xs whitespace-nowrap ${t.flags.includes('SHIP_OVERDUE') || t.flags.includes('ADDRESS_OVERDUE') ? 'text-rose-300' : t.flags.includes('SHIP_DUE_SOON') ? 'text-amber-300' : 'text-muted'}`}>{next}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex justify-center gap-2 text-xs">
          <button disabled={page <= 1} onClick={() => setParams({ page: String(page - 1) })} className="h-8 px-3 rounded-lg border border-line text-muted disabled:opacity-40">이전</button>
          <span className="h-8 px-3 inline-flex items-center text-subtle">{page} / {pages}</span>
          <button disabled={page >= pages} onClick={() => setParams({ page: String(page + 1) })} className="h-8 px-3 rounded-lg border border-line text-muted disabled:opacity-40">다음</button>
        </div>
      )}
      {openId && <TradeDrawer id={openId} onClose={() => setParams({ id: null })} />}
    </>
  )
}

function timeUntil(iso: string) {
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return `${timeAgo(iso)} 초과`
  const h = Math.floor(ms / 3600_000)
  return h >= 24 ? `${Math.floor(h / 24)}일 ${h % 24}시간 남음` : `${h}시간 ${Math.floor((ms % 3600_000) / 60_000)}분 남음`
}

interface TradeUser { id: string; nickname: string; email: string; balance: number; warningCount: number; isSuspended: boolean; createdAt: string; avgRating: number | null; reviewCount: number }
interface TradeDetail extends TradeRow {
  listing: MiniListing & { listingType: string; condition: string; createdAt: string; card: MiniListing['card'] & { id: string; setName: string } }
  buyer: TradeUser; seller: TradeUser
  recipientName: string | null; recipientPhone: string | null; zipCode: string | null; addressDetail: string | null; shippingMemo: string | null
  chatRoom: { id: string; messages: Array<{ id: string; content: string; type: string; createdAt: string; readAt: string | null; imageUrls: string[]; flagged: boolean; deletedAt: string | null; sender: { id: string; nickname: string } }> } | null
  dispute: { id: string; status: string; reason: string; description: string; createdAt: string } | null
  reports: Array<{ id: string; reason: string; detail: string | null; status: string; createdAt: string; reporter: { nickname: string } }>
  reviews: Array<{ id: string; rating: number; comment: string | null; role: string; reviewer: { nickname: string } }>
  offers: Array<{ id: string; amount: number; status: string }>
  timeline: Array<{ at: string | null; label: string }>
  buyerStats: { bought: number; sold: number; cancelled: number; reported: number }
  sellerStats: { bought: number; sold: number; cancelled: number; reported: number }
}

function TradeDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient()
  const isSuper = useAuthStore(s => s.user?.role === 'SUPER_ADMIN')
  const [notice, setNotice] = useState('')
  const [refundReason, setRefundReason] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const { data: t } = useQuery<TradeDetail>({ queryKey: ['admin', 'trade', id], queryFn: () => api.get(`/admin/trades/${id}`).then(r => r.data) })
  const refresh = () => { qc.invalidateQueries({ queryKey: ['admin', 'trade', id] }); qc.invalidateQueries({ queryKey: ['admin', 'trades'] }); qc.invalidateQueries({ queryKey: ['admin', 'ops'] }) }
  const done = (text: string) => { setMsg({ ok: true, text }); refresh() }
  const onErr = (fb: string) => (e: unknown) => setMsg({ ok: false, text: errMsg(e, fb) })

  const noticeMut = useMutation({ mutationFn: () => api.post(`/admin/trades/${id}/notice`, { content: notice }), onSuccess: () => { setNotice(''); done('채팅방에 운영자 안내를 보냈어요.') }, onError: onErr('안내 전송 실패') })
  const releaseMut = useMutation({ mutationFn: () => api.post(`/admin/transactions/${id}/release`), onSuccess: () => done('판매자에게 정산했어요.'), onError: onErr('정산 실패') })
  const refundMut = useMutation({ mutationFn: () => api.post(`/admin/trades/${id}/refund`, { reason: refundReason }), onSuccess: r => { setRefundReason(''); done(r.data.message) }, onError: onErr('환불 실패') })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const held = t?.escrowStatus === 'HELD'
  const box = 'rounded-xl border border-line bg-surface p-3.5'

  return createPortal(
    <div className="fixed inset-0 z-[90] flex justify-end bg-black/50" onClick={onClose}>
      <aside className="w-full max-w-xl h-full overflow-y-auto bg-bg border-l border-line" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="거래 상세">
        <div className="sticky top-0 z-10 flex items-center gap-2 px-5 py-3.5 bg-bg/95 backdrop-blur border-b border-line">
          <h2 className="font-bold text-fg">거래 상세</h2>
          {t && <Chip m={TX_STATUS[t.txStatus]} />}
          {t?.flags.map(f => <Chip key={f} m={FLAG[f]} />)}
          <button onClick={onClose} aria-label="닫기" className="ml-auto w-8 h-8 rounded-full flex items-center justify-center text-muted hover:text-fg hover:bg-surface-2"><X size={17} /></button>
        </div>
        {!t ? <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-muted" /></div> : (
          <div className="p-5 space-y-3.5 text-sm">
            {/* 상품 + 금액 */}
            <div className={`${box} flex gap-3`}>
              <span className="relative w-16 h-16 shrink-0 rounded-lg overflow-hidden bg-sunken border border-line">{listingThumb(t.listing) && <Image src={listingThumb(t.listing)!} alt="" fill sizes="64px" className="object-cover" />}</span>
              <div className="min-w-0 flex-1">
                <Link href={`/listings/${t.listing.id}`} target="_blank" className="font-medium text-fg hover:text-accent-fg inline-flex items-center gap-1">{listingTitle(t.listing)}<ExternalLink size={12} /></Link>
                <p className="text-xs text-muted">{t.listing.card.setName} · 거래ID {t.id.slice(0, 8)}</p>
                <p className="mt-1 tabular-nums"><b className="text-fg">{P(t.total)}</b> <span className="text-xs text-muted">(상품 {P(t.finalPrice)}{t.shippingFee ? ` + 배송비 ${P(t.shippingFee)}` : ''})</span></p>
                <p className="text-xs text-muted">대금: {held ? '보관 중' : t.escrowStatus === 'REFUNDED' ? '구매자 환불됨' : '판매자 정산됨'}</p>
              </div>
            </div>

            {/* 기한 */}
            {(t.shipDeadline || t.addressDeadline || t.autoConfirmAt) && (
              <p className={`rounded-xl px-3.5 py-2.5 text-xs flex items-center gap-2 ${t.flags.includes('SHIP_OVERDUE') || t.flags.includes('ADDRESS_OVERDUE') ? 'bg-rose-500/10 text-rose-300' : 'bg-amber-500/10 text-amber-200'}`}>
                <AlertTriangle size={14} />
                {t.shipDeadline ? `발송 기한 ${dt(t.shipDeadline)} (${timeUntil(t.shipDeadline)}) — 넘기면 자동 취소·환불` : t.addressDeadline ? `배송지 입력 기한 ${dt(t.addressDeadline)} (${timeUntil(t.addressDeadline)}) — 구매자가 입력 안 하면 자동 취소·환불` : `자동 구매확정 ${dt(t.autoConfirmAt)} (${timeUntil(t.autoConfirmAt!)})`}
              </p>
            )}

            {/* 구매자 / 판매자 */}
            <div className="grid grid-cols-2 gap-2.5">
              {([['구매자', t.buyer, t.buyerStats], ['판매자', t.seller, t.sellerStats]] as const).map(([role, u, s]) => (
                <div key={role} className={box}>
                  <p className="text-[11px] text-muted">{role}</p>
                  <Link href={`/users/${u.id}`} target="_blank" className="font-semibold text-fg hover:text-accent-fg">{u.nickname}</Link>
                  <p className="text-[11px] text-subtle truncate">{u.email}</p>
                  <p className="text-[11px] text-muted mt-1">잔액 {P(u.balance)} · ★{u.avgRating?.toFixed(1) ?? '-'}({u.reviewCount})</p>
                  <p className="text-[11px] text-muted">구매 {s.bought} · 판매완료 {s.sold} · 취소 {s.cancelled}</p>
                  {(s.reported > 0 || u.warningCount > 0 || u.isSuspended) && (
                    <p className="text-[11px] text-rose-300 mt-0.5">{u.isSuspended ? '정지됨 · ' : ''}신고 {s.reported} · 경고 {u.warningCount}</p>
                  )}
                </div>
              ))}
            </div>

            {/* 배송 */}
            <div className={box}>
              <p className="text-xs font-semibold text-fg-2 flex items-center gap-1.5 mb-1.5"><MapPin size={13} />배송지</p>
              {t.address ? (
                <div className="text-xs text-fg-3 space-y-0.5">
                  <p>{t.recipientName} · {t.recipientPhone}</p>
                  <p>({t.zipCode}) {t.address} {t.addressDetail}</p>
                  {t.shippingMemo && <p className="text-muted">메모: {t.shippingMemo}</p>}
                </div>
              ) : <p className="text-xs text-amber-300">구매자가 아직 배송지를 입력하지 않았어요.</p>}
              {t.trackingNumber && <p className="text-xs text-muted mt-2 flex items-center gap-1.5"><Truck size={13} />{t.trackingCarrier} <span className="font-mono text-fg-2">{t.trackingNumber}</span> · {dt(t.shippedAt)}</p>}
            </div>

            {/* 진행 기록 */}
            <div className={box}>
              <p className="text-xs font-semibold text-fg-2 mb-2">진행 기록</p>
              <ol className="space-y-1.5 border-l border-line ml-1.5">
                {t.timeline.map((e, i) => (
                  <li key={i} className="pl-3 relative text-xs">
                    <span className="absolute -left-[4px] top-1.5 w-[7px] h-[7px] rounded-full bg-accent" />
                    <span className="text-fg-3">{e.label}</span> <span className="text-subtle">{e.at ? dt(e.at) : ''}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* 분쟁·신고·후기 */}
            {(t.dispute || t.reports.length > 0 || t.reviews.length > 0) && (
              <div className={`${box} space-y-2 text-xs`}>
                {t.dispute && <p className="text-rose-300"><Flag size={12} className="inline mr-1" />분쟁 {t.dispute.status} · {t.dispute.reason} — {t.dispute.description} <Link href="/admin/disputes" className="underline">분쟁 관리</Link></p>}
                {t.reports.map(r => <p key={r.id} className="text-rose-300/90"><Flag size={12} className="inline mr-1" />신고({r.status}) {r.reporter.nickname}: {r.reason}{r.detail ? ` — ${r.detail}` : ''}</p>)}
                {t.reviews.map(r => <p key={r.id} className="text-fg-3"><Star size={12} className="inline mr-1 text-amber-400" />{r.reviewer.nickname} ({r.role === 'BUYER' ? '구매자' : '판매자'}) {r.rating}점{r.comment ? ` — ${r.comment}` : ''}</p>)}
              </div>
            )}

            {/* 조치 */}
            <div className={`${box} space-y-2.5`}>
              <p className="text-xs font-semibold text-fg-2">운영자 조치</p>
              {t.chatRoom && (
                <div className="flex gap-2">
                  <input value={notice} onChange={e => setNotice(e.target.value)} maxLength={500} placeholder="채팅방에 운영자 안내 (예: 오늘 중 발송 부탁드립니다)"
                    className="flex-1 h-9 bg-sunken border border-line rounded-lg px-3 text-xs text-fg placeholder:text-subtle" />
                  <button onClick={() => noticeMut.mutate()} disabled={!notice.trim() || noticeMut.isPending} className="h-9 px-3 rounded-lg bg-accent text-xs font-semibold text-white disabled:opacity-40 inline-flex items-center gap-1"><Send size={12} />보내기</button>
                </div>
              )}
              {held && (isSuper ? (
                <div className="space-y-2 pt-1 border-t border-line">
                  <button onClick={() => { if (confirm(`판매자에게 ${P(t.total)}를 정산하고 거래를 확정할까요?`)) releaseMut.mutate() }} disabled={releaseMut.isPending}
                    className="w-full h-9 rounded-lg border border-emerald-400/30 text-emerald-300 text-xs font-semibold hover:bg-emerald-500/10 inline-flex items-center justify-center gap-1.5"><ShieldCheck size={13} />강제 구매확정 · 판매자 정산</button>
                  <div className="flex gap-2">
                    <input value={refundReason} onChange={e => setRefundReason(e.target.value)} maxLength={300} placeholder="환불 사유 (양쪽에 전달돼요)" className="flex-1 h-9 bg-sunken border border-line rounded-lg px-3 text-xs text-fg placeholder:text-subtle" />
                    <button onClick={() => { if (confirm(`구매자에게 ${P(t.total)}를 환불하고 거래를 취소할까요?`)) refundMut.mutate() }} disabled={refundReason.trim().length < 2 || refundMut.isPending}
                      className="h-9 px-3 rounded-lg border border-rose-400/30 text-rose-300 text-xs font-semibold hover:bg-rose-500/10 disabled:opacity-40 inline-flex items-center gap-1"><Undo2 size={12} />환불</button>
                  </div>
                </div>
              ) : <p className="text-[11px] text-subtle">정산·환불은 최종 관리자만 할 수 있어요.</p>)}
              {msg && <p className={`text-xs ${msg.ok ? 'text-emerald-400' : 'text-rose-300'}`}>{msg.text}</p>}
            </div>

            {/* 채팅 기록 */}
            <div className={box}>
              <p className="text-xs font-semibold text-fg-2 flex items-center gap-1.5 mb-2"><MessageCircle size={13} />채팅 기록 {t.chatRoom ? `(${t.chatRoom.messages.length})` : ''}</p>
              {!t.chatRoom || t.chatRoom.messages.length === 0 ? <p className="text-xs text-subtle">채팅 기록이 없어요.</p> : (
                <ul className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                  {t.chatRoom.messages.map(m => (
                    <li key={m.id} className={`text-xs rounded-lg px-2.5 py-1.5 ${m.type === 'SYSTEM' ? 'bg-sunken text-muted' : m.type === 'OFFER' ? 'bg-emerald-500/10 text-emerald-200' : m.sender.id === t.buyer.id ? 'bg-surface-2 text-fg-3' : 'bg-accent-tint/60 text-fg-3'}`}>
                      <span className="font-semibold">{m.type === 'SYSTEM' ? '안내' : `${m.sender.nickname}${m.sender.id === t.buyer.id ? ' (구매자)' : m.sender.id === t.seller.id ? ' (판매자)' : ''}`}</span>
                      <span className="text-subtle ml-1.5">{dt(m.createdAt)}</span>
                      {(m.flagged || m.deletedAt) && <span className="ml-1.5">{m.flagged && <span className="px-1 rounded bg-rose-500/20 text-rose-200 text-[10px] font-semibold mr-1">위험 신호</span>}{m.deletedAt && <span className="px-1 rounded bg-surface-2 text-muted text-[10px]">사용자가 삭제함</span>}</span>}
                      {m.content && <p className="whitespace-pre-wrap break-words mt-0.5">{m.content}</p>}
                      {m.imageUrls.length > 0 && <span className="flex gap-1 mt-1">{m.imageUrls.map(u => <a key={u} href={u} target="_blank" rel="noreferrer" className="relative w-14 h-14 rounded-md overflow-hidden border border-line"><Image src={u} alt="" fill sizes="56px" className="object-cover" /></a>)}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </aside>
    </div>,
    document.body,
  )
}

interface AdminListing {
  id: string; title: string | null; status: string; listingType: string
  buyNowPrice: number | null; minOfferPrice: number | null; currentPrice: number | null; startingPrice: number | null
  shippingFee: number; imageUrls: string[]; likeCount: number; viewCount: number; createdAt: string; bumpedAt: string
  reservedAt: string | null; reservedPrice: number | null
  card: { name: string; nameKo: string | null; imageUrl: string | null }
  seller: { id: string; nickname: string }; reservedFor: { id: string; nickname: string } | null
  _count: { chatRooms: number; offers: number; reports: number; bids: number }
}

function ListingsTab({ params, setParams }: TabProps) {
  const qc = useQueryClient()
  const status = params.get('status') ?? ''
  const page = Number(params.get('page') ?? 1)
  const [q, setQ] = useState(params.get('q') ?? '')
  const [msg, setMsg] = useState('')
  const { data, isLoading } = useQuery<{ listings: AdminListing[]; total: number; limit: number; counts: Record<string, number> }>({
    queryKey: ['admin', 'market-listings', status, params.get('q'), page],
    queryFn: () => api.get('/admin/market/listings', { params: { status: status || undefined, q: params.get('q') || undefined, page } }).then(r => r.data),
  })
  const moderate = useMutation({
    mutationFn: (v: { id: string; action: 'suspend' | 'restore'; reason?: string }) => api.patch(`/admin/market/listings/${v.id}`, v),
    onSuccess: r => { setMsg(r.data.message); qc.invalidateQueries({ queryKey: ['admin', 'market-listings'] }); qc.invalidateQueries({ queryKey: ['admin', 'ops'] }) },
    onError: e => setMsg(errMsg(e, '처리 실패')),
  })
  const c = data?.counts ?? {}
  const all = Object.values(c).reduce((a, b) => a + b, 0)
  const pages = data ? Math.ceil(data.total / data.limit) : 0

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        {([['', '전체', all], ['ACTIVE', '판매중', c.ACTIVE], ['RESERVED', '예약중', c.RESERVED], ['SOLD', '판매완료', c.SOLD], ['SUSPENDED', '숨김', c.SUSPENDED], ['CANCELLED', '판매중지', c.CANCELLED], ['EXPIRED', '유찰', c.EXPIRED]] as const).map(([v, label, n]) => (
          <button key={v} onClick={() => setParams({ status: v || null, page: null })}
            className={`h-8 px-3 rounded-full text-xs font-semibold border ${status === v ? 'bg-accent-tint border-accent-line text-accent-soft' : 'border-line text-muted hover:text-fg'}`}>
            {label} <span className="tabular-nums opacity-70">{n ?? 0}</span>
          </button>
        ))}
        <form onSubmit={e => { e.preventDefault(); setParams({ q: q.trim() || null, page: null }) }} className="ml-auto relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="상품명·판매자" className="h-9 w-56 pl-8 pr-3 rounded-full bg-surface border border-line text-sm text-fg placeholder:text-subtle focus:outline-none focus:border-accent/50" />
        </form>
      </div>
      {msg && <p className="text-xs text-emerald-400">{msg}</p>}

      <div className="rounded-2xl border border-line bg-surface overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="border-b border-line text-xs text-subtle">
              <th className="text-left font-semibold px-4 py-2.5">상품</th>
              <th className="text-left font-semibold px-3 py-2.5">판매자</th>
              <th className="text-right font-semibold px-3 py-2.5">가격</th>
              <th className="text-left font-semibold px-3 py-2.5">상태</th>
              <th className="text-left font-semibold px-3 py-2.5">반응</th>
              <th className="text-left font-semibold px-3 py-2.5">등록/끌올</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={7} className="px-4 py-10 text-center text-subtle">불러오는 중…</td></tr>}
            {data?.listings.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-subtle">해당하는 상품이 없어요.</td></tr>}
            {data?.listings.map(l => {
              const thumb = listingThumb(l)
              const price = l.buyNowPrice ?? l.currentPrice ?? l.minOfferPrice ?? l.startingPrice
              return (
                <tr key={l.id} className="border-b border-line/60 hover:bg-surface-2/60">
                  <td className="px-4 py-2.5">
                    <Link href={`/listings/${l.id}`} target="_blank" className="flex items-center gap-2.5 min-w-0 hover:text-accent-fg">
                      <span className="relative w-9 h-9 shrink-0 rounded-md overflow-hidden bg-sunken border border-line">{thumb && <Image src={thumb} alt="" fill sizes="36px" className="object-cover" />}</span>
                      <span className="truncate max-w-[220px] text-fg-2">{listingTitle(l)}</span>
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-muted">{l.seller.nickname}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-fg">{price != null ? P(price) : '-'}{l.shippingFee ? <span className="block text-[10px] text-subtle">+배송 {P(l.shippingFee)}</span> : null}</td>
                  <td className="px-3 py-2.5">
                    <Chip m={LISTING_STATUS[l.status]} />
                    {l.reservedFor && <span className="block text-[10px] text-emerald-300 mt-0.5">{l.reservedFor.nickname} · {l.reservedPrice ? P(l.reservedPrice) : ''} · {l.reservedAt ? timeAgo(l.reservedAt) : ''}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-[11px] text-muted whitespace-nowrap">
                    <span className="inline-flex items-center gap-0.5 mr-2"><Heart size={11} />{l.likeCount}</span>
                    <span className="inline-flex items-center gap-0.5 mr-2"><MessageCircle size={11} />{l._count.chatRooms}</span>
                    <span className="mr-2">조회 {l.viewCount}</span>
                    {l._count.reports > 0 && <span className="text-rose-300 inline-flex items-center gap-0.5"><Flag size={11} />{l._count.reports}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-[11px] text-muted whitespace-nowrap">{timeAgo(l.createdAt)}{l.bumpedAt !== l.createdAt && <span className="block text-subtle">끌올 {timeAgo(l.bumpedAt)}</span>}</td>
                  <td className="px-3 py-2.5 text-right">
                    {(l.status === 'ACTIVE' || l.status === 'RESERVED') && (
                      <button onClick={() => { const reason = prompt('숨김 사유 (판매자에게 전달돼요)', '운영 정책 위반'); if (reason !== null) moderate.mutate({ id: l.id, action: 'suspend', reason }) }}
                        className="h-7 px-2.5 rounded-lg border border-line text-[11px] text-muted hover:text-rose-300 inline-flex items-center gap-1"><EyeOff size={12} />숨김</button>
                    )}
                    {l.status === 'SUSPENDED' && (
                      <button onClick={() => moderate.mutate({ id: l.id, action: 'restore' })} className="h-7 px-2.5 rounded-lg border border-line text-[11px] text-muted hover:text-emerald-300 inline-flex items-center gap-1"><Eye size={12} />복구</button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex justify-center gap-2 text-xs">
          <button disabled={page <= 1} onClick={() => setParams({ page: String(page - 1) })} className="h-8 px-3 rounded-lg border border-line text-muted disabled:opacity-40">이전</button>
          <span className="h-8 px-3 inline-flex items-center text-subtle">{page} / {pages}</span>
          <button disabled={page >= pages} onClick={() => setParams({ page: String(page + 1) })} className="h-8 px-3 rounded-lg border border-line text-muted disabled:opacity-40">다음</button>
        </div>
      )}
    </>
  )
}

export default function AdminTradesPage() {
  return <Suspense fallback={<div className="h-96 rounded-2xl bg-surface animate-pulse" />}><TradesContent /></Suspense>
}

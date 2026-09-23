'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import Badge from '@/components/ui/Badge'
import { TCG_LABELS, CONDITION_LABELS, LISTING_TYPE_LABELS, rarityLabel, resolveImageSrc } from '@/lib/utils'
import { format } from 'date-fns'
import { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'
import {
  Clock, Gavel, Tag, Handshake, ChevronLeft, ChevronRight,
  Zap, ShieldAlert, Flame, MessageCircle, ShieldCheck, AlertCircle, Check, Flag,
  Star, Reply, TrendingUp, TrendingDown, Minus, BarChart2, ArrowRight, Bot, Expand,
  Share2, Eye,
} from 'lucide-react'
import Link from 'next/link'
import type { Socket } from 'socket.io-client'
import { RatingBadge } from '@/components/StarRating'
import { PriceHistoryChart } from '@/components/PriceHistoryChart'
import { WishlistButton } from '@/components/WishlistButton'

/* ─── Countdown hook ──────────────────────────── */
function useCountdown(endsAt: Date | null | undefined) {
  const [remaining, setRemaining] = useState('')
  const [urgent, setUrgent] = useState(false)
  useEffect(() => {
    if (!endsAt) return
    function update() {
      const diff = new Date(endsAt!).getTime() - Date.now()
      if (diff <= 0) { setRemaining('종료'); setUrgent(false); return }
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setUrgent(diff < 5 * 60 * 1000)
      setRemaining(h > 0 ? `${h}시간 ${m}분` : m > 0 ? `${m}분 ${s}초` : `${s}초`)
    }
    update()
    const t = setInterval(update, 1000)
    return () => clearInterval(t)
  }, [endsAt])
  return { remaining, urgent }
}

/* ─── Market Stats Panel ──────────────────────── */
interface CardMarket {
  activeCount: number
  minPrice: number | null
  maxPrice: number | null
  avgBuyNow: number | null
  recentAvgPrice: number | null
  recentTxCount: number
}

function MarketStatsPanel({ cardMarket, currentPrice, listingType }: { cardMarket: CardMarket; currentPrice: number | null; listingType: string }) {
  if (!cardMarket || cardMarket.activeCount === 0) return null

  const refPrice = cardMarket.recentAvgPrice ?? cardMarket.avgBuyNow
  const priceDiff = refPrice && currentPrice ? currentPrice - refPrice : null
  const pricePct  = refPrice && priceDiff != null ? Math.round((priceDiff / refPrice) * 100) : null

  const PriceIndicator = () => {
    if (pricePct === null) return null
    if (Math.abs(pricePct) < 3) return <Minus size={12} className="text-muted-2" />
    if (pricePct > 0)  return <TrendingUp size={12} className="text-red-400" />
    return <TrendingDown size={12} className="text-emerald-400" />
  }
  const diffLabel = pricePct === null ? null
    : Math.abs(pricePct) < 3 ? '시세 수준'
    : pricePct > 0 ? `시세보다 ${pricePct}% 높음`
    : `시세보다 ${Math.abs(pricePct)}% 낮음`

  return (
    <div className="bg-surface/70 border border-line rounded-3xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-subtle uppercase tracking-wider font-semibold flex items-center gap-1.5">
          <BarChart2 size={11} className="text-accent-fg" /> 시세 현황
        </p>
        <span className="text-[10px] text-subtle">활성 리스팅 {cardMarket.activeCount}개</span>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        {cardMarket.minPrice != null && (
          <div>
            <p className="text-sm font-bold text-emerald-400 tabular-nums">{cardMarket.minPrice.toLocaleString()}<span className="text-[10px] ml-0.5">P</span></p>
            <p className="text-[10px] text-subtle mt-0.5">최저가</p>
          </div>
        )}
        {cardMarket.avgBuyNow != null && (
          <div>
            <p className="text-sm font-bold text-accent-soft tabular-nums">{cardMarket.avgBuyNow.toLocaleString()}<span className="text-[10px] ml-0.5">P</span></p>
            <p className="text-[10px] text-subtle mt-0.5">평균 즉구가</p>
          </div>
        )}
        {cardMarket.maxPrice != null && (
          <div>
            <p className="text-sm font-bold text-accent-2 tabular-nums">{cardMarket.maxPrice.toLocaleString()}<span className="text-[10px] ml-0.5">P</span></p>
            <p className="text-[10px] text-subtle mt-0.5">최고가</p>
          </div>
        )}
      </div>

      {cardMarket.recentAvgPrice != null && (
        <div className="flex items-center justify-between pt-2 border-t border-line">
          <div>
            <p className="text-[10px] text-subtle">30일 평균 체결가 ({cardMarket.recentTxCount}건)</p>
            <p className="text-sm font-bold text-fg tabular-nums mt-0.5">
              {cardMarket.recentAvgPrice.toLocaleString()}P
            </p>
          </div>
          {diffLabel && listingType !== 'OFFER' && (
            <div className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-semibold border ${
              pricePct === null || Math.abs(pricePct) < 3
                ? 'bg-surface-2 border-line text-muted-2'
                : pricePct > 0
                  ? 'bg-red-900/20 border-red-700/40 text-red-400'
                  : 'bg-emerald-900/20 border-emerald-700/40 text-emerald-400'
            }`}>
              <PriceIndicator />
              {diffLabel}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ─── Seller Grade Badge ────────────────────────── */
const GRADE_STYLE: Record<string, { label: string; cls: string }> = {
  BRONZE:   { label: 'BRONZE',   cls: 'text-orange-700 border-orange-800/40 bg-orange-950/30' },
  SILVER:   { label: 'SILVER',   cls: 'text-slate-400  border-slate-600/40  bg-slate-900/30'  },
  GOLD:     { label: 'GOLD',     cls: 'text-yellow-400 border-yellow-600/40 bg-yellow-950/30' },
  PLATINUM: { label: 'PLAT',     cls: 'text-cyan-400   border-cyan-600/40   bg-cyan-950/30'   },
  DIAMOND:  { label: 'DIAMOND',  cls: 'text-sky-300    border-sky-500/40    bg-sky-950/30'    },
}
function SellerGradeBadge({ sellerId }: { sellerId: string }) {
  const { data } = useQuery({
    queryKey: ['seller-grade', sellerId],
    queryFn: () => api.get(`/users/${sellerId}/seller-grade`).then(r => r.data as { grade: string }),
    staleTime: 5 * 60_000,
  })
  if (!data) return null
  const g = GRADE_STYLE[data.grade] ?? GRADE_STYLE['BRONZE']
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${g.cls}`}>{g.label}</span>
  )
}

/* ─── Comparable Listings ──────────────────────── */
interface ComparableListing {
  id: string
  listingType: string
  condition: string
  buyNowPrice: number | null
  currentPrice: number | null
  minOfferPrice: number | null
  gradingCompany: string | null
  gradingGrade: string | null
  auctionEndsAt: string | null
  status: string
  seller: { id: string; nickname: string; avgRating: number | null }
  _count: { bids: number }
}

function ComparableListings({ cardId, currentListingId }: { cardId: string; currentListingId: string }) {
  const { data } = useQuery({
    queryKey: ['card-listings', cardId],
    queryFn: () => api.get(`/cards/${cardId}/listings`, { params: { limit: 6 } }).then(r => r.data),
    staleTime: 30_000,
  })

  const listings: ComparableListing[] = (data?.listings ?? []).filter((l: ComparableListing) => l.id !== currentListingId)
  if (!listings.length) return null

  const typeIcon = (t: string) => t === 'AUCTION' ? <Gavel size={10} /> : t === 'OFFER' ? <Handshake size={10} /> : <Tag size={10} />
  const price = (l: ComparableListing) => l.buyNowPrice ?? l.currentPrice ?? l.minOfferPrice

  return (
    <div className="bg-surface border border-line rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-line flex items-center justify-between">
        <p className="text-[10px] text-subtle uppercase tracking-wider font-semibold flex items-center gap-1.5">
          <BarChart2 size={11} className="text-accent-fg" /> 이 카드의 다른 리스팅 ({listings.length})
        </p>
        <Link href={`/cards/${cardId}`} className="flex items-center gap-1 text-[10px] text-subtle hover:text-accent-fg transition-colors">
          카드 도감 <ArrowRight size={10} />
        </Link>
      </div>
      <div className="divide-y divide-surface-2">
        {listings.map(l => (
          <Link key={l.id} href={`/listings/${l.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2 transition-colors group">
            <div className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded border ${
              l.listingType === 'AUCTION' ? 'text-accent-2 border-accent-line bg-accent-tint'
              : l.listingType === 'OFFER' ? 'text-emerald-400 border-emerald-700/40 bg-emerald-900/20'
              : 'text-accent-fg border-accent-line bg-accent-tint'
            }`}>
              {typeIcon(l.listingType)}
              {l.listingType === 'AUCTION' ? '경매' : l.listingType === 'OFFER' ? '제안' : '즉구'}
            </div>
            <span className="text-[11px] text-muted-2">{CONDITION_LABELS[l.condition as keyof typeof CONDITION_LABELS] ?? l.condition}</span>
            {l.gradingCompany && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-tint border border-accent-line text-accent-soft font-bold">
                {l.gradingCompany}{l.gradingGrade ? ` ${l.gradingGrade}` : ''}
              </span>
            )}
            <span className="text-[11px] text-subtle truncate">{l.seller.nickname}</span>
            {l.listingType === 'AUCTION' && l._count.bids > 0 && (
              <span className="text-[10px] text-muted-2">{l._count.bids}입찰</span>
            )}
            <span className="ml-auto text-sm font-bold text-accent-2 tabular-nums shrink-0 group-hover:text-white transition-colors">
              {price(l) != null ? `${price(l)!.toLocaleString()}P` : '—'}
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}

/* ─── Seller Reviews ─────────────────────────── */
interface Review {
  id: string
  rating: number
  comment?: string | null
  sellerReply?: string | null
  sellerRepliedAt?: string | null
  createdAt: string
  reviewer: { id: string; nickname: string; avatarUrl?: string | null }
}

function SellerReviews({ sellerId, viewerId }: { sellerId: string; viewerId: string | null }) {
  const qc = useQueryClient()
  const [replyId, setReplyId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [replyErr, setReplyErr] = useState('')

  const { data } = useQuery({
    queryKey: ['seller-reviews', sellerId],
    queryFn: () => api.get(`/users/${sellerId}/reviews`).then(r => r.data),
  })

  const replyMut = useMutation({
    mutationFn: (reviewId: string) => api.post(`/reviews/${reviewId}/reply`, { reply: replyText }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['seller-reviews', sellerId] })
      setReplyId(null); setReplyText(''); setReplyErr('')
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      setReplyErr(e.response?.data?.message ?? '답글 등록 실패'),
  })

  const reviews: Review[] = data?.reviews ?? []
  if (!reviews.length) return null
  const isSeller = viewerId === sellerId

  return (
    <div className="bg-surface border border-line rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-line flex items-center justify-between">
        <p className="text-[10px] text-subtle uppercase tracking-wider font-semibold flex items-center gap-1.5">
          <Star size={11} className="text-accent-2 fill-accent-2" /> 판매자 리뷰 ({data?.total ?? 0})
        </p>
        {data?.avgRating && (
          <span className="text-xs text-accent-2 font-bold tabular-nums">★ {Number(data.avgRating).toFixed(1)}</span>
        )}
      </div>
      <div className="divide-y divide-surface-2">
        {reviews.map(rv => (
          <div key={rv.id} className="px-4 py-3 space-y-2">
            <div className="flex items-start gap-2">
              <div className="w-7 h-7 rounded-full bg-accent-tint border border-accent-line shrink-0 flex items-center justify-center text-xs font-bold text-accent-2 overflow-hidden">
                {rv.reviewer.avatarUrl
                  ? <img src={rv.reviewer.avatarUrl} alt="" className="w-full h-full object-cover" />
                  : rv.reviewer.nickname[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-[#8c60f2]">{rv.reviewer.nickname}</span>
                  <span className="text-xs text-accent-2">{'★'.repeat(rv.rating)}{'☆'.repeat(5 - rv.rating)}</span>
                  <span className="text-[10px] text-subtle ml-auto">{format(new Date(rv.createdAt), 'yy.MM.dd')}</span>
                </div>
                {rv.comment && <p className="text-xs text-fg-3 mt-1 leading-relaxed">{rv.comment}</p>}
              </div>
            </div>

            {/* 판매자 답글 표시 */}
            {rv.sellerReply && (
              <div className="ml-9 bg-surface-2 border border-line rounded-xl px-3 py-2 space-y-0.5">
                <p className="text-[10px] text-accent-fg font-semibold flex items-center gap-1">
                  <Reply size={9} /> 판매자 답글
                </p>
                <p className="text-xs text-fg-3 leading-relaxed">{rv.sellerReply}</p>
              </div>
            )}

            {/* 판매자 답글 작성 폼 (판매자 본인 + 미작성) */}
            {isSeller && !rv.sellerReply && (
              replyId === rv.id ? (
                <div className="ml-9 space-y-2">
                  <textarea
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    maxLength={500}
                    rows={2}
                    placeholder="구매자 리뷰에 답글을 남겨보세요..."
                    className="w-full bg-surface-2 border border-line focus:border-accent/60 rounded-xl px-3 py-2 text-xs text-fg placeholder:text-subtle outline-none resize-none"
                  />
                  {replyErr && <p className="text-[10px] text-red-400">{replyErr}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={() => replyMut.mutate(rv.id)}
                      disabled={replyText.trim().length < 1 || replyMut.isPending}
                      className="px-3 py-1.5 bg-accent hover:bg-accent-strong disabled:opacity-40 text-white rounded-lg text-[11px] font-medium"
                    >
                      등록
                    </button>
                    <button
                      onClick={() => { setReplyId(null); setReplyText(''); setReplyErr('') }}
                      className="px-3 py-1.5 bg-surface-2 border border-line text-muted-2 rounded-lg text-[11px]"
                    >
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => { setReplyId(rv.id); setReplyText('') }}
                  className="ml-9 flex items-center gap-1 text-[10px] text-subtle hover:text-accent-fg transition-colors"
                >
                  <Reply size={10} /> 답글 달기
                </button>
              )
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── Image Lightbox ─────────────────────────── */
function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="relative max-w-3xl max-h-[90vh] w-full" onClick={e => e.stopPropagation()}>
        <Image
          src={src}
          alt="확대 이미지"
          width={800}
          height={1120}
          className="object-contain rounded-2xl max-h-[90vh] w-auto mx-auto"
          unoptimized
        />
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-9 h-9 flex items-center justify-center bg-bg/80 text-white border border-line rounded-full hover:bg-surface transition-colors text-lg"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

/* ─── Image gallery ───────────────────────────── */
function ImageGallery({ images, onLightbox }: { images: string[]; onLightbox: (src: string) => void }) {
  const [active, setActive] = useState(0)
  if (!images.length) return null
  return (
    <div className="space-y-3">
      <div
        className="relative aspect-[3/4] bg-[radial-gradient(ellipse_at_top,var(--color-surface-2),var(--color-sunken))] rounded-[28px] overflow-hidden border border-white/10 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] cursor-zoom-in group"
        onClick={() => onLightbox(images[active])}
      >
        <Image src={images[active]} alt={`사진 ${active + 1}`} fill className="object-contain" />
        {/* 확대 힌트 */}
        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="flex items-center gap-1 h-7 px-3 glass text-white text-[11px] rounded-full border border-white/10">
            <Expand size={10} /> 확대
          </span>
        </div>
        {images.length > 1 && (
          <>
            <button onClick={e => { e.stopPropagation(); setActive(a => (a - 1 + images.length) % images.length) }}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center glass hover:bg-white/10 text-white rounded-full border border-white/10 transition-colors">
              <ChevronLeft size={16} />
            </button>
            <button onClick={e => { e.stopPropagation(); setActive(a => (a + 1) % images.length) }}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center glass hover:bg-white/10 text-white rounded-full border border-white/10 transition-colors">
              <ChevronRight size={16} />
            </button>
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
              {images.map((_, i) => (
                <button key={i} onClick={e => { e.stopPropagation(); setActive(i) }}
                  className={`rounded-full transition-all ${i === active ? 'w-4 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/35 hover:bg-white/60'}`} />
              ))}
            </div>
          </>
        )}
      </div>
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((url, i) => (
            <button key={url} onClick={() => setActive(i)}
              className={`relative shrink-0 w-16 h-20 rounded-2xl overflow-hidden border-2 transition-all ${
                i === active ? 'border-accent shadow-[0_0_10px_rgba(139,92,246,0.3)]' : 'border-line hover:border-line-strong'
              }`}>
              <Image src={url} alt={`썸네일 ${i + 1}`} fill className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── Chat button ──────────────────────────────── */
function ChatButton({ listingId }: { listingId: string }) {
  const { user } = useAuthStore()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  async function openChat() {
    if (!user) { router.push('/login'); return }
    setLoading(true)
    try {
      const res = await api.post<{ id: string }>(`/chat/listings/${listingId}`)
      router.push(`/chat/${res.data.id}`)
    } catch { /* ignore */ } finally { setLoading(false) }
  }
  return (
    <button onClick={openChat} disabled={loading}
      className="w-full h-12 flex items-center justify-center gap-2 bg-white/[0.03] hover:bg-white/[0.06] border border-line-strong disabled:opacity-50 text-fg-2 hover:text-fg rounded-full text-sm font-medium transition-colors">
      <MessageCircle size={15} />
      {loading ? '채팅방 여는 중...' : '판매자와 채팅'}
    </button>
  )
}

/* ─── Inline field row ─────────────────────────── */
function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-line last:border-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-sm text-fg text-right">{children}</span>
    </div>
  )
}

const inputCls = 'w-full h-12 bg-sunken/80 border border-line hover:border-line-strong focus:border-accent/60 focus:ring-4 focus:ring-accent/15 rounded-full px-5 text-sm text-fg placeholder:text-subtle focus:outline-none transition-all'

/* ─── Main page ────────────────────────────────── */
export default function ListingDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuthStore()
  const qc = useQueryClient()

  const [livePrice, setLivePrice] = useState<number | null>(null)
  const [lastBidder, setLastBidder] = useState<string | null>(null)
  const [auctionEndsAt, setAuctionEndsAt] = useState<Date | null>(null)
  const [auctionStatus, setAuctionStatus] = useState<'sold' | 'expired' | null>(null)
  const [extendMsg, setExtendMsg] = useState<string | null>(null)
  const extendTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [bidAmount, setBidAmount] = useState('')
  const [autoBidAmount, setAutoBidAmount] = useState('')
  const [showAutoBid, setShowAutoBid] = useState(false)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxImg, setLightboxImg] = useState('')
  const [copied, setCopied] = useState(false)
  const [offerAmount, setOfferAmount] = useState('')
  const [offerMessage, setOfferMessage] = useState('')
  const [actionMsg, setActionMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportReason, setReportReason] = useState('')
  const [reportDetail, setReportDetail] = useState('')
  const [reportMsg, setReportMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const invalidate = useCallback(() => qc.invalidateQueries({ queryKey: ['listing', id] }), [qc, id])

  const { data: listing, isLoading } = useQuery({
    queryKey: ['listing', id],
    queryFn: () => api.get(`/listings/${id}`).then(r => r.data),
  })

  useEffect(() => {
    if (listing?.auctionEndsAt) setAuctionEndsAt(new Date(listing.auctionEndsAt))
  }, [listing?.auctionEndsAt])

  const { remaining, urgent } = useCountdown(auctionEndsAt)

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { io } = require('socket.io-client') as typeof import('socket.io-client')
    const socket: Socket = io(process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') ?? 'http://localhost:4000', { transports: ['websocket'] })
    socket.emit('join:listing', id)

    const onBidPlaced = (data: { amount: number; bidderNickname: string; extended?: boolean; newEndsAt?: string; extendMinutes?: number }) => {
      setLivePrice(data.amount)
      setLastBidder(data.bidderNickname)
      if (data.extended && data.newEndsAt) {
        setAuctionEndsAt(new Date(data.newEndsAt))
        setExtendMsg(`${data.extendMinutes}분 연장됨`)
        if (extendTimer.current) clearTimeout(extendTimer.current)
        extendTimer.current = setTimeout(() => setExtendMsg(null), 5000)
      }
      invalidate()
    }
    const onSold = () => { setAuctionStatus('sold'); invalidate() }
    const onExpired = () => { setAuctionStatus('expired'); invalidate() }

    socket.on('bid:placed', onBidPlaced)
    socket.on('auction:sold', onSold)
    socket.on('auction:expired', onExpired)

    return () => {
      socket.off('bid:placed', onBidPlaced)
      socket.off('auction:sold', onSold)
      socket.off('auction:expired', onExpired)
      socket.emit('leave:listing', id)
      socket.disconnect()
      if (extendTimer.current) clearTimeout(extendTimer.current)
    }
  }, [id, invalidate])

  const buyMut = useMutation({
    mutationFn: () => api.post(`/listings/${id}/buy`),
    onSuccess: () => { setActionMsg({ type: 'ok', text: '구매가 완료되었습니다! 마이페이지에서 확인하세요.' }); invalidate() },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } }
      setActionMsg({ type: 'err', text: err.response?.data?.message ?? '구매에 실패했습니다.' })
    },
  })

  const bidMut = useMutation({
    mutationFn: (amount: number) => api.post(`/listings/${id}/bid`, { amount }),
    onSuccess: res => {
      const msg = res.data.outbid
        ? res.data.message
        : res.data.instantBuy ? '즉시낙찰 완료!'
        : res.data.extended ? `입찰 완료! 경매가 연장되었습니다.`
        : `입찰 완료! 현재가: ${res.data.currentPrice.toLocaleString()}P`
      setActionMsg({ type: res.data.outbid ? 'err' : 'ok', text: msg })
      setBidAmount(''); invalidate()
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } }
      setActionMsg({ type: 'err', text: err.response?.data?.message ?? '입찰에 실패했습니다.' })
    },
  })

  const autoBidMut = useMutation({
    mutationFn: (maxAmount: number) => api.post(`/listings/${id}/auto-bid`, { maxAmount }),
    onSuccess: res => {
      setActionMsg({ type: 'ok', text: res.data.message })
      setAutoBidAmount(''); setShowAutoBid(false); invalidate()
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } }
      setActionMsg({ type: 'err', text: err.response?.data?.message ?? '자동 입찰 설정에 실패했습니다.' })
    },
  })

  const cancelAutoBidMut = useMutation({
    mutationFn: () => api.delete(`/listings/${id}/auto-bid`),
    onSuccess: () => { setActionMsg({ type: 'ok', text: '자동 입찰이 취소되었습니다.' }); invalidate() },
    onError: () => setActionMsg({ type: 'err', text: '자동 입찰 취소에 실패했습니다.' }),
  })

  const { data: autoBidData } = useQuery({
    queryKey: ['auto-bid', id],
    queryFn: () => api.get(`/listings/${id}/auto-bid`).then(r => r.data),
    enabled: !!user && user.id !== listing?.sellerId,
  })
  const myAutoBid = autoBidData?.autoBid

  const reportMut = useMutation({
    mutationFn: () => api.post('/reports', {
      reportedUserId: listing!.seller.id,
      reason: reportReason,
      detail: reportDetail || undefined,
      listingId: id,
    }).then(r => r.data),
    onSuccess: () => {
      setReportMsg({ type: 'ok', text: '신고가 접수되었습니다. 검토 후 처리됩니다.' })
      setReportReason('')
      setReportDetail('')
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } }
      setReportMsg({ type: 'err', text: err.response?.data?.message ?? '신고 접수에 실패했습니다.' })
    },
  })

  const offerMut = useMutation({
    mutationFn: () => api.post(`/listings/${id}/offer`, { amount: Number(offerAmount), message: offerMessage }),
    onSuccess: () => { setActionMsg({ type: 'ok', text: '가격 제안이 완료되었습니다!' }); setOfferAmount(''); setOfferMessage(''); invalidate() },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } }
      setActionMsg({ type: 'err', text: err.response?.data?.message ?? '제안에 실패했습니다.' })
    },
  })

  /* ── Loading ── */
  if (isLoading) return (
    <div className="max-w-6xl mx-auto">
      <div className="h-5 w-20 bg-surface rounded-lg mb-6 animate-pulse" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 animate-pulse">
        <div className="aspect-[3/4] bg-surface rounded-2xl border border-line" />
        <div className="space-y-4">
          <div className="h-6 bg-surface rounded-lg w-3/4" />
          <div className="h-4 bg-surface rounded-lg w-1/2" />
          <div className="h-32 bg-surface rounded-2xl mt-4" />
        </div>
      </div>
    </div>
  )

  if (!listing) return (
    <div className="text-center py-24">
      <p className="text-5xl mb-4 opacity-20">🃏</p>
      <p className="text-muted-2">리스팅을 찾을 수 없습니다.</p>
      <Link href="/listings" className="mt-4 inline-flex items-center gap-1 text-accent-fg hover:underline text-sm">
        <ChevronLeft size={14} /> 목록으로
      </Link>
    </div>
  )

  const isSeller = user?.id === listing.sellerId
  const isActive = listing.status === 'ACTIVE'
  const currentPrice = livePrice ?? listing.currentPrice
  const endsAt = auctionEndsAt ?? (listing.auctionEndsAt ? new Date(listing.auctionEndsAt) : null)
  const auctionLive = endsAt && new Date() < endsAt && isActive

  const galleryImages: string[] = listing.imageUrls?.length > 0
    ? listing.imageUrls
    : listing.card.imageUrl ? [listing.card.imageUrl] : []

  const statusVariant = listing.status === 'SOLD' ? 'red' : listing.status === 'EXPIRED' ? 'default' : undefined
  const statusLabel = listing.status === 'SOLD' ? '판매완료' : listing.status === 'EXPIRED' ? '유찰' : listing.status === 'CANCELLED' ? '취소됨' : null

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <Link href="/listings"
        className="inline-flex items-center gap-1 h-8 pl-2 pr-3 rounded-full border border-line bg-surface/60 text-sm text-muted hover:text-fg hover:border-line-strong transition-colors group">
        <ChevronLeft size={15} className="group-hover:-translate-x-0.5 transition-transform" />
        마켓플레이스
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-start">
        {/* ── Left: Image ── */}
        <div className="relative lg:sticky lg:top-24">
          <div className="absolute inset-[10%] rounded-full bg-accent/25 blur-3xl pointer-events-none" />
          {lightboxOpen && <Lightbox src={lightboxImg} onClose={() => setLightboxOpen(false)} />}
          {galleryImages.length > 0 ? (
            <ImageGallery images={galleryImages} onLightbox={src => { setLightboxImg(src); setLightboxOpen(true) }} />
          ) : (
            <div className="relative aspect-[3/4] bg-sunken rounded-[28px] border border-line flex items-center justify-center">
              <div className="text-center">
                <span className="text-7xl opacity-20">🃏</span>
                <p className="text-sm text-subtle mt-2">{listing.card.name}</p>
              </div>
            </div>
          )}
          {listing.status === 'SOLD' && (
            <div className="absolute inset-0 bg-bg/70 backdrop-blur-[2px] rounded-[28px] flex items-center justify-center">
              <span className="text-4xl font-black text-red-400 border-4 border-red-400 px-5 py-2 rounded-xl rotate-[-12deg] shadow-[0_0_40px_rgba(239,68,68,0.3)]">
                SOLD
              </span>
            </div>
          )}
        </div>

        {/* ── Right: Info + Actions ── */}
        <div className="space-y-5">
          {/* Badges */}
          <div className="flex flex-wrap gap-1.5">
            <Badge>{TCG_LABELS[listing.card.tcgType] ?? listing.card.tcgType}</Badge>
            <Badge variant={listing.listingType === 'BUY_NOW' ? 'indigo' : listing.listingType === 'AUCTION' ? 'yellow' : 'green'}>
              {LISTING_TYPE_LABELS[listing.listingType]}
            </Badge>
            {statusLabel && statusVariant && <Badge variant={statusVariant}>{statusLabel}</Badge>}
          </div>

          {/* Title */}
          <div>
            {listing.card.cardNumber && (
              <span className="inline-block mb-3 px-2 py-[3px] rounded-md font-mono text-xs font-semibold bg-accent/10 text-accent-fg tracking-wider">
                [{listing.card.cardNumber}]
              </span>
            )}
            <div className="flex items-start gap-3 mb-0.5">
              <h1 className="text-3xl sm:text-[40px] font-extrabold tracking-[-0.03em] leading-[1.1] text-fg flex-1">
                {listing.card.nameKo ?? listing.card.name}
              </h1>
              <div className="flex items-center gap-2 shrink-0 mt-1">
                <WishlistButton cardId={listing.card.id} cardName={listing.card.nameKo ?? listing.card.name} />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.href)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  }}
                  title="링크 복사"
                  className="flex items-center gap-1.5 h-9 px-3.5 rounded-full border border-line bg-surface hover:border-line-strong text-muted hover:text-fg transition-all text-xs font-medium"
                >
                  {copied ? <><Check size={11} className="text-emerald-400" /> 복사됨</> : <><Share2 size={11} /> 공유</>}
                </button>
              </div>
            </div>
            {listing.card.nameKo && listing.card.nameKo !== listing.card.name && (
              <p className="text-sm text-subtle mb-1">{listing.card.name}</p>
            )}
            <p className="text-sm text-muted mt-1">
              {listing.card.setName}
              {listing.card.rarity && ` · ${rarityLabel(listing.card.rarity)}`}
            </p>
          </div>

          {/* ── Action panel ── */}
          <div className="relative overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-surface-2 via-surface to-surface p-6 space-y-5">
            <div className="absolute -top-20 -right-12 w-64 h-64 rounded-full bg-accent/15 blur-3xl pointer-events-none" />

            {/* BUY NOW */}
            {listing.listingType === 'BUY_NOW' && (
              <>
                <div>
                  <p className="relative text-xs text-muted mb-2">판매가</p>
                  <div className="flex items-center gap-2">
                    <span className="font-display text-[40px] font-semibold text-fg tabular-nums leading-none">{listing.buyNowPrice?.toLocaleString()}</span>
                    <span className="text-lg text-muted font-medium self-end mb-1">P</span>
                  </div>
                </div>
                {!isSeller && isActive && (
                  <div className="space-y-2.5">
                    <button onClick={() => { if (!user) { router.push('/login'); return } buyMut.mutate() }}
                      disabled={buyMut.isPending}
                      className="relative w-full h-13 py-3.5 flex items-center justify-center gap-2 bg-gradient-to-r from-accent to-accent-strong disabled:opacity-50 text-white font-semibold rounded-full transition-shadow shadow-[0_8px_28px_-6px_rgba(139,92,246,0.6)] hover:shadow-[0_8px_36px_-4px_rgba(139,92,246,0.8)]">
                      {buyMut.isPending
                        ? <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        : <><Tag size={16} /> 즉시구매</>}
                    </button>
                    <ChatButton listingId={listing.id} />
                    <div className="flex items-center justify-center gap-1.5 text-[10px] text-subtle">
                      <ShieldCheck size={11} className="text-emerald-500/60" />
                      결제 완료 → 판매자 발송 → 수령 확인 → 포인트 정산
                    </div>
                  </div>
                )}
              </>
            )}

            {/* AUCTION */}
            {listing.listingType === 'AUCTION' && (
              <>
                {auctionStatus === 'sold' && (
                  <div className="flex items-center gap-2 bg-red-950/50 border border-red-800/40 text-red-400 rounded-xl px-4 py-3 text-sm">
                    <AlertCircle size={14} /> 경매가 낙찰되었습니다.
                  </div>
                )}
                {auctionStatus === 'expired' && (
                  <div className="flex items-center gap-2 bg-surface-2 border border-line text-muted-2 rounded-xl px-4 py-3 text-sm">
                    <AlertCircle size={14} /> 경매가 유찰되었습니다.
                  </div>
                )}
                {lastBidder && (
                  <div className="flex items-center gap-2 text-xs text-accent-2 bg-accent-tint border border-accent-line/60 rounded-lg px-3 py-2">
                    <Zap size={11} className="animate-live" /> {lastBidder}님이 방금 입찰했습니다
                  </div>
                )}
                {extendMsg && (
                  <div className="flex items-center gap-2 text-xs text-accent-soft bg-accent-tint border border-accent-line/50 rounded-lg px-3 py-2">
                    <ShieldAlert size={11} /> {extendMsg}
                  </div>
                )}

                <div>
                  <p className="relative text-xs text-muted mb-2">
                    현재가 {livePrice && livePrice !== listing.currentPrice && (
                      <span className="ml-1 text-accent-2 normal-case">실시간</span>
                    )}
                  </p>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-display text-[40px] font-semibold text-fg tabular-nums leading-none">{currentPrice?.toLocaleString()}</span>
                    <span className="text-lg text-muted font-medium self-end mb-1">P</span>
                  </div>
                  <p className="text-xs text-subtle">시작가: {listing.startingPrice?.toLocaleString()}P</p>
                </div>

                {listing.instantBuyPrice && isActive && (
                  <div className="flex items-center gap-2 bg-orange-500/10 border border-orange-400/20 rounded-full px-4 h-9">
                    <Flame size={13} className="text-orange-400" />
                    <span className="text-xs text-orange-300 font-medium">즉시낙찰가: {listing.instantBuyPrice.toLocaleString()}P</span>
                  </div>
                )}

                {endsAt && (
                  <div className={`flex items-center gap-2 rounded-full px-4 h-10 border text-sm font-medium tabular-nums ${
                    urgent
                      ? 'bg-rose-500/10 border-rose-400/30 text-rose-300'
                      : 'bg-cyan-400/10 border-cyan-300/20 text-cyan-200'
                  }`}>
                    <Clock size={14} className={urgent ? 'animate-live' : ''} />
                    {new Date(endsAt) > new Date() ? `${remaining} 남음` : '경매 종료'}
                  </div>
                )}

                {listing.autoExtendMinutes && isActive && (
                  <div className="flex items-center gap-2 text-xs text-muted-2">
                    <ShieldAlert size={11} className="text-accent-fg/60" />
                    마감 {listing.autoExtendMinutes}분 전 입찰 시 {listing.autoExtendMinutes}분 연장 (최대 {listing.maxAutoExtends}회)
                  </div>
                )}

                {!isSeller && isActive && auctionLive && (
                  <div className="space-y-2.5 pt-1">
                    {/* 수동 입찰 */}
                    <input type="number" value={bidAmount} onChange={e => setBidAmount(e.target.value)}
                      placeholder={`${((currentPrice ?? 0) + 1).toLocaleString()}P 이상`}
                      className={inputCls} />
                    <div className="flex gap-2">
                      <button onClick={() => { if (!user) { router.push('/login'); return } bidMut.mutate(Number(bidAmount)) }}
                        disabled={bidMut.isPending || !bidAmount}
                        className="flex-1 h-12 flex items-center justify-center gap-2 bg-gradient-to-r from-accent to-accent-strong disabled:opacity-50 text-white font-semibold rounded-full transition-shadow shadow-[0_8px_28px_-6px_rgba(139,92,246,0.6)] hover:shadow-[0_8px_36px_-4px_rgba(139,92,246,0.8)]">
                        {bidMut.isPending
                          ? <span className="w-4 h-4 rounded-full border-2 border-bg/30 border-t-bg animate-spin" />
                          : <><Gavel size={16} /> 입찰하기</>}
                      </button>
                      {listing.instantBuyPrice && (
                        <button onClick={() => { if (!user) { router.push('/login'); return } bidMut.mutate(listing.instantBuyPrice!) }}
                          disabled={bidMut.isPending}
                          className="flex items-center gap-1.5 px-5 h-12 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white font-semibold rounded-full text-sm transition-colors whitespace-nowrap">
                          <Flame size={14} /> 즉시낙찰
                        </button>
                      )}
                    </div>

                    {/* 자동 입찰 패널 */}
                    <div className="border-t border-line pt-2.5">
                      {myAutoBid ? (
                        <div className="flex items-center justify-between bg-accent-tint border border-accent-line/60 rounded-xl px-3 py-2.5">
                          <div className="flex items-center gap-2 text-xs text-accent-2">
                            <Bot size={13} />
                            <span>자동 입찰 설정됨: <strong className="tabular-nums">{myAutoBid.maxAmount.toLocaleString()}P</strong> 한도</span>
                          </div>
                          <button
                            onClick={() => cancelAutoBidMut.mutate()}
                            disabled={cancelAutoBidMut.isPending}
                            className="text-[10px] text-red-400 hover:text-red-300 border border-red-700/40 px-2 py-1 rounded-lg transition-colors"
                          >
                            취소
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setShowAutoBid(v => !v)}
                          className={`w-full flex items-center justify-center gap-1.5 h-10 rounded-full text-xs font-medium border transition-all ${
                            showAutoBid
                              ? 'bg-accent-tint border-accent-line text-accent-2'
                              : 'bg-transparent border-line text-subtle hover:border-line-strong hover:text-fg-3'
                          }`}
                        >
                          <Bot size={13} /> 자동 입찰 설정
                        </button>
                      )}
                      {showAutoBid && !myAutoBid && (
                        <div className="mt-2 space-y-2">
                          <p className="text-[10px] text-subtle leading-relaxed">
                            최대 입찰 한도를 설정하면 다른 입찰자가 나타날 때 자동으로 1P씩 올려 입찰합니다.
                          </p>
                          <div className="flex gap-2">
                            <input
                              type="number"
                              value={autoBidAmount}
                              onChange={e => setAutoBidAmount(e.target.value)}
                              placeholder={`최대 한도 (최소 ${((currentPrice ?? 0) + 1).toLocaleString()}P)`}
                              className={inputCls}
                            />
                            <button
                              onClick={() => { if (!user) { router.push('/login'); return } autoBidMut.mutate(Number(autoBidAmount)) }}
                              disabled={autoBidMut.isPending || !autoBidAmount}
                              className="px-5 h-12 bg-accent hover:bg-accent-strong disabled:opacity-50 text-white font-semibold rounded-full text-sm transition-colors whitespace-nowrap"
                            >
                              {autoBidMut.isPending ? '...' : '설정'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {listing.bids?.length > 0 && (
                  <div className="space-y-1 pt-3 border-t border-line">
                    <p className="text-xs text-subtle font-semibold uppercase tracking-wider mb-2">
                      입찰 내역 ({listing.bids.length}건)
                    </p>
                    {listing.bids.slice(0, 5).map((bid: { id: string; bidder: { nickname: string }; amount: number; createdAt: string; isWinning: boolean; isAuto?: boolean }) => (
                      <div key={bid.id} className={`flex justify-between items-center py-1.5 text-xs ${bid.isWinning ? 'text-accent-2' : 'text-muted-2'}`}>
                        <span className="flex items-center gap-1.5">
                          {bid.isWinning && <Check size={10} className="text-accent-2" />}
                          {bid.isAuto && <Bot size={10} className="text-muted-2" />}
                          {bid.bidder.nickname}
                        </span>
                        <span className="font-semibold tabular-nums">{bid.amount.toLocaleString()}P</span>
                        <span className="text-subtle">{format(new Date(bid.createdAt), 'MM/dd HH:mm')}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* OFFER */}
            {listing.listingType === 'OFFER' && (
              <>
                <div>
                  <p className="relative text-xs text-muted mb-2">최소 제안가</p>
                  <div className="flex items-center gap-2">
                    <span className="font-display text-[40px] font-semibold text-fg tabular-nums leading-none">{listing.minOfferPrice?.toLocaleString()}</span>
                    <span className="text-lg text-muted font-medium self-end mb-1">P</span>
                  </div>
                </div>
                {!isSeller && isActive && (
                  <div className="space-y-2.5">
                    <input type="number" value={offerAmount} onChange={e => setOfferAmount(e.target.value)}
                      placeholder="제안 금액 (P)" className={inputCls} />
                    <input type="text" value={offerMessage} onChange={e => setOfferMessage(e.target.value)}
                      placeholder="메시지 (선택)" className={inputCls} />
                    <button onClick={() => { if (!user) { router.push('/login'); return } offerMut.mutate() }}
                      disabled={offerMut.isPending || !offerAmount}
                      className="w-full h-12 flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white font-semibold rounded-full transition-colors shadow-[0_8px_28px_-8px_rgba(16,185,129,0.6)]">
                      {offerMut.isPending
                        ? <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        : <><Handshake size={16} /> 가격 제안하기</>}
                    </button>
                    <ChatButton listingId={listing.id} />
                  </div>
                )}
              </>
            )}

            {/* Result message */}
            {actionMsg && (
              <div className={`flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm border ${
                actionMsg.type === 'ok'
                  ? 'bg-emerald-950/50 border-emerald-800/40 text-emerald-400'
                  : 'bg-red-950/50 border-red-800/40 text-red-400'
              }`}>
                {actionMsg.type === 'ok' ? <Check size={14} className="shrink-0 mt-0.5" /> : <AlertCircle size={14} className="shrink-0 mt-0.5" />}
                {actionMsg.text}
              </div>
            )}
          </div>

          {/* Card info panel */}
          <div className="bg-surface/70 border border-line rounded-3xl px-5">
            <InfoRow label="컨디션">{CONDITION_LABELS[listing.condition]}</InfoRow>
            <InfoRow label="그레이딩">
              {listing.gradingCompany
                ? <span className="flex items-center gap-1.5 justify-end">
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-accent-tint text-accent-soft border border-accent-line">{listing.gradingCompany}</span>
                    {listing.gradingGrade && <span className="font-bold text-white">{listing.gradingGrade}</span>}
                  </span>
                : <span className="text-subtle">None</span>}
            </InfoRow>
            <InfoRow label="수량">{listing.quantity}장</InfoRow>
            <InfoRow label="판매자">
              <span className="flex items-center gap-2 flex-wrap">
                <Link href={`/users/${listing.sellerId}`} className="hover:text-accent-fg transition-colors">
                  {listing.seller.nickname}
                </Link>
                <RatingBadge avgRating={listing.seller.avgRating ?? null} reviewCount={listing.seller.reviewCount ?? 0} />
                <SellerGradeBadge sellerId={listing.sellerId} />
              </span>
            </InfoRow>
            <InfoRow label="등록일">{format(new Date(listing.createdAt), 'yyyy.MM.dd HH:mm')}</InfoRow>
            {listing.viewCount > 0 && (
              <InfoRow label="조회수">
                <span className="flex items-center gap-1 text-muted-2">
                  <Eye size={11} /> {listing.viewCount.toLocaleString()}명이 봤어요
                </span>
              </InfoRow>
            )}
          </div>

          {/* Description */}
          {listing.description && (
            <div className="bg-surface/70 border border-line rounded-3xl p-5 text-sm text-fg-3 whitespace-pre-wrap leading-relaxed">
              {listing.description}
            </div>
          )}

          {/* Official card image (when real photos exist) */}
          {listing.imageUrls?.length > 0 && listing.card.imageUrl && (
            <div className="flex items-center gap-3 bg-surface border border-line rounded-xl p-3">
              <div className="relative w-10 h-14 shrink-0 rounded-lg overflow-hidden border border-line">
                <Image src={resolveImageSrc(listing.card.imageUrl)!} alt={listing.card.name} fill className="object-cover" />
              </div>
              <p className="text-xs text-subtle">공식 카드 이미지</p>
            </div>
          )}

          {/* 시세 현황 */}
          {listing.cardMarket && (
            <MarketStatsPanel
              cardMarket={listing.cardMarket}
              currentPrice={
                listing.listingType === 'BUY_NOW' ? listing.buyNowPrice
                : listing.listingType === 'AUCTION' ? (livePrice ?? listing.currentPrice)
                : listing.minOfferPrice
              }
              listingType={listing.listingType}
            />
          )}

          {/* 판매자 신뢰 지표 */}
          {listing.sellerStats && (
            <div className="bg-surface/70 border border-line rounded-3xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-subtle uppercase tracking-wider font-semibold">판매자 신뢰도</p>
                <RatingBadge avgRating={listing.seller.avgRating ?? null} reviewCount={listing.seller.reviewCount ?? 0} />
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="font-display text-2xl font-semibold text-fg tabular-nums">{listing.sellerStats.totalSales}</p>
                  <p className="text-[10px] text-subtle mt-0.5">총 거래</p>
                </div>
                <div>
                  <p className="font-display text-2xl font-semibold text-emerald-400 tabular-nums">{listing.sellerStats.completedSales}</p>
                  <p className="text-[10px] text-subtle mt-0.5">완료</p>
                </div>
                <div>
                  <p className={`text-lg font-bold tabular-nums ${
                    listing.sellerStats.completionRate === null ? 'text-subtle'
                    : listing.sellerStats.completionRate >= 90 ? 'text-emerald-400'
                    : listing.sellerStats.completionRate >= 70 ? 'text-yellow-400'
                    : 'text-red-400'
                  }`}>
                    {listing.sellerStats.completionRate === null ? '—' : `${listing.sellerStats.completionRate}%`}
                  </p>
                  <p className="text-[10px] text-subtle mt-0.5">거래완료율</p>
                </div>
              </div>
              {listing.sellerStats.totalSales === 0 && (
                <p className="text-[10px] text-subtle text-center">첫 거래 판매자입니다. 거래 시 유의하세요.</p>
              )}
            </div>
          )}

          {/* 이 카드 체결 가격 히스토리 */}
          <PriceHistoryChart cardId={listing.card.id} />

          {/* 이 카드의 다른 리스팅 */}
          <ComparableListings cardId={listing.card.id} currentListingId={listing.id} />

          {/* 판매자 리뷰 */}
          <SellerReviews sellerId={listing.sellerId} viewerId={user?.id ?? null} />

          {/* 신고 버튼 */}
          {user && !isSeller && (
            <div className="flex justify-end">
              <button
                onClick={() => { setReportOpen(true); setReportMsg(null) }}
                className="flex items-center gap-1.5 text-xs text-subtle hover:text-red-400 transition-colors"
              >
                <Flag size={11} />
                판매자 신고
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 신고 모달 */}
      {reportOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-sunken border border-line rounded-2xl w-full max-w-md space-y-5 p-6">
            <h3 className="text-base font-bold text-fg flex items-center gap-2">
              <Flag size={15} className="text-red-400" />
              판매자 신고
            </h3>

            {reportMsg ? (
              <div className={`flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm border ${
                reportMsg.type === 'ok'
                  ? 'bg-emerald-950/50 border-emerald-800/40 text-emerald-400'
                  : 'bg-red-950/50 border-red-800/40 text-red-400'
              }`}>
                {reportMsg.type === 'ok' ? <Check size={14} className="shrink-0 mt-0.5" /> : <AlertCircle size={14} className="shrink-0 mt-0.5" />}
                {reportMsg.text}
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <label className="text-xs text-muted-2 font-semibold uppercase tracking-wider">신고 유형</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { value: 'FAKE_ITEM',    label: '가짜/위조 카드' },
                      { value: 'NO_SHIPMENT',  label: '미발송/잠수' },
                      { value: 'WRONG_ITEM',   label: '다른 물품 발송' },
                      { value: 'DAMAGED_ITEM', label: '손상 물품 발송' },
                      { value: 'FRAUD',        label: '사기 의심' },
                      { value: 'HARASSMENT',   label: '괴롭힘/욕설' },
                      { value: 'OTHER',        label: '기타' },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setReportReason(opt.value)}
                        className={`px-3 py-2 rounded-xl text-xs font-medium border text-left transition-colors ${
                          reportReason === opt.value
                            ? 'bg-red-900/30 text-red-400 border-red-700/40'
                            : 'bg-surface text-muted-2 border-line hover:border-line-strong hover:text-fg-3'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-muted-2 font-semibold uppercase tracking-wider">상세 내용 (선택)</label>
                  <textarea
                    value={reportDetail}
                    onChange={e => setReportDetail(e.target.value)}
                    rows={3}
                    placeholder="구체적인 상황을 설명해주세요..."
                    className="w-full bg-surface border border-line hover:border-line-strong focus:border-accent/40 rounded-xl px-4 py-2.5 text-sm text-fg placeholder:text-subtle focus:outline-none resize-none transition-colors"
                  />
                </div>

                <p className="text-[10px] text-subtle leading-relaxed">
                  허위 신고는 계정 제재를 받을 수 있습니다. 관리자 검토 후 처리됩니다.
                </p>
              </>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => { setReportOpen(false); setReportReason(''); setReportDetail(''); setReportMsg(null) }}
                className="flex-1 py-2.5 rounded-xl border border-line text-muted-2 hover:text-fg-3 hover:border-line-strong text-sm transition-colors"
              >
                {reportMsg ? '닫기' : '취소'}
              </button>
              {!reportMsg && (
                <button
                  onClick={() => reportMut.mutate()}
                  disabled={!reportReason || reportMut.isPending}
                  className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {reportMut.isPending ? '접수 중...' : '신고하기'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

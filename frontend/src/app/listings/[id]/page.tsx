'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import Badge from '@/components/ui/Badge'
import { TCG_LABELS, CONDITION_LABELS, LISTING_TYPE_LABELS, rarityLabel } from '@/lib/utils'
import { format } from 'date-fns'
import { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'
import {
  Clock, Gavel, Tag, Handshake, ChevronLeft, ChevronRight,
  Zap, ShieldAlert, Flame, MessageCircle, ShieldCheck, AlertCircle, Check, Flag,
  Star, Reply,
} from 'lucide-react'
import Link from 'next/link'
import { io, Socket } from 'socket.io-client'
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
    <div className="bg-[#1a1410] border border-[#2e2318] rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-[#2e2318] flex items-center justify-between">
        <p className="text-[10px] text-[#5a4830] uppercase tracking-wider font-semibold flex items-center gap-1.5">
          <Star size={11} className="text-[#f0a832] fill-[#f0a832]" /> 판매자 리뷰 ({data?.total ?? 0})
        </p>
        {data?.avgRating && (
          <span className="text-xs text-[#f0a832] font-bold tabular-nums">★ {Number(data.avgRating).toFixed(1)}</span>
        )}
      </div>
      <div className="divide-y divide-[#1e1810]">
        {reviews.map(rv => (
          <div key={rv.id} className="px-4 py-3 space-y-2">
            <div className="flex items-start gap-2">
              <div className="w-7 h-7 rounded-full bg-[#2a1c0c] border border-[#3a2510] shrink-0 flex items-center justify-center text-xs font-bold text-[#f0a832] overflow-hidden">
                {rv.reviewer.avatarUrl
                  ? <img src={rv.reviewer.avatarUrl} alt="" className="w-full h-full object-cover" />
                  : rv.reviewer.nickname[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-[#c8b48a]">{rv.reviewer.nickname}</span>
                  <span className="text-xs text-[#f0a832]">{'★'.repeat(rv.rating)}{'☆'.repeat(5 - rv.rating)}</span>
                  <span className="text-[10px] text-[#4a3820] ml-auto">{format(new Date(rv.createdAt), 'yy.MM.dd')}</span>
                </div>
                {rv.comment && <p className="text-xs text-[#9e8a6a] mt-1 leading-relaxed">{rv.comment}</p>}
              </div>
            </div>

            {/* 판매자 답글 표시 */}
            {rv.sellerReply && (
              <div className="ml-9 bg-[#1a1208] border border-[#2e2318] rounded-xl px-3 py-2 space-y-0.5">
                <p className="text-[10px] text-[#d4a853] font-semibold flex items-center gap-1">
                  <Reply size={9} /> 판매자 답글
                </p>
                <p className="text-xs text-[#9e8a6a] leading-relaxed">{rv.sellerReply}</p>
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
                    className="w-full bg-[#1a1208] border border-[#2e2318] focus:border-[#d4a853]/60 rounded-xl px-3 py-2 text-xs text-[#f5ead8] placeholder:text-[#4a3820] outline-none resize-none"
                  />
                  {replyErr && <p className="text-[10px] text-red-400">{replyErr}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={() => replyMut.mutate(rv.id)}
                      disabled={replyText.trim().length < 1 || replyMut.isPending}
                      className="px-3 py-1.5 bg-[#d4a853] hover:bg-[#c49440] disabled:opacity-40 text-white rounded-lg text-[11px] font-medium"
                    >
                      등록
                    </button>
                    <button
                      onClick={() => { setReplyId(null); setReplyText(''); setReplyErr('') }}
                      className="px-3 py-1.5 bg-[#1a1208] border border-[#2e2318] text-[#7a6040] rounded-lg text-[11px]"
                    >
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => { setReplyId(rv.id); setReplyText('') }}
                  className="ml-9 flex items-center gap-1 text-[10px] text-[#5a4830] hover:text-[#d4a853] transition-colors"
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

/* ─── Image gallery ───────────────────────────── */
function ImageGallery({ images }: { images: string[] }) {
  const [active, setActive] = useState(0)
  if (!images.length) return null
  return (
    <div className="space-y-3">
      <div className="relative aspect-[3/4] bg-[#100c08] rounded-2xl overflow-hidden border border-[#2e2318]">
        <Image src={images[active]} alt={`사진 ${active + 1}`} fill className="object-contain" />
        {images.length > 1 && (
          <>
            <button onClick={() => setActive(a => (a - 1 + images.length) % images.length)}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-[#0f0b08]/80 hover:bg-[#1a1410] backdrop-blur-sm text-white rounded-full border border-[#2e2318] transition-colors">
              <ChevronLeft size={16} />
            </button>
            <button onClick={() => setActive(a => (a + 1) % images.length)}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-[#0f0b08]/80 hover:bg-[#1a1410] backdrop-blur-sm text-white rounded-full border border-[#2e2318] transition-colors">
              <ChevronRight size={16} />
            </button>
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
              {images.map((_, i) => (
                <button key={i} onClick={() => setActive(i)}
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
              className={`relative shrink-0 w-16 h-20 rounded-xl overflow-hidden border-2 transition-all ${
                i === active ? 'border-[#d4a853] shadow-[0_0_10px_rgba(212,168,83,0.3)]' : 'border-[#2e2318] hover:border-[#4a3520]'
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
      className="w-full h-11 flex items-center justify-center gap-2 bg-[#1a1410] hover:bg-[#221a12] border border-[#2e2318] hover:border-[#4a3520] disabled:opacity-50 text-[#9e8a6a] hover:text-[#e8d5b0] rounded-xl text-sm font-medium transition-all duration-200">
      <MessageCircle size={15} />
      {loading ? '채팅방 여는 중...' : '판매자와 채팅'}
    </button>
  )
}

/* ─── Inline field row ─────────────────────────── */
function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between py-2.5 border-b border-[#2e2318] last:border-0">
      <span className="text-[12px] text-[#7a6040] font-medium uppercase tracking-wider">{label}</span>
      <span className="text-[13px] text-[#e8d5b0] text-right">{children}</span>
    </div>
  )
}

const inputCls = 'w-full bg-[#100c08] border border-[#2e2318] hover:border-[#4a3520] focus:border-[#d4a853]/40 rounded-xl px-4 py-3 text-sm text-[#f5ead8] placeholder:text-[#5a4830] focus:outline-none transition-colors'

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
      const msg = res.data.instantBuy ? '즉시낙찰 완료!' : res.data.extended ? `입찰 완료! 경매가 연장되었습니다.` : `입찰 완료! 현재가: ${res.data.currentPrice.toLocaleString()}P`
      setActionMsg({ type: 'ok', text: msg })
      setBidAmount(''); invalidate()
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } }
      setActionMsg({ type: 'err', text: err.response?.data?.message ?? '입찰에 실패했습니다.' })
    },
  })

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
    <div className="max-w-4xl mx-auto">
      <div className="h-5 w-20 bg-[#1a1410] rounded-lg mb-6 animate-pulse" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-pulse">
        <div className="aspect-[3/4] bg-[#1a1410] rounded-2xl border border-[#2e2318]" />
        <div className="space-y-4">
          <div className="h-6 bg-[#1a1410] rounded-lg w-3/4" />
          <div className="h-4 bg-[#1a1410] rounded-lg w-1/2" />
          <div className="h-32 bg-[#1a1410] rounded-2xl mt-4" />
        </div>
      </div>
    </div>
  )

  if (!listing) return (
    <div className="text-center py-24">
      <p className="text-5xl mb-4 opacity-20">🃏</p>
      <p className="text-[#7a6040]">리스팅을 찾을 수 없습니다.</p>
      <Link href="/listings" className="mt-4 inline-flex items-center gap-1 text-[#d4a853] hover:underline text-sm">
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
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <Link href="/listings"
        className="inline-flex items-center gap-1.5 text-sm text-[#7a6040] hover:text-[#e8d5b0] transition-colors group">
        <ChevronLeft size={15} className="group-hover:-translate-x-0.5 transition-transform" />
        마켓플레이스로 돌아가기
      </Link>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* ── Left: Image ── */}
        <div className="relative">
          {galleryImages.length > 0 ? (
            <ImageGallery images={galleryImages} />
          ) : (
            <div className="aspect-[3/4] bg-[#100c08] rounded-2xl border border-[#2e2318] flex items-center justify-center">
              <div className="text-center">
                <span className="text-7xl opacity-20">🃏</span>
                <p className="text-sm text-[#5a4830] mt-2">{listing.card.name}</p>
              </div>
            </div>
          )}
          {listing.status === 'SOLD' && (
            <div className="absolute inset-0 bg-[#0f0b08]/70 backdrop-blur-[2px] rounded-2xl flex items-center justify-center">
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
              <span className="inline-block mb-2 px-2 py-[3px] rounded font-mono text-xs font-semibold bg-[#1a1208] border border-[#2e2318] text-[#7a6040] tracking-wider">
                {listing.card.setCode
                  ? `${listing.card.setCode}-${listing.card.cardNumber}`
                  : listing.card.cardNumber}
              </span>
            )}
            <div className="flex items-start gap-3 mb-0.5">
              <h1 className="text-2xl font-bold text-white tracking-tight flex-1">
                {listing.card.nameKo ?? listing.card.name}
              </h1>
              <WishlistButton cardId={listing.card.id} cardName={listing.card.nameKo ?? listing.card.name} />
            </div>
            {listing.card.nameKo && listing.card.nameKo !== listing.card.name && (
              <p className="text-sm text-[#5a4830] mb-1">{listing.card.name}</p>
            )}
            <p className="text-sm text-[#7a6040]">
              {listing.card.setName}
              {listing.card.rarity && ` · ${rarityLabel(listing.card.rarity)}`}
            </p>
          </div>

          {/* Card info panel */}
          <div className="bg-[#1a1410] border border-[#2e2318] rounded-2xl px-4">
            <InfoRow label="컨디션">{CONDITION_LABELS[listing.condition]}</InfoRow>
            <InfoRow label="그레이딩">
              {listing.gradingCompany
                ? <span className="flex items-center gap-1.5 justify-end">
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#2a1c08] text-[#e0b878] border border-[#3d2a0c]">{listing.gradingCompany}</span>
                    {listing.gradingGrade && <span className="font-bold text-white">{listing.gradingGrade}</span>}
                  </span>
                : <span className="text-[#5a4830]">None</span>}
            </InfoRow>
            <InfoRow label="수량">{listing.quantity}장</InfoRow>
            <InfoRow label="판매자">
              <span className="flex items-center gap-2 flex-wrap">
                <Link href={`/users/${listing.sellerId}`} className="hover:text-[#d4a853] transition-colors">
                  {listing.seller.nickname}
                </Link>
                <RatingBadge avgRating={listing.seller.avgRating ?? null} reviewCount={listing.seller.reviewCount ?? 0} />
              </span>
            </InfoRow>
            <InfoRow label="등록일">{format(new Date(listing.createdAt), 'yyyy.MM.dd HH:mm')}</InfoRow>
          </div>

          {/* Description */}
          {listing.description && (
            <div className="bg-[#1a1410] border border-[#2e2318] rounded-2xl p-4 text-sm text-[#9e8a6a] whitespace-pre-wrap leading-relaxed">
              {listing.description}
            </div>
          )}

          {/* Official card image (when real photos exist) */}
          {listing.imageUrls?.length > 0 && listing.card.imageUrl && (
            <div className="flex items-center gap-3 bg-[#1a1410] border border-[#2e2318] rounded-xl p-3">
              <div className="relative w-10 h-14 shrink-0 rounded-lg overflow-hidden border border-[#2e2318]">
                <Image src={listing.card.imageUrl} alt={listing.card.name} fill className="object-cover" />
              </div>
              <p className="text-xs text-[#5a4830]">공식 카드 이미지</p>
            </div>
          )}

          {/* ── Action panel ── */}
          <div className="bg-[#1a1410] border border-[#2e2318] rounded-2xl p-5 space-y-4">

            {/* BUY NOW */}
            {listing.listingType === 'BUY_NOW' && (
              <>
                <div>
                  <p className="text-[10px] text-[#5a4830] uppercase tracking-wider font-semibold mb-1">판매가</p>
                  <div className="flex items-center gap-2">
                    <Tag size={18} className="text-[#d4a853]" />
                    <span className="text-3xl font-bold text-[#f0a832] tabular-nums">{listing.buyNowPrice?.toLocaleString()}</span>
                    <span className="text-lg text-[#6b4c1a]">P</span>
                  </div>
                </div>
                {!isSeller && isActive && (
                  <div className="space-y-2.5">
                    <button onClick={() => { if (!user) { router.push('/login'); return } buyMut.mutate() }}
                      disabled={buyMut.isPending}
                      className="w-full h-12 flex items-center justify-center gap-2 bg-[#d4a853] hover:bg-[#c49440] disabled:opacity-50 text-white font-bold rounded-xl transition-all shadow-[0_0_20px_rgba(212,168,83,0.25)] hover:shadow-[0_0_28px_rgba(212,168,83,0.4)]">
                      {buyMut.isPending
                        ? <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        : <><Tag size={16} /> 즉시구매</>}
                    </button>
                    <ChatButton listingId={listing.id} />
                    <div className="flex items-center justify-center gap-1.5 text-[10px] text-[#4a3820]">
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
                  <div className="flex items-center gap-2 bg-[#221a12] border border-[#2e2318] text-[#7a6040] rounded-xl px-4 py-3 text-sm">
                    <AlertCircle size={14} /> 경매가 유찰되었습니다.
                  </div>
                )}
                {lastBidder && (
                  <div className="flex items-center gap-2 text-xs text-[#f0a832] bg-[#1a1000] border border-[#3d2e0c]/60 rounded-lg px-3 py-2">
                    <Zap size={11} className="animate-live" /> {lastBidder}님이 방금 입찰했습니다
                  </div>
                )}
                {extendMsg && (
                  <div className="flex items-center gap-2 text-xs text-[#e0b878] bg-[#2a1c0c] border border-[#3d2a0c]/50 rounded-lg px-3 py-2">
                    <ShieldAlert size={11} /> {extendMsg}
                  </div>
                )}

                <div>
                  <p className="text-[10px] text-[#5a4830] uppercase tracking-wider font-semibold mb-1">
                    현재가 {livePrice && livePrice !== listing.currentPrice && (
                      <span className="ml-1 text-[#f0a832] normal-case">실시간</span>
                    )}
                  </p>
                  <div className="flex items-center gap-2 mb-1">
                    <Gavel size={18} className="text-[#f0a832]" />
                    <span className="text-3xl font-bold text-[#f0a832] tabular-nums">{currentPrice?.toLocaleString()}</span>
                    <span className="text-lg text-[#6b4c1a]">P</span>
                  </div>
                  <p className="text-xs text-[#5a4830]">시작가: {listing.startingPrice?.toLocaleString()}P</p>
                </div>

                {listing.instantBuyPrice && isActive && (
                  <div className="flex items-center gap-2 bg-[#1e1000] border border-[#3d2510]/60 rounded-xl px-3 py-2">
                    <Flame size={13} className="text-orange-400" />
                    <span className="text-xs text-orange-300 font-medium">즉시낙찰가: {listing.instantBuyPrice.toLocaleString()}P</span>
                  </div>
                )}

                {endsAt && (
                  <div className={`flex items-center gap-2 rounded-xl px-3 py-2.5 border text-sm font-medium ${
                    urgent
                      ? 'bg-red-950/50 border-red-800/40 text-red-400'
                      : 'bg-[#221a12] border-[#2e2318] text-[#f0a832]'
                  }`}>
                    <Clock size={14} className={urgent ? 'animate-live' : ''} />
                    {new Date(endsAt) > new Date() ? `${remaining} 남음` : '경매 종료'}
                  </div>
                )}

                {listing.autoExtendMinutes && isActive && (
                  <div className="flex items-center gap-2 text-xs text-[#7a6040]">
                    <ShieldAlert size={11} className="text-[#d4a853]/60" />
                    마감 {listing.autoExtendMinutes}분 전 입찰 시 {listing.autoExtendMinutes}분 연장 (최대 {listing.maxAutoExtends}회)
                  </div>
                )}

                {!isSeller && isActive && auctionLive && (
                  <div className="space-y-2.5 pt-1">
                    <input type="number" value={bidAmount} onChange={e => setBidAmount(e.target.value)}
                      placeholder={`${((currentPrice ?? 0) + 1).toLocaleString()}P 이상`}
                      className={inputCls} />
                    <div className="flex gap-2">
                      <button onClick={() => { if (!user) { router.push('/login'); return } bidMut.mutate(Number(bidAmount)) }}
                        disabled={bidMut.isPending || !bidAmount}
                        className="flex-1 h-12 flex items-center justify-center gap-2 bg-[#f0a832] hover:bg-[#d4922a] disabled:opacity-50 text-[#0f0b08] font-bold rounded-xl transition-all shadow-[0_0_16px_rgba(240,168,50,0.2)] hover:shadow-[0_0_24px_rgba(240,168,50,0.35)]">
                        {bidMut.isPending
                          ? <span className="w-4 h-4 rounded-full border-2 border-[#0f0b08]/30 border-t-[#0f0b08] animate-spin" />
                          : <><Gavel size={16} /> 입찰하기</>}
                      </button>
                      {listing.instantBuyPrice && (
                        <button onClick={() => { if (!user) { router.push('/login'); return } bidMut.mutate(listing.instantBuyPrice!) }}
                          disabled={bidMut.isPending}
                          className="flex items-center gap-1.5 px-4 h-12 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-all whitespace-nowrap">
                          <Flame size={14} /> 즉시낙찰
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {listing.bids?.length > 0 && (
                  <div className="space-y-1 pt-3 border-t border-[#2e2318]">
                    <p className="text-xs text-[#5a4830] font-semibold uppercase tracking-wider mb-2">
                      입찰 내역 ({listing.bids.length}건)
                    </p>
                    {listing.bids.slice(0, 5).map((bid: { id: string; bidder: { nickname: string }; amount: number; createdAt: string; isWinning: boolean }) => (
                      <div key={bid.id} className={`flex justify-between items-center py-1.5 text-xs ${bid.isWinning ? 'text-[#f0a832]' : 'text-[#7a6040]'}`}>
                        <span className="flex items-center gap-1.5">
                          {bid.isWinning && <Check size={10} className="text-[#f0a832]" />}
                          {bid.bidder.nickname}
                        </span>
                        <span className="font-semibold tabular-nums">{bid.amount.toLocaleString()}P</span>
                        <span className="text-[#4a3820]">{format(new Date(bid.createdAt), 'MM/dd HH:mm')}</span>
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
                  <p className="text-[10px] text-[#5a4830] uppercase tracking-wider font-semibold mb-1">최소 제안가</p>
                  <div className="flex items-center gap-2">
                    <Handshake size={18} className="text-emerald-400" />
                    <span className="text-3xl font-bold text-[#f0a832] tabular-nums">{listing.minOfferPrice?.toLocaleString()}</span>
                    <span className="text-lg text-[#6b4c1a]">P</span>
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
                      className="w-full h-12 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl transition-all shadow-[0_0_16px_rgba(16,185,129,0.2)]">
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

          {/* 판매자 신뢰 지표 */}
          {listing.sellerStats && (
            <div className="bg-[#1a1410] border border-[#2e2318] rounded-2xl px-4 py-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-[#5a4830] uppercase tracking-wider font-semibold">판매자 신뢰도</p>
                <RatingBadge avgRating={listing.seller.avgRating ?? null} reviewCount={listing.seller.reviewCount ?? 0} />
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-lg font-bold text-[#f5ead8] tabular-nums">{listing.sellerStats.totalSales}</p>
                  <p className="text-[10px] text-[#5a4830] mt-0.5">총 거래</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-emerald-400 tabular-nums">{listing.sellerStats.completedSales}</p>
                  <p className="text-[10px] text-[#5a4830] mt-0.5">완료</p>
                </div>
                <div>
                  <p className={`text-lg font-bold tabular-nums ${
                    listing.sellerStats.completionRate === null ? 'text-[#5a4830]'
                    : listing.sellerStats.completionRate >= 90 ? 'text-emerald-400'
                    : listing.sellerStats.completionRate >= 70 ? 'text-yellow-400'
                    : 'text-red-400'
                  }`}>
                    {listing.sellerStats.completionRate === null ? '—' : `${listing.sellerStats.completionRate}%`}
                  </p>
                  <p className="text-[10px] text-[#5a4830] mt-0.5">거래완료율</p>
                </div>
              </div>
              {listing.sellerStats.totalSales === 0 && (
                <p className="text-[10px] text-[#5a4830] text-center">첫 거래 판매자입니다. 거래 시 유의하세요.</p>
              )}
            </div>
          )}

          {/* 이 카드 체결 가격 히스토리 */}
          <PriceHistoryChart cardId={listing.card.id} />

          {/* 판매자 리뷰 */}
          <SellerReviews sellerId={listing.sellerId} viewerId={user?.id ?? null} />

          {/* 신고 버튼 */}
          {user && !isSeller && (
            <div className="flex justify-end">
              <button
                onClick={() => { setReportOpen(true); setReportMsg(null) }}
                className="flex items-center gap-1.5 text-xs text-[#5a4830] hover:text-red-400 transition-colors"
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
          <div className="bg-[#150f0c] border border-[#2e2318] rounded-2xl w-full max-w-md space-y-5 p-6">
            <h3 className="text-base font-bold text-[#f5ead8] flex items-center gap-2">
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
                  <label className="text-xs text-[#7a6040] font-semibold uppercase tracking-wider">신고 유형</label>
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
                            : 'bg-[#1a1410] text-[#7a6040] border-[#2e2318] hover:border-[#4a3520] hover:text-[#9e8a6a]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-[#7a6040] font-semibold uppercase tracking-wider">상세 내용 (선택)</label>
                  <textarea
                    value={reportDetail}
                    onChange={e => setReportDetail(e.target.value)}
                    rows={3}
                    placeholder="구체적인 상황을 설명해주세요..."
                    className="w-full bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] focus:border-[#d4a853]/40 rounded-xl px-4 py-2.5 text-sm text-[#f5ead8] placeholder:text-[#5a4830] focus:outline-none resize-none transition-colors"
                  />
                </div>

                <p className="text-[10px] text-[#5a4830] leading-relaxed">
                  허위 신고는 계정 제재를 받을 수 있습니다. 관리자 검토 후 처리됩니다.
                </p>
              </>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => { setReportOpen(false); setReportReason(''); setReportDetail(''); setReportMsg(null) }}
                className="flex-1 py-2.5 rounded-xl border border-[#2e2318] text-[#7a6040] hover:text-[#9e8a6a] hover:border-[#4a3520] text-sm transition-colors"
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

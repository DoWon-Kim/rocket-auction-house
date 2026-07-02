'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Clock, Tag, Gavel, Handshake, Star, ShieldCheck, Eye } from 'lucide-react'
import { TCG_LABELS, CONDITION_LABELS, rarityLabel } from '@/lib/utils'
import { useState, useEffect } from 'react'

function useAuctionTimer(endsAt?: string) {
  const [label, setLabel] = useState('')
  const [urgent, setUrgent] = useState(false)
  useEffect(() => {
    if (!endsAt) return
    function tick() {
      const diff = new Date(endsAt!).getTime() - Date.now()
      if (diff <= 0) { setLabel('종료'); setUrgent(false); return }
      setUrgent(diff < 3_600_000)
      const h = Math.floor(diff / 3_600_000)
      const m = Math.floor((diff % 3_600_000) / 60_000)
      const s = Math.floor((diff % 60_000) / 1_000)
      if (h > 0) setLabel(`${h}시간 ${m}분`)
      else if (m > 0) setLabel(`${m}분 ${s}초`)
      else setLabel(`${s}초`)
    }
    tick()
    const t = setInterval(tick, 1_000)
    return () => clearInterval(t)
  }, [endsAt])
  return { label, urgent }
}

// 컨디션별 색상 맵
const CONDITION_COLORS: Record<string, string> = {
  MINT:         'text-emerald-400 bg-emerald-900/20 border-emerald-700/30',
  NEAR_MINT:    'text-green-400   bg-green-900/20   border-green-700/30',
  EXCELLENT:    'text-blue-400    bg-blue-900/20    border-blue-700/30',
  GOOD:         'text-yellow-400  bg-yellow-900/20  border-yellow-700/30',
  LIGHT_PLAYED: 'text-orange-400  bg-orange-900/20  border-orange-700/30',
  PLAYED:       'text-red-400     bg-red-900/20     border-red-700/30',
  POOR:         'text-zinc-400    bg-zinc-900/20    border-zinc-700/30',
}

// 그레이딩 회사별 색상
const GRADING_COLORS: Record<string, string> = {
  PSA: 'bg-red-900/30 text-red-300 border-red-700/50',
  BGS: 'bg-blue-900/30 text-blue-300 border-blue-700/50',
  CGC: 'bg-purple-900/30 text-purple-300 border-purple-700/50',
  SGC: 'bg-yellow-900/30 text-yellow-300 border-yellow-700/50',
  HGA: 'bg-orange-900/30 text-orange-300 border-orange-700/50',
  ACE: 'bg-emerald-900/30 text-emerald-300 border-emerald-700/50',
}

interface Listing {
  id: string
  listingType: string
  condition: string
  buyNowPrice?: number
  currentPrice?: number
  startingPrice?: number
  minOfferPrice?: number
  auctionEndsAt?: string
  quantity: number
  imageUrls?: string[]
  viewCount?: number
  gradingCompany?: string | null
  gradingGrade?: string | null
  card: {
    name: string
    nameKo?: string | null
    tcgType: string
    rarity: string
    setName: string
    setCode?: string | null
    cardNumber?: string | null
    imageUrl?: string
  }
  seller: { nickname: string; avgRating?: number | null; reviewCount?: number }
  _count: { bids: number; offers: number }
}

const TYPE_CONFIG = {
  BUY_NOW: {
    icon: <Tag size={10} strokeWidth={2.5} />,
    label: '즉시구매',
    cls: 'bg-[#1e1a10]/80 text-[#f5e6b8] border border-[#3a3018]/60',
  },
  AUCTION: {
    icon: <Gavel size={10} strokeWidth={2.5} />,
    label: '경매',
    cls: 'bg-[#2a1608]/80 text-[#f0a832] border border-[#4a2808]/60',
  },
  OFFER: {
    icon: <Handshake size={10} strokeWidth={2.5} />,
    label: '가격제안',
    cls: 'bg-[#0d2820]/80 text-[#4ade80] border border-[#1a4030]/60',
  },
}

function CardImageWithFallback({ src, alt }: { src: string; alt: string }) {
  const [imgSrc, setImgSrc] = useState(src)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setImgSrc(src)
    setFailed(false)
  }, [src])

  if (failed) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
        <span className="text-4xl opacity-20">🃏</span>
        <span className="text-[11px] text-[#4a3020] text-center px-3 leading-relaxed">{alt}</span>
      </div>
    )
  }

  return (
    <Image
      src={imgSrc}
      alt={alt}
      fill
      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
      className="object-cover group-hover:scale-[1.04] transition-transform duration-500 ease-out"
      onError={() => setFailed(true)}
      unoptimized={imgSrc.includes('scryfall.io') || imgSrc.includes('scryfall.com')}
    />
  )
}

export default function ListingCard({ listing }: { listing: Listing }) {
  const price =
    listing.listingType === 'BUY_NOW'
      ? listing.buyNowPrice
      : listing.listingType === 'AUCTION'
      ? (listing.currentPrice ?? listing.startingPrice)
      : listing.minOfferPrice

  const displayImage = listing.imageUrls?.[0] ?? listing.card.imageUrl
  const cfg = TYPE_CONFIG[listing.listingType as keyof typeof TYPE_CONFIG]
  const { label: timerLabel, urgent: isEndingSoon } = useAuctionTimer(
    listing.listingType === 'AUCTION' ? listing.auctionEndsAt : undefined
  )
  const gradingColor = listing.gradingCompany
    ? (GRADING_COLORS[listing.gradingCompany] ?? 'bg-zinc-900/30 text-zinc-300 border-zinc-700/50')
    : null
  const conditionColor = CONDITION_COLORS[listing.condition] ?? 'text-zinc-400 bg-zinc-900/20 border-zinc-700/30'

  return (
    <Link href={`/listings/${listing.id}`} className="group block">
      <article className="bg-[#1a1410] border border-[#2e2318] rounded-2xl overflow-hidden card-hover">
        {/* Image area */}
        <div className="relative aspect-[3/4] bg-[#100c08] overflow-hidden">
          {displayImage ? (
            <CardImageWithFallback src={displayImage} alt={listing.card.name} />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <span className="text-4xl opacity-20">🃏</span>
              <span className="text-[11px] text-[#4a3020] text-center px-3 leading-relaxed">{listing.card.name}</span>
            </div>
          )}

          {/* Bottom gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0f0b08]/90 via-[#0f0b08]/20 to-transparent" />

          {/* Type badge */}
          <div className="absolute top-2.5 left-2.5">
            <span className={`inline-flex items-center gap-1 px-2 py-[3px] rounded-md text-[10px] font-bold tracking-wide backdrop-blur-md ${cfg.cls}`}>
              {cfg.icon}
              {cfg.label}
            </span>
          </div>

          {/* TCG badge */}
          <div className="absolute top-2.5 right-2.5">
            <span className="inline-flex items-center px-2 py-[3px] rounded-md text-[10px] font-semibold bg-[#0f0b08]/70 backdrop-blur-md text-[#8a7055] border border-[#2e2318]/80">
              {TCG_LABELS[listing.card.tcgType] ?? listing.card.tcgType}
            </span>
          </div>

          {/* Grading badge — 그레이딩 카드면 중앙 하단에 표시 */}
          {listing.gradingCompany && listing.gradingGrade && gradingColor && (
            <div className={`absolute bottom-8 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-2.5 py-[4px] rounded-lg text-[11px] font-bold border backdrop-blur-md shadow-lg ${gradingColor}`}>
              <ShieldCheck size={11} strokeWidth={2} />
              {listing.gradingCompany} {listing.gradingGrade}
            </div>
          )}

          {/* Auction timer */}
          {listing.listingType === 'AUCTION' && listing.auctionEndsAt && timerLabel && (
            <div className={`absolute bottom-2.5 left-2.5 inline-flex items-center gap-1 px-2 py-[3px] rounded-md text-[10px] font-semibold backdrop-blur-md border ${
              isEndingSoon
                ? 'bg-red-950/70 text-red-400 border-red-800/50'
                : 'bg-[#0f0b08]/70 text-[#f0a832] border-[#3d2e0c]/60'
            }`}>
              <Clock size={10} className={isEndingSoon ? 'animate-live' : ''} />
              {timerLabel}
            </div>
          )}

          {/* Bid count badge */}
          {listing.listingType === 'AUCTION' && listing._count.bids > 0 && (
            <div className="absolute bottom-2.5 right-2.5 px-1.5 py-[3px] rounded-md text-[10px] text-[#f0a832] bg-[#2a1608]/80 backdrop-blur-md border border-[#4a2808]/60 font-semibold">
              {listing._count.bids}입찰
            </div>
          )}

          {/* Multiple images indicator */}
          {listing.listingType !== 'AUCTION' && listing.imageUrls && listing.imageUrls.length > 1 && (
            <div className="absolute bottom-2.5 right-2.5 px-1.5 py-[3px] rounded-md text-[10px] text-[#8a7055] bg-[#0f0b08]/70 backdrop-blur-md border border-[#2e2318]/70">
              +{listing.imageUrls.length - 1}
            </div>
          )}
        </div>

        {/* Info area */}
        <div className="p-3">
          {/* 카드번호 chip */}
          {listing.card.cardNumber && (
            <span className="inline-block mb-1 px-1.5 py-[2px] rounded text-[9px] font-mono font-semibold bg-[#1a1208] border border-[#2e2318] text-[#7a6040] tracking-wide">
              {listing.card.setCode ? `${listing.card.setCode}-${listing.card.cardNumber}` : listing.card.cardNumber}
            </span>
          )}
          <p className="font-semibold text-[13px] text-[#e8d5b0] line-clamp-1 mb-0.5">
            {listing.card.nameKo ?? listing.card.name}
          </p>
          {listing.card.nameKo && listing.card.nameKo !== listing.card.name && (
            <p className="text-[10px] text-[#5a4830] line-clamp-1 mb-0.5">{listing.card.name}</p>
          )}
          <p className="text-[11px] text-[#5a4830] line-clamp-1 mb-2">
            {listing.card.setName}
            {listing.card.rarity ? ` · ${rarityLabel(listing.card.rarity)}` : ''}
          </p>

          {/* Price row */}
          <div className="flex items-end justify-between mb-2">
            <div>
              <p className="text-[10px] text-[#4a3820] mb-0.5 uppercase tracking-wider font-medium">
                {listing.listingType === 'AUCTION' ? '현재가' : listing.listingType === 'OFFER' ? '최소제안' : '판매가'}
              </p>
              <p className="text-[15px] font-bold text-[#f0a832] tabular-nums leading-none">
                {price?.toLocaleString()}
                <span className="text-[11px] ml-0.5 text-[#6b4c1a] font-normal">P</span>
              </p>
            </div>
            {/* Condition pill */}
            <span className={`text-[9px] font-bold px-1.5 py-[2px] rounded border ${conditionColor}`}>
              {CONDITION_LABELS[listing.condition]}
            </span>
          </div>

          {/* Seller row */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#4a3820] truncate max-w-[70%]">
              {listing.seller.nickname}
            </span>
            {listing.seller.avgRating != null && (
              <span className="flex items-center gap-0.5 text-[10px] text-[#c8a035]">
                <Star size={9} fill="currentColor" strokeWidth={0} />
                {listing.seller.avgRating.toFixed(1)}
              </span>
            )}
          </div>
        </div>
      </article>
    </Link>
  )
}

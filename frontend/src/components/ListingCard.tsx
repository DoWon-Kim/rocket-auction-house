'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Clock, Tag, Gavel, Handshake } from 'lucide-react'
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
  seller: { nickname: string }
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

  return (
    <Link href={`/listings/${listing.id}`} className="group block">
      <article className="bg-[#1a1410] border border-[#2e2318] rounded-2xl overflow-hidden card-hover">
        {/* Image area */}
        <div className="relative aspect-[3/4] bg-[#100c08] overflow-hidden">
          {displayImage ? (
            <Image
              src={displayImage}
              alt={listing.card.name}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
              className="object-cover group-hover:scale-[1.04] transition-transform duration-500 ease-out"
            />
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

          {/* Auction timer (pinned bottom-left) */}
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

          {/* Multiple images */}
          {listing.imageUrls && listing.imageUrls.length > 1 && (
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
          <p className="text-[11px] text-[#5a4830] line-clamp-1 mb-2.5">
            {listing.card.setName}
            {listing.card.rarity ? ` · ${rarityLabel(listing.card.rarity)}` : ''}
          </p>

          {/* Price row */}
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[10px] text-[#4a3820] mb-0.5 uppercase tracking-wider font-medium">
                {listing.listingType === 'AUCTION' ? '현재가' : listing.listingType === 'OFFER' ? '최소제안' : '판매가'}
              </p>
              <p className="text-[15px] font-bold text-[#f0a832] tabular-nums leading-none">
                {price?.toLocaleString()}
                <span className="text-[11px] ml-0.5 text-[#6b4c1a] font-normal">P</span>
              </p>
            </div>
            <span className="text-[10px] text-[#4a3820] font-medium">
              {CONDITION_LABELS[listing.condition]}
            </span>
          </div>

          {/* Activity */}
          {(listing._count.bids > 0 || listing._count.offers > 0) && (
            <p className="text-[10px] text-[#4a3820] mt-1.5">
              {listing.listingType === 'AUCTION' && `입찰 ${listing._count.bids}건`}
              {listing.listingType === 'OFFER' && `제안 ${listing._count.offers}건`}
            </p>
          )}
        </div>
      </article>
    </Link>
  )
}

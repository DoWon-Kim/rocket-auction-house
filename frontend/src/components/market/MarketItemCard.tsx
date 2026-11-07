'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Gavel, Heart, MessageCircle, Handshake } from 'lucide-react'
import { CONDITION_LABELS } from '@/lib/utils'
import { type MarketListing, listingTitle, listingPrice, listingThumb, timeAgo, STATUS_OVERLAY } from '@/lib/market'
import { LikeButton } from '@/components/market/LikeButton'

// 번개장터식 상품 카드: 사진 · 제목 · 가격 · 시간 (찜/채팅 수)
export function MarketItemCard({ listing: l, liked, showLike = true, timeText }: { listing: MarketListing; liked?: boolean; showLike?: boolean; timeText?: string }) {
  const thumb = listingThumb(l)
  const isPhoto = !!l.imageUrls?.length // 실물 사진은 꽉 채우고, 공식 카드 이미지는 잘리지 않게
  const price = listingPrice(l)
  const overlay = STATUS_OVERLAY[l.status]
  const chats = l._count?.chatRooms ?? 0
  const likes = l.likeCount ?? 0

  return (
    <Link href={`/listings/${l.id}`} className="group block min-w-0">
      <div className="relative aspect-square rounded-2xl overflow-hidden bg-sunken border border-line">
        {thumb
          ? <Image src={thumb} alt={listingTitle(l)} fill sizes="(max-width:640px) 50vw, (max-width:1024px) 33vw, 20vw" className={`${isPhoto ? 'object-cover' : 'object-contain p-3'} group-hover:scale-[1.03] transition-transform duration-300`} />
          : <div className="absolute inset-0 flex items-center justify-center text-4xl opacity-20">🃏</div>}

        {/* 좌상단: 거래 방식 */}
        <div className="absolute top-2 left-2 flex gap-1">
          {l.listingType === 'AUCTION' && <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/55 text-[10px] font-semibold text-cyan-200"><Gavel size={10} />경매</span>}
          {(l.listingType === 'OFFER' || l.negotiable) && <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/55 text-[10px] font-semibold text-emerald-200"><Handshake size={10} />제안가능</span>}
          {l.gradingCompany && <span className="px-1.5 py-0.5 rounded-md bg-black/55 text-[10px] font-bold text-amber-200">{l.gradingCompany} {l.gradingGrade}</span>}
        </div>
        {showLike && !overlay && (
          <div className="absolute top-1.5 right-1.5"><LikeButton listingId={l.id} liked={liked} count={likes} /></div>
        )}

        {/* 예약중 · 판매완료 */}
        {overlay && (
          <div className="absolute inset-0 bg-black/55 flex items-center justify-center">
            <span className={`px-3 py-1.5 rounded-full text-sm font-bold ${l.status === 'RESERVED' ? 'bg-emerald-500/90 text-white' : 'bg-black/70 text-white/90 border border-white/20'}`}>{overlay}</span>
          </div>
        )}
        {!l.shippingFee && !overlay && (
          <span className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded-md bg-black/55 text-[10px] font-medium text-white/90">배송비 포함</span>
        )}
      </div>

      <div className="pt-2.5 px-0.5 space-y-1">
        <p className="text-sm text-fg-2 truncate group-hover:text-fg">{listingTitle(l)}</p>
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[15px] font-bold text-fg tabular-nums truncate">
            {price != null ? <>{price.toLocaleString()}<span className="text-xs font-semibold ml-0.5">P</span></> : '가격제안'}
            {l.listingType === 'OFFER' && <span className="text-[10px] font-medium text-muted ml-1">부터</span>}
          </p>
          <span className="text-[11px] text-subtle shrink-0">{timeText ?? timeAgo(l.bumpedAt ?? l.createdAt)}</span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-subtle">
          <span className="truncate">{CONDITION_LABELS[l.condition] ?? l.condition}</span>
          {l.listingType === 'AUCTION' && (l._count?.bids ?? 0) > 0 && <span>입찰 {l._count!.bids}</span>}
          {likes > 0 && <span className="flex items-center gap-0.5"><Heart size={10} />{likes}</span>}
          {chats > 0 && <span className="flex items-center gap-0.5"><MessageCircle size={10} />{chats}</span>}
        </div>
      </div>
    </Link>
  )
}

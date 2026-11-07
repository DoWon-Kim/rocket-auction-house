// 번개장터식 마켓 공용 타입·헬퍼
import { resolveImageSrc } from '@/lib/utils'

export interface MarketListing {
  id: string
  sellerId?: string
  listingType: 'BUY_NOW' | 'AUCTION' | 'OFFER' | string
  status: string
  condition: string
  title?: string | null
  buyNowPrice?: number | null
  currentPrice?: number | null
  startingPrice?: number | null
  minOfferPrice?: number | null
  shippingFee?: number
  negotiable?: boolean
  auctionEndsAt?: string | null
  imageUrls?: string[]
  likeCount?: number
  bumpedAt?: string
  createdAt: string
  gradingCompany?: string | null
  gradingGrade?: string | null
  card: { id?: string; name: string; nameKo?: string | null; imageUrl?: string | null; tcgType?: string; setName?: string | null; rarity?: string | null }
  seller?: { id: string; nickname: string; avatarUrl?: string | null }
  _count?: { bids?: number; offers?: number; chatRooms?: number }
}

export const listingTitle = (l: Pick<MarketListing, 'title' | 'card'>) => l.title || l.card.nameKo || l.card.name

export const listingPrice = (l: MarketListing): number | null =>
  l.listingType === 'AUCTION' ? (l.currentPrice ?? l.startingPrice ?? null)
  : l.listingType === 'OFFER' ? (l.minOfferPrice ?? null)
  : (l.buyNowPrice ?? null)

// 실물 사진 우선, 없으면 공식 카드 이미지
export const listingThumb = (l: Pick<MarketListing, 'imageUrls' | 'card'>) =>
  l.imageUrls?.[0] ?? resolveImageSrc(l.card.imageUrl ?? null)

export const STATUS_OVERLAY: Record<string, string> = { RESERVED: '예약중', SOLD: '판매완료', CANCELLED: '판매중지', EXPIRED: '유찰' }

export function timeAgo(iso: string | Date, now = Date.now()) {
  const diff = Math.max(0, now - new Date(iso).getTime()) / 1000
  if (diff < 60) return '방금 전'
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}일 전`
  if (diff < 86400 * 365) return `${Math.floor(diff / (86400 * 30))}달 전`
  return `${Math.floor(diff / (86400 * 365))}년 전`
}

export const shippingLabel = (fee?: number) => (fee ? `배송비 ${fee.toLocaleString()}P` : '배송비 포함')

// ── 최근 본 상품 (브라우저에만 저장) ─────────────────────────────────────────
const RECENT_KEY = 'recent-listings'
export interface RecentListing { id: string; title: string; thumb: string | null; price: number | null }

export function readRecent(): RecentListing[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as RecentListing[] } catch { return [] }
}
export function pushRecent(item: RecentListing) {
  try {
    const next = [item, ...readRecent().filter(r => r.id !== item.id)].slice(0, 20)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
    window.dispatchEvent(new Event('recent-listings-change'))
  } catch { /* 저장 불가 환경 무시 */ }
}

export const daysSince = (iso: string | Date, now = Date.now()) => Math.max(1, Math.floor((now - new Date(iso).getTime()) / 86400000))

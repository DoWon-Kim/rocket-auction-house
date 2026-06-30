'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { api } from '@/lib/api'
import { TCG_LABELS, CONDITION_LABELS, LISTING_TYPE_LABELS, rarityLabel } from '@/lib/utils'
import ListingCard from '@/components/ListingCard'
import {
  ChevronLeft, Tag, TrendingUp, Package, Layers,
  ChevronLeft as Prev, ChevronRight as Next,
  ShoppingBag, AlertCircle, BarChart2,
} from 'lucide-react'
import { PriceHistoryChart } from '@/components/PriceHistoryChart'
import { WishlistButton } from '@/components/WishlistButton'

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface MarketStats {
  activeCount: number
  minPrice: number
  maxPrice: number
  avgPrice: number
  byType: { BUY_NOW: number; AUCTION: number; OFFER: number }
}

interface CardDetail {
  id: string
  name: string
  nameKo: string | null
  nameJa: string | null
  tcgType: string
  setName: string
  setCode: string | null
  cardNumber: string | null
  rarity: string
  imageUrl: string | null
  description: string | null
  createdAt: string
  _count: { listings: number; oripaItems: number }
  marketStats: MarketStats | null
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
  gradingCompany?: string | null
  gradingGrade?: string | null
  card: {
    id: string; name: string; nameKo?: string | null; tcgType: string
    setName: string; cardNumber?: string | null; rarity: string; imageUrl?: string
  }
  seller: { id: string; nickname: string; avatarUrl: string | null }
  _count: { bids: number; offers: number }
}

interface ListingsResponse {
  listings: Listing[]
  total: number
  page: number
  totalPages: number
}

// ─── 유틸 ─────────────────────────────────────────────────────────────────────

const TCG_ICONS: Record<string, string> = {
  POKEMON: '🎴', YUGIOH: '⚡', MTG: '🪄', DIGIMON: '💻', WEISS: '🃏', OTHER: '📦',
}

function rarityColorClass(rarity: string): string {
  const r = rarity.toLowerCase()
  if (r.includes('hyper') || r.includes('starlight') || r.includes('quarter century'))
    return 'text-red-400 border-red-400/40 bg-red-400/10'
  if (r.includes('special illustration') || r.includes('gold rare'))
    return 'text-amber-300 border-amber-300/40 bg-amber-300/10'
  if (r.includes('secret') || r === 'sec')
    return 'text-yellow-300 border-yellow-300/40 bg-yellow-300/10'
  if (r.includes('ultra') || r === 'sr' || r.includes('super rare'))
    return 'text-orange-400 border-orange-400/40 bg-orange-400/10'
  if (r.includes('illustration') || r.includes('amazing') || r.includes('radiant'))
    return 'text-pink-400 border-pink-400/40 bg-pink-400/10'
  if (r === 'double rare' || r === 'mythic' || r.includes('vmax') || r.includes('vstar'))
    return 'text-purple-400 border-purple-400/40 bg-purple-400/10'
  if (r === 'rare' || r === 'r' || r.includes('holo'))
    return 'text-blue-400 border-blue-400/40 bg-blue-400/10'
  if (r === 'uncommon' || r === 'u' || r === 'promo')
    return 'text-emerald-400 border-emerald-400/40 bg-emerald-400/10'
  return 'text-[#7a6040] border-[#2e2318] bg-[#1a1208]'
}

const SORT_OPTIONS = [
  { value: 'newest',     label: '최신순' },
  { value: 'price_asc',  label: '가격 낮은순' },
  { value: 'price_desc', label: '가격 높은순' },
  { value: 'ending',     label: '마감 임박순' },
]

const LISTING_TYPE_FILTER = [
  { value: '', label: '전체' },
  { value: 'BUY_NOW', label: '즉시구매' },
  { value: 'AUCTION', label: '경매' },
  { value: 'OFFER',   label: '가격제안' },
]

// ─── 시세 패널 ────────────────────────────────────────────────────────────────

function MarketPanel({ stats, card }: { stats: MarketStats | null; card: CardDetail }) {
  if (!stats || stats.activeCount === 0) {
    return (
      <div className="bg-[#1a1410] border border-[#2e2318] rounded-xl p-5">
        <h2 className="text-sm font-semibold text-[#f5ead8] flex items-center gap-2 mb-4">
          <BarChart2 size={15} className="text-[#d4a853]" /> 현재 시세
        </h2>
        <div className="flex flex-col items-center py-6 gap-2">
          <AlertCircle size={28} className="text-[#4a3520]" />
          <p className="text-sm text-[#5a4830]">현재 등록된 판매가 없습니다.</p>
        </div>
      </div>
    )
  }

  const spread = stats.maxPrice - stats.minPrice

  return (
    <div className="bg-[#1a1410] border border-[#2e2318] rounded-xl p-5 space-y-4">
      <h2 className="text-sm font-semibold text-[#f5ead8] flex items-center gap-2">
        <BarChart2 size={15} className="text-[#d4a853]" /> 현재 시세
        <span className="ml-auto text-xs text-[#5a4830] font-normal">{stats.activeCount}개 활성 리스팅</span>
      </h2>

      {/* 가격 3개 */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-[#1a1208] border border-[#2e2318] rounded-xl py-3">
          <p className="text-[10px] text-[#5a4830] uppercase tracking-wider mb-1">최저가</p>
          <p className="text-base font-bold text-emerald-400 tabular-nums">{stats.minPrice.toLocaleString()}P</p>
        </div>
        <div className="bg-[#1a1208] border border-[#d4a853]/20 rounded-xl py-3">
          <p className="text-[10px] text-[#5a4830] uppercase tracking-wider mb-1">평균가</p>
          <p className="text-base font-bold text-[#f0a832] tabular-nums">{stats.avgPrice.toLocaleString()}P</p>
        </div>
        <div className="bg-[#1a1208] border border-[#2e2318] rounded-xl py-3">
          <p className="text-[10px] text-[#5a4830] uppercase tracking-wider mb-1">최고가</p>
          <p className="text-base font-bold text-red-400 tabular-nums">{stats.maxPrice.toLocaleString()}P</p>
        </div>
      </div>

      {/* 가격 폭 바 */}
      {spread > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-[#4a3820]">
            <span>{stats.minPrice.toLocaleString()}P</span>
            <span>{stats.maxPrice.toLocaleString()}P</span>
          </div>
          <div className="relative h-1.5 bg-[#2e2318] rounded-full overflow-hidden">
            <div
              className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-emerald-500 via-[#d4a853] to-red-500"
              style={{ width: '100%' }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-[#f0a832] border-2 border-[#0f0b08] shadow"
              style={{
                left: spread > 0 ? `calc(${((stats.avgPrice - stats.minPrice) / spread) * 100}% - 4px)` : '50%',
              }}
            />
          </div>
        </div>
      )}

      {/* 거래 유형별 */}
      <div className="flex gap-3 text-xs text-[#5a4830]">
        {stats.byType.BUY_NOW > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#d4a853]" /> 즉시구매 {stats.byType.BUY_NOW}
          </span>
        )}
        {stats.byType.AUCTION > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400" /> 경매 {stats.byType.AUCTION}
          </span>
        )}
        {stats.byType.OFFER > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" /> 가격제안 {stats.byType.OFFER}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── 카드 정보 테이블 ─────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-[#1a1208] last:border-b-0">
      <span className="text-xs text-[#5a4830] shrink-0 w-24">{label}</span>
      <span className="text-xs text-[#f5ead8] text-right flex-1">{value}</span>
    </div>
  )
}

// ─── 메인 페이지 ─────────────────────────────────────────────────────────────

export default function CardDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [listingSort, setListingSort] = useState('newest')
  const [listingType, setListingType] = useState('')
  const [listingPage, setListingPage] = useState(1)
  const [imgError, setImgError] = useState(false)

  const { data: card, isLoading } = useQuery<CardDetail>({
    queryKey: ['card', id],
    queryFn: () => api.get(`/cards/${id}`).then(r => r.data),
  })

  const { data: listingsData, isLoading: listingsLoading } = useQuery<ListingsResponse>({
    queryKey: ['card-listings', id, listingSort, listingType, listingPage],
    queryFn: () => api.get(`/cards/${id}/listings`, {
      params: {
        sort: listingSort,
        type: listingType || undefined,
        page: listingPage,
      }
    }).then(r => r.data),
    enabled: !!card,
  })

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="h-6 w-24 bg-[#1a1410] border border-[#2e2318] rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">
          <div className="aspect-[3/4] bg-[#1a1410] border border-[#2e2318] rounded-xl animate-pulse" />
          <div className="space-y-4">
            <div className="h-8 bg-[#1a1410] border border-[#2e2318] rounded-xl animate-pulse" />
            <div className="h-40 bg-[#1a1410] border border-[#2e2318] rounded-xl animate-pulse" />
            <div className="h-32 bg-[#1a1410] border border-[#2e2318] rounded-xl animate-pulse" />
          </div>
        </div>
      </div>
    )
  }

  if (!card) {
    return (
      <div className="text-center py-24">
        <p className="text-[#5a4830]">카드를 찾을 수 없습니다.</p>
        <Link href="/cards" className="mt-4 inline-block text-sm text-[#d4a853] hover:text-[#f0c060]">
          ← 카드 도감으로
        </Link>
      </div>
    )
  }

  const displayName  = card.nameKo ?? card.name
  const rColor       = rarityColorClass(card.rarity)
  const listings     = listingsData?.listings ?? []

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* 뒤로가기 */}
      <Link
        href="/cards"
        className="inline-flex items-center gap-1 text-sm text-[#8a7055] hover:text-[#f5ead8] transition-colors"
      >
        <ChevronLeft size={16} /> 카드 도감
      </Link>

      {/* ── 상단: 이미지 + 기본 정보 ── */}
      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-6">

        {/* 카드 이미지 */}
        <div className="flex flex-col items-center gap-3">
          <div
            className={`relative w-full max-w-[260px] mx-auto aspect-[3/4] rounded-2xl overflow-hidden border-2 shadow-2xl ${rColor.includes('red') ? 'border-red-400/30' : rColor.includes('amber') ? 'border-amber-300/30' : rColor.includes('yellow') ? 'border-yellow-300/30' : rColor.includes('orange') ? 'border-orange-400/30' : rColor.includes('pink') ? 'border-pink-400/30' : rColor.includes('purple') ? 'border-purple-400/30' : rColor.includes('blue') ? 'border-blue-400/30' : rColor.includes('emerald') ? 'border-emerald-400/30' : 'border-[#2e2318]'}`}
          >
            {card.imageUrl && !imgError ? (
              <Image
                src={card.imageUrl}
                alt={displayName}
                fill
                className="object-contain"
                onError={() => setImgError(true)}
                priority
              />
            ) : (
              <div className="absolute inset-0 bg-[#1a1208] flex items-center justify-center text-6xl">
                {TCG_ICONS[card.tcgType] ?? '🃏'}
              </div>
            )}
          </div>

          {/* 판매 버튼 */}
          <Link
            href={`/listings?tab=sell&cardId=${card.id}`}
            className="w-full max-w-[260px] flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-[#d4a853] to-[#b8860b] hover:from-[#e0b878] hover:to-[#c8960b] text-[#0f0b08] font-bold text-sm rounded-xl transition-all shadow-lg shadow-[#d4a853]/20"
          >
            <ShoppingBag size={15} /> 이 카드 판매하기
          </Link>
        </div>

        {/* 우측 정보 */}
        <div className="space-y-4">

          {/* 이름 + 배지 */}
          <div>
            <div className="flex items-start gap-2 flex-wrap mb-1">
              <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-semibold ${rColor}`}>
                {rarityLabel(card.rarity)}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-[#2e2318] bg-[#1a1208] text-[11px] text-[#7a6040]">
                {TCG_ICONS[card.tcgType]} {TCG_LABELS[card.tcgType] ?? card.tcgType}
              </span>
            </div>
            <div className="flex items-start gap-3">
              <h1 className="text-2xl font-bold text-[#f5ead8] leading-tight flex-1">{displayName}</h1>
              <WishlistButton cardId={card.id} cardName={displayName} />
            </div>
            {card.nameKo && card.name !== card.nameKo && (
              <p className="text-sm text-[#7a6040] mt-0.5">{card.name}</p>
            )}
            {card.nameJa && (
              <p className="text-sm text-[#5a4830] mt-0.5">{card.nameJa}</p>
            )}
          </div>

          {/* 카드 기본 정보 */}
          <div className="bg-[#1a1410] border border-[#2e2318] rounded-xl px-4 divide-y divide-[#1a1208]">
            <InfoRow label="세트" value={card.setName} />
            <InfoRow label="세트 코드" value={card.setCode} />
            <InfoRow label="카드 번호" value={card.cardNumber} />
            <InfoRow label="레어도" value={
              <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${rColor}`}>
                {rarityLabel(card.rarity)}
              </span>
            } />
            <InfoRow label="리스팅 수" value={`${card._count.listings.toLocaleString()}건`} />
            {card._count.oripaItems > 0 && (
              <InfoRow label="오리파 수록" value={`${card._count.oripaItems}개 오리파`} />
            )}
          </div>

          {card.description && (
            <div className="bg-[#1a1410] border border-[#2e2318] rounded-xl p-4">
              <p className="text-xs text-[#8a7055] leading-relaxed">{card.description}</p>
            </div>
          )}

          {/* 시세 패널 */}
          <MarketPanel stats={card.marketStats} card={card} />

          {/* 체결 가격 히스토리 차트 */}
          <PriceHistoryChart cardId={card.id} />
        </div>
      </div>

      {/* ── 활성 리스팅 ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-lg font-semibold text-[#f5ead8] flex items-center gap-2">
            <Tag size={16} className="text-[#d4a853]" />
            판매 리스팅
            {listingsData && (
              <span className="text-sm font-normal text-[#5a4830]">
                {listingsData.total.toLocaleString()}건
              </span>
            )}
          </h2>

          <div className="flex items-center gap-2">
            {/* 거래 유형 필터 */}
            <div className="flex gap-1">
              {LISTING_TYPE_FILTER.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => { setListingType(opt.value); setListingPage(1) }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    listingType === opt.value
                      ? 'bg-[#2a1c08] text-[#e0b878] border-[#3d2a0c]'
                      : 'text-[#7a6040] border-[#2e2318] hover:border-[#4a3520] hover:text-[#9e8a6a]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {/* 정렬 */}
            <select
              value={listingSort}
              onChange={e => { setListingSort(e.target.value); setListingPage(1) }}
              className="bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] rounded-lg px-2.5 py-1.5 text-xs text-[#f5ead8] focus:outline-none transition-colors"
            >
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        {listingsLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-[#1a1410] border border-[#2e2318] rounded-xl h-72 animate-pulse" />
            ))}
          </div>
        ) : listings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 bg-[#1a1410] border border-[#2e2318] rounded-xl">
            <Package size={36} className="text-[#2e2318]" />
            <p className="text-[#5a4830] text-sm">현재 판매 중인 리스팅이 없습니다.</p>
            <Link
              href={`/listings?tab=sell&cardId=${card.id}`}
              className="text-sm text-[#d4a853] hover:text-[#f0c060] transition-colors"
            >
              첫 번째로 판매 등록하기 →
            </Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {listings.map(l => <ListingCard key={l.id} listing={l} />)}
            </div>

            {/* 페이지네이션 */}
            {listingsData && listingsData.totalPages > 1 && (
              <div className="flex justify-center items-center gap-1">
                <button
                  onClick={() => setListingPage(p => Math.max(1, p - 1))}
                  disabled={listingPage === 1}
                  className="h-8 w-8 flex items-center justify-center rounded-lg bg-[#1a1410] border border-[#2e2318] text-[#7a6040] hover:border-[#4a3520] hover:text-[#e8d5b0] disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                >
                  <Prev size={13} />
                </button>
                <span className="text-xs text-[#5a4830] px-3">
                  {listingPage} / {listingsData.totalPages}
                </span>
                <button
                  onClick={() => setListingPage(p => Math.min(listingsData.totalPages, p + 1))}
                  disabled={listingPage === listingsData.totalPages}
                  className="h-8 w-8 flex items-center justify-center rounded-lg bg-[#1a1410] border border-[#2e2318] text-[#7a6040] hover:border-[#4a3520] hover:text-[#e8d5b0] disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                >
                  <Next size={13} />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── 같은 세트 카드 보기 ── */}
      <div className="flex justify-center pt-2">
        <Link
          href={`/cards?setName=${encodeURIComponent(card.setName)}&tcgType=${card.tcgType}`}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] rounded-xl text-sm text-[#7a6040] hover:text-[#e8d5b0] transition-colors"
        >
          <Layers size={14} />
          같은 세트 카드 더 보기 — {card.setName}
        </Link>
      </div>
    </div>
  )
}

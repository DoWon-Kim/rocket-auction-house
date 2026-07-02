'use client'

import { useState, useEffect } from 'react'
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
import { useRecentlyViewed } from '@/hooks/useRecentlyViewed'

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface MarketStats {
  activeCount: number
  minPrice: number
  maxPrice: number
  avgPrice: number
  byType: { BUY_NOW: number; AUCTION: number; OFFER: number }
}

interface PkmnAttack {
  name: string
  cost: string[]
  convertedEnergyCost: number
  damage: string
  text: string
}

interface PkmnAbility {
  name: string
  text: string
  type: string
}

interface PkmnWeak { type: string; value: string }

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
  supertype: string | null
  subtypes: string | null
  cardTypes: string | null
  hp: number | null
  attacks: PkmnAttack[] | null
  abilities: PkmnAbility[] | null
  weaknesses: PkmnWeak[] | null
  resistances: PkmnWeak[] | null
  retreatCost: number | null
  artist: string | null
  flavorText: string | null
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
  POKEMON: '🎴', YUGIOH: '⚡', MTG: '🪄', DIGIMON: '💻', ONEPIECE: '⚓', WEISS: '🃏', OTHER: '📦',
}

const ENERGY_TYPE_INFO: Record<string, { color: string; bg: string; icon: string; label: string }> = {
  Grass:     { color: '#4CAF50', bg: '#1a2e1a', icon: '🌿', label: '풀' },
  Fire:      { color: '#FF5722', bg: '#2e1a12', icon: '🔥', label: '불꽃' },
  Water:     { color: '#2196F3', bg: '#121a2e', icon: '💧', label: '물' },
  Lightning: { color: '#FFC107', bg: '#2e2a12', icon: '⚡', label: '번개' },
  Psychic:   { color: '#E91E63', bg: '#2e1222', icon: '🔮', label: '초능력' },
  Fighting:  { color: '#FF9800', bg: '#2e1e12', icon: '🥊', label: '격투' },
  Darkness:  { color: '#9C27B0', bg: '#1e1228', icon: '🌑', label: '악' },
  Metal:     { color: '#9E9E9E', bg: '#1e1e1e', icon: '⚙️', label: '강철' },
  Dragon:    { color: '#6A1B9A', bg: '#1a1228', icon: '🐉', label: '드래곤' },
  Fairy:     { color: '#F48FB1', bg: '#2e1222', icon: '✨', label: '요정' },
  Colorless: { color: '#B0BEC5', bg: '#1e1e1e', icon: '⭐', label: '무색' },
}

// 에너지 아이콘 (작은 배지)
function EnergyBadge({ type }: { type: string }) {
  const info = ENERGY_TYPE_INFO[type]
  if (!info) return <span className="text-[11px] bg-[#1a1208] border border-[#2e2318] px-1.5 py-0.5 rounded text-[#7a6040]">{type}</span>
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md"
      style={{ backgroundColor: info.bg, color: info.color, border: `1px solid ${info.color}40` }}
    >
      {info.icon} {info.label}
    </span>
  )
}

// 후퇴 비용 동그라미
function RetreatDots({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: Math.min(count, 5) }).map((_, i) => (
        <span key={i} className="w-4 h-4 rounded-full bg-[#B0BEC5]/30 border border-[#B0BEC5]/50 inline-flex items-center justify-center text-[8px]">⭐</span>
      ))}
      {count > 5 && <span className="text-[10px] text-[#7a6040]">+{count - 5}</span>}
    </div>
  )
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
  const { addCard } = useRecentlyViewed()

  const { data: card, isLoading } = useQuery<CardDetail>({
    queryKey: ['card', id],
    queryFn: () => api.get(`/cards/${id}`).then(r => r.data),
  })

  useEffect(() => {
    if (card) addCard({ id: card.id, name: card.name, nameKo: card.nameKo, imageUrl: card.imageUrl ?? null, tcgType: card.tcgType, setName: card.setName })
  }, [card?.id])

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

  const displayName    = card.nameKo ?? card.nameJa ?? card.name
  const rColor         = rarityColorClass(card.rarity)
  const listings       = listingsData?.listings ?? []
  const cheapestBuyNow = listings
    .filter(l => l.listingType === 'BUY_NOW' && l.buyNowPrice != null)
    .sort((a, b) => (a.buyNowPrice ?? 0) - (b.buyNowPrice ?? 0))[0] ?? null

  // 외부 데이터베이스 링크 생성
  function externalLink(c: CardDetail): { label: string; url: string } | null {
    switch (c.tcgType) {
      case 'YUGIOH':
        return { label: 'YGOProDeck', url: `https://ygoprodeck.com/card/?search=${encodeURIComponent(c.name)}` }
      case 'MTG':
        return { label: 'Scryfall', url: `https://scryfall.com/search?q=${encodeURIComponent(c.name)}+set:${c.setCode ?? ''}` }
      case 'POKEMON':
        return { label: 'Pokémon TCG DB', url: `https://www.pokemon.com/us/pokemon-tcg/pokemon-cards/?cardName=${encodeURIComponent(c.name)}` }
      case 'DIGIMON':
        return { label: 'Digimon Card DB', url: `https://www.digimoncard.com/products/card_game/card/` }
      default:
        return null
    }
  }
  const extLink = externalLink(card)

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

          {/* 최저가 즉시구매 CTA */}
          {cheapestBuyNow && (
            <Link
              href={`/listings/${cheapestBuyNow.id}`}
              className="w-full max-w-[260px] flex items-center justify-center gap-2 py-3 bg-[#d4a853] hover:bg-[#c49440] text-[#0f0b08] font-bold text-sm rounded-xl transition-all shadow-lg shadow-[#d4a853]/25"
            >
              <Tag size={15} /> 최저가 {cheapestBuyNow.buyNowPrice!.toLocaleString()}P 즉시구매
            </Link>
          )}

          {/* 판매 버튼 */}
          <Link
            href={`/listings?tab=sell&cardId=${card.id}`}
            className={`w-full max-w-[260px] flex items-center justify-center gap-2 py-2.5 transition-all ${
              cheapestBuyNow
                ? 'border border-[#3d2a0c] text-[#d4a853] hover:bg-[#1a1208] rounded-xl text-sm font-semibold'
                : 'bg-gradient-to-r from-[#d4a853] to-[#b8860b] hover:from-[#e0b878] hover:to-[#c8960b] text-[#0f0b08] font-bold text-sm rounded-xl shadow-lg shadow-[#d4a853]/20'
            }`}
          >
            <ShoppingBag size={15} /> 이 카드 판매하기
          </Link>

          {/* 외부 링크 */}
          {extLink && (
            <a
              href={extLink.url}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full max-w-[260px] flex items-center justify-center gap-1.5 py-2 border border-[#2e2318] hover:border-[#4a3520] rounded-xl text-xs text-[#7a6040] hover:text-[#c9a860] transition-colors"
            >
              <TrendingUp size={12} /> {extLink.label}에서 보기 ↗
            </a>
          )}
        </div>

        {/* 우측 정보 */}
        <div className="space-y-4">

          {/* 이름 + 배지 */}
          <div>
            {/* 레어도 + TCG 타입 + 언어 뱃지 */}
            <div className="flex items-start gap-2 flex-wrap mb-2">
              <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-semibold ${rColor}`}>
                {rarityLabel(card.rarity)}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-[#2e2318] bg-[#1a1208] text-[11px] text-[#7a6040]">
                {TCG_ICONS[card.tcgType]} {TCG_LABELS[card.tcgType] ?? card.tcgType}
              </span>
              {card.nameKo && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-emerald-700/40 bg-emerald-900/20 text-[11px] text-emerald-400 font-medium">
                  🇰🇷 한국어
                </span>
              )}
              {card.nameJa && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-blue-700/40 bg-blue-900/20 text-[11px] text-blue-400 font-medium">
                  🇯🇵 日本語
                </span>
              )}
            </div>

            {/* 메인 카드명 (한국어 우선) */}
            <div className="flex items-start gap-3">
              <h1 className="text-2xl font-bold text-[#f5ead8] leading-tight flex-1">{displayName}</h1>
              <WishlistButton cardId={card.id} cardName={displayName} />
            </div>

            {/* 서브 이름 (원문, 일본어) */}
            <div className="mt-1.5 space-y-0.5">
              {card.nameKo && card.name !== card.nameKo && (
                <p className="text-sm text-[#7a6040]">
                  <span className="text-[10px] mr-1.5 opacity-60">🇺🇸</span>{card.name}
                </p>
              )}
              {card.nameJa && (
                <p className="text-sm text-[#5a4830]">
                  <span className="text-[10px] mr-1.5 opacity-60">🇯🇵</span>{card.nameJa}
                </p>
              )}
            </div>
          </div>

          {/* 카드 기본 정보 */}
          <div className="bg-[#1a1410] border border-[#2e2318] rounded-xl px-4 divide-y divide-[#1a1208]">
            {card.nameKo && (
              <InfoRow label="한국어 이름" value={
                <span className="text-emerald-400 font-medium">{card.nameKo}</span>
              } />
            )}
            {card.nameJa && (
              <InfoRow label="일본어 이름" value={
                <span className="text-blue-300">{card.nameJa}</span>
              } />
            )}
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

          {/* 포켓몬 TCG 스탯 박스 (icu.gg 스타일) */}
          {card.tcgType === 'POKEMON' && (card.hp || card.attacks?.length || card.abilities?.length || card.weaknesses?.length || card.retreatCost) && (
            <div className="bg-[#1a1410] border border-[#2e2318] rounded-xl overflow-hidden">
              {/* 헤더: HP + 에너지 타입 */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#2e2318]">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-[#7a6040]">
                    {card.supertype ?? 'Pokémon'}
                    {card.subtypes && ` · ${card.subtypes.split(',').join(' · ')}`}
                  </span>
                  {card.cardTypes && card.cardTypes.split(',').map(t => (
                    <EnergyBadge key={t} type={t.trim()} />
                  ))}
                </div>
                {card.hp && (
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-[#5a4830]">HP</span>
                    <span className="text-2xl font-black text-red-400 leading-none">{card.hp}</span>
                  </div>
                )}
              </div>

              {/* 특성 (Ability) */}
              {card.abilities && card.abilities.length > 0 && (
                <div className="px-4 py-3 border-b border-[#1a1208]">
                  {card.abilities.map((ab, i) => (
                    <div key={i} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-red-900/40 text-red-400 border border-red-700/30">
                          {ab.type === 'Pokémon Power' ? '포켓몬 파워' : ab.type === 'Ancient Trait' ? '고대 특성' : '특성'}
                        </span>
                        <span className="text-sm font-semibold text-[#f5ead8]">{ab.name}</span>
                      </div>
                      <p className="text-xs text-[#8a7055] leading-relaxed">{ab.text}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* 기술 (Attacks) */}
              {card.attacks && card.attacks.length > 0 && (
                <div className="divide-y divide-[#1a1208]">
                  {card.attacks.map((atk, i) => (
                    <div key={i} className="px-4 py-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {/* 에너지 비용 */}
                          {atk.cost.map((c, j) => (
                            <EnergyBadge key={j} type={c} />
                          ))}
                          <span className="text-sm font-semibold text-[#f5ead8]">{atk.name}</span>
                        </div>
                        {atk.damage && (
                          <span className="text-lg font-black text-[#f0a832] whitespace-nowrap">{atk.damage}</span>
                        )}
                      </div>
                      {atk.text && (
                        <p className="text-xs text-[#8a7055] leading-relaxed">{atk.text}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* 약점 · 저항력 · 후퇴비용 */}
              {(card.weaknesses?.length || card.resistances?.length || card.retreatCost != null) && (
                <div className="flex items-center gap-4 px-4 py-3 border-t border-[#2e2318] bg-[#150f0c]">
                  {card.weaknesses && card.weaknesses.length > 0 && (
                    <div className="space-y-0.5">
                      <p className="text-[9px] text-[#4a3820] uppercase tracking-wider">약점</p>
                      <div className="flex items-center gap-1">
                        {card.weaknesses.map((w, i) => (
                          <span key={i} className="flex items-center gap-0.5">
                            <EnergyBadge type={w.type} />
                            <span className="text-[10px] text-red-400 font-bold">{w.value}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {card.resistances && card.resistances.length > 0 && (
                    <div className="space-y-0.5">
                      <p className="text-[9px] text-[#4a3820] uppercase tracking-wider">저항력</p>
                      <div className="flex items-center gap-1">
                        {card.resistances.map((r, i) => (
                          <span key={i} className="flex items-center gap-0.5">
                            <EnergyBadge type={r.type} />
                            <span className="text-[10px] text-emerald-400 font-bold">{r.value}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {card.retreatCost != null && (
                    <div className="space-y-0.5 ml-auto">
                      <p className="text-[9px] text-[#4a3820] uppercase tracking-wider">후퇴비용</p>
                      <RetreatDots count={card.retreatCost} />
                    </div>
                  )}
                </div>
              )}

              {/* 풀레이버 텍스트 */}
              {card.flavorText && (
                <div className="px-4 py-3 border-t border-[#1a1208]">
                  <p className="text-[11px] text-[#5a4830] italic leading-relaxed">&ldquo;{card.flavorText}&rdquo;</p>
                </div>
              )}

              {/* 일러스트레이터 */}
              {card.artist && (
                <div className="px-4 py-2 border-t border-[#1a1208] flex items-center justify-end gap-1">
                  <span className="text-[9px] text-[#4a3820]">illus.</span>
                  <span className="text-[11px] text-[#7a6040]">{card.artist}</span>
                </div>
              )}
            </div>
          )}

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

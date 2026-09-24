'use client'

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { api } from '@/lib/api'
import { TCG_LABELS, CONDITION_LABELS, LISTING_TYPE_LABELS, rarityLabel, resolveImageSrc } from '@/lib/utils'
import ListingCard from '@/components/ListingCard'
import {
  ChevronLeft, Tag, TrendingUp, Package,
  ChevronLeft as Prev, ChevronRight as Next,
  ShoppingBag, AlertCircle, BarChart2, CheckCircle2,
} from 'lucide-react'
import { PriceHistoryChart } from '@/components/PriceHistoryChart'
import { WishlistButton } from '@/components/WishlistButton'
import { useRecentlyViewed } from '@/hooks/useRecentlyViewed'
import { useCollection } from '@/hooks/useCollection'
import { TiltCard } from '@/components/TiltCard'
import { LANG_LABEL, LANG_SHORT, setHref, stageLabel, won, fmtDate, type CardLang } from '@/lib/cardDex'
import { ArrowRight, GitBranch, Sparkles } from 'lucide-react'
import { useKoreanView } from '@/hooks/useKoreanView'
import { KoViewToggle, PokedexPanel, TcgStatsPanel, type SpeciesInfo } from '@/components/cards/KoreanDex'

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
  snkrdunkPrice: number | null
  snkrdunkListings: string | null
  snkrdunkUpdatedAt: string | null
  stage: string | null
  evolvesFrom: string | null
  dexIds: number[]
  regulationMark: string | null
  lang: CardLang
  stats: Record<string, unknown> | null
  textKo: {
    attacks?: Array<{ name: string | null; text: string | null }>
    abilities?: Array<{ name: string | null; text: string | null }>
    effect?: string | null; flavor?: string | null; typeLine?: string | null
  } | null
  textKoSource: string | null
  species: SpeciesInfo[]
  set: { name: string; series: string | null; releaseDate: string | null; logoUrl: string | null; symbolUrl: string | null; officialCount: number | null; totalCount: number | null } | null
  createdAt: string
  _count: { listings: number; oripaItems: number }
  marketStats: MarketStats | null
}

interface RelatedCard {
  id: string; name: string; nameKo: string | null; nameJa: string | null; setName: string; setCode: string | null
  cardNumber: string | null; rarity: string; imageUrl: string | null; stage: string | null; snkrdunkPrice: number | null
  lang: CardLang; activeListings: number
}
interface EvoNode { name: string; card: RelatedCard | null; children?: EvoNode[] }
interface Related {
  lang: CardLang
  versions: RelatedCard[]
  evolution: { ancestors: EvoNode[]; current: string; descendants: EvoNode[] }
  samePokemon: { total: number; cards: RelatedCard[] }
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
  if (!info) return <span className="text-[11px] bg-surface-2 border border-line px-1.5 py-0.5 rounded text-muted-2">{type}</span>
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
      {count > 5 && <span className="text-[10px] text-muted-2">+{count - 5}</span>}
    </div>
  )
}

function opColorClass(color: string): string {
  const c = color.toLowerCase()
  if (c.includes('red'))    return 'text-red-400 border-red-700/30 bg-red-900/20'
  if (c.includes('blue'))   return 'text-blue-400 border-blue-700/30 bg-blue-900/20'
  if (c.includes('green'))  return 'text-emerald-400 border-emerald-700/30 bg-emerald-900/20'
  if (c.includes('purple')) return 'text-purple-400 border-purple-700/30 bg-purple-900/20'
  if (c.includes('black'))  return 'text-gray-300 border-gray-600/30 bg-gray-800/20'
  if (c.includes('yellow')) return 'text-yellow-400 border-yellow-700/30 bg-yellow-900/20'
  return 'text-muted border-line bg-surface-2'
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
  return 'text-muted-2 border-line bg-surface-2'
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

// 레어도 색에 맞춘 이미지 뒤 글로우
function glowForRarity(rColor: string): string {
  if (rColor.includes('red')) return 'bg-red-500/30'
  if (rColor.includes('amber') || rColor.includes('yellow')) return 'bg-amber-400/25'
  if (rColor.includes('orange')) return 'bg-orange-500/25'
  if (rColor.includes('pink')) return 'bg-pink-500/30'
  if (rColor.includes('blue')) return 'bg-sky-500/30'
  if (rColor.includes('emerald')) return 'bg-emerald-500/25'
  return 'bg-accent/35'
}

// ─── 시세 패널 ────────────────────────────────────────────────────────────────

function MarketPanel({ stats, card }: { stats: MarketStats | null; card: CardDetail }) {
  if (!stats || stats.activeCount === 0) {
    return (
      <div className="bg-surface border border-line rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-fg flex items-center gap-2 mb-4">
          <BarChart2 size={15} className="text-accent-fg" /> 현재 시세
        </h2>
        <div className="flex flex-col items-center py-6 gap-2">
          <AlertCircle size={28} className="text-subtle" />
          <p className="text-sm text-subtle">현재 등록된 판매가 없습니다.</p>
        </div>
      </div>
    )
  }

  const spread = stats.maxPrice - stats.minPrice

  return (
    <div className="bg-surface border border-line rounded-2xl p-5 space-y-4">
      <h2 className="text-sm font-semibold text-fg flex items-center gap-2">
        <BarChart2 size={15} className="text-accent-fg" /> 현재 시세
        <span className="ml-auto text-xs text-subtle font-normal">{stats.activeCount}개 활성 리스팅</span>
      </h2>

      {/* 가격 3개 */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-sunken/60 border border-line rounded-2xl py-4">
          <p className="text-[10px] text-subtle uppercase tracking-wider mb-1">최저가</p>
          <p className="font-display text-lg font-semibold text-emerald-400 tabular-nums">{stats.minPrice.toLocaleString()}P</p>
        </div>
        <div className="bg-sunken/60 border border-accent/20 rounded-2xl py-4">
          <p className="text-[10px] text-subtle uppercase tracking-wider mb-1">평균가</p>
          <p className="font-display text-lg font-semibold text-accent-2 tabular-nums">{stats.avgPrice.toLocaleString()}P</p>
        </div>
        <div className="bg-sunken/60 border border-line rounded-2xl py-4">
          <p className="text-[10px] text-subtle uppercase tracking-wider mb-1">최고가</p>
          <p className="font-display text-lg font-semibold text-red-400 tabular-nums">{stats.maxPrice.toLocaleString()}P</p>
        </div>
      </div>

      {/* 가격 폭 바 */}
      {spread > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-subtle">
            <span>{stats.minPrice.toLocaleString()}P</span>
            <span>{stats.maxPrice.toLocaleString()}P</span>
          </div>
          <div className="relative h-1.5 bg-line rounded-full overflow-hidden">
            <div
              className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-emerald-500 via-accent to-red-500"
              style={{ width: '100%' }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-accent border-2 border-bg shadow"
              style={{
                left: spread > 0 ? `calc(${((stats.avgPrice - stats.minPrice) / spread) * 100}% - 4px)` : '50%',
              }}
            />
          </div>
        </div>
      )}

      {/* 거래 유형별 */}
      <div className="flex gap-3 text-xs text-subtle">
        {stats.byType.BUY_NOW > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" /> 즉시구매 {stats.byType.BUY_NOW}
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

      {/* 스니덩 시세 */}
      {card.snkrdunkPrice != null && (
        <div className="border-t border-line pt-3 flex items-center justify-between">
          <div>
            <p className="text-[10px] text-subtle uppercase tracking-wider mb-0.5">스니덩 최저 호가</p>
            <p className="text-sm font-bold text-[#5ba3f5] tabular-nums">
              {card.snkrdunkPrice > 0 ? `₩${card.snkrdunkPrice.toLocaleString()}` : '리스팅 없음'}
              {card.snkrdunkListings && card.snkrdunkListings !== '0' && (
                <span className="ml-1.5 text-xs font-normal text-subtle">({card.snkrdunkListings}건)</span>
              )}
            </p>
          </div>
          {card.snkrdunkUpdatedAt && (
            <p className="text-[10px] text-subtle">
              {new Date(card.snkrdunkUpdatedAt).toLocaleDateString('ko-KR')} 기준
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── 카드 정보 테이블 ─────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null
  return (
    <div className="rounded-2xl border border-line bg-surface/70 px-4 py-3 min-w-0">
      <p className="text-[11px] text-muted mb-1">{label}</p>
      <div className="text-sm text-fg font-medium truncate">{value}</div>
    </div>
  )
}

// ─── 메인 페이지 ─────────────────────────────────────────────────────────────

// ─── 관련 카드 (진화 라인 · 같은 포켓몬) ─────────────────────────────────────

const relName = (c: RelatedCard) => (c.lang === 'ja' ? c.nameJa ?? c.name : c.nameKo ?? c.name)

function EvoCard({ node, current }: { node: EvoNode; current?: boolean }) {
  const inner = (
    <div className={`w-[88px] flex flex-col items-center gap-1.5 ${current ? '' : 'group'}`}>
      <div className={`relative w-[88px] aspect-[3/4] rounded-xl overflow-hidden border bg-surface-2 transition-all ${current ? 'border-accent shadow-[0_0_24px_-4px_rgba(139,92,246,0.6)]' : 'border-line group-hover:border-accent/50 group-hover:-translate-y-0.5'}`}>
        {node.card?.imageUrl
          ? <Image src={resolveImageSrc(node.card.imageUrl)!} alt={node.name} fill sizes="88px" className="object-contain" />
          : <div className="absolute inset-0 flex items-center justify-center px-2 text-center text-[10px] text-subtle">도감에 없음</div>}
      </div>
      <p className={`text-[11px] text-center leading-tight line-clamp-2 ${current ? 'text-fg font-semibold' : 'text-muted group-hover:text-fg'}`}>{node.name}</p>
      {node.card?.stage && <span className="text-[9px] text-subtle">{stageLabel(node.card.stage)}</span>}
    </div>
  )
  return node.card && !current ? <Link href={`/cards/${node.card.id}`}>{inner}</Link> : inner
}

function EvolutionLine({ evo, currentCard }: { evo: Related['evolution']; currentCard: RelatedCard }) {
  if (!evo.ancestors.length && !evo.descendants.length) return null
  const arrow = <ArrowRight size={16} className="shrink-0 text-subtle mt-12" />
  return (
    <section className="space-y-3">
      <h2 className="text-2xl font-bold tracking-tight text-fg flex items-center gap-2"><GitBranch size={20} className="text-accent-fg" />진화 라인</h2>
      <div className="rounded-2xl border border-line bg-surface p-4 sm:p-5 overflow-x-auto">
        <div className="flex items-start gap-3 w-max">
          {evo.ancestors.map(a => <div key={a.name} className="flex items-start gap-3"><EvoCard node={a} />{arrow}</div>)}
          <EvoCard node={{ name: evo.current, card: currentCard }} current />
          {evo.descendants.length > 0 && arrow}
          {evo.descendants.length > 0 && (
            <div className="flex flex-col gap-3">
              {evo.descendants.map(d => (
                <div key={d.name} className="flex items-start gap-3">
                  <EvoCard node={d} />
                  {d.children && d.children.length > 0 && (
                    <>{arrow}<div className="flex gap-3">{d.children.map(g => <EvoCard key={g.name} node={g} />)}</div></>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function RelatedStrip({ title, icon, cards, more }: { title: string; icon: React.ReactNode; cards: RelatedCard[]; more?: React.ReactNode }) {
  if (!cards.length) return null
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-2xl font-bold tracking-tight text-fg flex items-center gap-2">{icon}{title}</h2>
        {more}
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
        {cards.map(c => (
          <Link key={c.id} href={`/cards/${c.id}`} className="shrink-0 w-28 group">
            <div className="relative w-28 aspect-[3/4] rounded-xl overflow-hidden border border-line group-hover:border-accent/50 group-hover:-translate-y-1 transition-all bg-surface">
              {c.imageUrl ? <Image src={resolveImageSrc(c.imageUrl)!} alt={relName(c)} fill sizes="112px" className="object-contain" /> : <div className="absolute inset-0 flex items-center justify-center text-xl text-line">🃏</div>}
            </div>
            <p className="mt-1.5 text-[11px] text-muted group-hover:text-fg truncate">{relName(c)}</p>
            <p className="text-[10px] text-subtle truncate">{c.setCode} · {rarityLabel(c.rarity)}</p>
            {(c.snkrdunkPrice ?? 0) > 0 && <p className="text-[10px] text-sky-300 font-semibold tabular-nums">{won(c.snkrdunkPrice!)}</p>}
          </Link>
        ))}
      </div>
    </section>
  )
}

export default function CardDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [listingSort, setListingSort] = useState('newest')
  const [listingType, setListingType] = useState('')
  const [listingPage, setListingPage] = useState(1)
  const [imgError, setImgError] = useState(false)
  const { addCard } = useRecentlyViewed()
  const { isCollected, toggle: toggleCollection } = useCollection()
  const koView = useKoreanView()

  const { data: card, isLoading } = useQuery<CardDetail>({
    queryKey: ['card', id],
    queryFn: () => api.get(`/cards/${id}`).then(r => r.data),
  })

  useEffect(() => {
    if (card) addCard({ id: card.id, name: card.name, nameKo: card.nameKo, imageUrl: card.imageUrl ?? null, tcgType: card.tcgType, setName: card.setName })
  }, [card?.id])

  const { data: sameSetData } = useQuery<{ cards: Array<{ id: string; name: string; nameKo: string | null; cardNumber: string | null; imageUrl: string | null; rarity: string }> }>({
    queryKey: ['same-set', card?.setCode, card?.lang, card?.tcgType, id],
    queryFn: () => api.get('/cards', {
      params: card!.setCode
        ? { setCode: card!.setCode, setLang: card!.lang, tcgType: card!.tcgType, limit: 18, sort: 'price_desc' }
        : { setName: card!.setName, tcgType: card!.tcgType, limit: 18, sort: 'name' },
    }).then(r => r.data),
    enabled: !!card,
    staleTime: 60_000,
  })

  // 같은 세트·번호의 다른 버전/언어판, 진화 라인, 같은 포켓몬
  const { data: related } = useQuery<Related>({
    queryKey: ['card-related', id],
    queryFn: () => api.get(`/cards/${id}/related`).then(r => r.data),
    enabled: !!card,
    staleTime: 60_000,
  })
  const variants = related?.versions

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
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="h-6 w-24 bg-surface border border-line rounded animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-8 lg:gap-12">
          <div className="aspect-[3/4] bg-surface border border-line rounded-2xl animate-pulse" />
          <div className="space-y-4">
            <div className="h-8 bg-surface border border-line rounded-2xl animate-pulse" />
            <div className="h-40 bg-surface border border-line rounded-2xl animate-pulse" />
            <div className="h-32 bg-surface border border-line rounded-2xl animate-pulse" />
          </div>
        </div>
      </div>
    )
  }

  if (!card) {
    return (
      <div className="text-center py-24">
        <p className="text-subtle">카드를 찾을 수 없습니다.</p>
        <Link href="/cards" className="mt-4 inline-block text-sm text-accent-fg hover:text-accent-soft">
          ← 카드 도감으로
        </Link>
      </div>
    )
  }

  const originalName   = card.lang === 'ja' ? card.nameJa ?? card.name : card.name
  const displayName    = koView.on ? card.nameKo ?? originalName : originalName
  const kt             = koView.on && card.lang !== 'ko' ? card.textKo : null
  // 번역이 없는 항목은 원문 그대로 (섞이지 않게 항목 단위로)
  const koOr = (ko: string | null | undefined, orig: string | null | undefined) => (kt && ko ? ko : orig)
  const hasKoText = !!card.textKo && card.lang !== 'ko' && !!card.textKoSource
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
    <div className="max-w-6xl mx-auto space-y-14">

      {/* 뒤로가기 */}
      <Link
        href="/cards"
        className="inline-flex items-center gap-1 h-8 pl-2 pr-3 lg:-mb-6 rounded-full border border-line bg-surface/60 text-sm text-muted hover:text-fg hover:border-line-strong transition-colors"
      >
        <ChevronLeft size={16} /> 카드 도감
      </Link>

      {/* ── 상단: 이미지 + 기본 정보 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-8 lg:gap-12 items-start">

        {/* 카드 이미지 */}
        <div className="lg:sticky lg:top-24 flex flex-col items-center gap-4">
          <TiltCard className="w-full max-w-[340px] mx-auto" glowClassName={glowForRarity(rColor)}>
            <div className="relative aspect-[3/4] bg-surface-2">
              {card.imageUrl && !imgError ? (
                <Image
                  src={resolveImageSrc(card.imageUrl)!}
                  alt={displayName}
                  fill
                  sizes="340px"
                  className="object-contain"
                  onError={() => setImgError(true)}
                  priority
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-6xl">
                  {TCG_ICONS[card.tcgType] ?? '🃏'}
                </div>
              )}
            </div>
          </TiltCard>

          {/* 외부 링크 */}
          {extLink && (
            <a
              href={extLink.url}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full max-w-[340px] flex items-center justify-center gap-1.5 h-10 border border-line hover:border-line-strong rounded-full text-xs text-muted hover:text-fg transition-colors"
            >
              <TrendingUp size={12} /> {extLink.label}에서 보기 ↗
            </a>
          )}

          {/* 다른 버전 */}
          {variants && variants.length > 0 && (
            <div className="w-full max-w-[340px]">
              <p className="text-[10px] text-subtle uppercase tracking-wider mb-2 font-semibold">다른 버전·언어판 ({variants.length})</p>
              <div className="grid grid-cols-3 gap-2">
                {variants.map(v => (
                  <Link key={v.id} href={`/cards/${v.id}`} className="group flex flex-col items-center gap-1">
                    <div className="relative w-full aspect-[3/4] rounded-lg overflow-hidden border border-line group-hover:border-accent/40 transition-colors bg-surface-2">
                      {v.imageUrl ? (
                        <Image
                          src={resolveImageSrc(v.imageUrl)!}
                          alt={v.nameKo ?? v.name}
                          fill
                          sizes="80px"
                          className="object-contain"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-xl">🃏</div>
                      )}
                    </div>
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${rarityColorClass(v.rarity)}`}>
                      {rarityLabel(v.rarity)}
                    </span>
                    <span className="text-[9px] text-subtle text-center leading-tight">
                      {v.lang !== card.lang ? LANG_SHORT[v.lang] : v.cardNumber?.replace(/.*_/, '_') ?? ''}
                    </span>
                    {(v.snkrdunkPrice ?? 0) > 0 && <span className="text-[9px] text-sky-300 font-semibold tabular-nums">{won(v.snkrdunkPrice!)}</span>}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 우측 정보 */}
        <div className="space-y-5 min-w-0">

          {/* 이름 + 배지 */}
          <div>
            {/* 레어도 + TCG 타입 + 언어 뱃지 */}
            <div className="flex items-start gap-2 flex-wrap mb-4">
              <span className={`inline-flex items-center h-7 px-3 rounded-full border text-[11px] font-semibold ${rColor}`}>
                {rarityLabel(card.rarity)}
              </span>
              <span className="inline-flex items-center gap-1 h-7 px-3 rounded-full border border-line bg-surface-2 text-[11px] text-muted-2">
                {TCG_ICONS[card.tcgType]} {TCG_LABELS[card.tcgType] ?? card.tcgType}
              </span>
              <span className="inline-flex items-center h-7 px-3 rounded-full border border-line bg-surface-2 text-[11px] text-muted-2">{LANG_LABEL[card.lang]}</span>
              {card.regulationMark && (
                <span className="inline-flex items-center gap-1 h-7 px-3 rounded-full border border-line bg-surface-2 text-[11px] text-muted-2" title="레귤레이션 마크">
                  레귤레이션 <b className="text-fg">{card.regulationMark}</b>
                </span>
              )}
              {card.nameKo && (
                <span className="inline-flex items-center gap-1 h-7 px-3 rounded-full border border-emerald-700/40 bg-emerald-900/20 text-[11px] text-emerald-400 font-medium">
                  🇰🇷 한국어
                </span>
              )}
              {card.nameJa && (
                <span className="inline-flex items-center gap-1 h-7 px-3 rounded-full border border-blue-700/40 bg-blue-900/20 text-[11px] text-blue-400 font-medium">
                  🇯🇵 日本語
                </span>
              )}
            </div>

            {/* 메인 카드명 (한국어 우선) */}
            <div className="flex items-start gap-2">
              <h1 className="text-3xl sm:text-[40px] font-extrabold tracking-[-0.03em] text-fg leading-[1.1] flex-1">{displayName}</h1>
              <button
                onClick={() => toggleCollection(card.id)}
                title={isCollected(card.id) ? '보유 해제' : '보유 카드로 마킹'}
                className={`shrink-0 flex items-center gap-1.5 h-9 px-3.5 rounded-full border text-xs font-semibold transition-all mt-1 ${
                  isCollected(card.id)
                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                    : 'bg-surface-2 border-line text-subtle hover:border-emerald-700/40 hover:text-emerald-500'
                }`}
              >
                <CheckCircle2 size={13} />
                {isCollected(card.id) ? '보유 중' : '보유'}
              </button>
              <WishlistButton cardId={card.id} cardName={displayName} />
            </div>

            {/* 서브 이름 (원문, 일본어) */}
            <div className="mt-1.5 space-y-0.5">
              {/* 제목과 다른 언어 이름만 한 번씩 */}
              {[
                { flag: '🇰🇷', value: card.nameKo },
                { flag: '🇯🇵', value: card.nameJa ?? (card.lang === 'ja' ? card.name : null) },
                { flag: '🇺🇸', value: card.lang === 'en' ? card.name : null },
              ].filter((x, i, arr) => x.value && x.value !== displayName && arr.findIndex(y => y.value === x.value) === i).map(x => (
                <p key={x.flag} className="text-sm text-muted-2">
                  <span className="text-[10px] mr-1.5 opacity-60">{x.flag}</span>{x.value}
                </p>
              ))}
            </div>
          </div>

          {/* 가격 + 액션 */}
          <div className="relative overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-surface-2 via-surface to-surface p-6">
            <div className="absolute -top-16 -right-10 w-56 h-56 rounded-full bg-accent/15 blur-3xl pointer-events-none" />
            <div className="relative flex flex-col sm:flex-row sm:items-end justify-between gap-5">
              <div>
                <p className="text-xs text-muted mb-2">
                  {cheapestBuyNow ? '즉시구매 최저가' : card.marketStats?.activeCount ? '현재 최저 호가' : '시세'}
                </p>
                {cheapestBuyNow || card.marketStats?.activeCount ? (
                  <p className="font-display text-4xl font-semibold text-fg tabular-nums leading-none">
                    {(cheapestBuyNow?.buyNowPrice ?? card.marketStats!.minPrice).toLocaleString()}
                    <span className="text-lg text-muted ml-1 font-sans font-medium">P</span>
                  </p>
                ) : (
                  <p className="text-lg font-semibold text-fg-3">등록된 판매가 없습니다</p>
                )}
                {card.marketStats && card.marketStats.activeCount > 0 && (
                  <p className="text-xs text-muted mt-2">
                    평균 {card.marketStats.avgPrice.toLocaleString()}P · {card.marketStats.activeCount}개 판매 중
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {cheapestBuyNow && (
                  <Link
                    href={`/listings/${cheapestBuyNow.id}`}
                    className="h-12 px-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-accent to-accent-strong text-white text-sm font-semibold shadow-[0_8px_28px_-6px_rgba(139,92,246,0.6)] hover:shadow-[0_8px_36px_-4px_rgba(139,92,246,0.8)] transition-shadow"
                  >
                    <Tag size={15} /> 최저가로 구매
                  </Link>
                )}
                <Link
                  href={`/listings?tab=sell&cardId=${card.id}`}
                  className={`h-12 px-6 inline-flex items-center gap-2 rounded-full text-sm font-semibold transition-colors ${
                    cheapestBuyNow
                      ? 'border border-line-strong text-fg-2 hover:bg-surface-2'
                      : 'bg-white text-bg hover:bg-fg-2'
                  }`}
                >
                  <ShoppingBag size={15} /> 이 카드 판매하기
                </Link>
              </div>
            </div>
          </div>

          {/* 카드 기본 정보 */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
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
            <InfoRow label="세트" value={card.setCode
              ? <Link href={setHref(card.tcgType, card.lang, card.setCode)} className="text-accent-fg hover:underline">{card.set?.name ?? card.setName}</Link>
              : card.setName} />
            <InfoRow label="세트 코드" value={card.setCode} />
            {card.set?.releaseDate && <InfoRow label="발매일" value={fmtDate(card.set.releaseDate)} />}
            {card.stage && <InfoRow label="진화 단계" value={stageLabel(card.stage)} />}
            {card.evolvesFrom && <InfoRow label="진화 전" value={card.evolvesFrom} />}
            {card.dexIds?.length > 0 && (
              <InfoRow label="전국 도감" value={
                <span className="flex flex-wrap gap-1">{card.dexIds.map(n => (
                  <Link key={n} href={`/cards?q=%23${n}&tcgType=${card.tcgType}`} className="text-accent-fg hover:underline">No.{n}</Link>
                ))}</span>
              } />
            )}
            {card.artist && (
              <InfoRow label="일러스트레이터" value={
                <Link href={`/cards?artist=${encodeURIComponent(card.artist)}&tcgType=${card.tcgType}`} className="text-accent-fg hover:underline">{card.artist}</Link>
              } />
            )}
            <InfoRow label="카드 번호" value={card.cardNumber ? `[${card.cardNumber}]` : null} />
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
            <div className="bg-surface border border-line rounded-2xl overflow-hidden">
              {/* 헤더: HP + 에너지 타입 */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-line">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-muted-2">
                    {card.supertype ?? 'Pokémon'}
                    {card.subtypes && ` · ${card.subtypes.split(',').join(' · ')}`}
                  </span>
                  {card.cardTypes && card.cardTypes.split(',').map(t => (
                    <EnergyBadge key={t} type={t.trim()} />
                  ))}
                  {hasKoText && <KoViewToggle source={card.textKoSource} />}
                </div>
                {card.hp && (
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-subtle">HP</span>
                    <span className="text-2xl font-black text-red-400 leading-none">{card.hp}</span>
                  </div>
                )}
              </div>

              {/* 특성 (Ability) */}
              {card.abilities && card.abilities.length > 0 && (
                <div className="px-4 py-3 border-b border-surface-2">
                  {card.abilities.map((ab, i) => (
                    <div key={i} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-red-900/40 text-red-400 border border-red-700/30">
                          {ab.type === 'Pokémon Power' ? '포켓몬 파워' : ab.type === 'Ancient Trait' ? '고대 특성' : '특성'}
                        </span>
                        <span className="text-sm font-semibold text-fg">{koOr(kt?.abilities?.[i]?.name, ab.name)}</span>
                      </div>
                      <p className="text-xs text-muted leading-relaxed">{koOr(kt?.abilities?.[i]?.text, ab.text)}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* 기술 (Attacks) */}
              {card.attacks && card.attacks.length > 0 && (
                <div className="divide-y divide-surface-2">
                  {card.attacks.map((atk, i) => (
                    <div key={i} className="px-4 py-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {/* 에너지 비용 */}
                          {atk.cost.map((c, j) => (
                            <EnergyBadge key={j} type={c} />
                          ))}
                          <span className="text-sm font-semibold text-fg">{koOr(kt?.attacks?.[i]?.name, atk.name)}</span>
                        </div>
                        {atk.damage && (
                          <span className="text-lg font-black text-accent-2 whitespace-nowrap">{atk.damage}</span>
                        )}
                      </div>
                      {atk.text && (
                        <p className="text-xs text-muted leading-relaxed">{koOr(kt?.attacks?.[i]?.text, atk.text)}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* 약점 · 저항력 · 후퇴비용 */}
              {(card.weaknesses?.length || card.resistances?.length || card.retreatCost != null) && (
                <div className="flex items-center gap-4 px-4 py-3 border-t border-line bg-sunken">
                  {card.weaknesses && card.weaknesses.length > 0 && (
                    <div className="space-y-0.5">
                      <p className="text-[9px] text-subtle uppercase tracking-wider">약점</p>
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
                      <p className="text-[9px] text-subtle uppercase tracking-wider">저항력</p>
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
                      <p className="text-[9px] text-subtle uppercase tracking-wider">후퇴비용</p>
                      <RetreatDots count={card.retreatCost} />
                    </div>
                  )}
                </div>
              )}

              {/* 풀레이버 텍스트 */}
              {card.flavorText && (
                <div className="px-4 py-3 border-t border-surface-2">
                  <p className="text-[11px] text-subtle italic leading-relaxed">&ldquo;{koOr(kt?.flavor, card.flavorText)}&rdquo;</p>
                </div>
              )}

              {/* 일러스트레이터 */}
              {card.artist && (
                <div className="px-4 py-2 border-t border-surface-2 flex items-center justify-end gap-1">
                  <span className="text-[9px] text-subtle">illus.</span>
                  <span className="text-[11px] text-muted-2">{card.artist}</span>
                </div>
              )}
            </div>
          )}

          {/* 원피스 카드 스탯 */}
          {card.tcgType === 'ONEPIECE' && (card.retreatCost != null || card.hp != null || card.cardTypes || card.supertype || card.subtypes || card.description || card.flavorText) && (
            <div className="bg-surface border border-line rounded-2xl overflow-hidden">
              {/* 헤더: 카드 타입 + 속성 + 색 */}
              {(card.supertype || card.cardTypes || card.subtypes) && (
                <div className="flex items-center gap-2 flex-wrap px-4 py-3 border-b border-line">
                  {card.supertype && (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-surface-2 text-fg-3 border border-line">
                      {card.supertype}
                    </span>
                  )}
                  {card.cardTypes && card.cardTypes.split('/').map(col => (
                    <span key={col} className={`text-[10px] font-bold px-2 py-0.5 rounded border ${opColorClass(col.trim())}`}>
                      {col.trim()}
                    </span>
                  ))}
                  {card.subtypes && (
                    <span className="text-[11px] text-muted-2 ml-auto">
                      속성: <span className="text-fg-3">{card.subtypes}</span>
                    </span>
                  )}
                </div>
              )}

              {/* 스탯: Cost / Power / Counter */}
              {(card.retreatCost != null || card.hp != null || card.artist) && (
                <div className="flex divide-x divide-line border-b border-line">
                  {card.retreatCost != null && (
                    <div className="flex-1 px-4 py-3 text-center">
                      <p className="text-[9px] text-subtle uppercase tracking-wider mb-1">Cost</p>
                      <p className="text-2xl font-black text-accent-fg">{card.retreatCost}</p>
                    </div>
                  )}
                  {card.hp != null && (
                    <div className="flex-1 px-4 py-3 text-center">
                      <p className="text-[9px] text-subtle uppercase tracking-wider mb-1">Power</p>
                      <p className="text-2xl font-black text-fg">{card.hp.toLocaleString()}</p>
                    </div>
                  )}
                  {card.artist && (
                    <div className="flex-1 px-4 py-3 text-center">
                      <p className="text-[9px] text-subtle uppercase tracking-wider mb-1">
                        {card.artist.startsWith('life:') ? 'Life' : 'Counter'}
                      </p>
                      <p className="text-2xl font-black text-emerald-400">
                        {card.artist.startsWith('life:') ? card.artist.slice(5) : card.artist}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* 소속 / 타입 */}
              {card.flavorText && (
                <div className="px-4 py-2 border-b border-surface-2">
                  <span className="text-[10px] text-subtle">소속  </span>
                  <span className="text-[11px] text-muted">{card.flavorText}</span>
                </div>
              )}

              {/* 효과 텍스트 */}
              {card.description && (
                <div className="px-4 py-3">
                  <p className="text-[9px] text-subtle uppercase tracking-wider mb-2">Effect</p>
                  <p className="text-xs text-muted leading-relaxed whitespace-pre-line">{card.description}</p>
                </div>
              )}
            </div>
          )}

          {(card.tcgType === 'YUGIOH' || card.tcgType === 'MTG' || card.tcgType === 'DIGIMON') && (
            <TcgStatsPanel tcgType={card.tcgType} stats={card.stats} description={card.description}
              textKo={card.textKo} textKoSource={card.textKoSource} />
          )}

          {card.description && !['ONEPIECE', 'YUGIOH', 'MTG', 'DIGIMON'].includes(card.tcgType) && (
            <div className="bg-surface border border-line rounded-2xl p-4 space-y-2">
              {hasKoText && card.textKo?.effect && <div className="flex justify-end"><KoViewToggle source={card.textKoSource} /></div>}
              <p className="text-xs text-muted leading-relaxed whitespace-pre-line">{koOr(kt?.effect, card.description)}</p>
            </div>
          )}

          <PokedexPanel species={card.species ?? []} />

          {/* 시세 패널 */}
          <MarketPanel stats={card.marketStats} card={card} />

          {/* 체결 가격 히스토리 차트 */}
          <PriceHistoryChart cardId={card.id} />
        </div>
      </div>

      {/* ── 진화 라인 · 같은 포켓몬 ── */}
      {related && (
        <EvolutionLine evo={related.evolution} currentCard={{
          id: card.id, name: card.name, nameKo: card.nameKo, nameJa: card.nameJa, setName: card.setName, setCode: card.setCode,
          cardNumber: card.cardNumber, rarity: card.rarity, imageUrl: card.imageUrl, stage: card.stage,
          snkrdunkPrice: card.snkrdunkPrice, lang: card.lang, activeListings: card._count.listings,
        }} />
      )}
      {related && (
        <RelatedStrip
          title="같은 포켓몬의 다른 카드" icon={<Sparkles size={20} className="text-accent-fg" />}
          cards={related.samePokemon.cards}
          more={card.dexIds?.[0] != null && related.samePokemon.total > related.samePokemon.cards.length ? (
            <Link href={`/cards?q=%23${card.dexIds[0]}&tcgType=${card.tcgType}`} className="text-xs text-muted-2 hover:text-accent-fg">
              전체 {related.samePokemon.total}장 보기 →
            </Link>
          ) : undefined}
        />
      )}

      {/* ── 활성 리스팅 ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-2xl font-bold tracking-tight text-fg flex items-center gap-2">
            판매 리스팅
            {listingsData && (
              <span className="text-sm font-normal text-subtle">
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
                  className={`h-8 px-3.5 rounded-full text-xs font-medium border transition-all ${
                    listingType === opt.value
                      ? 'bg-accent-tint text-accent-soft border-accent-line'
                      : 'text-muted-2 border-line hover:border-line-strong hover:text-fg-3'
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
              className="h-8 bg-surface border border-line hover:border-line-strong rounded-full px-3 text-xs text-fg focus:outline-none transition-colors"
            >
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        {listingsLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-surface border border-line rounded-2xl h-72 animate-pulse" />
            ))}
          </div>
        ) : listings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 bg-surface border border-line rounded-2xl">
            <Package size={36} className="text-line" />
            <p className="text-subtle text-sm">현재 판매 중인 리스팅이 없습니다.</p>
            <Link
              href={`/listings?tab=sell&cardId=${card.id}`}
              className="text-sm text-accent-fg hover:text-accent-soft transition-colors"
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
                  className="h-9 w-9 flex items-center justify-center rounded-full bg-surface border border-line text-muted-2 hover:border-line-strong hover:text-fg-2 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                >
                  <Prev size={13} />
                </button>
                <span className="text-xs text-subtle px-3">
                  {listingPage} / {listingsData.totalPages}
                </span>
                <button
                  onClick={() => setListingPage(p => Math.min(listingsData.totalPages, p + 1))}
                  disabled={listingPage === listingsData.totalPages}
                  className="h-9 w-9 flex items-center justify-center rounded-full bg-surface border border-line text-muted-2 hover:border-line-strong hover:text-fg-2 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                >
                  <Next size={13} />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── 같은 세트 카드 ── */}
      {sameSetData && sameSetData.cards.filter(c => c.id !== card.id).length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold tracking-tight text-fg flex items-center gap-2">
              같은 세트 카드
              <span className="text-xs font-normal text-subtle">— {card.setName}</span>
            </h2>
            <Link
              href={card.setCode ? setHref(card.tcgType, card.lang, card.setCode) : `/cards?setName=${encodeURIComponent(card.setName)}&tcgType=${card.tcgType}`}
              className="text-xs text-muted-2 hover:text-accent-fg transition-colors"
            >
              세트 도감에서 보기 →
            </Link>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {sameSetData.cards
              .filter(c => c.id !== card.id)
              .slice(0, 16)
              .map(c => (
                <Link
                  key={c.id}
                  href={`/cards/${c.id}`}
                  className="shrink-0 group flex flex-col items-center gap-1.5 w-28"
                >
                  <div className="relative w-28 h-[150px] rounded-xl overflow-hidden border border-line group-hover:border-accent/50 group-hover:-translate-y-1 transition-all bg-surface">
                    {c.imageUrl ? (
                      <Image
                        src={resolveImageSrc(c.imageUrl)!}
                        alt={c.nameKo ?? c.name}
                        fill
                        sizes="80px"
                        className="object-contain"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-xl text-line">🃏</div>
                    )}
                  </div>
                  <p className="text-[11px] text-muted group-hover:text-fg line-clamp-2 text-center leading-tight w-full transition-colors">
                    {c.nameKo ?? c.name}
                  </p>
                  {c.cardNumber && (
                    <p className="text-[8px] text-subtle font-mono">{c.cardNumber}</p>
                  )}
                </Link>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}

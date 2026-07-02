'use client'

import { useQuery } from '@tanstack/react-query'
import { useSearchParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import ListingCard from '@/components/ListingCard'
import SkeletonCard from '@/components/SkeletonCard'
import SellForm from '@/components/SellForm'
import { TCG_LABELS, CONDITION_LABELS } from '@/lib/utils'
import { Suspense, useState } from 'react'
import {
  SlidersHorizontal, X, PlusCircle, LayoutGrid,
  ChevronLeft, ChevronRight, TrendingUp, Zap, Clock,
  ShieldCheck, Tag, Gavel, Flame, BarChart2,
} from 'lucide-react'
import { useAuthStore } from '@/lib/store'
import Image from 'next/image'
import Link from 'next/link'

// ─── 상수 ─────────────────────────────────────────────────────────────────────

const TCG_TYPES = ['POKEMON', 'YUGIOH', 'MTG', 'DIGIMON', 'ONEPIECE', 'WEISS', 'OTHER']
const LISTING_TYPES = [
  { value: '', label: '전체', icon: null },
  { value: 'BUY_NOW', label: '즉시구매', icon: <Tag size={11} /> },
  { value: 'AUCTION', label: '경매', icon: <Gavel size={11} /> },
  { value: 'OFFER', label: '가격제안', icon: <Flame size={11} /> },
]
const SORT_OPTIONS = [
  { value: 'newest',     label: '최신순' },
  { value: 'price_asc',  label: '가격 낮은순' },
  { value: 'price_desc', label: '가격 높은순' },
  { value: 'ending_soon', label: '마감 임박' },
  { value: 'popular',    label: '인기순' },
  { value: 'bid_count',  label: '입찰 많은순' },
]
const CONDITIONS = [
  { value: 'MINT',         label: 'MINT',      color: 'text-emerald-400', bg: 'bg-emerald-900/20 border-emerald-700/40' },
  { value: 'NEAR_MINT',   label: 'NM',         color: 'text-green-400',   bg: 'bg-green-900/20 border-green-700/40' },
  { value: 'EXCELLENT',   label: 'EX',         color: 'text-blue-400',    bg: 'bg-blue-900/20 border-blue-700/40' },
  { value: 'GOOD',        label: 'GOOD',       color: 'text-yellow-400',  bg: 'bg-yellow-900/20 border-yellow-700/40' },
  { value: 'LIGHT_PLAYED', label: 'LP',        color: 'text-orange-400',  bg: 'bg-orange-900/20 border-orange-700/40' },
  { value: 'PLAYED',      label: 'PL',         color: 'text-red-400',     bg: 'bg-red-900/20 border-red-700/40' },
  { value: 'POOR',        label: 'POOR',       color: 'text-zinc-400',    bg: 'bg-zinc-900/20 border-zinc-700/40' },
]
const GRADING_COMPANIES = ['PSA', 'BGS', 'CGC', 'SGC', 'HGA', 'ACE']

const inputCls = 'w-32 bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] focus:border-[#d4a853]/40 rounded-lg px-3 py-2 text-sm text-[#f5ead8] focus:outline-none transition-colors'

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────

function FilterPill({
  active, onClick, children, className,
}: { active: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-150 ${
        active
          ? 'bg-[#2a1c08] text-[#e0b878] border-[#3d2a0c]'
          : `bg-transparent text-[#7a6040] border-[#2e2318] hover:border-[#4a3520] hover:text-[#9e8a6a] ${className ?? ''}`
      }`}>
      {children}
    </button>
  )
}

// ─── 시장 요약 바 ──────────────────────────────────────────────────────────────

interface MarketSummary {
  activeCount: number
  activeAuctions: number
  tx24h: { count: number; volume: number; avgPrice: number | null }
  tx7d: { count: number; volume: number }
  topCards: { cardId: string; name: string; imageUrl: string | null; tcgType: string; rarity: string; txCount: number; avgPrice: number | null }[]
  recentDeals: { id: string; finalPrice: number; completedAt: string; cardName: string; cardImage: string | null; tcgType: string; listingType: string }[]
}

function MarketStatBar() {
  const { data } = useQuery<MarketSummary>({
    queryKey: ['market-summary'],
    queryFn: () => api.get('/listings/market-summary').then(r => r.data),
    staleTime: 60_000,
  })

  const stats = [
    {
      icon: <BarChart2 size={14} className="text-[#d4a853]" />,
      label: '활성 리스팅',
      value: data ? data.activeCount.toLocaleString() : '—',
    },
    {
      icon: <Gavel size={14} className="text-[#f0a832]" />,
      label: '진행 중 경매',
      value: data ? data.activeAuctions.toLocaleString() : '—',
    },
    {
      icon: <TrendingUp size={14} className="text-emerald-400" />,
      label: '24h 체결',
      value: data ? `${data.tx24h.count.toLocaleString()}건` : '—',
    },
    {
      icon: <Zap size={14} className="text-blue-400" />,
      label: '24h 거래액',
      value: data && data.tx24h.volume > 0 ? `${(data.tx24h.volume / 10000).toFixed(1)}만P` : '—',
    },
    {
      icon: <ShieldCheck size={14} className="text-purple-400" />,
      label: '7일 체결',
      value: data ? `${data.tx7d.count.toLocaleString()}건` : '—',
    },
  ]

  return (
    <div className="bg-[#150f0c] border border-[#2e2318] rounded-2xl px-5 py-4 space-y-4">
      {/* 숫자 지표 */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {stats.map(s => (
          <div key={s.label} className="flex items-center gap-2">
            {s.icon}
            <div>
              <p className="text-xs font-bold text-[#f5ead8] tabular-nums leading-none">{s.value}</p>
              <p className="text-[10px] text-[#5a4830] mt-0.5">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 최근 체결 & 인기 카드 */}
      {data && (data.recentDeals.length > 0 || data.topCards.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-[#2e2318]">
          {/* 최근 체결 */}
          {data.recentDeals.length > 0 && (
            <div>
              <p className="text-[10px] text-[#5a4830] uppercase tracking-wider font-semibold mb-2 flex items-center gap-1.5">
                <Clock size={10} /> 최근 체결
              </p>
              <div className="space-y-1.5">
                {data.recentDeals.slice(0, 3).map(deal => (
                  <div key={deal.id} className="flex items-center gap-2">
                    {deal.cardImage
                      ? <div className="relative w-6 h-9 shrink-0 rounded overflow-hidden bg-[#0f0b08]">
                          <Image src={deal.cardImage} alt={deal.cardName} fill className="object-contain" sizes="24px" />
                        </div>
                      : <div className="w-6 h-9 shrink-0 rounded bg-[#1a1208] flex items-center justify-center text-[8px]">🃏</div>
                    }
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-[#e8d5b0] truncate">{deal.cardName}</p>
                      <p className="text-[10px] text-[#5a4830]">{deal.listingType === 'AUCTION' ? '경매' : deal.listingType === 'BUY_NOW' ? '즉구' : '제안'}</p>
                    </div>
                    <p className="text-[11px] font-bold text-[#f0a832] tabular-nums shrink-0">{deal.finalPrice.toLocaleString()}P</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 인기 카드 */}
          {data.topCards.length > 0 && (
            <div>
              <p className="text-[10px] text-[#5a4830] uppercase tracking-wider font-semibold mb-2 flex items-center gap-1.5">
                <TrendingUp size={10} /> 7일 인기 카드
              </p>
              <div className="space-y-1.5">
                {data.topCards.slice(0, 3).map((card, idx) => (
                  <Link key={card.cardId} href={`/cards/${card.cardId}`} className="flex items-center gap-2 group">
                    <span className="text-[10px] font-bold text-[#4a3820] w-4 text-right shrink-0">#{idx + 1}</span>
                    {card.imageUrl
                      ? <div className="relative w-6 h-9 shrink-0 rounded overflow-hidden bg-[#0f0b08]">
                          <Image src={card.imageUrl} alt={card.name ?? ''} fill className="object-contain" sizes="24px" />
                        </div>
                      : <div className="w-6 h-9 shrink-0 rounded bg-[#1a1208] flex items-center justify-center text-[8px]">🃏</div>
                    }
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-[#e8d5b0] truncate group-hover:text-white transition-colors">{card.name}</p>
                      <p className="text-[10px] text-[#5a4830]">{card.txCount}건 {card.avgPrice ? `· 평균 ${card.avgPrice.toLocaleString()}P` : ''}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── 메인 컨텐츠 ──────────────────────────────────────────────────────────────

function ListingsContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const user = useAuthStore(s => s.user)
  const [showFilter, setShowFilter] = useState(false)
  const [minPriceInput, setMinPriceInput] = useState(searchParams.get('minPrice') ?? '')
  const [maxPriceInput, setMaxPriceInput] = useState(searchParams.get('maxPrice') ?? '')

  const tab         = searchParams.get('tab') ?? 'browse'
  const type        = searchParams.get('type') ?? ''
  const tcgType     = searchParams.get('tcgType') ?? ''
  const cardName    = searchParams.get('cardName') ?? ''
  const sort        = searchParams.get('sort') ?? 'newest'
  const minPrice    = searchParams.get('minPrice') ?? ''
  const maxPrice    = searchParams.get('maxPrice') ?? ''
  const condition   = searchParams.get('condition') ?? ''
  const grading     = searchParams.get('grading') ?? ''
  const hasGrading  = searchParams.get('hasGrading') ?? ''
  const page        = Number(searchParams.get('page') ?? '1')

  function setTab(t: string) {
    const params = new URLSearchParams()
    if (t !== 'browse') params.set('tab', t)
    router.push(`/listings${params.size > 0 ? `?${params.toString()}` : ''}`)
  }

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) { params.set(key, value) } else { params.delete(key) }
    params.delete('page')
    router.push(`/listings?${params.toString()}`)
  }

  function toggleParam(key: string, value: string, current: string) {
    setParam(key, current === value ? '' : value)
  }

  function applyPriceFilter() {
    const params = new URLSearchParams(searchParams.toString())
    if (minPriceInput) { params.set('minPrice', minPriceInput) } else { params.delete('minPrice') }
    if (maxPriceInput) { params.set('maxPrice', maxPriceInput) } else { params.delete('maxPrice') }
    params.delete('page')
    router.push(`/listings?${params.toString()}`)
  }

  function clearAllFilters() {
    setMinPriceInput('')
    setMaxPriceInput('')
    router.push('/listings')
  }

  const hasFilters = !!(type || tcgType || cardName || minPrice || maxPrice || condition || grading || hasGrading)

  const { data, isLoading } = useQuery({
    queryKey: ['listings', { type, tcgType, cardName, sort, minPrice, maxPrice, condition, grading, hasGrading, page }],
    queryFn: () =>
      api.get('/listings', {
        params: {
          type:        type || undefined,
          tcgType:     tcgType || undefined,
          cardName:    cardName || undefined,
          sort:        sort || undefined,
          minPrice:    minPrice || undefined,
          maxPrice:    maxPrice || undefined,
          condition:   condition || undefined,
          gradingCompany: grading || undefined,
          hasGrading:  hasGrading || undefined,
          page,
        },
      }).then(r => r.data),
    enabled: tab === 'browse',
    staleTime: 30_000,
  })

  const totalPages = data ? Math.ceil(data.total / data.limit) : 0

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start sm:items-center gap-4 flex-col sm:flex-row">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">마켓플레이스</h1>
          {tab === 'browse' && data && (
            <p className="text-xs text-[#5a4830] mt-0.5">총 {data.total.toLocaleString()}개 리스팅</p>
          )}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {/* Market 링크 */}
          <Link href="/market"
            className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-medium bg-[#1a1410] border border-[#2e2318] text-[#7a6040] hover:border-[#d4a853]/30 hover:text-[#d4a853] transition-all">
            <BarChart2 size={12} /> 시장 분석
          </Link>

          {/* Tab switcher */}
          <div className="flex items-center gap-1 bg-[#1a1410] border border-[#2e2318] rounded-xl p-1">
            <button onClick={() => setTab('browse')}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                tab === 'browse'
                  ? 'bg-[#2a1c08] text-[#e0b878] shadow-[0_0_12px_rgba(212,168,83,0.15)]'
                  : 'text-[#7a6040] hover:text-[#9e8a6a]'
              }`}>
              <LayoutGrid size={13} /> 둘러보기
            </button>
            {user && (
              <button onClick={() => setTab('sell')}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  tab === 'sell'
                    ? 'bg-[#2a1c08] text-[#e0b878] shadow-[0_0_12px_rgba(212,168,83,0.15)]'
                    : 'text-[#7a6040] hover:text-[#9e8a6a]'
                }`}>
                <PlusCircle size={13} /> 판매 등록
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Sell form tab */}
      {tab === 'sell' && user && (
        <div className="bg-[#1a1410] border border-[#2e2318] rounded-2xl p-6">
          <SellForm onSuccess={id => router.push(`/listings/${id}`)} />
        </div>
      )}

      {/* Browse tab */}
      {tab === 'browse' && (
        <>
          {/* 시장 현황 바 */}
          <MarketStatBar />

          {/* 거래 유형 Quick Filter */}
          <div className="flex gap-1.5 flex-wrap">
            {LISTING_TYPES.map(t => (
              <FilterPill key={t.value} active={type === t.value} onClick={() => setParam('type', t.value)}>
                {t.icon}{t.label}
              </FilterPill>
            ))}
          </div>

          {/* Filter toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            <select value={sort} onChange={e => setParam('sort', e.target.value)}
              className="h-9 px-3 bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] rounded-lg text-sm text-[#9e8a6a] focus:outline-none transition-colors cursor-pointer">
              {SORT_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>

            <button onClick={() => setShowFilter(v => !v)}
              className={`h-9 flex items-center gap-1.5 px-3 rounded-lg text-sm border transition-all duration-150 ${
                showFilter || hasFilters
                  ? 'bg-[#2a1c08] border-[#3d2a0c] text-[#e0b878]'
                  : 'bg-[#1a1410] border-[#2e2318] text-[#7a6040] hover:border-[#4a3520] hover:text-[#9e8a6a]'
              }`}>
              <SlidersHorizontal size={13} />
              필터
              {hasFilters && <span className="w-1.5 h-1.5 rounded-full bg-[#d4a853]" />}
            </button>

            {hasFilters && (
              <button onClick={clearAllFilters}
                className="h-9 w-9 flex items-center justify-center text-[#5a4830] hover:text-[#e8d5b0] bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] rounded-lg transition-colors"
                title="필터 초기화">
                <X size={14} />
              </button>
            )}

            {/* 활성 필터 칩 */}
            {cardName && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a1410] border border-[#2e2318] rounded-lg text-xs text-[#7a6040]">
                <span>&ldquo;{cardName}&rdquo;</span>
                <button onClick={() => setParam('cardName', '')} className="text-[#5a4830] hover:text-[#9e8a6a]">
                  <X size={12} />
                </button>
              </div>
            )}
            {condition && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a1410] border border-[#2e2318] rounded-lg text-xs text-[#e0b878]">
                {CONDITION_LABELS[condition as keyof typeof CONDITION_LABELS] ?? condition}
                <button onClick={() => setParam('condition', '')} className="text-[#5a4830] hover:text-[#9e8a6a]">
                  <X size={12} />
                </button>
              </div>
            )}
            {grading && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a1410] border border-[#2e2318] rounded-lg text-xs text-[#e0b878]">
                {grading} 그레이딩
                <button onClick={() => setParam('grading', '')} className="text-[#5a4830] hover:text-[#9e8a6a]">
                  <X size={12} />
                </button>
              </div>
            )}
            {hasGrading === 'true' && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a1410] border border-[#2e2318] rounded-lg text-xs text-[#e0b878]">
                <ShieldCheck size={11} /> 그레이딩 카드만
                <button onClick={() => setParam('hasGrading', '')} className="text-[#5a4830] hover:text-[#9e8a6a]">
                  <X size={12} />
                </button>
              </div>
            )}
          </div>

          {/* Expanded filter panel */}
          {showFilter && (
            <div className="bg-[#1a1410] border border-[#2e2318] rounded-2xl p-5 space-y-5">
              {/* TCG 종류 */}
              <div>
                <p className="text-[10px] text-[#5a4830] mb-3 uppercase tracking-[0.15em] font-semibold">TCG 종류</p>
                <div className="flex gap-1.5 flex-wrap">
                  <FilterPill active={!tcgType} onClick={() => setParam('tcgType', '')}>전체</FilterPill>
                  {TCG_TYPES.map(t => (
                    <FilterPill key={t} active={tcgType === t} onClick={() => setParam('tcgType', t)}>
                      {TCG_LABELS[t]}
                    </FilterPill>
                  ))}
                </div>
              </div>

              {/* 카드 컨디션 */}
              <div>
                <p className="text-[10px] text-[#5a4830] mb-3 uppercase tracking-[0.15em] font-semibold">카드 상태</p>
                <div className="flex gap-1.5 flex-wrap">
                  {CONDITIONS.map(c => (
                    <button
                      key={c.value}
                      onClick={() => toggleParam('condition', c.value, condition)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                        condition === c.value ? c.bg + ' ' + c.color : 'border-[#2e2318] text-[#7a6040] hover:border-[#4a3520]'
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 그레이딩 */}
              <div>
                <p className="text-[10px] text-[#5a4830] mb-3 uppercase tracking-[0.15em] font-semibold">그레이딩</p>
                <div className="flex gap-1.5 flex-wrap">
                  <button
                    onClick={() => toggleParam('hasGrading', 'true', hasGrading)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      hasGrading === 'true'
                        ? 'bg-[#2a1c08] text-[#e0b878] border-[#3d2a0c]'
                        : 'border-[#2e2318] text-[#7a6040] hover:border-[#4a3520]'
                    }`}
                  >
                    <ShieldCheck size={11} /> 그레이딩 카드만
                  </button>
                  {GRADING_COMPANIES.map(g => (
                    <FilterPill key={g} active={grading === g} onClick={() => toggleParam('grading', g, grading)}>
                      {g}
                    </FilterPill>
                  ))}
                </div>
              </div>

              {/* 가격 범위 */}
              <div>
                <p className="text-[10px] text-[#5a4830] mb-3 uppercase tracking-[0.15em] font-semibold">가격 범위</p>
                <div className="flex items-center gap-2">
                  <input type="number" value={minPriceInput} onChange={e => setMinPriceInput(e.target.value)}
                    placeholder="최소 (P)" className={inputCls} />
                  <span className="text-[#4a3520]">–</span>
                  <input type="number" value={maxPriceInput} onChange={e => setMaxPriceInput(e.target.value)}
                    placeholder="최대 (P)" className={inputCls} />
                  <button onClick={applyPriceFilter}
                    className="h-9 px-4 bg-[#d4a853] hover:bg-[#c49440] text-white rounded-lg text-xs font-semibold transition-colors">
                    적용
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Grid */}
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : data?.listings?.length === 0 ? (
            <div className="text-center py-28">
              <p className="text-5xl mb-4 opacity-20">🃏</p>
              <p className="text-[#5a4830] text-sm">조건에 맞는 카드가 없습니다.</p>
              {hasFilters && (
                <button onClick={clearAllFilters} className="mt-3 text-[#d4a853] hover:underline text-sm">
                  필터 초기화
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {data?.listings?.map((listing: Parameters<typeof ListingCard>[0]['listing']) => (
                  <ListingCard key={listing.id} listing={listing} />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex justify-center items-center gap-1 pt-4">
                  <button
                    onClick={() => { const p = new URLSearchParams(searchParams.toString()); p.set('page', String(page - 1)); router.push(`/listings?${p}`) }}
                    disabled={page === 1}
                    className="h-9 w-9 flex items-center justify-center rounded-lg bg-[#1a1410] border border-[#2e2318] text-[#7a6040] hover:border-[#4a3520] hover:text-[#e8d5b0] disabled:opacity-25 disabled:cursor-not-allowed transition-colors">
                    <ChevronLeft size={15} />
                  </button>

                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                    .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                      if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('...')
                      acc.push(p)
                      return acc
                    }, [])
                    .map((p, i) =>
                      p === '...' ? (
                        <span key={`e-${i}`} className="h-9 w-9 flex items-center justify-center text-[#4a3520] text-sm">…</span>
                      ) : (
                        <button key={p}
                          onClick={() => { const ps = new URLSearchParams(searchParams.toString()); ps.set('page', String(p)); router.push(`/listings?${ps}`) }}
                          className={`h-9 w-9 flex items-center justify-center rounded-lg text-sm font-medium transition-all ${
                            p === page
                              ? 'bg-[#2a1c08] text-[#e0b878] border border-[#3d2a0c] shadow-[0_0_10px_rgba(212,168,83,0.12)]'
                              : 'bg-[#1a1410] border border-[#2e2318] text-[#7a6040] hover:border-[#4a3520] hover:text-[#e8d5b0]'
                          }`}>
                          {p}
                        </button>
                      )
                    )}

                  <button
                    onClick={() => { const p = new URLSearchParams(searchParams.toString()); p.set('page', String(page + 1)); router.push(`/listings?${p}`) }}
                    disabled={page === totalPages}
                    className="h-9 w-9 flex items-center justify-center rounded-lg bg-[#1a1410] border border-[#2e2318] text-[#7a6040] hover:border-[#4a3520] hover:text-[#e8d5b0] disabled:opacity-25 disabled:cursor-not-allowed transition-colors">
                    <ChevronRight size={15} />
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

export default function ListingsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 rounded-full border-2 border-[#2e2318] border-t-[#d4a853] animate-spin" />
      </div>
    }>
      <ListingsContent />
    </Suspense>
  )
}

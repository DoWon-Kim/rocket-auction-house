'use client'

import { useQuery } from '@tanstack/react-query'
import { useSearchParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import ListingCard from '@/components/ListingCard'
import SellForm from '@/components/SellForm'
import { TCG_LABELS } from '@/lib/utils'
import { Suspense, useState } from 'react'
import { SlidersHorizontal, X, PlusCircle, LayoutGrid, ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuthStore } from '@/lib/store'

const TCG_TYPES = ['POKEMON', 'YUGIOH', 'MTG', 'DIGIMON', 'ONEPIECE', 'WEISS', 'OTHER']
const LISTING_TYPES = [
  { value: '', label: '전체' },
  { value: 'BUY_NOW', label: '즉시구매' },
  { value: 'AUCTION', label: '경매' },
  { value: 'OFFER', label: '가격제안' },
]
const SORT_OPTIONS = [
  { value: 'newest', label: '최신순' },
  { value: 'price_asc', label: '가격 낮은순' },
  { value: 'price_desc', label: '가격 높은순' },
]

const inputCls = 'w-32 bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] focus:border-[#d4a853]/40 rounded-lg px-3 py-2 text-sm text-[#f5ead8] focus:outline-none transition-colors'

function FilterPill({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-150 ${
        active
          ? 'bg-[#2a1c08] text-[#e0b878] border-[#3d2a0c]'
          : 'bg-transparent text-[#7a6040] border-[#2e2318] hover:border-[#4a3520] hover:text-[#9e8a6a]'
      }`}>
      {children}
    </button>
  )
}

function ListingsContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const user = useAuthStore(s => s.user)
  const [showFilter, setShowFilter] = useState(false)
  const [minPriceInput, setMinPriceInput] = useState(searchParams.get('minPrice') ?? '')
  const [maxPriceInput, setMaxPriceInput] = useState(searchParams.get('maxPrice') ?? '')

  const tab = searchParams.get('tab') ?? 'browse'
  const type = searchParams.get('type') ?? ''
  const tcgType = searchParams.get('tcgType') ?? ''
  const cardName = searchParams.get('cardName') ?? ''
  const sort = searchParams.get('sort') ?? 'newest'
  const minPrice = searchParams.get('minPrice') ?? ''
  const maxPrice = searchParams.get('maxPrice') ?? ''
  const page = Number(searchParams.get('page') ?? '1')

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

  const hasFilters = !!(type || tcgType || cardName || minPrice || maxPrice)

  const { data, isLoading } = useQuery({
    queryKey: ['listings', { type, tcgType, cardName, sort, minPrice, maxPrice, page }],
    queryFn: () =>
      api.get('/listings', {
        params: {
          type: type || undefined, tcgType: tcgType || undefined,
          cardName: cardName || undefined, sort: sort || undefined,
          minPrice: minPrice || undefined, maxPrice: maxPrice || undefined, page,
        },
      }).then(r => r.data),
    enabled: tab === 'browse',
    staleTime: 30000,
  })

  const totalPages = data ? Math.ceil(data.total / data.limit) : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start sm:items-center gap-4 flex-col sm:flex-row">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">마켓플레이스</h1>
          {tab === 'browse' && data && (
            <p className="text-xs text-[#5a4830] mt-0.5">총 {data.total.toLocaleString()}개 리스팅</p>
          )}
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 bg-[#1a1410] border border-[#2e2318] rounded-xl p-1">
          <button onClick={() => setTab('browse')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${
              tab === 'browse'
                ? 'bg-[#2a1c08] text-[#e0b878] shadow-[0_0_12px_rgba(212,168,83,0.15)]'
                : 'text-[#7a6040] hover:text-[#9e8a6a]'
            }`}>
            <LayoutGrid size={13} />
            둘러보기
          </button>
          {user && (
            <button onClick={() => setTab('sell')}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                tab === 'sell'
                  ? 'bg-[#2a1c08] text-[#e0b878] shadow-[0_0_12px_rgba(212,168,83,0.15)]'
                  : 'text-[#7a6040] hover:text-[#9e8a6a]'
              }`}>
              <PlusCircle size={13} />
              판매 등록
            </button>
          )}
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

            {cardName && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a1410] border border-[#2e2318] rounded-lg text-xs text-[#7a6040]">
                <span>&ldquo;{cardName}&rdquo;</span>
                <button onClick={() => setParam('cardName', '')} className="text-[#5a4830] hover:text-[#9e8a6a]">
                  <X size={12} />
                </button>
              </div>
            )}
          </div>

          {/* Expanded filter panel */}
          {showFilter && (
            <div className="bg-[#1a1410] border border-[#2e2318] rounded-2xl p-5 space-y-5">
              <div>
                <p className="text-[10px] text-[#5a4830] mb-3 uppercase tracking-[0.15em] font-semibold">거래 유형</p>
                <div className="flex gap-1.5 flex-wrap">
                  {LISTING_TYPES.map(t => (
                    <FilterPill key={t.value} active={type === t.value} onClick={() => setParam('type', t.value)}>
                      {t.label}
                    </FilterPill>
                  ))}
                </div>
              </div>

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
                <div key={i} className="bg-[#1a1410] border border-[#2e2318] rounded-2xl aspect-[3/4] animate-pulse" />
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

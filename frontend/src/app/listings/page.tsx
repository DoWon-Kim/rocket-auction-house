'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createPortal } from 'react-dom'
import { useRouter, useSearchParams } from 'next/navigation'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Search, X, SlidersHorizontal, Plus, BarChart2, Truck, Handshake, ShieldCheck, Tag, Gavel, Loader2, ChevronDown } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { TCG_LABELS, CONDITION_LABELS } from '@/lib/utils'
import { MarketItemCard } from '@/components/market/MarketItemCard'
import { RecentlyViewed } from '@/components/market/RecentlyViewed'
import type { MarketListing } from '@/lib/market'

const TCGS = ['POKEMON', 'ONEPIECE', 'YUGIOH', 'DIGIMON', 'MTG', 'WEISS', 'OTHER']
const TYPES = [['BUY_NOW', '즉시구매', Tag], ['OFFER', '가격제안', Handshake], ['AUCTION', '경매', Gavel]] as const
const SORTS = [['newest', '최신순'], ['price_asc', '낮은 가격순'], ['price_desc', '높은 가격순'], ['likes', '찜 많은순'], ['popular', '조회 많은순'], ['ending_soon', '마감 임박(경매)']] as const
const PRICE_PRESETS = [['', '10000', '1만 이하'], ['10000', '50000', '1~5만'], ['50000', '100000', '5~10만'], ['100000', '500000', '10~50만'], ['500000', '', '50만 이상']] as const
const CONDITIONS = ['MINT', 'NEAR_MINT', 'EXCELLENT', 'GOOD', 'LIGHT_PLAYED', 'PLAYED', 'POOR']
const PAGE = 30

interface Page { listings: MarketListing[]; total: number; page: number; limit: number; likedIds: string[] }
interface Summary { activeCount: number; activeAuctions: number; tx24h: { count: number; volume: number } }

function ListingsContent() {
  const params = useSearchParams()
  const router = useRouter()
  const user = useAuthStore(s => s.user)
  const get = (k: string) => params.get(k) ?? ''
  const [q, setQ] = useState(get('q'))
  const [sheet, setSheet] = useState(false)
  const sentinel = useRef<HTMLDivElement>(null)

  // 예전 판매 등록 주소 호환
  useEffect(() => { if (params.get('tab') === 'sell') router.replace(`/sell${params.get('cardId') ? `?cardId=${params.get('cardId')}` : ''}`) }, [params, router])

  const setParams = (next: Record<string, string>) => {
    const p = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(next)) { if (v) p.set(k, v); else p.delete(k) }
    router.replace(`/listings${p.size ? `?${p}` : ''}`, { scroll: false })
  }
  const toggle = (k: string, v: string) => setParams({ [k]: get(k) === v ? '' : v })

  const filters = {
    cardName: get('q'), tcgType: get('tcgType'), type: get('type'), sort: get('sort') || 'newest',
    shipping: get('shipping'), negotiable: get('negotiable'), hasGrading: get('hasGrading'),
    condition: get('condition'), minPrice: get('minPrice'), maxPrice: get('maxPrice'),
  }
  const activeCount = ['tcgType', 'type', 'shipping', 'negotiable', 'hasGrading', 'condition', 'minPrice', 'maxPrice', 'q'].filter(k => get(k)).length

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery<Page>({
    queryKey: ['listings', filters],
    queryFn: ({ pageParam }) => api.get('/listings', { params: { ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), page: pageParam, limit: PAGE } }).then(r => r.data),
    initialPageParam: 1,
    getNextPageParam: last => (last.page * last.limit < last.total ? last.page + 1 : undefined),
  })
  const listings = data?.pages.flatMap(p => p.listings) ?? []
  const liked = new Set(data?.pages.flatMap(p => p.likedIds ?? []))
  const total = data?.pages[0]?.total ?? 0
  const { data: summary } = useQuery<Summary>({ queryKey: ['market-summary'], queryFn: () => api.get('/listings/market-summary').then(r => r.data), staleTime: 60_000 })

  // 끝까지 내리면 자동으로 더 불러오기
  useEffect(() => {
    const el = sentinel.current
    if (!el || !hasNextPage) return
    const io = new IntersectionObserver(e => { if (e[0].isIntersecting && !isFetchingNextPage) fetchNextPage() }, { rootMargin: '600px' })
    io.observe(el)
    return () => io.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const chip = (on: boolean) => `shrink-0 h-9 px-3.5 rounded-full text-sm font-medium border inline-flex items-center gap-1.5 transition-colors ${on ? 'bg-fg text-bg border-fg' : 'border-line text-fg-2 hover:border-line-strong'}`

  return (
    <div className="space-y-4 pb-20 lg:pb-0">
      {/* 머리 · 검색 */}
      <div className="flex items-center gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-fg">마켓</h1>
          <p className="text-xs text-muted">{isLoading ? '불러오는 중…' : `판매중인 상품 ${total.toLocaleString()}개`}
            {summary && <span className="hidden sm:inline"> · 24시간 거래 {summary.tx24h.count}건 · 진행 중 경매 {summary.activeAuctions}개</span>}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/market" className="hidden sm:inline-flex h-10 px-3.5 rounded-full border border-line text-sm text-fg-2 items-center gap-1.5 hover:border-line-strong"><BarChart2 size={15} />시장 분석</Link>
          <Link href="/sell" className="hidden lg:inline-flex h-10 px-4 rounded-full bg-accent text-sm font-bold text-white items-center gap-1.5 hover:bg-accent-strong"><Plus size={16} />판매하기</Link>
        </div>
      </div>

      <form onSubmit={e => { e.preventDefault(); setParams({ q: q.trim() }) }} className="relative">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-subtle" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="어떤 카드를 찾고 있나요? (이름·번호·세트·상품 제목)" aria-label="마켓 검색"
          className="w-full h-12 pl-11 pr-10 rounded-2xl bg-surface border border-line text-[15px] text-fg placeholder:text-subtle focus:outline-none focus:border-accent/60" />
        {q && <button type="button" onClick={() => { setQ(''); setParams({ q: '' }) }} aria-label="검색어 지우기" className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full text-subtle hover:text-fg flex items-center justify-center"><X size={16} /></button>}
      </form>

      {/* TCG */}
      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button onClick={() => setParams({ tcgType: '' })} className={chip(!get('tcgType'))}>전체</button>
        {TCGS.map(t => <button key={t} onClick={() => toggle('tcgType', t)} className={chip(get('tcgType') === t)}>{TCG_LABELS[t]}</button>)}
      </div>

      {/* 빠른 필터 · 정렬 */}
      <div className="flex items-center gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button onClick={() => setSheet(true)} className={`${chip(activeCount > 0)} !gap-1`}><SlidersHorizontal size={14} />필터{activeCount > 0 && <span className="ml-0.5 w-5 h-5 rounded-full bg-accent text-white text-[11px] flex items-center justify-center">{activeCount}</span>}</button>
        {TYPES.map(([v, label, Icon]) => <button key={v} onClick={() => toggle('type', v)} className={chip(get('type') === v)}><Icon size={14} />{label}</button>)}
        <button onClick={() => toggle('shipping', 'free')} className={chip(get('shipping') === 'free')}><Truck size={14} />배송비 포함</button>
        <button onClick={() => toggle('negotiable', '1')} className={chip(get('negotiable') === '1')}><Handshake size={14} />제안 가능</button>
        <button onClick={() => toggle('hasGrading', 'true')} className={chip(get('hasGrading') === 'true')}><ShieldCheck size={14} />그레이딩</button>
        <label className="relative shrink-0 ml-auto">
          <select value={filters.sort} onChange={e => setParams({ sort: e.target.value === 'newest' ? '' : e.target.value })} aria-label="정렬"
            className="h-9 pl-3.5 pr-8 rounded-full border border-line bg-surface text-sm text-fg-2 appearance-none cursor-pointer focus:outline-none">
            {SORTS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
        </label>
      </div>

      {activeCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {get('q') && <span className="px-2.5 py-1 rounded-full bg-surface-2 text-fg-2">‘{get('q')}’</span>}
          {get('condition') && <span className="px-2.5 py-1 rounded-full bg-surface-2 text-fg-2">{CONDITION_LABELS[get('condition')]}</span>}
          {(get('minPrice') || get('maxPrice')) && <span className="px-2.5 py-1 rounded-full bg-surface-2 text-fg-2">{get('minPrice') ? `${Number(get('minPrice')).toLocaleString()}P` : ''} ~ {get('maxPrice') ? `${Number(get('maxPrice')).toLocaleString()}P` : ''}</span>}
          <button onClick={() => { setQ(''); router.replace('/listings', { scroll: false }) }} className="px-2.5 py-1 rounded-full text-muted hover:text-fg underline">모두 지우기</button>
        </div>
      )}

      {!activeCount && <RecentlyViewed />}

      {/* 상품 */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-6">
          {Array.from({ length: 10 }).map((_, i) => <div key={i} className="animate-pulse space-y-2"><div className="aspect-square rounded-2xl bg-surface" /><div className="h-3.5 w-3/4 rounded bg-surface" /><div className="h-4 w-1/2 rounded bg-surface" /></div>)}
        </div>
      ) : listings.length === 0 ? (
        <div className="text-center py-20 space-y-3">
          <p className="text-4xl opacity-30">🔍</p>
          <p className="text-fg-2 font-semibold">{activeCount ? '조건에 맞는 상품이 없어요' : '아직 등록된 상품이 없어요'}</p>
          <p className="text-sm text-muted">{activeCount ? '필터를 줄이거나 다른 이름으로 검색해보세요.' : '첫 번째 판매자가 되어보세요!'}</p>
          <div className="flex justify-center gap-2 pt-1">
            {activeCount > 0 && <button onClick={() => { setQ(''); router.replace('/listings') }} className="h-10 px-4 rounded-full border border-line text-sm text-fg-2">필터 초기화</button>}
            <Link href="/sell" className="h-10 px-4 rounded-full bg-accent text-sm font-bold text-white inline-flex items-center gap-1"><Plus size={15} />판매하기</Link>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-6">
            {listings.map(l => <MarketItemCard key={l.id} listing={l} liked={liked.has(l.id)} showLike={l.sellerId !== user?.id} />)}
          </div>
          <div ref={sentinel} className="flex justify-center py-6">
            {isFetchingNextPage ? <Loader2 className="animate-spin text-muted" /> : hasNextPage ? <button onClick={() => fetchNextPage()} className="h-10 px-5 rounded-full border border-line text-sm text-fg-2">더 보기</button> : <p className="text-xs text-subtle">마지막 상품이에요</p>}
          </div>
        </>
      )}

      {/* 모바일: 판매하기 */}
      <Link href="/sell" className="lg:hidden fixed bottom-5 right-5 z-40 h-14 pl-5 pr-6 rounded-full bg-gradient-to-r from-accent to-accent-strong text-white font-bold shadow-[0_10px_30px_-6px_rgba(139,92,246,0.7)] inline-flex items-center gap-1.5"><Plus size={20} />판매하기</Link>

      {sheet && <FilterSheet get={get} onClose={() => setSheet(false)} onApply={next => { setParams(next); setSheet(false) }} />}
    </div>
  )
}

// 상태·가격 필터 (모바일: 아래에서 올라오는 시트)
function FilterSheet({ get, onClose, onApply }: { get: (k: string) => string; onClose: () => void; onApply: (next: Record<string, string>) => void }) {
  const [condition, setCondition] = useState(get('condition'))
  const [minPrice, setMin] = useState(get('minPrice'))
  const [maxPrice, setMax] = useState(get('maxPrice'))
  const pill = (on: boolean) => `h-10 px-4 rounded-full text-sm border ${on ? 'bg-fg text-bg border-fg font-semibold' : 'border-line text-fg-2'}`
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-end sm:items-center justify-center" onClick={onClose} role="dialog" aria-modal="true" aria-label="필터">
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-line bg-bg p-5 space-y-5 max-h-[85dvh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center"><h2 className="text-lg font-bold text-fg">필터</h2><button onClick={onClose} aria-label="닫기" className="ml-auto text-muted hover:text-fg"><X size={20} /></button></div>
        <div className="space-y-2">
          <p className="text-sm font-semibold text-fg-2">카드 상태</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setCondition('')} className={pill(!condition)}>전체</button>
            {CONDITIONS.map(c => <button key={c} onClick={() => setCondition(condition === c ? '' : c)} className={pill(condition === c)}>{CONDITION_LABELS[c]}</button>)}
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-semibold text-fg-2">가격</p>
          <div className="flex flex-wrap gap-2">
            {PRICE_PRESETS.map(([a, b, label]) => <button key={label} onClick={() => { setMin(a); setMax(b) }} className={pill(minPrice === a && maxPrice === b)}>{label}</button>)}
          </div>
          <div className="flex items-center gap-2 pt-1">
            <input inputMode="numeric" value={minPrice} onChange={e => setMin(e.target.value.replace(/\D/g, ''))} placeholder="최소" aria-label="최소 가격" className="flex-1 min-w-0 h-11 rounded-xl bg-sunken border border-line px-3 text-sm text-fg" />
            <span className="text-muted">~</span>
            <input inputMode="numeric" value={maxPrice} onChange={e => setMax(e.target.value.replace(/\D/g, ''))} placeholder="최대" aria-label="최대 가격" className="flex-1 min-w-0 h-11 rounded-xl bg-sunken border border-line px-3 text-sm text-fg" />
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setCondition(''); setMin(''); setMax('') }} className="h-12 px-5 rounded-2xl border border-line text-sm text-fg-2">초기화</button>
          <button onClick={() => onApply({ condition, minPrice, maxPrice })} className="flex-1 h-12 rounded-2xl bg-accent text-white font-bold">적용하기</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default function ListingsPage() {
  return <Suspense fallback={<div className="h-96 rounded-3xl bg-surface animate-pulse" />}><ListingsContent /></Suspense>
}

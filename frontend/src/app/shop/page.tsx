'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Truck, ShieldCheck, Coins, Package, Flame, Sparkles, Timer } from 'lucide-react'
import { api } from '@/lib/api'
import { TCG_LABELS } from '@/lib/utils'
import { CATEGORY_ICON, CATEGORY_LABELS, P, type ShippingPolicy, type ShopItemCard } from '@/lib/shop'
import { ProductCard, PriceBlock } from '@/components/shop/ProductCard'
import { ShopTopBar } from '@/components/shop/ShopTopBar'
import { OripaGrid } from '@/components/shop/OripaGrid'

interface Home {
  featured: Array<ShopItemCard & { description: string | null; images: string[] }>
  newArrivals: ShopItemCard[]; best: ShopItemCard[]; lowStock: ShopItemCard[]
  categories: Array<{ category: string; count: number }>
  tcgTypes: Array<{ tcgType: string; count: number }>
  shipping: ShippingPolicy
}

const SORTS = [
  { value: 'new', label: '신상품순' }, { value: 'popular', label: '인기순' },
  { value: 'discount', label: '할인율순' }, { value: 'price_asc', label: '낮은 가격순' }, { value: 'price_desc', label: '높은 가격순' },
]

// ── 메인 배너 (추천 상품 캐러셀) ───────────────────────────────────────────────

function HeroCarousel({ items }: { items: Home['featured'] }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (items.length < 2) return
    const t = setInterval(() => setI(v => (v + 1) % items.length), 5000)
    return () => clearInterval(t)
  }, [items.length])
  if (!items.length) return null
  const it = items[i % items.length]
  return (
    <section className="relative overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-accent/25 via-surface to-sky-500/10">
      <div className="absolute -top-24 -left-20 w-80 h-80 rounded-full bg-accent/25 blur-3xl pointer-events-none" />
      <div className="relative grid md:grid-cols-[1.1fr_1fr] gap-6 p-6 sm:p-10 items-center min-h-[320px]">
        <div className="space-y-4 order-2 md:order-1">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent/20 text-accent-soft text-xs font-semibold"><Sparkles size={12} />추천 상품</span>
          <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-fg leading-tight line-clamp-2">{it.name}</h2>
          {it.description && <p className="text-sm text-muted line-clamp-2 max-w-lg">{it.description.split('\n')[0]}</p>}
          <PriceBlock price={it.price} originalPrice={it.originalPrice} discountRate={it.discountRate} size="lg" />
          <Link href={`/shop/${it.id}`} className="inline-flex h-12 px-7 items-center rounded-full bg-white text-bg text-sm font-bold hover:bg-fg-2">지금 구매하기</Link>
        </div>
        <div className="relative h-56 sm:h-72 order-1 md:order-2">
          {it.imageUrl && <Image src={it.imageUrl} alt={it.name} fill sizes="(max-width:768px) 100vw, 45vw" className="object-contain drop-shadow-[0_20px_40px_rgba(0,0,0,0.6)]" priority />}
        </div>
      </div>
      {items.length > 1 && (
        <>
          <button onClick={() => setI(v => (v - 1 + items.length) % items.length)} aria-label="이전 배너"
            className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-bg/60 border border-line flex items-center justify-center hover:bg-bg"><ChevronLeft size={16} /></button>
          <button onClick={() => setI(v => (v + 1) % items.length)} aria-label="다음 배너"
            className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-bg/60 border border-line flex items-center justify-center hover:bg-bg"><ChevronRight size={16} /></button>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
            {items.map((_, n) => <button key={n} onClick={() => setI(n)} aria-label={`${n + 1}번 배너`} className={`h-1.5 rounded-full transition-all ${n === i % items.length ? 'w-6 bg-white' : 'w-1.5 bg-white/40'}`} />)}
          </div>
        </>
      )}
    </section>
  )
}

function Section({ title, icon, items, more }: { title: string; icon: React.ReactNode; items: ShopItemCard[]; more?: () => void }) {
  if (!items.length) return null
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-xl font-bold text-fg">{icon}{title}</h2>
        {more && <button onClick={more} className="text-xs text-muted hover:text-fg">전체 보기 →</button>}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {items.slice(0, 5).map(i => <ProductCard key={i.id} item={i} />)}
      </div>
    </section>
  )
}

// ── 전체 상품 (필터·정렬·페이지) ───────────────────────────────────────────────

function AllProducts({ q, tcgType, category, sort, page, hideSoldOut, setParam }: {
  q: string; tcgType: string; category: string; sort: string; page: number; hideSoldOut: boolean
  setParam: (k: string, v: string) => void
}) {
  const { data, isLoading } = useQuery<{ items: ShopItemCard[]; total: number; limit: number }>({
    queryKey: ['shop-list', q, tcgType, category, sort, page, hideSoldOut],
    queryFn: () => api.get('/shop', { params: { q: q || undefined, tcgType: tcgType || undefined, category: category || undefined, sort, page, hideSoldOut: hideSoldOut || undefined } }).then(r => r.data),
    placeholderData: prev => prev,
  })
  const totalPages = data ? Math.ceil(data.total / data.limit) : 0
  const chip = (active: boolean) => `h-8 px-3 rounded-full text-xs border transition-colors ${active ? 'bg-accent text-white border-accent' : 'text-muted-2 border-line hover:border-line-strong hover:text-fg-3'}`
  return (
    <section id="all" className="space-y-4 scroll-mt-24">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-xl font-bold text-fg">{q ? <>&lsquo;{q}&rsquo; 검색 결과</> : '전체 상품'} <span className="text-sm font-normal text-subtle">{data?.total ?? 0}개</span></h2>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer">
            <input type="checkbox" checked={hideSoldOut} onChange={e => setParam('hideSoldOut', e.target.checked ? '1' : '')} />품절 제외
          </label>
          <select value={sort} onChange={e => setParam('sort', e.target.value)} aria-label="정렬"
            className="h-9 bg-surface border border-line rounded-lg px-3 text-xs text-fg focus:outline-none cursor-pointer">
            {SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => setParam('tcgType', '')} className={chip(!tcgType)}>전체 TCG</button>
        {['POKEMON', 'YUGIOH', 'ONEPIECE', 'DIGIMON', 'MTG', 'WEISS'].map(t => (
          <button key={t} onClick={() => setParam('tcgType', tcgType === t ? '' : t)} className={chip(tcgType === t)}>{TCG_LABELS[t]}</button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => setParam('category', '')} className={chip(!category)}>전체 종류</button>
        {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
          <button key={k} onClick={() => setParam('category', category === k ? '' : k)} className={chip(category === k)}>{v}</button>
        ))}
      </div>
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">{Array.from({ length: 10 }).map((_, i) => <div key={i} className="aspect-[3/4] rounded-2xl bg-surface animate-pulse" />)}</div>
      ) : !data?.items.length ? (
        <div className="py-20 text-center text-subtle"><Package size={36} className="mx-auto mb-2 opacity-40" />조건에 맞는 상품이 없습니다.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">{data.items.map(i => <ProductCard key={i.id} item={i} />)}</div>
      )}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm text-muted">
          <button disabled={page <= 1} onClick={() => setParam('page', String(page - 1))} aria-label="이전 페이지" className="w-9 h-9 rounded-lg border border-line inline-flex items-center justify-center disabled:opacity-30"><ChevronLeft size={16} /></button>
          <span className="tabular-nums">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setParam('page', String(page + 1))} aria-label="다음 페이지" className="w-9 h-9 rounded-lg border border-line inline-flex items-center justify-center disabled:opacity-30"><ChevronRight size={16} /></button>
        </div>
      )}
    </section>
  )
}

function ShopContent() {
  const router = useRouter()
  const params = useSearchParams()
  const tab = params.get('tab') === 'oripa' ? 'oripa' : 'mall'
  const q = params.get('q') ?? ''
  const tcgType = params.get('tcgType') ?? ''
  const category = params.get('category') ?? ''
  const sort = params.get('sort') ?? 'new'
  const page = Math.max(1, Number(params.get('page')) || 1)
  const hideSoldOut = params.get('hideSoldOut') === '1'
  const filtering = !!(q || tcgType || category || params.get('page'))

  const setParam = (k: string, v: string) => {
    const p = new URLSearchParams(params.toString())
    if (v) p.set(k, v); else p.delete(k)
    if (k !== 'page') p.delete('page')
    router.replace(`/shop?${p.toString()}#all`, { scroll: false })
  }

  const { data: home } = useQuery<Home>({ queryKey: ['shop-home'], queryFn: () => api.get('/shop/home').then(r => r.data), staleTime: 60_000 })
  const toAll = (k?: string, v?: string) => { if (k && v) setParam(k, v); document.getElementById('all')?.scrollIntoView({ behavior: 'smooth' }) }

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <ShopTopBar initialQ={q} />

      <div className="flex gap-1 rounded-xl bg-surface border border-line p-1 w-fit">
        <Link href="/shop" className={`h-9 px-4 inline-flex items-center rounded-lg text-sm ${tab === 'mall' ? 'bg-surface-2 text-fg font-semibold' : 'text-muted hover:text-fg'}`}>TCG 상품</Link>
        <Link href="/shop?tab=oripa" className={`h-9 px-4 inline-flex items-center rounded-lg text-sm ${tab === 'oripa' ? 'bg-gradient-to-r from-pink-600 to-purple-600 text-white font-semibold' : 'text-muted hover:text-fg'}`}>🎲 오리파 뽑기</Link>
      </div>

      {tab === 'oripa' ? <OripaGrid /> : (
        <>
          {!filtering && home && (
            <>
              <HeroCarousel items={home.featured} />

              {/* 혜택 안내 */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { icon: <Truck size={18} />, title: home.shipping.freeOver > 0 ? `${P(home.shipping.freeOver)} 이상 무료배송` : '배송비 안내', desc: `기본 배송비 ${P(home.shipping.fee)}` },
                  { icon: <ShieldCheck size={18} />, title: '100% 정품 미개봉', desc: '공식 유통 상품만 판매합니다' },
                  { icon: <Coins size={18} />, title: '포인트 간편 결제', desc: '충전한 포인트로 바로 결제' },
                ].map(b => (
                  <div key={b.title} className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
                    <span className="w-10 h-10 rounded-xl bg-accent/15 text-accent-fg flex items-center justify-center">{b.icon}</span>
                    <span><span className="block text-sm font-semibold text-fg">{b.title}</span><span className="block text-xs text-muted">{b.desc}</span></span>
                  </div>
                ))}
              </div>

              {/* 카테고리 */}
              <section className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => {
                  const n = home.categories.find(c => c.category === k)?.count ?? 0
                  return (
                    <button key={k} onClick={() => toAll('category', k)} className="flex flex-col items-center gap-1.5 rounded-2xl border border-line bg-surface py-4 hover:border-accent/40">
                      <span className="text-2xl">{CATEGORY_ICON[k]}</span>
                      <span className="text-xs font-semibold text-fg-2">{v}</span>
                      <span className="text-[10px] text-subtle">{n}개</span>
                    </button>
                  )
                })}
              </section>

              <Section title="베스트" icon={<Flame size={18} className="text-rose-400" />} items={home.best} more={() => toAll('sort', 'popular')} />
              <Section title="신상품" icon={<Sparkles size={18} className="text-sky-300" />} items={home.newArrivals} more={() => toAll('sort', 'new')} />
              <Section title="품절 임박" icon={<Timer size={18} className="text-orange-400" />} items={home.lowStock} />
            </>
          )}

          <AllProducts q={q} tcgType={tcgType} category={category} sort={sort} page={page} hideSoldOut={hideSoldOut} setParam={setParam} />
        </>
      )}
    </div>
  )
}

export default function ShopPage() {
  return (
    <Suspense fallback={<div className="max-w-7xl mx-auto h-72 rounded-3xl bg-surface animate-pulse" />}>
      <ShopContent />
    </Suspense>
  )
}

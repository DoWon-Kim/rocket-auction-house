'use client'

import { Suspense, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { BookOpen, Search } from 'lucide-react'
import { api } from '@/lib/api'
import { artworkUrl, POKE_TYPE_KO, TypePill } from '@/components/cards/KoreanDex'
import { DexTabs } from '@/components/cards/DexTabs'

interface Species { dexId: number; nameKo: string; nameJa: string | null; nameEn: string; genusKo: string | null; types: string[]; generation: number | null; cardCount: number }

const PAGE = 120

function PokedexContent() {
  const router = useRouter()
  const params = useSearchParams()
  const gen = params.get('gen') ?? ''
  const type = params.get('type') ?? ''
  const hasCards = params.get('hasCards') === '1'
  const [q, setQ] = useState('')
  const [shown, setShown] = useState(PAGE)

  const setParam = (k: string, v: string) => {
    const p = new URLSearchParams(params.toString())
    if (v) p.set(k, v); else p.delete(k)
    router.replace(`/pokedex?${p.toString()}`)
    setShown(PAGE)
  }

  const { data, isLoading } = useQuery<{ species: Species[]; total: number }>({
    queryKey: ['pokedex', gen, type, hasCards],
    queryFn: () => api.get('/pokedex', { params: { gen: gen || undefined, type: type || undefined, hasCards: hasCards ? '1' : undefined } }).then(r => r.data),
    staleTime: 10 * 60 * 1000,
  })

  // 이름(한·일·영)·번호 검색은 화면에서
  const list = useMemo(() => {
    const t = q.trim().toLowerCase().replace(/^(no\.?|#)\s*/, '')
    return (data?.species ?? []).filter(s => !t || String(s.dexId) === t.replace(/^0+/, '') || s.nameKo.includes(t) || (s.nameJa ?? '').includes(t) || s.nameEn.toLowerCase().includes(t))
  }, [data, q])

  const chip = (active: boolean) => `h-8 px-3 rounded-lg text-xs border transition-colors ${active ? 'bg-accent-tint text-accent-soft border-accent-line' : 'text-muted-2 border-line hover:border-line-strong hover:text-fg-3'}`

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-[26px] sm:text-3xl font-bold tracking-tight text-fg flex items-center gap-2">
            <BookOpen size={22} className="text-accent-fg" />포켓몬 도감
          </h1>
          <p className="text-xs text-subtle">전국도감 {data?.total.toLocaleString() ?? '-'}종 · 한국어 이름·분류·도감 설명과 포켓몬별 카드를 한곳에서.</p>
        </div>
        <DexTabs active="pokedex" />
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-subtle" />
        <input value={q} onChange={e => { setQ(e.target.value); setShown(PAGE) }} placeholder="한국어·일본어·영어 이름 또는 도감 번호 (예: 피카츄, ゲッコウガ, 658)"
          className="w-full h-12 bg-surface border border-line focus:border-accent/50 rounded-xl pl-11 pr-3 text-sm text-fg placeholder:text-subtle focus:outline-none" />
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setParam('gen', '')} className={chip(!gen)}>전체 세대</button>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(g => <button key={g} onClick={() => setParam('gen', gen === String(g) ? '' : String(g))} className={chip(gen === String(g))}>{g}세대</button>)}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setParam('type', '')} className={chip(!type)}>전체 타입</button>
          {Object.entries(POKE_TYPE_KO).map(([k, v]) => (
            <button key={k} onClick={() => setParam('type', type === k ? '' : k)} className={chip(type === k)}
              style={type === k ? { borderColor: v.color, color: v.color } : undefined}>{v.label}</button>
          ))}
          <button onClick={() => setParam('hasCards', hasCards ? '' : '1')} className={`${chip(hasCards)} ml-auto`}>카드 있는 포켓몬만</button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2.5">
          {Array.from({ length: 24 }).map((_, i) => <div key={i} className="aspect-[4/5] rounded-2xl bg-surface animate-pulse" />)}
        </div>
      ) : list.length === 0 ? (
        <p className="py-20 text-center text-sm text-muted">조건에 맞는 포켓몬이 없습니다.</p>
      ) : (
        <>
          <p className="text-xs text-subtle">{list.length.toLocaleString()}종</p>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2.5">
            {list.slice(0, shown).map(s => (
              <Link key={s.dexId} href={`/pokedex/${s.dexId}`}
                className="group rounded-2xl border border-line bg-surface p-2.5 hover:border-accent/40 hover:bg-surface-2/40 transition-colors">
                <div className="relative aspect-square">
                  {/* eslint-disable-next-line @next/next/no-img-element -- PokeAPI 공식 아트워크 */}
                  <img src={artworkUrl(s.dexId)} alt={s.nameKo} loading="lazy" className="w-full h-full object-contain group-hover:scale-105 transition-transform" />
                  {s.cardCount > 0 && <span className="absolute top-0 right-0 px-1.5 rounded-md bg-bg/80 text-[9px] font-semibold text-accent-fg">카드 {s.cardCount}</span>}
                </div>
                <p className="mt-1.5 text-[10px] font-mono text-subtle">No.{String(s.dexId).padStart(4, '0')}</p>
                <p className="text-sm font-semibold text-fg truncate">{s.nameKo}</p>
                <div className="mt-1 flex flex-wrap gap-1">{s.types.map(t => <TypePill key={t} type={t} />)}</div>
              </Link>
            ))}
          </div>
          {shown < list.length && (
            <div className="flex justify-center">
              <button onClick={() => setShown(v => v + PAGE)} className="h-10 px-5 rounded-xl border border-line text-sm text-fg-2 hover:bg-surface-2">
                더 보기 ({(list.length - shown).toLocaleString()}종 남음)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function PokedexPage() {
  return (
    <Suspense fallback={<div className="max-w-7xl mx-auto h-64 rounded-2xl bg-surface animate-pulse" />}>
      <PokedexContent />
    </Suspense>
  )
}

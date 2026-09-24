'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react'
import { api } from '@/lib/api'
import { rarityLabel, resolveImageSrc, TCG_LABELS } from '@/lib/utils'
import { LANG_SHORT, won, type CardLang } from '@/lib/cardDex'
import { artworkUrl, TypePill, type SpeciesInfo } from '@/components/cards/KoreanDex'
import { DexTabs } from '@/components/cards/DexTabs'

interface Entry {
  species: SpeciesInfo & { nameJa: string | null; nameEn: string; evolvesFromDexId: number | null }
  family: Array<{ dexId: number; nameKo: string; evolvesFromDexId: number | null; cardCount: number }>
  cards: Array<{
    id: string; name: string; nameKo: string | null; nameJa: string | null; tcgType: string; setName: string; setCode: string | null
    cardNumber: string | null; rarity: string; imageUrl: string | null; stage: string | null; regulationMark: string | null
    snkrdunkPrice: number | null; lang: CardLang; activeListings: number; createdAt: string
  }>
  cardTotal: number
}

export default function PokedexEntryPage() {
  const { dexId } = useParams<{ dexId: string }>()
  const id = Number(dexId)
  const [lang, setLang] = useState<CardLang | ''>('')
  const [sort, setSort] = useState<'price' | 'newest'>('price')

  const { data, isLoading, isError } = useQuery<Entry>({
    queryKey: ['pokedex-entry', id],
    queryFn: () => api.get(`/pokedex/${id}`).then(r => r.data),
    staleTime: 10 * 60 * 1000,
  })

  const cards = useMemo(() => {
    const list = (data?.cards ?? []).filter(c => !lang || c.lang === lang)
    return sort === 'newest' ? [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : list
  }, [data, lang, sort])
  const langCounts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const c of data?.cards ?? []) m[c.lang] = (m[c.lang] ?? 0) + 1
    return m
  }, [data])

  if (isLoading) return <div className="max-w-6xl mx-auto space-y-4">{[0, 1].map(i => <div key={i} className="h-56 rounded-3xl bg-surface animate-pulse" />)}</div>
  if (isError || !data) return <div className="max-w-6xl mx-auto py-24 text-center text-muted">도감에 없는 포켓몬입니다. <Link href="/pokedex" className="text-accent-fg hover:underline">도감으로</Link></div>

  const s = data.species
  // 진화 단계별로 묶기 (뿌리 → 다음 단계)
  const stages: Entry['family'][] = []
  let frontier = data.family.filter(f => !data.family.some(p => p.dexId === f.evolvesFromDexId))
  while (frontier.length && stages.length < 4) {
    stages.push(frontier)
    const ids = new Set(frontier.map(f => f.dexId))
    frontier = data.family.filter(f => f.evolvesFromDexId != null && ids.has(f.evolvesFromDexId))
  }
  const btn = (active: boolean) => `h-8 px-3 rounded-lg text-xs ${active ? 'bg-surface-2 text-fg font-semibold' : 'text-muted hover:text-fg'}`

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/pokedex" className="inline-flex items-center gap-1 h-8 pl-2 pr-3 rounded-full border border-line bg-surface/60 text-sm text-muted hover:text-fg">
          <ChevronLeft size={16} /> 포켓몬 도감
        </Link>
        <DexTabs active="pokedex" />
      </div>

      {/* 도감 정보 */}
      <section className="relative overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-surface-2 via-surface to-surface p-5 sm:p-8 flex flex-col md:flex-row gap-6 md:items-center">
        <div className="absolute -top-20 -right-16 w-72 h-72 rounded-full bg-accent/15 blur-3xl pointer-events-none" />
        {/* eslint-disable-next-line @next/next/no-img-element -- PokeAPI 공식 아트워크 */}
        <img src={artworkUrl(s.dexId)} alt={s.nameKo} className="relative w-48 h-48 sm:w-56 sm:h-56 object-contain mx-auto md:mx-0 drop-shadow-[0_10px_30px_rgba(0,0,0,0.6)]" />
        <div className="relative min-w-0 flex-1 space-y-3">
          <p className="font-mono text-sm text-subtle">No.{String(s.dexId).padStart(4, '0')}</p>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-fg">{s.nameKo}</h1>
          <p className="text-sm text-muted">{[s.nameJa, s.nameEn].filter(Boolean).join(' · ')}</p>
          <div className="flex flex-wrap items-center gap-2">
            {s.types.map(t => <TypePill key={t} type={t} />)}
            {s.genusKo && <span className="text-xs text-fg-3">{s.genusKo}</span>}
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {s.heightDm != null && <span className="px-2.5 py-1 rounded-lg bg-surface-2 text-fg-3">키 {(s.heightDm / 10).toFixed(1)}m</span>}
            {s.weightHg != null && <span className="px-2.5 py-1 rounded-lg bg-surface-2 text-fg-3">몸무게 {(s.weightHg / 10).toFixed(1)}kg</span>}
            {s.generation && <span className="px-2.5 py-1 rounded-lg bg-surface-2 text-fg-3">{s.generation}세대</span>}
            <span className="px-2.5 py-1 rounded-lg bg-accent-tint text-accent-soft">카드 {data.cardTotal.toLocaleString()}장</span>
          </div>
          {s.flavorKo && <p className="text-sm text-fg-2 leading-relaxed max-w-2xl">{s.flavorKo}</p>}
        </div>
        <div className="relative flex md:flex-col gap-2 justify-center">
          {id > 1 && <Link href={`/pokedex/${id - 1}`} aria-label="이전 번호" className="w-9 h-9 inline-flex items-center justify-center rounded-full border border-line hover:bg-surface-2"><ChevronLeft size={16} /></Link>}
          <Link href={`/pokedex/${id + 1}`} aria-label="다음 번호" className="w-9 h-9 inline-flex items-center justify-center rounded-full border border-line hover:bg-surface-2"><ChevronRight size={16} /></Link>
        </div>
      </section>

      {/* 진화 */}
      {data.family.length > 1 && (
        <section className="space-y-3">
          <h2 className="text-xl font-bold text-fg">진화</h2>
          <div className="rounded-2xl border border-line bg-surface p-4 overflow-x-auto">
            <div className="flex items-center gap-3 w-max">
              {stages.map((stage, i) => (
                <div key={i} className="flex items-center gap-3">
                  {i > 0 && <ArrowRight size={16} className="text-subtle" />}
                  <div className="flex flex-col gap-2">
                    {stage.map(f => (
                      <Link key={f.dexId} href={`/pokedex/${f.dexId}`}
                        className={`flex items-center gap-2 rounded-xl border px-2 py-1.5 transition-colors ${f.dexId === id ? 'border-accent bg-accent-tint' : 'border-line hover:border-accent/40'}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- PokeAPI 공식 아트워크 */}
                        <img src={artworkUrl(f.dexId)} alt="" className="w-12 h-12 object-contain" loading="lazy" />
                        <span>
                          <span className="block text-sm font-semibold text-fg">{f.nameKo}</span>
                          <span className="block text-[10px] text-subtle">카드 {f.cardCount}장</span>
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 카드 */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-bold text-fg">{s.nameKo} 카드 <span className="text-sm font-normal text-subtle">{data.cardTotal.toLocaleString()}장</span></h2>
          <div className="flex flex-wrap gap-2">
            <div className="flex gap-1 rounded-xl bg-surface border border-line p-1">
              <button onClick={() => setLang('')} className={btn(!lang)}>전체</button>
              {(['ja', 'ko', 'en'] as CardLang[]).filter(l => langCounts[l]).map(l => (
                <button key={l} onClick={() => setLang(l)} className={btn(lang === l)}>{LANG_SHORT[l]} {langCounts[l]}</button>
              ))}
            </div>
            <div className="flex gap-1 rounded-xl bg-surface border border-line p-1">
              <button onClick={() => setSort('price')} className={btn(sort === 'price')}>시세순</button>
              <button onClick={() => setSort('newest')} className={btn(sort === 'newest')}>최신순</button>
            </div>
          </div>
        </div>
        {cards.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted rounded-2xl border border-line bg-surface">등록된 카드가 없습니다.</p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2.5">
            {cards.map(c => (
              <Link key={c.id} href={`/cards/${c.id}`} className="group rounded-xl border border-line bg-surface overflow-hidden hover:border-accent/40">
                <div className="relative aspect-[3/4] bg-bg">
                  {c.imageUrl
                    ? <Image src={resolveImageSrc(c.imageUrl)!} alt={c.nameKo ?? c.name} fill sizes="(max-width: 640px) 33vw, 16vw" className="object-contain" />
                    : <span className="absolute inset-0 flex items-center justify-center px-2 text-center text-[10px] text-subtle">이미지 준비 중<br />{c.setCode} {c.cardNumber}</span>}
                  <span className="absolute top-1 left-1 px-1 rounded bg-bg/80 text-[9px] text-fg-3">{LANG_SHORT[c.lang]}</span>
                </div>
                <div className="p-1.5 space-y-0.5">
                  <p className="text-[11px] text-fg truncate">{c.nameKo ?? c.name}</p>
                  <p className="text-[9px] text-subtle truncate">{c.setCode ?? c.setName} · {rarityLabel(c.rarity)}</p>
                  {(c.snkrdunkPrice ?? 0) > 0 && <p className="text-[10px] font-semibold text-sky-300 tabular-nums">{won(c.snkrdunkPrice!)}</p>}
                  {c.tcgType !== 'POKEMON' && <p className="text-[9px] text-subtle">{TCG_LABELS[c.tcgType]}</p>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

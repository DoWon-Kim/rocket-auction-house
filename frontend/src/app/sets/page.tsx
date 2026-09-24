'use client'

import { Suspense, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Layers, Search, CalendarDays } from 'lucide-react'
import { api } from '@/lib/api'
import { TCG_LABELS } from '@/lib/utils'
import { LANG_LABEL, setHref, type CardLang } from '@/lib/cardDex'
import { SetBadge } from '@/components/sets/SetBadge'
import { DexTabs } from '@/components/cards/DexTabs'

interface SetItem {
  tcgType: string
  lang: CardLang
  code: string
  name: string
  cardCount: number
  pricedCount: number
  series: string | null
  releaseDate: string | null
  logoUrl: string | null
  symbolUrl: string | null
  officialCount: number | null
  totalCount: number | null
}

const TCG_TABS = ['POKEMON', 'YUGIOH', 'MTG', 'DIGIMON', 'ONEPIECE'] as const
const LANGS: Array<CardLang | ''> = ['', 'ja', 'ko', 'en']

function SetTile({ set }: { set: SetItem }) {
  const secret = set.totalCount && set.officialCount ? set.totalCount - set.officialCount : 0
  return (
    <Link href={setHref(set.tcgType, set.lang, set.code)}
      className="group flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 hover:border-accent/40 hover:bg-surface-2/40 transition-colors">
      <SetBadge set={set} />
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-1.5">
          {set.symbolUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- 세트 심볼
            <img src={set.symbolUrl} alt="" className="h-4 w-4 object-contain" loading="lazy" />
          )}
          <p className="text-sm font-semibold text-fg truncate group-hover:text-white">{set.name}</p>
        </div>
        <p className="text-[11px] text-subtle truncate">
          {set.code} · {LANG_LABEL[set.lang]}
          {set.releaseDate && <> · {new Date(set.releaseDate).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short' })}</>}
        </p>
        <div className="flex flex-wrap gap-1.5 pt-1 text-[10px]">
          <span className="px-1.5 py-0.5 rounded-md bg-surface-2 text-fg-3">카드 {set.cardCount.toLocaleString()}장</span>
          {set.officialCount != null && set.officialCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-md bg-surface-2 text-muted">공식 {set.officialCount}{secret > 0 ? ` + 시크릿 ${secret}` : ''}</span>
          )}
          {set.pricedCount > 0 && <span className="px-1.5 py-0.5 rounded-md bg-sky-500/10 text-sky-300">시세 {set.pricedCount}장</span>}
        </div>
      </div>
    </Link>
  )
}

function SetsContent() {
  const router = useRouter()
  const params = useSearchParams()
  const tcgType = params.get('tcgType') ?? 'POKEMON'
  const lang = (params.get('lang') ?? '') as CardLang | ''
  const [q, setQ] = useState('')

  const setParam = (k: string, v: string) => {
    const p = new URLSearchParams(params.toString())
    if (v) p.set(k, v); else p.delete(k)
    router.replace(`/sets?${p.toString()}`)
  }

  const { data, isLoading } = useQuery<{ sets: SetItem[]; langCounts: Record<string, number> }>({
    queryKey: ['sets', tcgType, lang],
    queryFn: () => api.get('/sets', { params: { tcgType, lang: lang || undefined } }).then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })

  // 검색은 클라이언트에서, 시리즈별로 묶기 (발매일 최신순 유지)
  const groups = useMemo(() => {
    const term = q.trim().toLowerCase()
    const list = (data?.sets ?? []).filter(s => !term || s.name.toLowerCase().includes(term) || s.code.toLowerCase().includes(term))
    const map = new Map<string, SetItem[]>()
    for (const s of list) {
      const key = s.series ?? '기타'
      map.set(key, [...(map.get(key) ?? []), s])
    }
    return [...map]
  }, [data, q])

  const totalLangs = Object.values(data?.langCounts ?? {}).reduce((a, b) => a + b, 0)

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-[26px] sm:text-3xl font-bold tracking-tight text-fg flex items-center gap-2">
            <Layers size={22} className="text-accent-fg" />세트 도감
          </h1>
          <p className="text-xs text-subtle">확장팩별 카드 구성·발매일·시세를 한눈에 보고, 수집 진행률을 확인하세요.</p>
        </div>
        <DexTabs active="sets" />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TCG_TABS.map(t => (
          <button key={t} onClick={() => setParam('tcgType', t)}
            className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${tcgType === t ? 'bg-accent-tint text-accent-soft border-accent-line' : 'text-muted-2 border-line hover:border-line-strong hover:text-fg-3'}`}>
            {TCG_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-xl bg-surface border border-line p-1">
          {LANGS.map(l => {
            const count = l ? data?.langCounts[l] ?? 0 : totalLangs
            if (l && !count) return null
            return (
              <button key={l || 'all'} onClick={() => setParam('lang', l)}
                className={`h-8 px-3 rounded-lg text-xs transition-colors ${lang === l ? 'bg-surface-2 text-fg font-semibold' : 'text-muted hover:text-fg'}`}>
                {l ? LANG_LABEL[l] : '전체'} <span className="text-subtle tabular-nums">{count}</span>
              </button>
            )
          })}
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="세트 이름·코드 검색"
            className="w-full h-10 bg-surface border border-line focus:border-accent/50 rounded-xl pl-9 pr-3 text-sm text-fg placeholder:text-subtle focus:outline-none" />
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {Array.from({ length: 10 }).map((_, i) => <div key={i} className="h-44 rounded-2xl bg-surface border border-line animate-pulse" />)}
        </div>
      ) : groups.length === 0 ? (
        <p className="py-20 text-center text-sm text-muted">조건에 맞는 세트가 없습니다.</p>
      ) : (
        groups.map(([series, sets]) => (
          <section key={series} className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-fg-2">
              <CalendarDays size={14} className="text-accent-fg" />{series}
              <span className="text-xs font-normal text-subtle">{sets.length}개 세트</span>
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {sets.map(s => <SetTile key={`${s.lang}-${s.code}`} set={s} />)}
            </div>
          </section>
        ))
      )}
    </div>
  )
}

export default function SetsPage() {
  return (
    <Suspense fallback={<div className="max-w-7xl mx-auto h-64 rounded-2xl bg-surface animate-pulse" />}>
      <SetsContent />
    </Suspense>
  )
}


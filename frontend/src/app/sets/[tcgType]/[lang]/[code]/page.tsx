'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, CheckCircle2, CalendarDays, Coins, Store, Trophy } from 'lucide-react'
import { api } from '@/lib/api'
import { rarityLabel, resolveImageSrc, TCG_LABELS } from '@/lib/utils'
import { LANG_LABEL, won, fmtDate, stageLabel, type CardLang } from '@/lib/cardDex'
import { useCollection } from '@/hooks/useCollection'
import { SetBadge } from '@/components/sets/SetBadge'
import { useKoreanView } from '@/hooks/useKoreanView'
import { KoViewToggle } from '@/components/cards/KoreanDex'

interface SetCard {
  id: string
  name: string
  nameKo: string | null
  nameJa: string | null
  cardNumber: string | null
  rarity: string
  imageUrl: string | null
  supertype: string | null
  stage: string | null
  hp: number | null
  artist: string | null
  snkrdunkPrice: number | null
  minPrice: number | null
  activeListings: number
}

interface SetDetail {
  set: {
    tcgType: string; lang: CardLang; code: string; name: string; series: string | null; releaseDate: string | null
    logoUrl: string | null; symbolUrl: string | null; officialCount: number | null; totalCount: number | null; cardCount: number
  }
  rarities: Array<{ name: string; count: number }>
  market: { pricedCount: number; totalValue: number; activeListings: number; top: Array<{ id: string; name: string; cardNumber: string | null; rarity: string; imageUrl: string | null; price: number }> }
  cards: SetCard[]
}

type OwnedFilter = 'all' | 'owned' | 'missing'

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="flex items-center gap-1.5 text-[11px] text-muted">{icon}{label}</p>
      <p className="mt-1.5 text-lg font-bold text-fg tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-subtle mt-0.5">{sub}</p>}
    </div>
  )
}

export default function SetDetailPage() {
  const params = useParams<{ tcgType: string; lang: string; code: string }>()
  const code = decodeURIComponent(params.code)
  const { isCollected, toggle } = useCollection()
  const koView = useKoreanView()
  const [rarity, setRarity] = useState('')
  const [owned, setOwned] = useState<OwnedFilter>('all')
  const [sort, setSort] = useState<'number' | 'price'>('number')

  const { data, isLoading, isError } = useQuery<SetDetail>({
    queryKey: ['set', params.tcgType, params.lang, code],
    queryFn: () => api.get(`/sets/${params.tcgType}/${params.lang}/${encodeURIComponent(code)}`).then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })

  const ownedCount = data?.cards.filter(c => isCollected(c.id)).length ?? 0
  const cards = useMemo(() => {
    const list = (data?.cards ?? []).filter(c =>
      (!rarity || c.rarity === rarity) &&
      (owned === 'all' || (owned === 'owned') === isCollected(c.id)))
    return sort === 'price' ? [...list].sort((a, b) => (b.snkrdunkPrice ?? -1) - (a.snkrdunkPrice ?? -1)) : list
  }, [data, rarity, owned, sort, isCollected])

  if (isLoading) return <div className="max-w-7xl mx-auto space-y-4">{[0, 1, 2].map(i => <div key={i} className="h-40 rounded-2xl bg-surface animate-pulse" />)}</div>
  if (isError || !data) {
    return (
      <div className="max-w-7xl mx-auto py-24 text-center space-y-3">
        <p className="text-muted">세트를 찾을 수 없습니다.</p>
        <Link href="/sets" className="text-sm text-accent-fg hover:underline">세트 도감으로</Link>
      </div>
    )
  }

  const { set, market, rarities } = data
  const pct = set.cardCount ? Math.round((ownedCount / set.cardCount) * 1000) / 10 : 0
  const secret = set.totalCount && set.officialCount ? set.totalCount - set.officialCount : 0
  const filterBtn = (active: boolean) => `h-8 px-3 rounded-lg text-xs border transition-colors ${active ? 'bg-accent-tint text-accent-soft border-accent-line' : 'text-muted-2 border-line hover:border-line-strong hover:text-fg-3'}`

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <nav className="flex items-center gap-1 text-xs text-muted">
        <Link href="/cards" className="hover:text-fg">카드 도감</Link><ChevronRight size={12} />
        <Link href={`/sets?tcgType=${set.tcgType}`} className="hover:text-fg">세트 도감</Link><ChevronRight size={12} />
        <span className="text-fg-2 truncate">{set.name}</span>
      </nav>

      {/* 헤더 */}
      <section className="rounded-3xl border border-line bg-surface/70 p-5 sm:p-6 flex flex-col sm:flex-row gap-5 sm:items-center">
        <div className="sm:w-48 shrink-0"><SetBadge set={set} size="lg" /></div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="px-2 py-0.5 rounded-md bg-surface-2 text-fg-3">{TCG_LABELS[set.tcgType] ?? set.tcgType}</span>
            <span className="px-2 py-0.5 rounded-md bg-surface-2 text-fg-3">{LANG_LABEL[set.lang]}</span>
            <span className="px-2 py-0.5 rounded-md bg-surface-2 text-fg-3 font-mono">{set.code}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-fg">{set.name}</h1>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            {set.series && <span>{set.series}</span>}
            {set.releaseDate && <span className="inline-flex items-center gap-1"><CalendarDays size={13} />{fmtDate(set.releaseDate)} 발매</span>}
            {set.officialCount != null && set.officialCount > 0 && <span>공식 {set.officialCount}장{secret > 0 && ` + 시크릿 ${secret}장`}</span>}
          </p>
        </div>
      </section>

      {/* 요약 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat icon={<CheckCircle2 size={12} />} label="내 수집" value={`${ownedCount} / ${set.cardCount}`}
          sub={<span className="block mt-1.5 h-1.5 rounded-full bg-surface-2 overflow-hidden"><span className="block h-full bg-gradient-to-r from-accent to-emerald-400" style={{ width: `${pct}%` }} /></span>} />
        <Stat icon={<Coins size={12} />} label="세트 시세 합계" value={market.totalValue ? won(market.totalValue) : '-'} sub={`시세 있는 카드 ${market.pricedCount}장 · 스니덩 최저 호가 기준`} />
        <Stat icon={<Store size={12} />} label="판매 중 매물" value={`${market.activeListings.toLocaleString()}건`} sub="이 세트 카드의 거래소 매물" />
        <Stat icon={<Trophy size={12} />} label="최고 시세" value={market.top[0] ? won(market.top[0].price) : '-'} sub={market.top[0]?.name} />
      </div>

      {/* 최고 시세 카드 */}
      {market.top.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-fg-2">시세 TOP {market.top.length}</h2>
          <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
            {market.top.map((c, i) => (
              <Link key={c.id} href={`/cards/${c.id}`} className="shrink-0 w-32 group">
                <div className="relative aspect-[3/4] rounded-xl overflow-hidden border border-line bg-bg group-hover:border-accent/40">
                  {c.imageUrl && <Image src={resolveImageSrc(c.imageUrl)!} alt={c.name} fill sizes="128px" className="object-contain" />}
                  <span className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-bg/80 text-[10px] font-bold text-fg flex items-center justify-center">{i + 1}</span>
                </div>
                <p className="mt-1.5 text-xs text-fg truncate">{c.name}</p>
                <p className="text-[11px] text-sky-300 font-semibold tabular-nums">{won(c.price)}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 레어도 구성 + 필터 */}
      <section className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setRarity('')} className={filterBtn(!rarity)}>전체 {set.cardCount}</button>
          {rarities.map(r => (
            <button key={r.name} onClick={() => setRarity(rarity === r.name ? '' : r.name)} className={filterBtn(rarity === r.name)}>
              {rarityLabel(r.name)} <span className="text-subtle">{r.count}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-xl bg-surface border border-line p-1">
            {([['all', '전체'], ['owned', '보유'], ['missing', '미보유']] as const).map(([v, l]) => (
              <button key={v} onClick={() => setOwned(v)} className={`h-7 px-3 rounded-lg text-xs ${owned === v ? 'bg-surface-2 text-fg font-semibold' : 'text-muted hover:text-fg'}`}>{l}</button>
            ))}
          </div>
          <div className="flex gap-1 rounded-xl bg-surface border border-line p-1">
            {([['number', '번호순'], ['price', '시세순']] as const).map(([v, l]) => (
              <button key={v} onClick={() => setSort(v)} className={`h-7 px-3 rounded-lg text-xs ${sort === v ? 'bg-surface-2 text-fg font-semibold' : 'text-muted hover:text-fg'}`}>{l}</button>
            ))}
          </div>
          <span className="text-xs text-subtle">{cards.length}장 · 카드의 ✓ 를 눌러 보유 표시</span>
          {set.lang !== 'ko' && <span className="ml-auto"><KoViewToggle /></span>}
        </div>
      </section>

      {/* 카드 목록 */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2.5">
        {cards.map(c => {
          const mine = isCollected(c.id)
          const original = set.lang === 'ja' ? (c.nameJa ?? c.name) : c.name
          const name = koView.on ? c.nameKo ?? original : original
          return (
            <div key={c.id} className="group relative">
              <Link href={`/cards/${c.id}`} className={`block rounded-xl border bg-surface overflow-hidden transition-colors ${mine ? 'border-emerald-400/40' : 'border-line hover:border-accent/40'}`}>
                <div className={`relative aspect-[3/4] bg-bg ${!mine && owned !== 'all' ? '' : ''}`}>
                  {c.imageUrl
                    ? <Image src={resolveImageSrc(c.imageUrl)!} alt={name} fill sizes="(max-width: 640px) 33vw, 12vw" className="object-contain" />
                    : <div className="absolute inset-0 flex items-center justify-center text-subtle text-xs">{c.cardNumber}</div>}
                  <span className="absolute bottom-1 left-1 px-1 rounded bg-bg/80 text-[9px] font-mono text-fg-3">{c.cardNumber}</span>
                </div>
                <div className="p-1.5 space-y-0.5">
                  <p className="text-[11px] text-fg truncate">{name}</p>
                  <p className="text-[9px] text-subtle truncate">{rarityLabel(c.rarity)}{c.stage ? ` · ${stageLabel(c.stage)}` : ''}</p>
                  <p className="text-[10px] font-semibold tabular-nums truncate">
                    {c.minPrice != null
                      ? <span className="text-accent-fg">최저 {c.minPrice.toLocaleString()}P</span>
                      : (c.snkrdunkPrice ?? 0) > 0 ? <span className="text-sky-300">시세 {won(c.snkrdunkPrice!)}</span> : <span className="text-subtle">-</span>}
                  </p>
                </div>
              </Link>
              <button onClick={() => toggle(c.id)} title={mine ? '보유 해제' : '보유 표시'} aria-pressed={mine}
                className={`absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center transition-all ${mine ? 'bg-emerald-500 text-white' : 'bg-bg/70 border border-line text-subtle sm:opacity-0 group-hover:opacity-100'}`}>
                <CheckCircle2 size={14} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

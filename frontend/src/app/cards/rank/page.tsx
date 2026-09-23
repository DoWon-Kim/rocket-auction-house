'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Image from 'next/image'
import Link from 'next/link'
import { api } from '@/lib/api'
import { TCG_LABELS, rarityLabel, resolveImageSrc } from '@/lib/utils'
import { TrendingUp, Tag, Crown, Zap, ChevronRight } from 'lucide-react'

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface RankCard {
  id: string
  name: string
  nameKo: string | null
  nameJa: string | null
  tcgType: string
  setName: string
  rarity: string
  imageUrl: string | null
  cardTypes: string | null
  supertype: string | null
  hp: number | null
}

interface RankItem {
  rank: number
  price?: number
  listingCount?: number
  card: RankCard
}

interface RankResponse {
  mode: string
  rank: RankItem[]
}

// ─── 상수 ─────────────────────────────────────────────────────────────────────

const TCG_TYPES = ['POKEMON', 'YUGIOH', 'MTG', 'DIGIMON', 'ONEPIECE'] as const
const TCG_ICONS: Record<string, string> = {
  POKEMON: '🎴', YUGIOH: '⚡', MTG: '🪄', DIGIMON: '💻', ONEPIECE: '⚓',
}

const ENERGY_TYPE_INFO: Record<string, { color: string; bg: string; icon: string }> = {
  Grass:     { color: '#4CAF50', bg: '#1a2e1a', icon: '🌿' },
  Fire:      { color: '#FF5722', bg: '#2e1a12', icon: '🔥' },
  Water:     { color: '#2196F3', bg: '#121a2e', icon: '💧' },
  Lightning: { color: '#FFC107', bg: '#2e2a12', icon: '⚡' },
  Psychic:   { color: '#E91E63', bg: '#2e1222', icon: '🔮' },
  Fighting:  { color: '#FF9800', bg: '#2e1e12', icon: '🥊' },
  Darkness:  { color: '#9C27B0', bg: '#1e1228', icon: '🌑' },
  Metal:     { color: '#9E9E9E', bg: '#1e1e1e', icon: '⚙️' },
  Dragon:    { color: '#6A1B9A', bg: '#1a1228', icon: '🐉' },
  Fairy:     { color: '#F48FB1', bg: '#2e1222', icon: '✨' },
  Colorless: { color: '#B0BEC5', bg: '#1e1e1e', icon: '⭐' },
}

function rarityColorClass(rarity: string): string {
  const r = rarity.toLowerCase()
  if (r.includes('hyper') || r.includes('starlight') || r.includes('quarter century'))
    return 'text-red-400'
  if (r.includes('special illustration') || r.includes('gold rare'))
    return 'text-amber-300'
  if (r.includes('secret') || r === 'sec')
    return 'text-yellow-300'
  if (r.includes('ultra') || r === 'sr' || r.includes('super rare'))
    return 'text-orange-400'
  if (r.includes('illustration') || r.includes('amazing'))
    return 'text-pink-400'
  if (r === 'double rare' || r === 'mythic')
    return 'text-purple-400'
  if (r === 'rare' || r === 'r' || r.includes('holo'))
    return 'text-blue-400'
  return 'text-muted-2'
}

function RankMedal({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-2xl">🥇</span>
  if (rank === 2) return <span className="text-2xl">🥈</span>
  if (rank === 3) return <span className="text-2xl">🥉</span>
  return (
    <span className="w-8 h-8 flex items-center justify-center text-sm font-bold text-subtle bg-surface-2 rounded-full border border-line">
      {rank}
    </span>
  )
}

// ─── 랭킹 카드 아이템 ─────────────────────────────────────────────────────────

function RankRow({ item, mode }: { item: RankItem; mode: string }) {
  const displayName = item.card.nameKo ?? item.card.name
  const rColor = rarityColorClass(item.card.rarity)

  return (
    <Link
      href={`/cards/${item.card.id}`}
      className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2 transition-colors border-b border-surface-2 last:border-b-0 group"
    >
      {/* 순위 */}
      <div className="w-10 flex items-center justify-center shrink-0">
        <RankMedal rank={item.rank} />
      </div>

      {/* 카드 이미지 */}
      <div className="relative w-10 h-14 shrink-0 rounded overflow-hidden bg-bg">
        {item.card.imageUrl ? (
          <Image
            src={resolveImageSrc(item.card.imageUrl)!}
            alt={displayName}
            fill
            className="object-contain"
            sizes="40px"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-sm">
            {TCG_ICONS[item.card.tcgType] ?? '🃏'}
          </div>
        )}
      </div>

      {/* 카드 정보 */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-fg truncate group-hover:text-white transition-colors">
          {displayName}
        </p>
        {item.card.nameKo && item.card.name !== item.card.nameKo && (
          <p className="text-[11px] text-subtle truncate">{item.card.name}</p>
        )}
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-[10px] bg-surface-2 border border-line px-1.5 py-0.5 rounded text-muted-2">
            {TCG_LABELS[item.card.tcgType] ?? item.card.tcgType}
          </span>
          <span className={`text-[10px] font-semibold ${rColor}`}>
            {rarityLabel(item.card.rarity)}
          </span>
          {item.card.cardTypes && item.card.cardTypes.split(',').map(t => {
            const info = ENERGY_TYPE_INFO[t.trim()]
            return info ? (
              <span key={t} className="text-[9px] px-1 py-0.5 rounded font-semibold"
                style={{ backgroundColor: info.bg, color: info.color }}>
                {info.icon}
              </span>
            ) : null
          })}
          {item.card.hp && (
            <span className="text-[10px] font-bold text-red-400">HP {item.card.hp}</span>
          )}
        </div>
        <p className="text-[10px] text-subtle truncate mt-0.5">{item.card.setName}</p>
      </div>

      {/* 가격 / 거래량 */}
      <div className="text-right shrink-0">
        {mode === 'price' && item.price != null && (
          <p className="text-base font-bold text-accent-2">{item.price.toLocaleString()}<span className="text-xs ml-0.5">P</span></p>
        )}
        {mode === 'listings' && item.listingCount != null && (
          <>
            <p className="text-base font-bold text-accent-soft">{item.listingCount}</p>
            <p className="text-[10px] text-subtle">리스팅</p>
          </>
        )}
      </div>

      <ChevronRight size={14} className="text-subtle group-hover:text-muted-2 transition-colors shrink-0" />
    </Link>
  )
}

// ─── 메인 페이지 ─────────────────────────────────────────────────────────────

export default function CardRankPage() {
  const [mode, setMode] = useState<'listings' | 'price'>('listings')
  const [tcgType, setTcgType] = useState('')

  const { data, isLoading } = useQuery<RankResponse>({
    queryKey: ['card-rank', mode, tcgType],
    queryFn: () => api.get('/cards/rank', {
      params: {
        mode,
        tcgType: tcgType || undefined,
        limit: 30,
      }
    }).then(r => r.data),
    staleTime: 60_000,
  })

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* 헤더 */}
      <div className="space-y-1">
        <h1 className="text-[26px] sm:text-3xl font-bold tracking-tight text-fg flex items-center gap-2">
          <Crown size={22} className="text-accent-fg" />
          카드 랭킹
        </h1>
        <p className="text-xs text-subtle">실시간 거래량 및 시세 기준 인기 카드</p>
      </div>

      {/* 모드 선택 */}
      <div className="flex gap-2">
        <button
          onClick={() => setMode('listings')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
            mode === 'listings'
              ? 'bg-accent-tint text-accent-soft border-accent-line'
              : 'text-muted-2 border-line hover:border-line-strong hover:text-fg-3'
          }`}
        >
          <Tag size={14} /> 거래량 랭킹
        </button>
        <button
          onClick={() => setMode('price')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
            mode === 'price'
              ? 'bg-accent-tint text-accent-soft border-accent-line'
              : 'text-muted-2 border-line hover:border-line-strong hover:text-fg-3'
          }`}
        >
          <TrendingUp size={14} /> 시세 랭킹
        </button>
      </div>

      {/* TCG 필터 */}
      <div className="flex gap-1.5 flex-wrap">
        <button
          onClick={() => setTcgType('')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all border ${
            !tcgType
              ? 'bg-accent-tint text-accent-soft border-accent-line'
              : 'bg-transparent text-muted-2 border-line hover:border-line-strong'
          }`}
        >
          전체
        </button>
        {TCG_TYPES.map(t => (
          <button
            key={t}
            onClick={() => setTcgType(t === tcgType ? '' : t)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all border ${
              tcgType === t
                ? 'bg-accent-tint text-accent-soft border-accent-line'
                : 'bg-transparent text-muted-2 border-line hover:border-line-strong'
            }`}
          >
            {TCG_ICONS[t]} {TCG_LABELS[t]}
          </button>
        ))}
      </div>

      {/* 랭킹 목록 */}
      <div className="bg-surface border border-line rounded-xl overflow-hidden">
        {/* 상단 설명 바 */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-line bg-sunken">
          <div className="flex items-center gap-2">
            {mode === 'listings'
              ? <><Tag size={12} className="text-accent-fg" /><span className="text-xs text-muted-2">활성 리스팅 수 기준</span></>
              : <><Zap size={12} className="text-accent-fg" /><span className="text-xs text-muted-2">즉시구매 최고가 기준</span></>
            }
          </div>
          <span className="text-[11px] text-subtle">TOP {data?.rank.length ?? '—'}</span>
        </div>

        {isLoading ? (
          <div className="divide-y divide-surface-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
                <div className="w-10 h-8 bg-surface-2 rounded" />
                <div className="w-10 h-14 bg-surface-2 rounded" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-surface-2 rounded w-2/3" />
                  <div className="h-3 bg-surface-2 rounded w-1/3" />
                </div>
                <div className="w-16 h-6 bg-surface-2 rounded" />
              </div>
            ))}
          </div>
        ) : !data?.rank.length ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <Crown size={36} className="text-line" />
            <p className="text-subtle text-sm">아직 거래 데이터가 없습니다.</p>
            <Link href="/listings" className="text-sm text-accent-fg hover:text-[#8a5ef2]">
              리스팅 보러 가기 →
            </Link>
          </div>
        ) : (
          <div>
            {data.rank.map(item => (
              <RankRow key={item.card.id} item={item} mode={mode} />
            ))}
          </div>
        )}
      </div>

      {/* 도감 링크 */}
      <div className="text-center">
        <Link
          href="/cards"
          className="inline-flex items-center gap-2 text-sm text-muted-2 hover:text-accent-soft transition-colors"
        >
          ← 카드 도감으로 돌아가기
        </Link>
      </div>
    </div>
  )
}

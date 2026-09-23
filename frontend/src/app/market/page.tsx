'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Image from 'next/image'
import Link from 'next/link'
import { api } from '@/lib/api'
import { TCG_LABELS, rarityLabel, resolveImageSrc } from '@/lib/utils'
import {
  BarChart2, TrendingUp, TrendingDown, Zap, Clock,
  ShieldCheck, Tag, Gavel, Handshake, ChevronRight,
  Crown, Activity, Package,
} from 'lucide-react'
import { format } from 'date-fns'

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface TopCard {
  cardId: string
  name: string | null
  imageUrl: string | null
  tcgType: string
  rarity: string | null
  txCount: number
  avgPrice: number | null
}

interface RecentDeal {
  id: string
  finalPrice: number
  completedAt: string
  cardName: string
  cardImage: string | null
  tcgType: string
  listingType: string
}

interface MarketSummary {
  activeCount: number
  activeAuctions: number
  tx24h: { count: number; volume: number; avgPrice: number | null }
  tx7d: { count: number; volume: number; avgPrice?: number | null }
  topCards: TopCard[]
  recentDeals: RecentDeal[]
}

// ─── 통계 카드 ─────────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  color?: string
}) {
  return (
    <div className="bg-surface border border-line hover:border-[#1f1d31] rounded-2xl p-5 space-y-3 transition-colors">
      <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl border ${color ?? 'bg-accent-tint border-accent-line'}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-extrabold text-fg tabular-nums leading-none">{value}</p>
        <p className="text-xs text-subtle mt-1.5">{label}</p>
        {sub && <p className="text-[11px] text-subtle mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ─── 거래 유형 배지 ───────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  if (type === 'AUCTION') return (
    <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded font-semibold bg-accent-tint border border-accent-line text-accent-2">
      <Gavel size={9} /> 경매
    </span>
  )
  if (type === 'OFFER') return (
    <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded font-semibold bg-emerald-900/20 border border-emerald-700/40 text-emerald-400">
      <Handshake size={9} /> 제안
    </span>
  )
  return (
    <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded font-semibold bg-accent-tint border border-accent-line text-accent-fg">
      <Tag size={9} /> 즉구
    </span>
  )
}

// ─── 메달 ─────────────────────────────────────────────────────────────────────

function Medal({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-xl">🥇</span>
  if (rank === 2) return <span className="text-xl">🥈</span>
  if (rank === 3) return <span className="text-xl">🥉</span>
  return (
    <span className="w-7 h-7 flex items-center justify-center text-xs font-bold text-subtle bg-surface-2 rounded-full border border-line">
      {rank}
    </span>
  )
}

// ─── 메인 페이지 ──────────────────────────────────────────────────────────────

export default function MarketPage() {
  const [period, setPeriod] = useState<'24h' | '7d'>('7d')

  const { data, isLoading } = useQuery<MarketSummary>({
    queryKey: ['market-summary'],
    queryFn: () => api.get('/listings/market-summary').then(r => r.data),
    staleTime: 60_000,
    refetchInterval: 120_000,
  })

  const txStats = period === '24h' ? data?.tx24h : data?.tx7d

  return (
    <div className="max-w-5xl mx-auto space-y-10">

      {/* 헤더 */}
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <h1 className="text-[26px] sm:text-3xl font-bold tracking-tight text-fg flex items-center gap-2">
            <BarChart2 size={22} className="text-accent-fg" />
            시장 분석
          </h1>
          <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-emerald-950/60 border border-emerald-800/40 rounded-full text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            LIVE
          </div>
        </div>
        <p className="text-xs text-subtle">Rocket Auction House 실시간 TCG 시장 데이터</p>
      </div>

      {/* KPI 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          icon={<Package size={18} className="text-accent-soft" />}
          label="활성 리스팅"
          value={data ? data.activeCount.toLocaleString() : '—'}
          color="bg-accent-tint border-accent-line"
        />
        <StatCard
          icon={<Gavel size={18} className="text-accent-2" />}
          label="진행 중 경매"
          value={data ? data.activeAuctions.toLocaleString() : '—'}
          color="bg-accent-tint border-accent-line"
        />
        <StatCard
          icon={<Activity size={18} className="text-emerald-400" />}
          label="24h 체결 건수"
          value={data ? `${data.tx24h.count.toLocaleString()}건` : '—'}
          sub={data?.tx24h.avgPrice ? `평균 ${data.tx24h.avgPrice.toLocaleString()}P` : undefined}
          color="bg-emerald-900/30 border-emerald-700/40"
        />
        <StatCard
          icon={<Zap size={18} className="text-blue-400" />}
          label="24h 거래액"
          value={data && data.tx24h.volume > 0 ? `${(data.tx24h.volume / 10000).toFixed(1)}만P` : '—'}
          sub={data?.tx7d.volume ? `7일 ${(data.tx7d.volume / 10000).toFixed(1)}만P` : undefined}
          color="bg-blue-900/30 border-blue-700/40"
        />
      </div>

      {/* 기간 탭 */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-subtle font-medium">기간 선택</span>
        {(['24h', '7d'] as const).map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-4 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
              period === p
                ? 'bg-accent-tint text-accent-soft border-accent-line'
                : 'bg-transparent text-muted-2 border-line hover:border-line-strong'
            }`}
          >
            {p === '24h' ? '24시간' : '7일'}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1.5 text-[10px] text-subtle">
          <Clock size={10} />
          {format(new Date(), 'MM/dd HH:mm')} 기준
        </div>
      </div>

      {/* 거래량 요약 */}
      {txStats && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-surface border border-line rounded-2xl p-5">
            <p className="text-[10px] text-subtle uppercase tracking-wider font-semibold mb-3">
              {period === '24h' ? '24시간' : '7일'} 체결 건수
            </p>
            <p className="text-3xl font-extrabold text-emerald-400 tabular-nums">{txStats.count.toLocaleString()}<span className="text-sm text-subtle ml-1">건</span></p>
          </div>
          <div className="bg-surface border border-line rounded-2xl p-5">
            <p className="text-[10px] text-subtle uppercase tracking-wider font-semibold mb-3">
              {period === '24h' ? '24시간' : '7일'} 거래액
            </p>
            <p className="text-3xl font-extrabold text-accent-2 tabular-nums">
              {txStats.volume > 0 ? (txStats.volume / 10000).toFixed(1) : '0'}<span className="text-sm text-subtle ml-1">만P</span>
            </p>
            {'avgPrice' in txStats && txStats.avgPrice && (
              <p className="text-[11px] text-subtle mt-2">평균 체결가 {txStats.avgPrice.toLocaleString()}P</p>
            )}
          </div>
        </div>
      )}

      {/* 메인 콘텐츠 그리드 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* 7일 인기 카드 TOP */}
        <div className="bg-surface border border-line rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-line flex items-center justify-between">
            <p className="text-[10px] text-subtle uppercase tracking-wider font-semibold flex items-center gap-1.5">
              <Crown size={11} className="text-accent-fg" /> 7일 인기 카드
            </p>
            <Link href="/cards/rank" className="flex items-center gap-1 text-[10px] text-subtle hover:text-accent-fg transition-colors">
              카드 랭킹 <ChevronRight size={10} />
            </Link>
          </div>

          {isLoading ? (
            <div className="divide-y divide-sunken">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
                  <div className="w-7 h-7 rounded-full bg-surface-2" />
                  <div className="w-10 h-14 bg-surface-2 rounded" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 bg-surface-2 rounded w-2/3" />
                    <div className="h-3 bg-surface-2 rounded w-1/3" />
                  </div>
                  <div className="w-16 h-5 bg-surface-2 rounded" />
                </div>
              ))}
            </div>
          ) : !data?.topCards.length ? (
            <div className="flex flex-col items-center py-12 gap-2">
              <TrendingUp size={28} className="text-line" />
              <p className="text-subtle text-sm">거래 데이터가 아직 없습니다</p>
            </div>
          ) : (
            <div className="divide-y divide-sunken">
              {data.topCards.map((card, idx) => (
                <Link key={card.cardId} href={`/cards/${card.cardId}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2 transition-colors group">
                  <div className="w-7 flex items-center justify-center shrink-0">
                    <Medal rank={idx + 1} />
                  </div>
                  <div className="relative w-10 h-14 shrink-0 rounded overflow-hidden bg-bg">
                    {card.imageUrl ? (
                      <Image src={resolveImageSrc(card.imageUrl)!} alt={card.name ?? ''} fill className="object-contain" sizes="40px" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-sm">🃏</div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-fg-2 truncate group-hover:text-white transition-colors">
                      {card.name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-subtle">{TCG_LABELS[card.tcgType] ?? card.tcgType}</span>
                      {card.rarity && <span className="text-[10px] text-muted-2">{rarityLabel(card.rarity)}</span>}
                    </div>
                    <p className="text-[10px] text-subtle mt-0.5">{card.txCount}건 체결</p>
                  </div>
                  <div className="text-right shrink-0">
                    {card.avgPrice && (
                      <>
                        <p className="text-sm font-bold text-accent-2 tabular-nums">{card.avgPrice.toLocaleString()}</p>
                        <p className="text-[10px] text-subtle">평균P</p>
                      </>
                    )}
                  </div>
                  <ChevronRight size={13} className="text-line-strong group-hover:text-muted-2 transition-colors shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* 최근 체결 */}
        <div className="bg-surface border border-line rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-line flex items-center justify-between">
            <p className="text-[10px] text-subtle uppercase tracking-wider font-semibold flex items-center gap-1.5">
              <Activity size={11} className="text-emerald-400" /> 최근 체결 내역
            </p>
            <div className="flex items-center gap-1 text-[10px] text-subtle">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              24h
            </div>
          </div>

          {isLoading ? (
            <div className="divide-y divide-sunken">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
                  <div className="w-10 h-14 bg-surface-2 rounded" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 bg-surface-2 rounded w-2/3" />
                    <div className="h-3 bg-surface-2 rounded w-1/3" />
                  </div>
                  <div className="w-16 h-5 bg-surface-2 rounded" />
                </div>
              ))}
            </div>
          ) : !data?.recentDeals.length ? (
            <div className="flex flex-col items-center py-12 gap-2">
              <ShieldCheck size={28} className="text-line" />
              <p className="text-subtle text-sm">24시간 내 체결 내역이 없습니다</p>
            </div>
          ) : (
            <div className="divide-y divide-sunken">
              {data.recentDeals.map(deal => (
                <div key={deal.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="relative w-10 h-14 shrink-0 rounded overflow-hidden bg-bg">
                    {deal.cardImage ? (
                      <Image src={deal.cardImage} alt={deal.cardName} fill className="object-contain" sizes="40px" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-sm">🃏</div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-fg-2 truncate">{deal.cardName}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <TypeBadge type={deal.listingType} />
                      <span className="text-[10px] text-subtle">{TCG_LABELS[deal.tcgType] ?? deal.tcgType}</span>
                    </div>
                    <p className="text-[10px] text-line-strong mt-0.5">
                      {format(new Date(deal.completedAt), 'MM/dd HH:mm')}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-accent-2 tabular-nums">{deal.finalPrice.toLocaleString()}</p>
                    <p className="text-[10px] text-subtle">P</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="px-4 py-3 border-t border-line">
            <Link href="/listings"
              className="flex items-center justify-center gap-1.5 text-xs text-muted-2 hover:text-accent-fg transition-colors">
              마켓플레이스 둘러보기 <ChevronRight size={13} />
            </Link>
          </div>
        </div>
      </div>

      {/* 시장 지수 안내 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { icon: <ShieldCheck size={16} className="text-emerald-400" />, title: '에스크로 보호', desc: '모든 거래는 에스크로로 보호됩니다. 수령 확인까지 자금이 안전하게 보관됩니다.', bg: 'bg-emerald-900/10 border-emerald-700/30' },
          { icon: <Zap size={16} className="text-accent-2" />, title: '실시간 경매', desc: 'WebSocket 기반 실시간 입찰. 스나이핑 방지 자동 연장 시스템으로 공정한 경쟁을 보장합니다.', bg: 'bg-accent-tint/50 border-accent-line' },
          { icon: <TrendingUp size={16} className="text-blue-400" />, title: '가격 히스토리', desc: '카드별 실거래 가격 추이를 분석해 합리적인 가격으로 거래하세요.', bg: 'bg-blue-900/10 border-blue-700/30' },
        ].map(item => (
          <div key={item.title} className={`${item.bg} border rounded-2xl p-5 space-y-2`}>
            <div className="flex items-center gap-2">
              {item.icon}
              <p className="text-sm font-bold text-fg-2">{item.title}</p>
            </div>
            <p className="text-[11px] text-subtle leading-relaxed">{item.desc}</p>
          </div>
        ))}
      </div>

      {/* 카드 도감 & 랭킹 링크 */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/cards" className="group bg-surface hover:bg-[#12111c] border border-line hover:border-accent/30 rounded-2xl p-5 transition-all flex items-center justify-between">
          <div>
            <p className="font-bold text-fg-2 group-hover:text-white transition-colors">카드 도감</p>
            <p className="text-[11px] text-subtle mt-0.5">13,000+ 카드 검색</p>
          </div>
          <ChevronRight size={16} className="text-line-strong group-hover:text-accent-fg transition-colors" />
        </Link>
        <Link href="/cards/rank" className="group bg-surface hover:bg-[#12111c] border border-line hover:border-accent/30 rounded-2xl p-5 transition-all flex items-center justify-between">
          <div>
            <p className="font-bold text-fg-2 group-hover:text-white transition-colors">카드 랭킹</p>
            <p className="text-[11px] text-subtle mt-0.5">인기 & 고가 TOP 30</p>
          </div>
          <ChevronRight size={16} className="text-line-strong group-hover:text-accent-fg transition-colors" />
        </Link>
      </div>

    </div>
  )
}

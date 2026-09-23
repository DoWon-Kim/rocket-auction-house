'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Gavel, Tag, Handshake, Package, ArrowRight, ArrowUpRight, ShieldCheck, Zap, TrendingUp, Radio } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import ListingCard from '@/components/ListingCard'
import { TCG_LABELS, resolveImageSrc } from '@/lib/utils'

const FEATURES = [
  {
    icon: Tag,
    tone: 'from-violet-500/25 to-violet-500/5 text-violet-300 ring-violet-400/20',
    title: '즉시구매',
    desc: '원하는 카드를 고정 가격으로 바로 구매',
    href: '/listings?type=BUY_NOW',
  },
  {
    icon: Gavel,
    tone: 'from-cyan-400/25 to-cyan-400/5 text-cyan-300 ring-cyan-300/20',
    title: '경매',
    desc: '실시간 입찰로 최고가에 낙찰',
    href: '/listings?type=AUCTION',
  },
  {
    icon: Handshake,
    tone: 'from-emerald-400/25 to-emerald-400/5 text-emerald-300 ring-emerald-300/20',
    title: '가격 제안',
    desc: '원하는 가격을 직접 제안하고 협상',
    href: '/listings?type=OFFER',
  },
  {
    icon: Package,
    tone: 'from-fuchsia-400/25 to-fuchsia-400/5 text-fuchsia-300 ring-fuchsia-300/20',
    title: '오리파 뽑기',
    desc: '랜덤 뽑기로 레어 카드 획득',
    href: '/shop?tab=oripa',
  },
]

interface MarketSummary {
  activeCount: number
  activeAuctions: number
  tx24h: { count: number; volume: number; avgPrice: number | null }
  tx7d: { count: number; volume: number }
  topCards: { cardId: string; name: string; imageUrl: string | null; tcgType: string; txCount: number; avgPrice: number | null }[]
  recentDeals: { id: string; finalPrice: number; completedAt: string; cardName: string; cardImage: string | null; tcgType: string; listingType: string }[]
}

const TCG_TICKER = ['POKÉMON', 'YU-GI-OH!', 'MAGIC: THE GATHERING', 'ONE PIECE', 'DIGIMON', 'WEISS SCHWARZ', 'LORCANA', 'UNION ARENA']

function SectionHeader({ eyebrow, title, desc, href, live }: { eyebrow: string; title: string; desc?: string; href?: string; live?: boolean }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-6">
      <div>
        <p className="font-display text-[11px] font-semibold tracking-[0.2em] text-accent-fg uppercase mb-2 flex items-center gap-2">
          {live && <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-live" />}
          {eyebrow}
        </p>
        <h2 className="text-2xl sm:text-[28px] font-bold text-fg tracking-tight">{title}</h2>
        {desc && <p className="text-sm text-muted mt-1">{desc}</p>}
      </div>
      {href && (
        <Link href={href}
          className="shrink-0 inline-flex items-center gap-1.5 h-9 px-4 rounded-full border border-line hover:border-line-strong bg-surface/60 text-sm text-fg-3 hover:text-fg transition-colors">
          전체 보기 <ArrowRight size={14} />
        </Link>
      )}
    </div>
  )
}

function StatTile({ label, value, suffix, accent }: { label: string; value: string; suffix: string; accent?: boolean }) {
  return (
    <div className="relative rounded-2xl border border-line bg-surface/70 px-5 py-4 overflow-hidden">
      {accent && <div className="absolute -top-10 -right-10 w-28 h-28 rounded-full bg-accent/20 blur-2xl" />}
      <p className="text-xs text-muted mb-2">{label}</p>
      <p className="font-display text-[26px] font-semibold tabular-nums leading-none text-fg">
        {value}<span className="text-sm text-muted ml-1 font-sans font-medium">{suffix}</span>
      </p>
    </div>
  )
}

export default function Home() {
  const user = useAuthStore(s => s.user)
  const { data: recentData } = useQuery({
    queryKey: ['listings', 'recent-home'],
    queryFn: () => api.get('/listings', { params: { limit: 8, sort: 'newest' } }).then(r => r.data),
    staleTime: 60_000,
  })
  const { data: auctionData } = useQuery({
    queryKey: ['listings', 'live-auctions-home'],
    queryFn: () => api.get('/listings', { params: { limit: 4, type: 'AUCTION', sort: 'ending_soon' } }).then(r => r.data),
    staleTime: 30_000,
  })
  const { data: marketData } = useQuery<MarketSummary>({
    queryKey: ['market-summary'],
    queryFn: () => api.get('/listings/market-summary').then(r => r.data),
    staleTime: 60_000,
  })

  const recentListings = recentData?.listings ?? []
  const liveAuctions = auctionData?.listings ?? []
  const topCards = marketData?.topCards ?? []

  return (
    <div className="space-y-24">

      {/* ── Hero ─────────────────────────────── */}
      <section className="relative pt-6 sm:pt-12 overflow-x-clip lg:overflow-visible">
        <div className="absolute inset-x-0 -top-8 h-[520px] dot-grid [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)] pointer-events-none" />

        <div className="relative grid lg:grid-cols-[1.05fr_1fr] gap-12 lg:gap-10 items-center">
          {/* Copy */}
          <div className="animate-fade-up">
            <div className="inline-flex items-center gap-2 h-8 pl-1.5 pr-3.5 rounded-full border border-line bg-surface/70 text-xs text-fg-3">
              <span className="inline-flex items-center gap-1 h-5 px-2 rounded-full bg-accent/15 text-accent-soft font-display font-semibold text-[10px] tracking-wider">
                <Radio size={10} /> LIVE
              </span>
              TCG 전문 거래소 · 에스크로 보호
            </div>

            <h1 className="mt-6 text-[44px] sm:text-6xl lg:text-[68px] font-extrabold tracking-[-0.035em] leading-[1.05] text-fg">
              희귀 카드를<br />
              <span className="gradient-text">가장 안전하게.</span>
            </h1>

            <p className="mt-6 text-base sm:text-lg text-muted max-w-md leading-relaxed">
              포켓몬·유희왕·MTG·원피스까지. 실시간 경매와 즉시구매,
              수령 확인 전까지 결제금을 보호하는 에스크로로 거래하세요.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/listings"
                className="group h-12 pl-6 pr-5 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-accent to-accent-strong text-white text-sm font-semibold shadow-[0_8px_32px_-6px_rgba(139,92,246,0.6)] hover:shadow-[0_8px_40px_-4px_rgba(139,92,246,0.8)] transition-shadow">
                마켓 둘러보기
                <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
              </Link>
              <Link href="/sell"
                className="h-12 px-6 inline-flex items-center rounded-full border border-line-strong bg-surface/60 hover:bg-surface-2 text-sm font-semibold text-fg-2 transition-colors">
                카드 판매하기
              </Link>
            </div>

            <div className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-sm text-fg-3">
              <span className="inline-flex items-center gap-2"><ShieldCheck size={16} className="text-emerald-400" /> 에스크로 보호</span>
              <span className="inline-flex items-center gap-2"><Zap size={16} className="text-accent-2" /> 수령 즉시 정산</span>
              <span className="inline-flex items-center gap-2"><TrendingUp size={16} className="text-accent-fg" /> 실시간 입찰</span>
            </div>
          </div>

          {/* Showcase */}
          <div className="relative animate-fade-up [animation-delay:120ms]">
            <div className="absolute -inset-6 bg-[radial-gradient(closest-side,rgba(139,92,246,0.35),transparent)] blur-2xl" />
            <div className="relative rounded-[28px] p-px bg-gradient-to-br from-accent/70 via-line-strong to-accent-2/50">
              <div className="relative aspect-[4/3] rounded-[27px] overflow-hidden bg-surface">
                <Image src="/tcg_background.png" alt="" fill priority sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-bg/80 via-transparent to-transparent" />
              </div>
            </div>

            {/* Floating glass chips */}
            <div className="absolute left-3 lg:-left-8 bottom-6 lg:bottom-10 glass border border-white/10 rounded-2xl px-4 py-3 shadow-2xl">
              <p className="text-[11px] text-muted">진행 중 경매</p>
              <p className="font-display text-xl font-semibold text-fg tabular-nums">
                {(marketData?.activeAuctions ?? 0).toLocaleString()}<span className="text-xs text-muted ml-1 font-sans">건</span>
              </p>
            </div>
            <div className="absolute right-3 lg:-right-6 top-4 lg:top-8 glass border border-white/10 rounded-2xl px-4 py-3 shadow-2xl">
              <p className="text-[11px] text-muted flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-live" /> 24h 거래액
              </p>
              <p className="font-display text-xl font-semibold text-accent-2 tabular-nums">
                {(marketData?.tx24h.volume ?? 0).toLocaleString()}<span className="text-xs text-muted ml-1 font-sans">P</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── TCG ticker ─────────────────────────── */}
      <section aria-label="취급 TCG 종목" className="-mx-4 sm:-mx-6 border-y border-line bg-surface/40 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_10%,black_90%,transparent)]">
        <div className="flex w-max animate-marquee py-4">
          {[...TCG_TICKER, ...TCG_TICKER].map((t, i) => (
            <span key={i} className="font-display text-sm font-semibold tracking-[0.18em] text-subtle px-8 flex items-center gap-8">
              {t}<span className="text-accent/60">✦</span>
            </span>
          ))}
        </div>
      </section>

      {/* ── Market stats ─────────────────────── */}
      <section>
        <SectionHeader eyebrow="Market" title="시장 현황" desc="지금 이 순간의 거래 흐름" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile label="활성 리스팅" value={(marketData?.activeCount ?? 0).toLocaleString()} suffix="개" accent />
          <StatTile label="24시간 체결" value={(marketData?.tx24h.count ?? 0).toLocaleString()} suffix="건" />
          <StatTile label="7일 거래량" value={(marketData?.tx7d.count ?? 0).toLocaleString()} suffix="건" />
          <StatTile label="24시간 평균가" value={(marketData?.tx24h.avgPrice ?? 0).toLocaleString()} suffix="P" />
        </div>

        {topCards.length > 0 && (
          <div className="mt-3 rounded-2xl border border-line bg-surface/70 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-line flex items-center justify-between">
              <p className="text-sm font-semibold text-fg-2 flex items-center gap-2">
                <TrendingUp size={15} className="text-accent-fg" /> 7일 인기 카드
              </p>
              <Link href="/market" className="text-xs text-muted hover:text-fg transition-colors">상세 분석</Link>
            </div>
            <div className="divide-y divide-line">
              {topCards.map((card, idx) => (
                <Link key={card.cardId} href={`/cards/${card.cardId}`}
                  className="flex items-center gap-4 px-5 py-3 hover:bg-surface-2 transition-colors group">
                  <span className={`font-display w-5 text-center text-sm font-bold shrink-0 ${idx === 0 ? 'text-accent-2' : idx < 3 ? 'text-accent-fg' : 'text-subtle'}`}>{idx + 1}</span>
                  {card.imageUrl
                    ? <div className="relative w-9 h-12 shrink-0 rounded-md overflow-hidden bg-sunken">
                        <Image src={resolveImageSrc(card.imageUrl)!} alt={card.name ?? ''} fill className="object-contain" sizes="36px" />
                      </div>
                    : <div className="w-9 h-12 shrink-0 rounded-md bg-surface-2 flex items-center justify-center text-xs">🃏</div>
                  }
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-fg-2 truncate group-hover:text-fg transition-colors font-medium">{card.name}</p>
                    <p className="text-xs text-subtle">{TCG_LABELS[card.tcgType] ?? card.tcgType} · {card.txCount}건 거래</p>
                  </div>
                  {card.avgPrice && (
                    <p className="font-display text-sm font-semibold text-fg tabular-nums shrink-0">{card.avgPrice.toLocaleString()}<span className="text-xs text-muted ml-0.5">P</span></p>
                  )}
                  <ArrowUpRight size={15} className="text-subtle group-hover:text-accent-fg transition-colors shrink-0" />
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ── Trade types (bento) ──────────────── */}
      <section>
        <SectionHeader eyebrow="How to trade" title="거래 방식" desc="목적에 맞는 방식으로 거래하세요" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {FEATURES.map((f, i) => (
            <Link key={f.href} href={f.href}
              className="neon-border group relative rounded-2xl border border-line bg-surface/70 hover:bg-surface-2/80 p-5 sm:p-6 transition-colors">
              <div className="flex items-start justify-between">
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-b ring-1 ${f.tone} flex items-center justify-center`}>
                  <f.icon size={20} />
                </div>
                <span className="font-display text-xs text-subtle">0{i + 1}</span>
              </div>
              <h3 className="mt-8 font-bold text-fg text-base">{f.title}</h3>
              <p className="mt-1 text-sm text-muted leading-relaxed">{f.desc}</p>
              <ArrowUpRight size={16} className="absolute right-5 bottom-5 text-subtle group-hover:text-fg group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-all" />
            </Link>
          ))}
        </div>
      </section>

      {/* ── Live auctions ─────────────────────── */}
      {liveAuctions.length > 0 && (
        <section>
          <SectionHeader eyebrow="Live auction" live title="진행 중인 경매" desc="종료 임박 순" href="/listings?type=AUCTION" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {liveAuctions.map((l: Parameters<typeof ListingCard>[0]['listing']) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        </section>
      )}

      {/* ── Recent listings ───────────────────── */}
      {recentListings.length > 0 && (
        <section>
          <SectionHeader eyebrow="New arrivals" title="최근 등록" desc="새롭게 등록된 카드" href="/listings" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {recentListings.map((l: Parameters<typeof ListingCard>[0]['listing']) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        </section>
      )}

      {/* ── CTA band ─────────────────────────── */}
      {!user && (
        <section className="relative overflow-hidden rounded-[28px] border border-accent-line bg-gradient-to-br from-accent-tint via-surface to-surface p-8 sm:p-12">
          <div className="absolute -top-24 -right-16 w-80 h-80 rounded-full bg-accent/30 blur-3xl" />
          <div className="absolute -bottom-24 left-1/3 w-72 h-72 rounded-full bg-accent-2/15 blur-3xl" />
          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-fg tracking-tight">첫 거래를 시작해 보세요</h2>
              <p className="mt-2 text-muted">가입은 무료, 수수료는 투명하게. 1분이면 충분합니다.</p>
            </div>
            <div className="flex gap-3">
              <Link href="/register"
                className="h-12 px-6 inline-flex items-center gap-2 rounded-full bg-white text-bg text-sm font-semibold hover:bg-fg-2 transition-colors">
                무료 가입 <ArrowRight size={16} />
              </Link>
              <Link href="/login"
                className="h-12 px-6 inline-flex items-center rounded-full border border-line-strong text-sm font-semibold text-fg-2 hover:bg-surface-2 transition-colors">
                로그인
              </Link>
            </div>
          </div>
        </section>
      )}

    </div>
  )
}

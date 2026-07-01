'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Gavel, Tag, Handshake, Package, ChevronRight, ShieldCheck, Zap, TrendingUp } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import ListingCard from '@/components/ListingCard'

const FEATURES = [
  {
    icon: <Tag size={22} className="text-[#e0b878]" />,
    iconBg: 'bg-[#2a1c08] border-[#3d2a0c]',
    title: '즉시구매',
    desc: '원하는 카드를 고정 가격으로 즉시 구매',
    href: '/listings?type=BUY_NOW',
    color: 'hover:border-[#d4a853]/30',
  },
  {
    icon: <Gavel size={22} className="text-[#f0a832]" />,
    iconBg: 'bg-[#2a1f08] border-[#3d2e0c]',
    title: '경매',
    desc: '시간 제한 경매에 참여해 최고가 낙찰',
    href: '/listings?type=AUCTION',
    color: 'hover:border-[#f0a832]/30',
  },
  {
    icon: <Handshake size={22} className="text-[#4ade80]" />,
    iconBg: 'bg-[#0d2820] border-[#1a4030]',
    title: '가격 제안',
    desc: '원하는 가격을 직접 제안하고 협상',
    href: '/listings?type=OFFER',
    color: 'hover:border-[#4ade80]/30',
  },
  {
    icon: <Package size={22} className="text-[#c084fc]" />,
    iconBg: 'bg-[#1e0d2e] border-[#2e1a45]',
    title: '오리파 뽑기',
    desc: '랜덤 뽑기로 레어 카드를 획득',
    href: '/shop?tab=oripa',
    color: 'hover:border-[#c084fc]/30',
  },
]

const TCG_LIST = [
  { name: '포켓몬', emoji: '⚡' },
  { name: '유희왕', emoji: '👁' },
  { name: 'MTG', emoji: '✦' },
  { name: '디지몬', emoji: '🌐' },
  { name: '원피스', emoji: '⚓' },
  { name: '바이스', emoji: '⚔' },
  { name: '기타', emoji: '🃏' },
]

const TRUST_ITEMS = [
  { icon: <ShieldCheck size={18} className="text-[#4ade80]" />, label: '에스크로 보호', desc: '결제 후 수령 확인까지 안전 보관' },
  { icon: <Zap size={18} className="text-[#f0a832]" />, label: '빠른 정산', desc: '수령 확인 즉시 포인트 자동 정산' },
  { icon: <TrendingUp size={18} className="text-[#e0b878]" />, label: '실시간 경매', desc: '입찰 현황을 실시간으로 확인' },
]

export default function Home() {
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

  const recentListings = recentData?.listings ?? []
  const liveAuctions = auctionData?.listings ?? []

  return (
    <div className="space-y-20">

      {/* ── Hero ─────────────────────────────── */}
      <section className="relative -mx-4 px-4 pt-20 pb-24 overflow-hidden">
        {/* Background image */}
        <div className="absolute inset-0">
          <Image
            src="/tcg_background.png"
            alt=""
            fill
            priority
            className="object-cover object-center"
            sizes="100vw"
          />
        </div>
        {/* Dark overlay to keep text readable */}
        <div className="absolute inset-0 bg-[#0f0b08]/72" />
        {/* Warm golden radial glow */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_50%_10%,rgba(212,168,83,0.14)_0%,rgba(184,134,11,0.06)_45%,transparent_70%)]" />
        {/* Vignette */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_100%_80%_at_50%_50%,transparent_50%,rgba(15,11,8,0.6)_100%)]" />
        {/* Bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-[#0f0b08] to-transparent" />

        <div className="relative z-10 text-center space-y-6 max-w-3xl mx-auto">
          {/* Eyebrow */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#221a12] border border-[#3a2510] text-[#8a7055] text-xs font-medium tracking-wider uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80] animate-live" />
            TCG 전문 거래소
          </div>

          {/* Headline */}
          <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight leading-[1.08]">
            <span className="text-white">Rocket</span>
            <br />
            <span className="gradient-text">Auction House</span>
          </h1>

          <p className="text-[#b8997a] text-lg max-w-md mx-auto leading-relaxed">
            포켓몬·유희왕·MTG 등 모든 TCG 카드를<br className="hidden sm:block" />
            에스크로 보호 아래 안전하게 거래하세요
          </p>

          {/* CTA buttons */}
          <div className="flex items-center justify-center gap-3 pt-2">
            <Link href="/listings"
              className="h-11 px-7 flex items-center gap-2 bg-[#d4a853] hover:bg-[#c49440] text-white text-sm font-semibold rounded-xl transition-all duration-200 shadow-[0_0_24px_rgba(212,168,83,0.35)] hover:shadow-[0_0_32px_rgba(212,168,83,0.5)]">
              마켓 둘러보기
              <ChevronRight size={14} />
            </Link>
            <Link href="/register"
              className="h-11 px-7 flex items-center text-sm font-semibold text-[#9e8a6a] bg-[#1a1410] hover:bg-[#221a12] border border-[#2e2318] hover:border-[#4a3520] rounded-xl transition-all duration-200">
              무료 가입
            </Link>
          </div>

          {/* Trust strip */}
          <div className="flex items-center justify-center gap-6 pt-4 flex-wrap">
            {TRUST_ITEMS.map(t => (
              <div key={t.label} className="flex items-center gap-2">
                {t.icon}
                <div className="text-left">
                  <p className="text-xs font-semibold text-[#e8d5b0]">{t.label}</p>
                  <p className="text-[10px] text-[#5a4830]">{t.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Trade types ──────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-7">
          <div>
            <h2 className="text-xl font-bold text-white">거래 방식</h2>
            <p className="text-sm text-[#5a4830] mt-0.5">목적에 맞는 방식으로 거래하세요</p>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {FEATURES.map(f => (
            <Link key={f.href} href={f.href} className="group">
              <div className={`bg-[#1a1410] border border-[#2e2318] ${f.color} rounded-2xl p-5 space-y-4 transition-all duration-250 hover:shadow-[0_4px_32px_rgba(0,0,0,0.4)] hover:-translate-y-0.5`}>
                <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl border ${f.iconBg}`}>
                  {f.icon}
                </div>
                <div>
                  <h3 className="font-bold text-[#e8d5b0] text-sm mb-1">{f.title}</h3>
                  <p className="text-[11px] text-[#5a4830] leading-relaxed">{f.desc}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Live auctions ─────────────────────── */}
      {liveAuctions.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-7">
            <div className="flex items-center gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-white">진행 중인 경매</h2>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-red-950/60 border border-red-800/40 rounded-full text-[10px] font-bold text-red-400 uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-live" />
                    LIVE
                  </span>
                </div>
                <p className="text-sm text-[#5a4830] mt-0.5">종료 임박 순으로 정렬됩니다</p>
              </div>
            </div>
            <Link href="/listings?type=AUCTION"
              className="flex items-center gap-1 text-sm text-[#7a6040] hover:text-[#d4a853] transition-colors">
              전체 보기 <ChevronRight size={14} />
            </Link>
          </div>
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
          <div className="flex items-center justify-between mb-7">
            <div>
              <h2 className="text-xl font-bold text-white">최근 등록</h2>
              <p className="text-sm text-[#5a4830] mt-0.5">새롭게 등록된 카드를 확인하세요</p>
            </div>
            <Link href="/listings"
              className="flex items-center gap-1 text-sm text-[#7a6040] hover:text-[#d4a853] transition-colors">
              전체 보기 <ChevronRight size={14} />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {recentListings.map((l: Parameters<typeof ListingCard>[0]['listing']) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        </section>
      )}

      {/* ── Supported TCG ─────────────────────── */}
      <section className="py-14 border-t border-[#2e2318] relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_100%_at_50%_100%,rgba(212,168,83,0.04)_0%,transparent_70%)]" />
        <div className="relative">
          <div className="flex items-center justify-center gap-3 mb-2">
            <div className="h-px w-12 bg-gradient-to-r from-transparent to-[#d4a853]/40" />
            <p className="text-center text-[11px] text-[#7a6040] uppercase tracking-[0.25em] font-semibold">취급 TCG 종목</p>
            <div className="h-px w-12 bg-gradient-to-l from-transparent to-[#d4a853]/40" />
          </div>
          <p className="text-center text-xs text-[#4a3820] mb-8">모든 주요 TCG 카드를 거래하세요</p>
          <div className="flex flex-wrap justify-center gap-2">
            {TCG_LIST.map(t => (
              <span key={t.name}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#1a1410] border border-[#2e2318] hover:border-[#d4a853]/30 hover:bg-[#221a12] rounded-xl text-sm text-[#7a6040] hover:text-[#d4a853] transition-all duration-200 cursor-default">
                <span className="text-base">{t.emoji}</span>
                {t.name}
              </span>
            ))}
          </div>
        </div>
      </section>

    </div>
  )
}

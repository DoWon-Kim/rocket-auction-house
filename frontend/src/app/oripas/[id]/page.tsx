'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { sounds } from '@/lib/sounds'
import {
  Package, ChevronLeft, Sparkles, Star, Trophy,
  History, BarChart2, Users, X,
} from 'lucide-react'
import Badge from '@/components/ui/Badge'
import { formatDistanceToNow } from 'date-fns'
import { ko } from 'date-fns/locale'

type DrawPhase = 'idle' | 'drawing' | 'spotlight'

interface OripaItem {
  id: string
  grade: number
  quantity: number
  weight: number
  isLastOne: boolean
  probability: number
  card: { id: string; name: string; rarity: string; setName: string; imageUrl?: string; tcgType: string }
}

interface DrawResult {
  card: { id: string; name: string; rarity: string; imageUrl?: string }
  grade: number
  isLastOne?: boolean
}

interface PurchaseRecord {
  id: string
  draws: number
  totalPaid: number
  createdAt: string
  user: { nickname: string }
  results: DrawResult[]
}

// ─── Particle burst ───────────────────────────────────────────────────────────

function Particles({ count, colorA, colorB }: { count: number; colorA: string; colorB: string }) {
  const items = useMemo(() =>
    Array.from({ length: count }, (_, i) => {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.8
      const dist = 90 + Math.random() * 130
      const size = 3 + Math.random() * 8
      return {
        tx: Math.round(Math.cos(angle) * dist),
        ty: Math.round(Math.sin(angle) * dist),
        size,
        delay: +(Math.random() * 0.45).toFixed(2),
        dur: +(0.65 + Math.random() * 0.55).toFixed(2),
      }
    }), [count])

  return (
    <>
      {items.map((p, i) => (
        <div
          key={i}
          className="absolute top-1/2 left-1/2 rounded-full pointer-events-none"
          style={{
            width: p.size,
            height: p.size,
            marginLeft: -p.size / 2,
            marginTop: -p.size / 2,
            background: `linear-gradient(135deg, ${colorA}, ${colorB})`,
            animation: `particle-fly ${p.dur}s ease-out ${p.delay}s both`,
            ['--tx' as string]: `${p.tx}px`,
            ['--ty' as string]: `${p.ty}px`,
          }}
        />
      ))}
    </>
  )
}

// ─── Drawing overlay ──────────────────────────────────────────────────────────

function DrawingOverlay() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm select-none pointer-events-none">
      <div className="relative flex items-center justify-center mb-10">
        {/* Outer glow ring */}
        <div
          className="absolute rounded-full animate-oripa-glow"
          style={{
            width: 240, height: 240,
            background: 'radial-gradient(circle, rgba(236,72,153,0.4) 0%, rgba(168,85,247,0.2) 50%, transparent 70%)',
          }}
        />
        {/* Inner ring */}
        <div
          className="absolute rounded-full animate-oripa-glow"
          style={{
            width: 160, height: 160,
            background: 'radial-gradient(circle, rgba(236,72,153,0.55) 0%, rgba(168,85,247,0.3) 60%, transparent 70%)',
            animationDelay: '0.6s',
          }}
        />
        {/* Pack card */}
        <div
          className="relative z-10 flex items-center justify-center rounded-2xl border-2 border-pink-500/70"
          style={{
            width: 88, height: 120,
            background: 'linear-gradient(135deg, rgba(131,24,67,0.9), rgba(88,28,135,0.7), rgba(30,27,75,0.9))',
            boxShadow: '0 0 40px rgba(236,72,153,0.6), 0 0 80px rgba(236,72,153,0.2)',
            animation: 'oripa-pack-rock 1s ease-in-out infinite alternate',
          }}
        >
          <Sparkles size={32} className="text-pink-300" />
        </div>
      </div>

      <p className="text-white font-bold text-xl tracking-[0.2em]">뽑는 중</p>
      <div className="flex gap-2 mt-3">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className="w-2.5 h-2.5 rounded-full bg-pink-400"
            style={{ animation: `oripa-dot 1.2s ease-in-out ${i * 0.2}s infinite` }}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Spotlight overlay (one card at a time) ────────────────────────────────────

function SpotlightScene({
  result, onNext, onSkipAll, current, total,
}: {
  result: DrawResult
  onNext: () => void
  onSkipAll: () => void
  current: number
  total: number
}) {
  const isLastOne = !!result.isLastOne
  const [floating, setFloating] = useState(false)

  const glowColor    = isLastOne ? 'rgba(251,146,60,0.65)' : 'rgba(250,204,21,0.55)'
  const glowWide     = isLastOne ? 'rgba(251,146,60,0.25)' : 'rgba(250,204,21,0.18)'
  const particleA    = isLastOne ? '#fb923c' : '#fbbf24'
  const particleB    = isLastOne ? '#ef4444' : '#a855f7'
  const borderStyle  = isLastOne ? '4px solid #fb923c' : '4px solid #fbbf24'
  const flashBg      = isLastOne ? 'rgba(251,146,60,0.35)' : 'rgba(255,255,255,0.55)'
  const boxShadow    = isLastOne
    ? '0 0 80px rgba(251,146,60,0.7), 0 0 160px rgba(251,146,60,0.3)'
    : '0 0 80px rgba(250,204,21,0.6), 0 0 160px rgba(250,204,21,0.25)'
  const textShadow   = isLastOne ? '0 0 24px rgba(251,146,60,1)' : '0 0 24px rgba(250,204,21,1)'

  // Zoom-in finishes at 0.7s → switch to float
  useEffect(() => {
    sounds?.spotlightReveal(isLastOne)
    const t = setTimeout(() => setFloating(true), 700)
    return () => clearTimeout(t)
  }, [])

  // Auto-advance
  useEffect(() => {
    const t = setTimeout(onNext, 3200)
    return () => clearTimeout(t)
  }, [onNext])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center cursor-pointer"
      onClick={onNext}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/92 backdrop-blur-md" />

      {/* Ambient glow */}
      <div
        className="absolute inset-0 animate-oripa-glow pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 60% 60% at 50% 48%, ${glowColor}, ${glowWide} 50%, transparent 72%)`,
        }}
      />

      {/* Entry flash */}
      <div
        className="absolute inset-0 pointer-events-none animate-oripa-flash"
        style={{ background: flashBg }}
      />

      {/* Skip button */}
      <button
        onClick={e => { e.stopPropagation(); onSkipAll() }}
        className="absolute top-5 right-5 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/50 hover:text-white text-xs font-medium transition-all"
      >
        <X size={12} /> 전체 스킵
      </button>

      {/* Progress counter */}
      {total > 1 && (
        <div className="absolute top-5 left-5 z-10 text-white/35 text-xs font-mono">
          {current + 1} / {total}
        </div>
      )}

      {/* Card + particles */}
      <div className="relative flex items-center justify-center">
        <Particles count={isLastOne ? 32 : 22} colorA={particleA} colorB={particleB} />

        <div
          className={floating ? 'animate-oripa-float' : 'animate-oripa-zoom-in'}
          style={{
            width: 190, height: 254,
            borderRadius: 16,
            overflow: 'hidden',
            border: borderStyle,
            boxShadow,
            position: 'relative',
          }}
        >
          {result.card.imageUrl ? (
            <Image src={result.card.imageUrl} alt={result.card.name} fill className="object-cover" />
          ) : (
            <div
              className="absolute inset-0 flex items-center justify-center text-6xl"
              style={{ background: '#1a1208' }}
            >
              🃏
            </div>
          )}
          {/* Shimmer sweep */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.22) 50%, transparent 70%)',
              animation: 'shimmer 2s ease-in-out 0.55s 1 both',
            }}
          />
        </div>
      </div>

      {/* Grade label */}
      <div className="relative z-10 mt-8 text-center pointer-events-none space-y-2">
        {isLastOne ? (
          <div className="animate-oripa-text-pop">
            <div
              className="flex items-center gap-3 justify-center text-orange-400 font-black text-3xl tracking-widest"
              style={{ textShadow }}
            >
              <Trophy size={28} fill="currentColor" /> LAST ONE <Trophy size={28} fill="currentColor" />
            </div>
          </div>
        ) : (
          <div className="animate-oripa-text-pop">
            <div
              className="text-yellow-400 font-black text-5xl tracking-widest"
              style={{ textShadow }}
            >
              ★★★
            </div>
          </div>
        )}

        <p
          className="text-white/60 text-sm font-medium animate-oripa-badge"
          style={{ maxWidth: 240 }}
        >
          {result.card.name}
        </p>

        <p className="text-white/25 text-xs animate-oripa-badge" style={{ animationDelay: '1.4s' }}>
          탭하여 계속
        </p>
      </div>
    </div>
  )
}

// ─── Flip card ────────────────────────────────────────────────────────────────

function FlipCard({ result, revealed, delay }: { result: DrawResult; revealed: boolean; delay: number }) {
  const [flipped, setFlipped] = useState(false)

  useEffect(() => {
    if (!revealed) { setFlipped(false); return }
    const t = setTimeout(() => setFlipped(true), delay)
    return () => clearTimeout(t)
  }, [revealed, delay])

  useEffect(() => {
    if (flipped) sounds?.cardFlip()
  }, [flipped])

  const gradeStyle = result.isLastOne
    ? 'border-orange-400 shadow-[0_0_20px_rgba(251,146,60,0.45)]'
    : result.grade === 3
    ? 'border-yellow-400 shadow-[0_0_16px_rgba(250,204,21,0.38)]'
    : result.grade === 2
    ? 'border-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.22)]'
    : 'border-[#2e2318]'

  const bgStyle = result.isLastOne
    ? 'bg-gradient-to-b from-orange-900/30 to-[#1a1410]'
    : result.grade === 3
    ? 'bg-gradient-to-b from-yellow-900/30 to-[#1a1410]'
    : result.grade === 2
    ? 'bg-gradient-to-b from-purple-900/30 to-[#1a1410]'
    : 'bg-[#1a1410]'

  return (
    <div className="relative" style={{ perspective: '800px' }}>
      <div
        className="relative transition-all duration-700"
        style={{
          transformStyle: 'preserve-3d',
          transform: flipped ? 'rotateY(0deg)' : 'rotateY(180deg)',
        }}
      >
        {/* Front (result) */}
        <div
          className={`border-2 rounded-xl p-2 text-center space-y-1.5 ${gradeStyle} ${bgStyle}`}
          style={{ backfaceVisibility: 'hidden' }}
        >
          {result.isLastOne && (
            <div className="flex items-center justify-center gap-0.5 text-[10px] text-orange-400 font-bold">
              <Trophy size={10} /> LAST ONE
            </div>
          )}
          <div className="relative aspect-[3/4] bg-[#1a1208] rounded-lg overflow-hidden">
            {result.card.imageUrl ? (
              <Image src={result.card.imageUrl} alt={result.card.name} fill className="object-cover" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-2xl">🃏</div>
            )}
            {(result.grade === 3 || result.isLastOne) && flipped && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: 'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.18) 50%, transparent 70%)',
                  animation: 'shimmer 1.6s ease-in-out',
                }}
              />
            )}
          </div>
          <p className="text-[11px] font-medium line-clamp-2 leading-tight px-0.5 text-[#e8d5b0]">
            {result.card.name}
          </p>
          <Badge
            variant={result.isLastOne ? 'yellow' : result.grade === 3 ? 'yellow' : result.grade === 2 ? 'indigo' : 'default'}
          >
            {result.isLastOne ? '🏆 Last One' : result.grade === 3 ? '★★★' : result.grade === 2 ? '★★' : '★'}
          </Badge>
        </div>

        {/* Back */}
        <div
          className="absolute inset-0 border-2 border-pink-500/60 bg-gradient-to-br from-pink-900/50 via-purple-900/40 to-[#d4a853]/20 rounded-xl flex items-center justify-center"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          <div className="text-center space-y-1">
            <Sparkles size={28} className="text-pink-400/70 mx-auto" />
            <p className="text-[10px] text-pink-400/50 font-bold tracking-widest">ORIPA</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function OripaDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuthStore()
  const qc = useQueryClient()

  const [drawCount, setDrawCount] = useState(1)
  const [results, setResults] = useState<DrawResult[] | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [isLastDraw, setIsLastDraw] = useState(false)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'items' | 'history'>('items')
  const resultsRef = useRef<HTMLDivElement>(null)

  // Animation state
  const [phase, setPhase] = useState<DrawPhase>('idle')
  const [spotlightQueue, setSpotlightQueue] = useState<DrawResult[]>([])
  const [spotlightIndex, setSpotlightIndex] = useState(0)

  const { data: oripa, isLoading } = useQuery({
    queryKey: ['oripa', id],
    queryFn: () => api.get(`/oripas/${id}`).then(r => r.data),
  })

  const { data: history } = useQuery<PurchaseRecord[]>({
    queryKey: ['oripa-history', id],
    queryFn: () => api.get(`/oripas/${id}/history`).then(r => r.data),
    enabled: activeTab === 'history',
  })

  useEffect(() => {
    if (!oripa) return
    if (drawCount > oripa.remainSlots && oripa.remainSlots > 0) {
      const best = [10, 5, 1].find(n => n <= oripa.remainSlots) ?? 1
      setDrawCount(best)
    }
  }, [oripa?.remainSlots])

  const enterReveal = useCallback(() => {
    sounds?.allReveal()
    setPhase('idle')
    setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 120)
    setTimeout(() => setRevealed(true), 420)
  }, [])

  const advanceSpotlight = useCallback(() => {
    setSpotlightIndex(prev => {
      if (prev < spotlightQueue.length - 1) return prev + 1
      enterReveal()
      return prev
    })
  }, [spotlightQueue.length, enterReveal])

  const skipAllSpotlights = useCallback(() => {
    enterReveal()
  }, [enterReveal])

  const drawMut = useMutation({
    mutationFn: () => api.post(`/oripas/${id}/draw`, { draws: drawCount }),
    onSuccess: res => {
      const drawResults: DrawResult[] = res.data.results
      const isLD: boolean = res.data.isLastDraw ?? false

      setResults(drawResults)
      setIsLastDraw(isLD)
      setRevealed(false)
      setError('')
      qc.invalidateQueries({ queryKey: ['oripa', id] })
      qc.invalidateQueries({ queryKey: ['oripa-history', id] })

      // Build spotlight queue: Last One cards first, then ★★★
      const highlights = [
        ...drawResults.filter(r => r.isLastOne),
        ...drawResults.filter(r => !r.isLastOne && r.grade === 3),
      ]

      if (highlights.length > 0) {
        setSpotlightQueue(highlights)
        setSpotlightIndex(0)
        setPhase('spotlight')
      } else {
        enterReveal()
      }
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } }
      setError(err.response?.data?.message ?? '뽑기에 실패했습니다.')
      setPhase('idle')
    },
  })

  // Probability summary by grade
  const gradeProbs = (() => {
    if (!oripa?.items?.length) return null
    const byGrade: Record<number, number> = {}
    for (const item of oripa.items as OripaItem[]) {
      byGrade[item.grade] = (byGrade[item.grade] ?? 0) + item.probability
    }
    return byGrade
  })()

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="h-8 w-32 bg-[#1a1410] border border-[#2e2318] rounded-xl animate-pulse" />
        <div className="bg-[#1a1410] border border-[#2e2318] rounded-xl h-72 animate-pulse" />
        <div className="bg-[#1a1410] border border-[#2e2318] rounded-xl h-40 animate-pulse" />
      </div>
    )
  }
  if (!oripa) return <div className="text-center py-24 text-[#5a4830]">오리파를 찾을 수 없습니다.</div>

  const progressPct = ((oripa.totalSlots - oripa.remainSlots) / oripa.totalSlots) * 100
  const isSoldOut = oripa.remainSlots === 0
  const availableCounts = [1, 5, 10].filter(n => n <= oripa.remainSlots)
  const isLastOne = oripa.remainSlots > 0 && oripa.remainSlots <= drawCount
  const items = oripa.items as OripaItem[]

  return (
    <>
      {/* ── Animation overlays ── */}
      {phase === 'drawing' && <DrawingOverlay />}

      {phase === 'spotlight' && spotlightQueue[spotlightIndex] && (
        <SpotlightScene
          key={spotlightIndex}
          result={spotlightQueue[spotlightIndex]}
          onNext={advanceSpotlight}
          onSkipAll={skipAllSpotlights}
          current={spotlightIndex}
          total={spotlightQueue.length}
        />
      )}

      {/* ── Page content ── */}
      <div className="max-w-3xl mx-auto space-y-6">
        <Link href="/oripas" className="inline-flex items-center gap-1 text-sm text-[#8a7055] hover:text-[#f5ead8] transition-colors">
          <ChevronLeft size={16} /> 목록으로
        </Link>

        {/* Header */}
        <div className="bg-[#1a1410] border border-[#2e2318] rounded-xl overflow-hidden">
          <div className="relative h-52 bg-[#1a1208]">
            {oripa.imageUrl ? (
              <Image src={oripa.imageUrl} alt={oripa.title} fill className="object-cover" />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-pink-900/40 via-purple-900/30 to-[#d4a853]/20 flex items-center justify-center">
                <Package size={72} className="text-pink-400/25" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#1a1410] via-[#1a1410]/20 to-transparent" />
            <div className="absolute bottom-4 left-5 right-5">
              <h1 className="text-2xl font-bold text-[#f5ead8] drop-shadow">{oripa.title}</h1>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {oripa.description && <p className="text-[#8a7055] text-sm">{oripa.description}</p>}

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-[#1a1208] border border-[#2e2318] rounded-xl py-3">
                <p className="text-lg font-bold text-[#f0a832] tabular-nums">{oripa.pricePerDraw.toLocaleString()}P</p>
                <p className="text-xs text-[#5a4830] mt-0.5">1회 가격</p>
              </div>
              <div className="bg-[#1a1208] border border-[#2e2318] rounded-xl py-3">
                <p className={`text-lg font-bold tabular-nums ${isSoldOut ? 'text-[#5a4830]' : oripa.remainSlots <= 5 ? 'text-red-400' : 'text-[#f5ead8]'}`}>
                  {isSoldOut ? '매진' : oripa.remainSlots.toLocaleString()}
                </p>
                <p className="text-xs text-[#5a4830] mt-0.5">남은 슬롯</p>
              </div>
              <div className="bg-[#1a1208] border border-[#2e2318] rounded-xl py-3">
                <p className="text-lg font-bold text-[#f5ead8] flex items-center justify-center gap-1 tabular-nums">
                  <Users size={14} className="text-[#8a7055]" />
                  {oripa._count?.purchases ?? 0}
                </p>
                <p className="text-xs text-[#5a4830] mt-0.5">참여자</p>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs text-[#5a4830]">
                <span>{Math.round(progressPct)}% 소진</span>
                <span>{oripa.remainSlots}/{oripa.totalSlots}</span>
              </div>
              <div className="relative w-full bg-[#2e2318] rounded-full h-2.5 overflow-hidden">
                <div
                  className={`h-2.5 rounded-full transition-all duration-700 ${progressPct >= 90 ? 'bg-red-500' : 'bg-gradient-to-r from-pink-500 to-purple-500'}`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            {gradeProbs && (
              <div className="flex gap-2 flex-wrap">
                {([3, 2, 1] as const).filter(g => gradeProbs[g] != null).map(g => (
                  <div key={g} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
                    g === 3
                      ? 'bg-yellow-400/15 text-yellow-300 border border-yellow-400/30'
                      : g === 2
                      ? 'bg-purple-400/15 text-purple-300 border border-purple-400/30'
                      : 'bg-[#1a1208] border border-[#2e2318] text-[#8a7055]'
                  }`}>
                    <Star size={10} fill="currentColor" />
                    {g === 3 ? '최상위' : g === 2 ? '레어' : '일반'} {(gradeProbs[g] * 100).toFixed(1)}%
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Draw panel */}
        <div className="bg-[#1a1410] border border-[#2e2318] rounded-xl p-5 space-y-4">
          <h2 className="font-semibold flex items-center gap-2 text-lg text-[#f5ead8]">
            <Sparkles size={18} className="text-pink-400" /> 뽑기
          </h2>

          {isSoldOut ? (
            <div className="text-center py-8 space-y-2">
              <p className="text-4xl">📦</p>
              <p className="text-[#8a7055] font-medium">이 오리파는 매진되었습니다.</p>
            </div>
          ) : (
            <>
              {availableCounts.length > 0 && (
                <div className="flex gap-2">
                  {availableCounts.map(n => (
                    <button
                      key={n}
                      onClick={() => setDrawCount(n)}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                        drawCount === n
                          ? 'bg-gradient-to-r from-pink-600 to-purple-600 text-white shadow-lg shadow-pink-500/20'
                          : 'bg-[#1a1208] border border-[#2e2318] text-[#8a7055] hover:border-[#4a3520] hover:text-[#e8d5b0]'
                      }`}
                    >
                      {n}회
                    </button>
                  ))}
                </div>
              )}

              <div className="bg-[#1a1208] border border-[#2e2318] rounded-xl px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-[#7a6040] uppercase tracking-wider font-semibold">총 비용</p>
                  <p className="text-2xl font-bold text-[#f0a832] tabular-nums">{(oripa.pricePerDraw * drawCount).toLocaleString()}P</p>
                </div>
                {user && (
                  <div className="text-right">
                    <p className="text-xs text-[#7a6040] uppercase tracking-wider font-semibold">내 잔액</p>
                    <p className={`text-sm font-medium tabular-nums ${user.balance < oripa.pricePerDraw * drawCount ? 'text-red-400' : 'text-[#f5ead8]'}`}>
                      {user.balance.toLocaleString()}P
                    </p>
                  </div>
                )}
              </div>

              {isLastOne && (
                <div className="flex items-center gap-2 bg-orange-500/10 border border-orange-500/40 rounded-xl px-4 py-3 text-sm text-orange-300">
                  <Trophy size={15} />
                  <span>이 뽑기가 <strong>Last One</strong>입니다! 최고 등급 카드가 보장됩니다.</span>
                </div>
              )}

              {error && (
                <div className="bg-red-950/50 border border-red-800/50 text-red-400 rounded-xl px-4 py-3 text-sm">{error}</div>
              )}

              <button
                onClick={() => {
                  if (!user) { router.push('/login'); return }
                  if (phase !== 'idle') return
                  setResults(null)
                  setRevealed(false)
                  setError('')
                  sounds?.packOpen()
                  setPhase('drawing')
                  drawMut.mutate()
                }}
                disabled={phase !== 'idle' || oripa.remainSlots < drawCount}
                className="w-full bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-4 rounded-xl font-bold text-base transition-all flex items-center justify-center gap-2 shadow-lg shadow-pink-500/20"
              >
                <Sparkles size={18} />
                {drawCount}회 뽑기
              </button>
            </>
          )}
        </div>

        {/* Results */}
        {results && (
          <div ref={resultsRef} className="bg-[#1a1410] border border-[#2e2318] rounded-xl p-5 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold flex items-center gap-2 text-lg text-[#f5ead8]">
                <Sparkles size={18} className="text-yellow-400" />
                뽑기 결과!
              </h2>
              {!revealed ? (
                <button
                  onClick={() => setRevealed(true)}
                  className="text-sm text-pink-400 hover:text-pink-300 font-medium transition-colors"
                >
                  전체 공개 →
                </button>
              ) : (
                <button
                  onClick={() => { setResults(null); setRevealed(false) }}
                  className="text-sm text-[#5a4830] hover:text-[#8a7055] transition-colors"
                >
                  닫기
                </button>
              )}
            </div>

            {isLastDraw && (
              <div className="flex items-center gap-2 bg-orange-500/10 border border-orange-500/30 rounded-xl px-4 py-3 text-sm text-orange-300">
                <Trophy size={16} /> <strong>라스트 원!</strong>&nbsp;마지막 슬롯에서 최고 등급 카드가 확정되었습니다.
              </div>
            )}

            <div className={`grid gap-3 ${
              results.length === 1 ? 'grid-cols-1 max-w-[150px] mx-auto'
              : results.length <= 3 ? 'grid-cols-3'
              : 'grid-cols-3 sm:grid-cols-5'
            }`}>
              {results.map((r, i) => (
                <FlipCard key={i} result={r} revealed={revealed} delay={i * 180} />
              ))}
            </div>

            {revealed && (
              <div className="border-t border-[#2e2318] pt-4 space-y-2">
                <div className="flex gap-4 text-sm flex-wrap">
                  {results.filter(r => r.isLastOne).length > 0 && (
                    <span className="text-orange-400 font-medium flex items-center gap-1">
                      <Trophy size={13} /> Last One {results.filter(r => r.isLastOne).length}개
                    </span>
                  )}
                  {results.filter(r => r.grade === 3 && !r.isLastOne).length > 0 && (
                    <span className="text-yellow-300">★★★ {results.filter(r => r.grade === 3 && !r.isLastOne).length}개</span>
                  )}
                  {results.filter(r => r.grade === 2).length > 0 && (
                    <span className="text-purple-300">★★ {results.filter(r => r.grade === 2).length}개</span>
                  )}
                  <span className="text-[#5a4830]">★ {results.filter(r => r.grade === 1).length}개</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {results.map((r, i) => (
                    <span key={i} className={`text-xs px-2 py-0.5 rounded border ${
                      r.isLastOne ? 'border-orange-400/50 bg-orange-400/10 text-orange-300'
                      : r.grade === 3 ? 'border-yellow-400/40 bg-yellow-400/10 text-yellow-300'
                      : r.grade === 2 ? 'border-purple-400/40 bg-purple-400/10 text-purple-300'
                      : 'border-[#2e2318] text-[#5a4830]'
                    }`}>
                      {r.card.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tabs: card list & history */}
        <div className="bg-[#1a1410] border border-[#2e2318] rounded-xl overflow-hidden">
          <div className="flex border-b border-[#2e2318]">
            <button
              onClick={() => setActiveTab('items')}
              className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-medium transition-colors ${
                activeTab === 'items'
                  ? 'text-[#f5ead8] border-b-2 border-pink-500 -mb-px'
                  : 'text-[#5a4830] hover:text-[#8a7055]'
              }`}
            >
              <BarChart2 size={15} /> 수록 카드 &amp; 확률
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-medium transition-colors ${
                activeTab === 'history'
                  ? 'text-[#f5ead8] border-b-2 border-pink-500 -mb-px'
                  : 'text-[#5a4830] hover:text-[#8a7055]'
              }`}
            >
              <History size={15} /> 최근 뽑기
            </button>
          </div>

          {activeTab === 'items' && (
            <>
              {items.length === 0 ? (
                <p className="p-8 text-center text-[#5a4830] text-sm">수록 카드가 없습니다.</p>
              ) : (
                <div className="divide-y divide-[#2e2318]">
                  {items.map(item => (
                    <div key={item.id} className={`flex items-center gap-3 px-4 py-3 hover:bg-[#1a1208] transition-colors ${item.isLastOne ? 'bg-orange-500/5' : ''}`}>
                      <div className="relative w-9 h-12 shrink-0 rounded overflow-hidden bg-[#1a1208]">
                        {item.card.imageUrl ? (
                          <Image src={item.card.imageUrl} alt={item.card.name} fill className="object-cover" />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center text-sm">🃏</div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-medium truncate text-[#f5ead8]">{item.card.name}</p>
                          {item.isLastOne && (
                            <span className="text-[10px] bg-orange-500/20 text-orange-300 border border-orange-500/40 px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0">
                              <Trophy size={8} /> Last One
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#5a4830]">{item.card.setName} · {item.card.rarity}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <Badge variant={item.grade === 3 ? 'yellow' : item.grade === 2 ? 'indigo' : 'default'}>
                          {item.grade === 3 ? '★★★' : item.grade === 2 ? '★★' : '★'}
                        </Badge>
                        <div className="text-right min-w-[52px]">
                          <p className="text-xs font-semibold text-[#f5ead8]">{(item.probability * 100).toFixed(2)}%</p>
                          <p className="text-[10px] text-[#5a4830]">{item.quantity}장</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {items.some(i => i.isLastOne) && (
                <div className="px-4 py-3 border-t border-[#2e2318] bg-orange-500/5 flex items-center gap-2 text-xs text-orange-300">
                  <Trophy size={12} />
                  Last One 보장: {items.filter(i => i.isLastOne).map(i => i.card.name).join(', ')} — 마지막 슬롯에서 확정 획득
                </div>
              )}
            </>
          )}

          {activeTab === 'history' && (
            <div className="divide-y divide-[#2e2318]">
              {!history || history.length === 0 ? (
                <p className="p-8 text-center text-[#5a4830] text-sm">아직 뽑기 기록이 없습니다.</p>
              ) : (history ?? []).map(purchase => {
                const safeResults = Array.isArray(purchase.results) ? purchase.results : []
                const topResult = safeResults.length > 0
                  ? [...safeResults].sort((a, b) => (b.isLastOne ? 1 : 0) - (a.isLastOne ? 1 : 0) || b.grade - a.grade)[0]
                  : null
                const hasLastOne = safeResults.some(r => r.isLastOne)

                return (
                  <div key={purchase.id} className="px-4 py-4 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {topResult?.card.imageUrl ? (
                          <div className="relative w-7 h-9 rounded overflow-hidden bg-[#1a1208] shrink-0">
                            <Image src={topResult.card.imageUrl} alt={topResult.card.name} fill className="object-cover" />
                          </div>
                        ) : (
                          <span className="text-lg">🃏</span>
                        )}
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium text-[#f5ead8]">{purchase.user.nickname}</span>
                            <span className="text-xs text-[#5a4830]">{purchase.draws}회 뽑기</span>
                            {hasLastOne && (
                              <span className="text-[10px] text-orange-400 flex items-center gap-0.5 font-medium">
                                <Trophy size={9} /> Last One!
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-[#5a4830]">
                            {formatDistanceToNow(new Date(purchase.createdAt), { addSuffix: true, locale: ko })}
                            {' · '}
                            <span className="text-[#f0a832] font-bold tabular-nums">{purchase.totalPaid.toLocaleString()}P</span>
                          </p>
                        </div>
                      </div>
                    </div>

                    {safeResults.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {safeResults.map((r, i) => (
                          <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded border ${
                            r.isLastOne ? 'border-orange-400/50 bg-orange-400/10 text-orange-300'
                            : r.grade === 3 ? 'border-yellow-400/40 bg-yellow-400/10 text-yellow-300'
                            : r.grade === 2 ? 'border-purple-400/40 bg-purple-400/10 text-purple-300'
                            : 'border-[#2e2318] text-[#5a4830]'
                          }`}>
                            {r.card.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

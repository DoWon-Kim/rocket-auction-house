'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import Link from 'next/link'
import { useMutation } from '@tanstack/react-query'
import { Coins, Crown, Sparkles, X, RotateCw, Archive, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { sounds } from '@/lib/sounds'
import { type DrawResult, gradeOf, LAST_ONE } from '@/lib/oripa'

type Phase = 'charge' | 'deal' | 'summary'
const isBig = (r: DrawResult) => r.grade >= 4 || r.isLastOne

function Confetti({ colors }: { colors: string[] }) {
  const [pieces] = useState(() => Array.from({ length: 70 }, (_, i) => ({
    left: Math.random() * 100, delay: Math.random() * 0.6, dur: 2.4 + Math.random() * 1.8,
    dx: (Math.random() - 0.5) * 240, rot: 360 + Math.random() * 720, w: 6 + Math.random() * 6, color: colors[i % colors.length],
  })))
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((p, i) => (
        <span key={i} className="absolute top-0 rounded-[2px]"
          style={{ left: `${p.left}%`, width: p.w, height: p.w * 0.45, background: p.color, animation: `oripa-confetti ${p.dur}s cubic-bezier(.2,.6,.4,1) ${p.delay}s both`, ['--dx' as string]: `${p.dx}px`, ['--rot' as string]: `${p.rot}deg` }} />
      ))}
    </div>
  )
}

function Face({ r, size }: { r: DrawResult; size: 'sm' | 'lg' }) {
  const g = gradeOf(r.grade)
  return (
    <div className={`absolute inset-0 [backface-visibility:hidden] rounded-2xl overflow-hidden bg-gradient-to-br from-[#1b1630] to-[#0b0914] ring-2 ${r.isLastOne ? 'ring-emerald-300' : g.ring} ${g.glow}`}>
      {r.prizeType === 'POINT'
        ? <div className="absolute inset-0 flex flex-col items-center justify-center text-amber-200"><Coins size={size === 'lg' ? 64 : 34} /><span className={`${size === 'lg' ? 'text-2xl' : 'text-sm'} font-black mt-1 tabular-nums`}>{(r.pointAmount ?? 0).toLocaleString()}P</span></div>
        : r.card?.imageUrl && <Image src={r.card.imageUrl} alt={r.name} fill sizes={size === 'lg' ? '320px' : '160px'} className="object-contain p-1.5" />}
      {r.grade >= 3 && <span className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/25 to-transparent" style={{ animation: 'shimmer 1.6s ease-in-out 0.2s both' }} />}
      <span className={`absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md text-[10px] font-extrabold ${r.isLastOne ? LAST_ONE.chip : g.chip}`}>{r.isLastOne ? '라스트원' : g.short}</span>
    </div>
  )
}

function Back({ r }: { r: DrawResult }) {
  // 뒷면 테두리로 등급 암시 (상위상 이상만 빛남 — 두근두근 연출)
  const hint = r.isLastOne ? 'from-emerald-300 via-amber-300 to-emerald-400 animate-oripa-hue' : r.grade >= 4 ? 'from-amber-300 via-rose-400 to-fuchsia-500 animate-oripa-hue' : r.grade === 3 ? 'from-fuchsia-500 to-violet-500' : 'from-white/10 to-white/5'
  return (
    <div className={`absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] rounded-2xl p-[2px] bg-gradient-to-br ${hint}`}>
      <div className="w-full h-full rounded-[14px] bg-[radial-gradient(circle_at_50%_30%,#2a1f4d,#0b0914_70%)] flex flex-col items-center justify-center">
        <Sparkles className="text-white/50" size={22} />
        <span className="mt-1 text-[10px] font-black tracking-[0.2em] text-white/50">ROCKET</span>
      </div>
    </div>
  )
}

export function DrawStage({ results, cover, onClose, onAgain, againLabel, canAgain }: {
  results: DrawResult[]; cover: string | null; onClose: () => void; onAgain: () => void; againLabel: string; canAgain: boolean
}) {
  const [phase, setPhase] = useState<Phase>('charge')
  const [flipped, setFlipped] = useState<boolean[]>(() => results.map(() => false))
  const [spot, setSpot] = useState<DrawResult | null>(null)
  const best = useMemo(() => results.reduce((a, r) => (r.isLastOne ? 5 : r.grade) > a ? (r.isLastOne ? 5 : r.grade) : a, 0), [results])
  const chargeColor = best === 5 ? '#34d399' : best >= 4 ? '#fbbf24' : best === 3 ? '#d946ef' : '#60a5fa'

  // 처음 한 번: 충전 연출 뒤 카드 펼치기 (대박이면 조금 더 뜸 들이기)
  useEffect(() => {
    sounds?.packOpen()
    const t = setTimeout(() => setPhase(p => (p === 'charge' ? 'deal' : p)), best >= 4 ? 2200 : 1400)
    document.body.style.overflow = 'hidden'
    return () => { clearTimeout(t); document.body.style.overflow = '' }
  }, [best])

  useEffect(() => {
    if (phase !== 'summary') return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, onClose])

  function flip(i: number) {
    if (flipped[i]) return
    const next = [...flipped]; next[i] = true; setFlipped(next)
    sounds?.cardFlip()
    if (isBig(results[i])) setTimeout(() => { setSpot(results[i]); sounds?.spotlightReveal(results[i].isLastOne) }, 450)
    if (next.every(Boolean)) setTimeout(() => { sounds?.allReveal(); if (!isBig(results[i])) setPhase('summary') }, 700)
  }
  function flipAll() {
    const bigOne = results.find((r, i) => !flipped[i] && isBig(r))
    setFlipped(results.map(() => true))
    sounds?.allReveal()
    if (bigOne) setTimeout(() => { setSpot(bigOne); sounds?.spotlightReveal(bigOne.isLastOne) }, 600)
    else setTimeout(() => setPhase('summary'), 900)
  }
  function closeSpot() { setSpot(null); if (flipped.every(Boolean)) setPhase('summary') }

  const one = results.length === 1
  return createPortal(
    <div className="fixed inset-0 z-[150] bg-[#07060d]/95 backdrop-blur-md flex flex-col items-center justify-center overflow-y-auto" role="dialog" aria-modal="true" aria-label="오리파 뽑기">
      {/* 충전: 팩이 떨리며 빛이 차오름 — 색으로 최고 등급을 살짝 암시 */}
      {phase === 'charge' && (
        <div className="relative flex flex-col items-center gap-6">
          <div className="absolute w-[420px] h-[420px] rounded-full blur-3xl opacity-60 animate-oripa-glow" style={{ background: chargeColor }} />
          <div className="absolute w-[520px] h-[520px] opacity-30 animate-oripa-rays" style={{ background: `conic-gradient(from 0deg, transparent, ${chargeColor}, transparent 25%, transparent 50%, ${chargeColor}, transparent 75%)`, borderRadius: '50%' }} />
          <div className="relative w-44 h-60 rounded-3xl overflow-hidden border-2 border-white/30 bg-gradient-to-br from-[#2a1f4d] to-[#0b0914] animate-oripa-charge shadow-2xl">
            {cover ? <Image src={cover} alt="" fill sizes="176px" className="object-contain p-3" /> : <Sparkles className="m-auto mt-24 text-white/60" size={40} />}
          </div>
          <p className="relative text-white/80 font-bold tracking-widest text-sm">{best >= 4 ? '…!?' : '두근두근'}</p>
        </div>
      )}

      {/* 카드 펼치기 */}
      {phase !== 'charge' && (
        <div className="w-full max-w-5xl px-4 py-10 flex flex-col items-center gap-6">
          <div className={`grid gap-3 sm:gap-4 ${one ? 'grid-cols-1' : results.length <= 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3 sm:grid-cols-5'}`}>
            {results.map((r, i) => (
              <button key={i} onClick={() => flip(i)} aria-label={flipped[i] ? r.name : `${i + 1}번째 카드 열기`}
                className={`relative ${one ? 'w-56 h-80 sm:w-64 sm:h-[22rem]' : 'w-24 h-32 sm:w-32 sm:h-44'} [perspective:900px] animate-oripa-deal`} style={{ animationDelay: `${i * 70}ms` }}>
                <span className={`absolute inset-0 transition-transform duration-500 [transform-style:preserve-3d] ${flipped[i] ? '' : '[transform:rotateY(180deg)]'}`}>
                  <Face r={r} size={one ? 'lg' : 'sm'} />
                  <Back r={r} />
                </span>
                {flipped[i] && r.ticketNo && <span className="absolute -bottom-5 inset-x-0 text-center text-[10px] text-white/40 tabular-nums">#{r.ticketNo}</span>}
              </button>
            ))}
          </div>
          {phase === 'deal' && !flipped.every(Boolean) && (
            <div className="flex items-center gap-3 pt-4">
              <p className="text-white/50 text-sm">카드를 눌러 한 장씩 열어보세요</p>
              {results.length > 1 && <button onClick={flipAll} className="h-10 px-5 rounded-full bg-white text-black text-sm font-bold">모두 열기</button>}
            </div>
          )}
          {phase === 'summary' && <Summary results={results} onClose={onClose} onAgain={onAgain} againLabel={againLabel} canAgain={canAgain} />}
        </div>
      )}

      {/* 대박 스포트라이트 */}
      {spot && (
        <div className="fixed inset-0 z-[160] bg-black/90 flex flex-col items-center justify-center" onClick={closeSpot}>
          <div className="absolute w-[700px] h-[700px] opacity-40 animate-oripa-rays rounded-full" style={{ background: `conic-gradient(from 0deg, transparent, ${spot.isLastOne ? LAST_ONE.hex : '#fbbf24'}, transparent 12%, transparent 25%, #f472b6, transparent 37%, transparent 50%, ${spot.isLastOne ? LAST_ONE.hex : '#fbbf24'}, transparent 62%, transparent 75%, #a78bfa, transparent 87%)` }} />
          <Confetti colors={['#fbbf24', '#f472b6', '#a78bfa', '#34d399', '#60a5fa', '#ffffff']} />
          <p className="relative text-sm font-black tracking-[0.3em] text-amber-200 animate-oripa-text-pop">{spot.isLastOne ? 'LAST ONE' : 'JACKPOT'}</p>
          <p className="relative mt-2 text-3xl sm:text-5xl font-black bg-gradient-to-r from-amber-200 via-rose-300 to-fuchsia-300 bg-clip-text text-transparent animate-oripa-text-pop">{spot.isLastOne ? '라스트원상 획득!' : `${gradeOf(spot.grade).label} 당첨!`}</p>
          <div className="relative mt-6 w-64 h-[22rem] sm:w-72 sm:h-96 animate-oripa-zoom-in"><Face r={spot} size="lg" /></div>
          <p className="relative mt-5 text-lg font-bold text-white text-center px-6">{spot.name}</p>
          <p className="relative mt-6 text-xs text-white/40">화면을 누르면 계속</p>
        </div>
      )}

      {phase === 'summary' && <button onClick={onClose} aria-label="닫기" className="fixed top-4 right-4 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20"><X size={20} /></button>}
    </div>,
    document.body,
  )
}

// 결과 요약: 포인트 합계 · 카드 포인트 교환 · 한 번 더
function Summary({ results, onClose, onAgain, againLabel, canAgain }: { results: DrawResult[]; onClose: () => void; onAgain: () => void; againLabel: string; canAgain: boolean }) {
  const exchangeable = results.filter(r => r.prizeType === 'CARD' && r.exchangeValue && r.inventoryItemId)
  const [picked, setPicked] = useState<Set<string>>(() => new Set(exchangeable.filter(r => r.grade <= 1).map(r => r.inventoryItemId!)))
  const [done, setDone] = useState<Set<string>>(new Set())
  const [msg, setMsg] = useState('')
  const points = results.filter(r => r.prizeType === 'POINT').reduce((s, r) => s + (r.pointAmount ?? 0), 0)
  const pickedTotal = exchangeable.filter(r => picked.has(r.inventoryItemId!) && !done.has(r.inventoryItemId!)).reduce((s, r) => s + (r.exchangeValue ?? 0), 0)
  const exchange = useMutation({
    mutationFn: () => api.post<{ message: string; balance: number }>('/my/inventory/exchange', { ids: [...picked].filter(id => !done.has(id)) }).then(r => r.data),
    onSuccess: d => {
      setDone(prev => new Set([...prev, ...picked])); setMsg(d.message)
      useAuthStore.setState(s => (s.user ? { user: { ...s.user, balance: d.balance } } : s))
    },
    onError: (e: unknown) => setMsg((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? '교환에 실패했어요.'),
  })
  const sorted = [...results].sort((a, b) => (b.isLastOne ? 5 : b.grade) - (a.isLastOne ? 5 : a.grade))

  return (
    <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-white/[0.04] p-5 space-y-4 animate-oripa-deal">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-black text-white">뽑기 결과 {results.length}장</h2>
        {points > 0 && <span className="px-3 py-1 rounded-full bg-amber-400/15 text-amber-200 text-sm font-bold tabular-nums">+{points.toLocaleString()}P 지급</span>}
      </div>
      <ul className="divide-y divide-white/5 max-h-72 overflow-y-auto">
        {sorted.map((r, i) => {
          const g = gradeOf(r.grade)
          const id = r.inventoryItemId
          return (
            <li key={i} className="flex items-center gap-3 py-2">
              <span className={`w-12 shrink-0 text-center px-1.5 py-0.5 rounded-md text-[10px] font-extrabold ${r.isLastOne ? LAST_ONE.chip : g.chip}`}>{r.isLastOne ? <Crown size={11} className="inline" /> : g.short}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm text-white truncate">{r.name}</span>
                <span className="block text-[11px] text-white/40">{r.isLastOne ? '라스트원상' : `#${r.ticketNo} · ${g.label}`}{r.prizeType === 'POINT' ? ' · 포인트 지급 완료' : ' · 보관함에 저장됨'}</span>
              </span>
              {r.prizeType === 'CARD' && r.exchangeValue && id && (
                done.has(id)
                  ? <span className="text-xs text-emerald-300 tabular-nums">{r.exchangeValue.toLocaleString()}P 교환됨</span>
                  : <label className="flex items-center gap-1.5 text-xs text-white/70 cursor-pointer tabular-nums">
                      <input type="checkbox" checked={picked.has(id)} onChange={e => setPicked(p => { const n = new Set(p); if (e.target.checked) n.add(id); else n.delete(id); return n })} />
                      {r.exchangeValue.toLocaleString()}P로 교환
                    </label>
              )}
            </li>
          )
        })}
      </ul>
      {msg && <p className="text-xs text-emerald-300">{msg}</p>}
      <div className="flex flex-wrap gap-2 justify-end">
        {exchangeable.length > 0 && (
          <button onClick={() => exchange.mutate()} disabled={pickedTotal === 0 || exchange.isPending} className="h-11 px-4 rounded-xl border border-amber-300/40 text-amber-200 text-sm font-bold disabled:opacity-40 inline-flex items-center gap-1.5">
            {exchange.isPending ? <Loader2 size={15} className="animate-spin" /> : <Coins size={15} />}선택 카드 {pickedTotal.toLocaleString()}P로 교환
          </button>
        )}
        <Link href="/my?tab=inventory" onClick={onClose} className="h-11 px-4 rounded-xl border border-white/15 text-white/80 text-sm font-bold inline-flex items-center gap-1.5 hover:text-white"><Archive size={15} />보관함</Link>
        <button onClick={onAgain} disabled={!canAgain} className="h-11 px-5 rounded-xl bg-gradient-to-r from-amber-400 via-rose-500 to-fuchsia-500 text-white text-sm font-black disabled:opacity-40 inline-flex items-center gap-1.5"><RotateCw size={15} />{againLabel}</button>
      </div>
    </div>
  )
}

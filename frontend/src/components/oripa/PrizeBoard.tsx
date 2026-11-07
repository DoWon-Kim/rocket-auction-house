'use client'

import Image from 'next/image'
import { Crown, Coins } from 'lucide-react'
import { type OripaPrize, GRADE, gradeOf, prizeName, LAST_ONE } from '@/lib/oripa'

function PrizeTile({ p, big, flash }: { p: OripaPrize; big?: boolean; flash?: boolean }) {
  const g = gradeOf(p.grade)
  const gone = p.remaining === 0
  const pct = p.quantity ? (p.remaining / p.quantity) * 100 : 0
  return (
    <div className={`relative rounded-2xl border border-white/10 bg-white/[0.03] p-2.5 transition-all ${gone ? 'opacity-35 grayscale' : ''} ${flash ? 'ring-2 ring-amber-300 scale-[1.02]' : ''}`}>
      <div className={`relative ${big ? 'aspect-[3/4]' : 'aspect-square'} rounded-xl overflow-hidden bg-gradient-to-br from-white/10 to-transparent ring-1 ${g.ring}`}>
        {p.prizeType === 'POINT'
          ? <div className="absolute inset-0 flex flex-col items-center justify-center text-amber-200"><Coins size={big ? 44 : 28} /><span className="text-sm font-extrabold mt-1 tabular-nums">{(p.pointAmount ?? 0).toLocaleString()}P</span></div>
          : p.card?.imageUrl ? <Image src={p.card.imageUrl} alt="" fill sizes={big ? '260px' : '140px'} className="object-contain p-1.5" /> : null}
        {gone && <span className="absolute inset-0 flex items-center justify-center"><span className="px-2 py-1 rounded-md bg-black/80 text-xs font-bold text-white rotate-[-10deg]">당첨 완료</span></span>}
      </div>
      <p className="mt-2 text-xs font-semibold text-white/90 line-clamp-2 min-h-[2rem]">{prizeName(p)}</p>
      <div className="mt-1 flex items-center justify-between text-[11px] tabular-nums">
        <span className={gone ? 'text-white/40' : g.text}>남은 {p.remaining}</span>
        <span className="text-white/40">/ {p.quantity}</span>
      </div>
      <div className="mt-1 h-1 rounded-full bg-white/10 overflow-hidden"><div className={`h-full bg-gradient-to-r ${g.bar}`} style={{ width: `${pct}%` }} /></div>
    </div>
  )
}

// 등급별 상품판: 남은 수가 실시간으로 줄어든다
export function PrizeBoard({ items, remainSlots, flashIds }: { items: OripaPrize[]; remainSlots: number; flashIds?: Set<string> }) {
  const lastOne = items.find(i => i.isLastOne)
  const grades = [4, 3, 2, 1].map(g => ({ g, list: items.filter(i => !i.isLastOne && i.grade === g) })).filter(x => x.list.length)

  return (
    <div className="space-y-6">
      {lastOne && (
        <div className="relative overflow-hidden rounded-3xl border border-emerald-300/30 bg-gradient-to-r from-emerald-500/15 via-teal-500/10 to-transparent p-4 flex items-center gap-4">
          <div className="w-24 shrink-0"><PrizeTile p={lastOne} big flash={flashIds?.has(lastOne.id)} /></div>
          <div className="min-w-0">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-extrabold ${LAST_ONE.chip}`}><Crown size={12} />라스트원상</span>
            <p className="mt-1.5 font-bold text-white">{prizeName(lastOne)}</p>
            <p className="text-xs text-white/60 mt-0.5">마지막 1장을 뽑는 분에게 뽑은 상품과 <b className="text-emerald-200">별도로</b> 추가 지급돼요.{lastOne.remaining > 0 && ` 남은 티켓 ${remainSlots.toLocaleString()}장!`}</p>
          </div>
        </div>
      )}
      {grades.map(({ g, list }) => {
        const meta = GRADE[g as 1 | 2 | 3 | 4]
        const left = list.reduce((s, i) => s + i.remaining, 0)
        const total = list.reduce((s, i) => s + i.quantity, 0)
        return (
          <section key={g} className="space-y-2.5">
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-md text-[11px] font-extrabold ${meta.chip}`}>{meta.label}</span>
              <span className="text-xs text-white/60 tabular-nums">남은 {left} / {total}</span>
              {remainSlots > 0 && left > 0 && <span className="ml-auto text-[11px] text-white/40 tabular-nums">지금 1장 뽑으면 {((left / remainSlots) * 100).toFixed(left / remainSlots < 0.01 ? 2 : 1)}%</span>}
            </div>
            <div className={`grid gap-2.5 ${g >= 3 ? 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-5' : 'grid-cols-3 sm:grid-cols-5 lg:grid-cols-7'}`}>
              {list.map(p => <PrizeTile key={p.id} p={p} big={g >= 3} flash={flashIds?.has(p.id)} />)}
            </div>
          </section>
        )
      })}
    </div>
  )
}

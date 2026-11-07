'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Crown, Flame, Ticket } from 'lucide-react'
import { type OripaSummary, gradeOf, prizeName, LAST_ONE } from '@/lib/oripa'

// 오리파 목록 카드: 대표 상품 · 진행률 · 남은 티켓 · 가격
export function OripaCard({ o }: { o: OripaSummary }) {
  const sold = o.totalSlots - o.remainSlots
  const pct = o.totalSlots ? Math.round((sold / o.totalSlots) * 100) : 0
  const soldOut = o.status === 'SOLD_OUT'
  const hot = !soldOut && o.remainSlots / o.totalSlots <= 0.1
  const top = [...o.items].filter(i => !i.isLastOne).sort((a, b) => b.grade - a.grade)
  const hero = top[0]
  const lastOne = o.items.find(i => i.isLastOne)
  const cover = o.imageUrl ?? hero?.card?.imageUrl ?? null

  return (
    <Link href={`/oripas/${o.id}`} className="group relative block rounded-3xl overflow-hidden border border-white/10 bg-[#0d0b16] hover:border-amber-300/40 transition-colors">
      <div className="relative aspect-[4/3] overflow-hidden">
        {/* 배경: 대표 이미지 + 네온 그라데이션 */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(251,191,36,0.25),transparent_55%),radial-gradient(circle_at_80%_80%,rgba(217,70,239,0.3),transparent_55%)]" />
        {cover && <Image src={cover} alt="" fill sizes="(max-width:640px) 100vw, 33vw" className={`object-contain p-6 drop-shadow-[0_20px_40px_rgba(0,0,0,0.6)] group-hover:scale-105 transition-transform duration-500 ${soldOut ? 'grayscale opacity-60' : ''}`} />}
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#0d0b16] to-transparent" />

        <div className="absolute top-3 left-3 flex gap-1.5">
          {soldOut ? <span className="px-2.5 py-1 rounded-full bg-black/70 text-xs font-bold text-white/90 border border-white/20">완판</span>
            : o.status === 'PAUSED' ? <span className="px-2.5 py-1 rounded-full bg-black/70 text-xs font-bold text-amber-200">일시중지</span>
            : hot ? <span className="px-2.5 py-1 rounded-full bg-rose-500 text-xs font-bold text-white inline-flex items-center gap-1 animate-pulse"><Flame size={12} />마감 임박</span>
            : <span className="px-2.5 py-1 rounded-full bg-emerald-500/90 text-xs font-bold text-white">판매중</span>}
        </div>
        {lastOne && (
          <span className={`absolute top-3 right-3 px-2 py-1 rounded-full text-[10px] font-bold inline-flex items-center gap-1 ${LAST_ONE.chip}`}><Crown size={11} />라스트원</span>
        )}
        {hero && (
          <span className={`absolute bottom-3 left-3 px-2 py-0.5 rounded-md text-[10px] font-extrabold ${gradeOf(hero.grade).chip}`}>
            {gradeOf(hero.grade).label} · {prizeName(hero)}
          </span>
        )}
      </div>

      <div className="px-4 pb-4 pt-1 space-y-2.5">
        <h3 className="font-bold text-white truncate group-hover:text-amber-100">{o.title}</h3>
        <div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div className={`h-full rounded-full bg-gradient-to-r ${soldOut ? 'from-slate-500 to-slate-400' : 'from-amber-400 via-rose-500 to-fuchsia-500'}`} style={{ width: `${pct}%` }} />
          </div>
          <div className="flex justify-between text-[11px] mt-1 text-white/60 tabular-nums">
            <span>{pct}% 판매</span>
            <span>남은 {o.remainSlots.toLocaleString()} / {o.totalSlots.toLocaleString()}</span>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-lg font-extrabold text-white tabular-nums">{o.pricePerDraw.toLocaleString()}<span className="text-xs font-semibold text-white/60 ml-0.5">P / 1회</span></span>
          <span className="flex -space-x-2">
            {top.slice(0, 4).map(p => (
              <span key={p.id} className={`relative w-8 h-8 rounded-lg overflow-hidden border-2 border-[#0d0b16] bg-white/5 ${p.remaining === 0 ? 'opacity-30' : ''}`} title={`${gradeOf(p.grade).label} ${prizeName(p)}`}>
                {p.card?.imageUrl ? <Image src={p.card.imageUrl} alt="" fill sizes="32px" className="object-cover" /> : <Ticket size={14} className="m-auto mt-2 text-white/50" />}
              </span>
            ))}
          </span>
        </div>
      </div>
    </Link>
  )
}

'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Sparkles, ShieldCheck, Ticket, Crown } from 'lucide-react'
import { api } from '@/lib/api'
import type { OripaSummary } from '@/lib/oripa'
import { OripaCard } from '@/components/oripa/OripaCard'
import { HitTicker } from '@/components/oripa/HitTicker'

export default function OripasPage() {
  const [tab, setTab] = useState<'live' | 'soldout'>('live')
  const { data, isLoading } = useQuery<OripaSummary[]>({ queryKey: ['oripas', tab], queryFn: () => api.get('/oripas', { params: { status: tab } }).then(r => r.data), refetchInterval: 30_000 })

  return (
    <div className="space-y-6">
      {/* 히어로 */}
      <section className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#0b0914] px-6 sm:px-10 py-10 sm:py-14">
        <div className="absolute -top-24 -left-20 w-96 h-96 rounded-full bg-amber-500/20 blur-3xl" />
        <div className="absolute -bottom-32 right-0 w-[28rem] h-[28rem] rounded-full bg-fuchsia-600/25 blur-3xl" />
        <div className="absolute inset-0 opacity-[0.07] bg-[conic-gradient(from_0deg,transparent,white,transparent_30%)] animate-oripa-rays" />
        <div className="relative max-w-2xl space-y-4">
          <p className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-xs font-semibold text-amber-200"><Sparkles size={13} />ROCKET ORIPA</p>
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white leading-[1.1]">
            한 장의 티켓으로<br /><span className="bg-gradient-to-r from-amber-300 via-rose-400 to-fuchsia-400 bg-clip-text text-transparent">레전드 카드</span>를 뽑아보세요
          </h1>
          <p className="text-white/60 text-sm sm:text-base">정해진 수의 티켓 중에서 1장씩 꺼내는 진짜 오리파. 남은 상품이 실시간으로 보이고, 완판되면 추첨 순서를 공개해 누구나 검증할 수 있어요.</p>
          <div className="flex flex-wrap gap-2 pt-1 text-xs text-white/70">
            <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/5 border border-white/10"><Ticket size={13} />남은 티켓·상품 실시간 공개</span>
            <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/5 border border-white/10"><Crown size={13} />마지막 1장엔 라스트원상</span>
            <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/5 border border-white/10"><ShieldCheck size={13} />공정성 검증</span>
          </div>
        </div>
      </section>

      <HitTicker />

      <div className="flex items-center gap-2">
        {([['live', '판매중'], ['soldout', '완판']] as const).map(([v, label]) => (
          <button key={v} onClick={() => setTab(v)} className={`h-9 px-4 rounded-full text-sm font-semibold ${tab === v ? 'bg-white text-black' : 'bg-white/5 text-white/70 hover:text-white'}`}>{label}</button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="aspect-[4/5] rounded-3xl bg-surface animate-pulse" />)}</div>
      ) : !data?.length ? (
        <div className="text-center py-24 text-white/50">
          <Ticket size={40} className="mx-auto mb-3 opacity-40" />
          {tab === 'live' ? '지금 판매 중인 오리파가 없어요. 곧 새로운 오리파가 열려요!' : '아직 완판된 오리파가 없어요.'}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">{data.map(o => <OripaCard key={o.id} o={o} />)}</div>
      )}
    </div>
  )
}

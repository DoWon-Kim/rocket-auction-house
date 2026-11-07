'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Trophy } from 'lucide-react'
import { api } from '@/lib/api'
import { connectSocket } from '@/lib/socket'
import { useAuthStore } from '@/lib/store'
import { gradeOf } from '@/lib/oripa'
import { timeAgo } from '@/lib/market'

interface Hit { at: string; nickname: string; oripaId: string; oripaTitle: string; grade: number; isLastOne: boolean; name: string }

// 전체 오리파 대박 당첨 전광판 (새 당첨은 실시간으로 앞에 붙음)
export function HitTicker() {
  const user = useAuthStore(s => s.user)
  const { data } = useQuery<Hit[]>({ queryKey: ['oripa-hits'], queryFn: () => api.get('/oripas/recent-hits').then(r => r.data), refetchInterval: 60_000 })
  const [live, setLive] = useState<Hit[]>([])

  useEffect(() => {
    if (!user) return
    const s = connectSocket()
    const on = (e: { oripaId: string; oripaTitle: string; nickname: string; at: string; hits: Array<{ grade: number; isLastOne: boolean; name: string }> }) =>
      setLive(prev => [...e.hits.map(h => ({ ...h, at: e.at, nickname: e.nickname, oripaId: e.oripaId, oripaTitle: e.oripaTitle })), ...prev].slice(0, 10))
    s.on('oripa:hit', on)
    return () => { s.off('oripa:hit', on) }
  }, [user])

  const hits = [...live, ...(data ?? [])].slice(0, 20)
  if (hits.length === 0) return null
  const row = hits.map((h, i) => (
    <Link key={i} href={`/oripas/${h.oripaId}`} className="shrink-0 inline-flex items-center gap-2 px-4 text-sm text-white/80 hover:text-white">
      <span className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold ${h.isLastOne ? 'bg-emerald-500 text-white' : gradeOf(h.grade).chip}`}>{h.isLastOne ? '라스트원' : gradeOf(h.grade).label}</span>
      <b className="text-white">{h.nickname}</b>님이 <span className="text-amber-200">{h.name}</span> 당첨! <span className="text-white/40 text-xs">{h.oripaTitle} · {timeAgo(h.at)}</span>
    </Link>
  ))

  return (
    <div className="relative flex items-center gap-3 rounded-2xl border border-amber-300/20 bg-gradient-to-r from-amber-500/10 via-fuchsia-500/10 to-transparent overflow-hidden h-11">
      <span className="shrink-0 pl-4 pr-2 inline-flex items-center gap-1.5 text-xs font-bold text-amber-200 z-10"><Trophy size={14} />대박 당첨</span>
      <div className="flex-1 overflow-hidden">
        {/* 같은 줄을 두 번 이어 붙여 끊김 없이 흐르게 */}
        <div className="flex w-max animate-oripa-ticker hover:[animation-play-state:paused]">{row}{row}</div>
      </div>
    </div>
  )
}

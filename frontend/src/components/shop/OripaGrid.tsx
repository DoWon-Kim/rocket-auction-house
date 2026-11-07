'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Ticket } from 'lucide-react'
import { api } from '@/lib/api'
import type { OripaSummary } from '@/lib/oripa'
import { OripaCard } from '@/components/oripa/OripaCard'

// 샵 > 오리파 탭: 판매 중인 오리파 미리보기 (전체는 /oripas)
export function OripaGrid() {
  const { data, isLoading } = useQuery<OripaSummary[]>({ queryKey: ['oripas', 'live'], queryFn: () => api.get('/oripas', { params: { status: 'live' } }).then(r => r.data), staleTime: 30_000 })
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">정해진 티켓 중 1장씩 꺼내는 오리파 — 남은 상품이 실시간으로 보여요</p>
        <Link href="/oripas" className="text-sm text-accent-fg inline-flex items-center hover:underline">오리파 라운지<ChevronRight size={15} /></Link>
      </div>
      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="aspect-[4/5] rounded-3xl bg-surface animate-pulse" />)}</div>
      ) : !data?.length ? (
        <div className="text-center py-20 text-subtle"><Ticket size={36} className="mx-auto mb-3 opacity-40" />진행 중인 오리파가 없어요.</div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">{data.map(o => <OripaCard key={o.id} o={o} />)}</div>
      )}
    </div>
  )
}

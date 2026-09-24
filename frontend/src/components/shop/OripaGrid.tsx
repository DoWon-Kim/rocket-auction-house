'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Package } from 'lucide-react'
import { api } from '@/lib/api'
import Badge from '@/components/ui/Badge'

// ─── 오리파 탭 ───────────────────────────────────────────────────────────────

interface OripaCardItem {
  id: string
  grade: number
  card: { imageUrl?: string; name: string }
}

interface Oripa {
  id: string; title: string; description?: string; imageUrl?: string
  pricePerDraw: number; totalSlots: number; remainSlots: number
  items: OripaCardItem[]; _count: { purchases: number }
}

function CardCollage({ items }: { items: OripaCardItem[] }) {
  const picks = [...items].sort((a, b) => b.grade - a.grade).filter(i => i.card.imageUrl).slice(0, 4)
  if (picks.length === 0) return <div className="absolute inset-0 flex items-center justify-center"><Package size={48} className="text-pink-400/40" /></div>
  if (picks.length === 1) return <Image src={picks[0].card.imageUrl!} alt={picks[0].card.name} fill sizes="(max-width:640px) 100vw,50vw" className="object-cover opacity-80" />
  return (
    <div className="absolute inset-0 grid grid-cols-2 gap-0.5">
      {picks.map((item, i) => (
        <div key={item.id} className={`relative overflow-hidden ${picks.length === 3 && i === 0 ? 'row-span-2' : ''}`}>
          <Image src={item.card.imageUrl!} alt={item.card.name} fill sizes="25vw" className="object-cover" />
        </div>
      ))}
    </div>
  )
}

export function OripaGrid() {
  const { data: oripas, isLoading } = useQuery({
    queryKey: ['oripas'],
    queryFn: () => api.get('/oripas').then(r => r.data),
    staleTime: 60000,
  })

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">랜덤 뽑기로 레어 TCG 카드를 획득하세요</p>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="bg-surface border border-line rounded-2xl h-56 animate-pulse" />)}
        </div>
      ) : !oripas?.length ? (
        <div className="text-center py-24 text-subtle">
          <p className="text-4xl mb-4">📦</p>
          <p>진행 중인 오리파가 없습니다.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(oripas as Oripa[]).map(oripa => {
            const soldPct = ((oripa.totalSlots - oripa.remainSlots) / oripa.totalSlots) * 100
            const almostGone = oripa.remainSlots > 0 && oripa.remainSlots <= 5
            return (
              <Link key={oripa.id} href={`/oripas/${oripa.id}`} className="group">
                <div className="bg-surface border border-line rounded-2xl overflow-hidden hover:border-pink-500/50 transition-all duration-200 hover:shadow-lg hover:shadow-pink-500/10 card-hover">
                  <div className="relative h-44 bg-surface-2 overflow-hidden">
                    {oripa.imageUrl
                      ? <Image src={oripa.imageUrl} alt={oripa.title} fill className="object-cover group-hover:scale-105 transition-transform duration-300" />
                      : <div className="absolute inset-0 group-hover:scale-105 transition-transform duration-300"><CardCollage items={oripa.items} /></div>}
                    <div className="absolute inset-0 bg-gradient-to-t from-surface/80 via-transparent to-transparent" />
                    <div className="absolute top-2 right-2">
                      {almostGone
                        ? <Badge variant="red">라스트 {oripa.remainSlots}장!</Badge>
                        : oripa.remainSlots === 0
                          ? <Badge variant="default">매진</Badge>
                          : <Badge variant="red">{oripa.remainSlots}/{oripa.totalSlots} 남음</Badge>}
                    </div>
                    <div className="absolute bottom-2 left-3">
                      <span className="text-accent-2 font-bold tabular-nums text-lg drop-shadow">{oripa.pricePerDraw.toLocaleString()}P</span>
                      <span className="text-muted text-xs ml-1">/ 1회</span>
                    </div>
                  </div>
                  <div className="p-4 space-y-2">
                    <h3 className="font-semibold line-clamp-1 text-fg">{oripa.title}</h3>
                    {oripa.description && <p className="text-xs text-muted line-clamp-2">{oripa.description}</p>}
                    <div className="flex items-center justify-between text-xs text-subtle">
                      <span>{oripa._count.purchases}명 참여</span>
                      <span>{Math.round(soldPct)}% 소진</span>
                    </div>
                    <div className="w-full bg-line rounded-full h-1.5">
                      <div className={`h-1.5 rounded-full transition-all ${almostGone ? 'bg-red-500' : 'bg-gradient-to-r from-pink-500 to-purple-500'}`} style={{ width: `${soldPct}%` }} />
                    </div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}


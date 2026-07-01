'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState } from 'react'
import { Layers, Trophy, CheckCircle2, ChevronRight } from 'lucide-react'
import { TCG_LABELS } from '@/lib/utils'

interface SetSummary {
  tcgType: string
  setName: string
  ownedCount: number
  totalCount: number
  percentage: number
}

interface Overall {
  totalSets: number
  completedSets: number
  totalCardsOwned: number
  totalCardsAvailable: number
}

interface CollectionData {
  sets: SetSummary[]
  overall: Overall
}

const TCG_ORDER = ['POKEMON', 'YUGIOH', 'MTG', 'DIGIMON', 'ONEPIECE', 'WEISS', 'OTHER']

export default function CollectionPage() {
  const { user } = useAuthStore()
  const router = useRouter()

  // 모든 훅은 early return 전에 선언 (Rules of Hooks)
  const [activeTcg, setActiveTcg] = useState<string>('ALL')

  const { data, isLoading } = useQuery<CollectionData>({
    queryKey: ['my-collection'],
    queryFn: () => api.get('/my/collection').then(r => r.data),
    enabled: !!user,
  })

  if (!user) { router.replace('/login'); return null }

  const tcgTypes = data
    ? Array.from(new Set(data.sets.map(s => s.tcgType)))
        .sort((a, b) => TCG_ORDER.indexOf(a) - TCG_ORDER.indexOf(b))
    : []

  const filtered = data?.sets.filter(s =>
    activeTcg === 'ALL' || s.tcgType === activeTcg
  ) ?? []

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <Layers size={20} className="text-[#d4a853]" />
        <h1 className="text-xl font-bold text-[#f5ead8]">컬렉션 트래커</h1>
      </div>

      {/* 전체 통계 */}
      {data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: '보유 카드', value: data.overall.totalCardsOwned.toLocaleString(), sub: `/ ${data.overall.totalCardsAvailable.toLocaleString()} 종` },
            { label: '달성률', value: `${data.overall.totalCardsAvailable > 0 ? ((data.overall.totalCardsOwned / data.overall.totalCardsAvailable) * 100).toFixed(1) : 0}%`, sub: '전체 기준' },
            { label: '완성 세트', value: data.overall.completedSets.toString(), sub: `/ ${data.overall.totalSets} 세트` },
            { label: '세트 진행', value: `${data.overall.totalSets > 0 ? Math.round((data.overall.completedSets / data.overall.totalSets) * 100) : 0}%`, sub: '완성 기준' },
          ].map(stat => (
            <div key={stat.label} className="bg-[#1a1410] border border-[#2e2318] rounded-2xl px-4 py-3 text-center">
              <p className="text-[11px] text-[#5a4830] uppercase tracking-wider">{stat.label}</p>
              <p className="text-lg font-bold text-[#d4a853] mt-0.5">{stat.value}</p>
              <p className="text-[11px] text-[#4a3820]">{stat.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* TCG 탭 */}
      {tcgTypes.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setActiveTcg('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
              activeTcg === 'ALL'
                ? 'bg-[#d4a853] text-white'
                : 'bg-[#1a1410] border border-[#2e2318] text-[#7a6040] hover:text-[#d4a853]'
            }`}
          >전체</button>
          {tcgTypes.map(tcg => (
            <button
              key={tcg}
              onClick={() => setActiveTcg(tcg)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                activeTcg === tcg
                  ? 'bg-[#d4a853] text-white'
                  : 'bg-[#1a1410] border border-[#2e2318] text-[#7a6040] hover:text-[#d4a853]'
              }`}
            >
              {TCG_LABELS[tcg] ?? tcg}
            </button>
          ))}
        </div>
      )}

      {/* 세트 목록 */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-16 bg-[#1a1410] rounded-2xl border border-[#2e2318] animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-[#4a3820]">
          <Layers size={40} className="opacity-20" />
          <p className="text-sm">카드를 구매하거나 오리파를 열어 컬렉션을 완성하세요.</p>
          <Link href="/listings" className="text-sm text-[#d4a853] hover:text-[#f0c060]">
            마켓플레이스 둘러보기 →
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(set => {
            const isComplete = set.ownedCount >= set.totalCount && set.totalCount > 0
            const pct = set.percentage

            return (
              <Link
                key={`${set.tcgType}::${set.setName}`}
                href={`/collection/${set.tcgType}/${encodeURIComponent(set.setName)}`}
                className={`group flex items-center gap-4 rounded-2xl border px-4 py-3 transition-all hover:border-[#d4a853]/40 ${
                  isComplete
                    ? 'bg-[#d4a853]/5 border-[#d4a853]/30'
                    : 'bg-[#1a1410] border-[#2e2318]'
                }`}
              >
                {/* 완성 뱃지 */}
                <div className={`shrink-0 ${isComplete ? 'text-[#d4a853]' : 'text-[#2e2318]'}`}>
                  {isComplete ? <Trophy size={18} /> : <CheckCircle2 size={18} />}
                </div>

                {/* 세트 정보 */}
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-[#f5ead8] truncate group-hover:text-[#d4a853] transition-colors">
                      {set.setName}
                    </span>
                    <span className="text-[10px] text-[#5a4830] shrink-0">
                      {TCG_LABELS[set.tcgType] ?? set.tcgType}
                    </span>
                  </div>

                  {/* 프로그레스 바 */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-[#2e2318] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          isComplete ? 'bg-[#d4a853]' : 'bg-[#7a5830]'
                        }`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                    <span className={`text-[11px] font-medium shrink-0 tabular-nums ${
                      isComplete ? 'text-[#d4a853]' : pct > 0 ? 'text-[#7a6040]' : 'text-[#3a2810]'
                    }`}>
                      {set.ownedCount}/{set.totalCount}
                    </span>
                    <span className={`text-[11px] shrink-0 tabular-nums ${isComplete ? 'text-[#d4a853]' : 'text-[#4a3820]'}`}>
                      {pct.toFixed(1)}%
                    </span>
                  </div>
                </div>

                <ChevronRight size={14} className="text-[#3a2810] shrink-0 group-hover:text-[#d4a853] transition-colors" />
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

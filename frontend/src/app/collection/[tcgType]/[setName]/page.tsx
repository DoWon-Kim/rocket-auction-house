'use client'

import { use } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { ChevronLeft, Layers, CheckCircle2, Package } from 'lucide-react'
import { TCG_LABELS } from '@/lib/utils'
import { WishlistButton } from '@/components/WishlistButton'
import { useState } from 'react'

interface CollectionCard {
  id: string
  name: string
  nameKo: string | null
  cardNumber: string | null
  rarity: string
  imageUrl: string | null
  owned: boolean
  quantity: number
}

interface SetData {
  tcgType: string
  setName: string
  cards: CollectionCard[]
  ownedCount: number
  totalCount: number
}

export default function CollectionSetPage({ params }: { params: Promise<{ tcgType: string; setName: string }> }) {
  const { tcgType, setName } = use(params)
  const decodedSetName = decodeURIComponent(setName)
  const { user } = useAuthStore()
  const router = useRouter()

  // 모든 훅은 early return 전에 선언 (Rules of Hooks)
  const [filter, setFilter] = useState<'ALL' | 'OWNED' | 'MISSING'>('ALL')

  const { data, isLoading } = useQuery<SetData>({
    queryKey: ['my-collection-set', tcgType, decodedSetName],
    queryFn: () => api.get(`/my/collection/${tcgType}/${encodeURIComponent(decodedSetName)}`).then(r => r.data),
    enabled: !!user,
  })

  if (!user) { router.replace('/login'); return null }

  const filteredCards = (data?.cards ?? []).filter(c => {
    if (filter === 'OWNED') return c.owned
    if (filter === 'MISSING') return !c.owned
    return true
  })

  const pct = data ? (data.totalCount > 0 ? Math.round((data.ownedCount / data.totalCount) * 10000) / 100 : 0) : 0
  const isComplete = data ? data.ownedCount >= data.totalCount && data.totalCount > 0 : false

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* 뒤로 가기 */}
      <Link href="/collection" className="flex items-center gap-1.5 text-sm text-[#5a4830] hover:text-[#d4a853] transition-colors w-fit">
        <ChevronLeft size={15} /> 컬렉션 목록
      </Link>

      {/* 헤더 */}
      <div className={`rounded-2xl border px-5 py-4 ${isComplete ? 'bg-[#d4a853]/5 border-[#d4a853]/30' : 'bg-[#1a1410] border-[#2e2318]'}`}>
        <div className="flex items-start gap-3 mb-3">
          <Layers size={18} className={isComplete ? 'text-[#d4a853] mt-0.5' : 'text-[#5a4830] mt-0.5'} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-bold text-base text-[#f5ead8]">{decodedSetName}</h1>
              <span className="text-xs text-[#5a4830]">{TCG_LABELS[tcgType] ?? tcgType}</span>
              {isComplete && (
                <span className="flex items-center gap-1 px-2 py-0.5 bg-[#d4a853]/20 border border-[#d4a853]/40 rounded-full text-[10px] text-[#d4a853] font-semibold">
                  <CheckCircle2 size={9} /> 완성
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 진행률 바 */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-[11px]">
            <span className="text-[#5a4830]">진행률</span>
            <span className={isComplete ? 'text-[#d4a853] font-semibold' : 'text-[#7a6040]'}>
              {data?.ownedCount ?? 0} / {data?.totalCount ?? 0} ({pct.toFixed(1)}%)
            </span>
          </div>
          <div className="h-2 bg-[#2e2318] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${isComplete ? 'bg-[#d4a853]' : 'bg-gradient-to-r from-[#5a3820] to-[#8a5830]'}`}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* 필터 탭 */}
      <div className="flex gap-2">
        {(['ALL', 'OWNED', 'MISSING'] as const).map(f => {
          const label = f === 'ALL' ? '전체' : f === 'OWNED' ? '보유' : '미보유'
          const count = f === 'ALL' ? (data?.totalCount ?? 0) : f === 'OWNED' ? (data?.ownedCount ?? 0) : ((data?.totalCount ?? 0) - (data?.ownedCount ?? 0))
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                filter === f
                  ? 'bg-[#d4a853] text-white'
                  : 'bg-[#1a1410] border border-[#2e2318] text-[#7a6040] hover:text-[#d4a853]'
              }`}
            >
              {label}
              <span className={`text-[10px] rounded-full px-1.5 py-0.5 ${
                filter === f ? 'bg-white/20 text-white' : 'bg-[#2e2318] text-[#5a4830]'
              }`}>{count}</span>
            </button>
          )
        })}
      </div>

      {/* 카드 그리드 */}
      {isLoading ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
          {Array.from({ length: 30 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] bg-[#1a1410] rounded-xl border border-[#2e2318] animate-pulse" />
          ))}
        </div>
      ) : filteredCards.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-[#4a3820]">
          <Package size={32} className="opacity-20" />
          <p className="text-sm">{filter === 'MISSING' ? '모든 카드를 보유하고 있습니다!' : '카드가 없습니다.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
          {filteredCards.map(card => {
            const name = card.nameKo ?? card.name
            return (
              <div key={card.id} className={`group relative rounded-xl overflow-hidden border transition-all ${
                card.owned
                  ? 'border-[#5a4020] hover:border-[#d4a853]/50'
                  : 'border-[#1e1810] opacity-40 hover:opacity-60'
              }`}>
                {/* 카드 이미지 */}
                <Link href={`/cards/${card.id}`} className="block aspect-[3/4] bg-[#120d08]">
                  {card.imageUrl ? (
                    <Image
                      src={card.imageUrl} alt={name}
                      width={120} height={160}
                      className={`w-full h-full object-cover transition-all duration-200 ${card.owned ? '' : 'grayscale'}`}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl">🃏</div>
                  )}
                </Link>

                {/* 보유 수량 뱃지 */}
                {card.owned && card.quantity > 1 && (
                  <div className="absolute top-1.5 left-1.5 bg-black/70 text-[#d4a853] text-[10px] font-bold px-1.5 py-0.5 rounded-md">
                    ×{card.quantity}
                  </div>
                )}

                {/* 체크 뱃지 */}
                {card.owned && (
                  <div className="absolute top-1.5 right-1.5">
                    <CheckCircle2 size={14} className="text-[#d4a853] drop-shadow-md" />
                  </div>
                )}

                {/* 카드명 + 위시리스트 */}
                <div className="px-1.5 py-1.5 bg-[#0e0a07]">
                  <p className="text-[10px] text-[#7a6040] truncate">{name}</p>
                  {card.cardNumber && (
                    <p className="text-[9px] text-[#4a3820]">{card.cardNumber} · {card.rarity}</p>
                  )}
                  {!card.owned && (
                    <div className="mt-1 flex justify-center">
                      <WishlistButton cardId={card.id} cardName={name} size="sm" />
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

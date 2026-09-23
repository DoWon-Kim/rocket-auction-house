'use client'

import { use, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore, useAuthHydrated } from '@/lib/store'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { ChevronLeft, Layers, CheckCircle2, Package } from 'lucide-react'
import { TCG_LABELS, resolveImageSrc } from '@/lib/utils'
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

  const hydrated = useAuthHydrated()

  useEffect(() => {
    if (hydrated && !user) router.replace('/login')
  }, [hydrated, user, router])

  if (!user) return null

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
      <Link href="/collection" className="flex items-center gap-1.5 text-sm text-subtle hover:text-accent-fg transition-colors w-fit">
        <ChevronLeft size={15} /> 컬렉션 목록
      </Link>

      {/* 헤더 */}
      <div className={`rounded-2xl border px-5 py-4 ${isComplete ? 'bg-accent/5 border-accent/30' : 'bg-surface border-line'}`}>
        <div className="flex items-start gap-3 mb-3">
          <Layers size={18} className={isComplete ? 'text-accent-fg mt-0.5' : 'text-subtle mt-0.5'} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-bold text-base text-fg">{decodedSetName}</h1>
              <span className="text-xs text-subtle">{TCG_LABELS[tcgType] ?? tcgType}</span>
              {isComplete && (
                <span className="flex items-center gap-1 px-2 py-0.5 bg-accent/20 border border-accent/40 rounded-full text-[10px] text-accent-fg font-semibold">
                  <CheckCircle2 size={9} /> 완성
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 진행률 바 */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-[11px]">
            <span className="text-subtle">진행률</span>
            <span className={isComplete ? 'text-accent-fg font-semibold' : 'text-muted-2'}>
              {data?.ownedCount ?? 0} / {data?.totalCount ?? 0} ({pct.toFixed(1)}%)
            </span>
          </div>
          <div className="h-2 bg-line rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${isComplete ? 'bg-accent' : 'bg-gradient-to-r from-[#2e2b48] to-[#652bee]'}`}
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
                  ? 'bg-accent text-white'
                  : 'bg-surface border border-line text-muted-2 hover:text-accent-fg'
              }`}
            >
              {label}
              <span className={`text-[10px] rounded-full px-1.5 py-0.5 ${
                filter === f ? 'bg-white/20 text-white' : 'bg-line text-subtle'
              }`}>{count}</span>
            </button>
          )
        })}
      </div>

      {/* 카드 그리드 */}
      {isLoading ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
          {Array.from({ length: 30 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] bg-surface rounded-xl border border-line animate-pulse" />
          ))}
        </div>
      ) : filteredCards.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-subtle">
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
                  ? 'border-[#2e2b48] hover:border-accent/50'
                  : 'border-surface-2 opacity-40 hover:opacity-60'
              }`}>
                {/* 카드 이미지 */}
                <Link href={`/cards/${card.id}`} className="block aspect-[3/4] bg-sunken">
                  {card.imageUrl ? (
                    <Image
                      src={resolveImageSrc(card.imageUrl)!} alt={name}
                      width={120} height={160}
                      className={`w-full h-full object-cover transition-all duration-200 ${card.owned ? '' : 'grayscale'}`}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl">🃏</div>
                  )}
                </Link>

                {/* 보유 수량 뱃지 */}
                {card.owned && card.quantity > 1 && (
                  <div className="absolute top-1.5 left-1.5 bg-black/70 text-accent-fg text-[10px] font-bold px-1.5 py-0.5 rounded-md">
                    ×{card.quantity}
                  </div>
                )}

                {/* 체크 뱃지 */}
                {card.owned && (
                  <div className="absolute top-1.5 right-1.5">
                    <CheckCircle2 size={14} className="text-accent-fg drop-shadow-md" />
                  </div>
                )}

                {/* 카드명 + 위시리스트 */}
                <div className="px-1.5 py-1.5 bg-[#08070c]">
                  <p className="text-[10px] text-muted-2 truncate">{name}</p>
                  {card.cardNumber && (
                    <p className="text-[9px] text-subtle"><span className="text-accent-fg/60 font-mono">[{card.cardNumber}]</span> · {card.rarity}</p>
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

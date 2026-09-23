'use client'

import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore, useAuthHydrated } from '@/lib/store'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Heart, Target, Trash2, Tag, TrendingDown, ExternalLink } from 'lucide-react'
import { TCG_LABELS, resolveImageSrc } from '@/lib/utils'
import { WishlistTargetEditButton } from '@/components/WishlistButton'

interface WishlistItem {
  id: string
  cardId: string
  targetPrice: number | null
  createdAt: string
  currentLowest: number | null
  isBelowTarget: boolean
  card: {
    id: string
    name: string
    nameKo: string | null
    tcgType: string
    setName: string
    rarity: string
    imageUrl: string | null
    _count: { listings: number }
  }
}

export default function WishlistPage() {
  const { user } = useAuthStore()
  const router = useRouter()
  const qc = useQueryClient()

  // 모든 훅은 early return 전에 선언 (Rules of Hooks)
  const { data: items, isLoading } = useQuery<WishlistItem[]>({
    queryKey: ['my-wishlist'],
    queryFn: () => api.get('/my/wishlist').then(r => r.data),
    enabled: !!user,
  })

  const remove = useMutation({
    mutationFn: (cardId: string) => api.delete(`/wishlist/${cardId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-wishlist'] }),
  })

  const hydrated = useAuthHydrated()

  useEffect(() => {
    if (hydrated && !user) router.replace('/login')
  }, [hydrated, user, router])

  if (!user) return null

  if (isLoading) return (
    <div className="max-w-2xl mx-auto space-y-3">
      <div className="h-8 w-48 bg-surface rounded-xl animate-pulse" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-24 bg-surface rounded-2xl border border-line animate-pulse" />
      ))}
    </div>
  )

  const list = items ?? []

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <Heart size={20} className="text-red-400 fill-red-400" />
        <h1 className="text-xl font-bold text-fg">위시리스트</h1>
        <span className="text-sm text-subtle">{list.length}개 카드</span>
      </div>

      {list.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-subtle">
          <Heart size={40} className="opacity-20" />
          <p className="text-sm">위시리스트가 비어있습니다.</p>
          <Link href="/cards" className="text-sm text-accent-fg hover:text-[#8a5ef2] transition-colors">
            카드 도감 둘러보기 →
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {list.map(item => {
            const name = item.card.nameKo ?? item.card.name
            const alertActive = item.targetPrice != null && item.currentLowest != null
              && item.currentLowest <= item.targetPrice

            return (
              <div
                key={item.id}
                className={`group flex items-center gap-4 bg-surface border rounded-2xl px-4 py-3 transition-colors ${
                  alertActive
                    ? 'border-accent/40 bg-accent/5'
                    : 'border-line hover:border-line-strong'
                }`}
              >
                {/* 카드 이미지 */}
                <Link href={`/cards/${item.card.id}`} className="shrink-0">
                  <div className="w-10 h-14 rounded-lg overflow-hidden bg-sunken border border-line">
                    {item.card.imageUrl ? (
                      <Image
                        src={resolveImageSrc(item.card.imageUrl)!} alt={name}
                        width={40} height={56} className="object-cover w-full h-full"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xl">🃏</div>
                    )}
                  </div>
                </Link>

                {/* 카드 정보 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 flex-wrap">
                    <Link href={`/cards/${item.card.id}`}
                      className="font-semibold text-sm text-fg hover:text-accent-fg transition-colors truncate">
                      {name}
                    </Link>
                    {alertActive && (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 bg-accent/20 border border-accent/40 rounded text-[10px] text-accent-fg font-medium shrink-0">
                        <TrendingDown size={9} /> 목표가 달성!
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] text-subtle mt-0.5">
                    {TCG_LABELS[item.card.tcgType]} · {item.card.setName}
                  </p>

                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    {/* 현재 최저가 */}
                    {item.currentLowest != null ? (
                      <span className={`flex items-center gap-1 text-xs ${
                        alertActive ? 'text-accent-fg font-semibold' : 'text-muted-2'
                      }`}>
                        <Tag size={10} />
                        최저 {item.currentLowest.toLocaleString()}P
                      </span>
                    ) : (
                      <span className="text-xs text-subtle">판매 없음</span>
                    )}

                    {/* 목표가 수정 버튼 */}
                    <WishlistTargetEditButton
                      cardId={item.card.id}
                      cardName={name}
                      currentTarget={item.targetPrice}
                    />

                    {/* 리스팅 수 */}
                    {item.card._count.listings > 0 && (
                      <Link
                        href={`/cards/${item.card.id}`}
                        className="flex items-center gap-1 text-[11px] text-subtle hover:text-accent-fg transition-colors"
                      >
                        <ExternalLink size={10} />
                        {item.card._count.listings}개 리스팅
                      </Link>
                    )}
                  </div>
                </div>

                {/* 삭제 버튼 */}
                <button
                  onClick={() => remove.mutate(item.card.id)}
                  disabled={remove.isPending}
                  className="shrink-0 p-2 text-subtle hover:text-red-400 hover:bg-accent-tint rounded-xl transition-colors opacity-0 group-hover:opacity-100"
                  title="위시리스트에서 삭제"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* 도움말 */}
      {list.length > 0 && (
        <div className="flex items-start gap-2 text-[11px] text-subtle bg-surface border border-line rounded-xl px-4 py-3">
          <Target size={12} className="shrink-0 mt-0.5" />
          목표가를 설정하면 해당 가격 이하 리스팅이 등록될 때 알림을 받습니다.
        </div>
      )}
    </div>
  )
}

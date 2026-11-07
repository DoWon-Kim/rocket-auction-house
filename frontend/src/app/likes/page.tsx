'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Heart } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore, useAuthHydrated } from '@/lib/store'
import { MarketItemCard } from '@/components/market/MarketItemCard'
import { RecentlyViewed } from '@/components/market/RecentlyViewed'
import type { MarketListing } from '@/lib/market'

export default function LikesPage() {
  const user = useAuthStore(s => s.user)
  const hydrated = useAuthHydrated()
  const router = useRouter()
  const [hideDone, setHideDone] = useState(false)
  useEffect(() => { if (hydrated && !user) router.replace('/login') }, [hydrated, user, router])

  const { data, isLoading } = useQuery<MarketListing[]>({ queryKey: ['my-likes'], queryFn: () => api.get('/my/likes').then(r => r.data), enabled: !!user })
  if (!user) return null
  const shown = (data ?? []).filter(l => !hideDone || l.status === 'ACTIVE' || l.status === 'RESERVED')

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-fg flex items-center gap-2"><Heart size={22} className="text-rose-400 fill-rose-400" />찜한 상품</h1>
          <p className="text-xs text-muted mt-1">{data?.length ?? 0}개 · 가격이 궁금한 카드는 <Link href="/wishlist" className="underline hover:text-fg">관심 카드(가격 알림)</Link>에서 관리해요</p>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer">
          <input type="checkbox" checked={hideDone} onChange={e => setHideDone(e.target.checked)} />판매완료 숨기기
        </label>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="aspect-square rounded-2xl bg-surface animate-pulse" />)}</div>
      ) : shown.length === 0 ? (
        <div className="text-center py-20 text-subtle space-y-2">
          <Heart size={34} className="mx-auto opacity-30" />
          <p className="text-sm">찜한 상품이 없어요.</p>
          <Link href="/listings" className="inline-block text-sm text-accent-fg hover:underline">마켓 둘러보기</Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-6">
          {shown.map(l => <MarketItemCard key={l.id} listing={l} liked />)}
        </div>
      )}

      <RecentlyViewed />
    </div>
  )
}

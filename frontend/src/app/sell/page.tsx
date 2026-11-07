'use client'

import { Suspense, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore, useAuthHydrated } from '@/lib/store'
import { QuickSellForm, type SellCard } from '@/components/sell/QuickSellForm'

function SellContent() {
  const params = useSearchParams()
  const router = useRouter()
  const user = useAuthStore(s => s.user)
  const hydrated = useAuthHydrated()
  const cardId = params.get('cardId')
  useEffect(() => { if (hydrated && !user) router.replace('/login') }, [hydrated, user, router])

  // 카드 도감에서 ‘이 카드 판매하기’로 오면 카드를 미리 채움
  const { data: card, isLoading } = useQuery<SellCard>({ queryKey: ['card', cardId, 'sell'], queryFn: () => api.get(`/cards/${cardId}`).then(r => r.data), enabled: !!cardId })

  if (!user) return null
  if (cardId && isLoading) return <div className="h-96 rounded-3xl bg-surface animate-pulse" />
  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/listings" className="w-9 h-9 rounded-full border border-line flex items-center justify-center text-muted hover:text-fg" aria-label="마켓으로"><ChevronLeft size={18} /></Link>
        <div>
          <h1 className="text-2xl font-black text-fg">판매하기</h1>
          <p className="text-xs text-muted">사진 → 카드 → 가격만 정하면 끝. 나머지는 천천히 채워도 돼요.</p>
        </div>
      </div>
      <QuickSellForm key={card?.id ?? 'new'} initialCard={card ?? null} />
    </div>
  )
}

export default function SellPage() {
  return <Suspense fallback={<div className="h-96 rounded-3xl bg-surface animate-pulse" />}><SellContent /></Suspense>
}

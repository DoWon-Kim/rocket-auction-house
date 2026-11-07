'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { Heart } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'

// 찜 토글 — variant: overlay(상품 카드 위) · button(상세 하단 바)
export function LikeButton({ listingId, liked: initial, count: initialCount, variant = 'overlay', disabled }: {
  listingId: string; liked?: boolean; count?: number; variant?: 'overlay' | 'button'; disabled?: boolean
}) {
  const user = useAuthStore(s => s.user)
  const router = useRouter()
  const qc = useQueryClient()
  // 사용자가 누른 뒤에는 서버 응답 값을, 그 전에는 props 값을 보여준다
  const [local, setLocal] = useState<{ liked: boolean; count: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const liked = local?.liked ?? !!initial
  const count = local?.count ?? initialCount ?? 0

  const toggle = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    if (!user) { router.push('/login'); return }
    if (busy || disabled) return
    setBusy(true)
    const before = { liked, count }
    setLocal({ liked: !liked, count: count + (liked ? -1 : 1) }) // 낙관적 반영
    try {
      const r = await api.post<{ liked: boolean; likeCount: number }>(`/listings/${listingId}/like`)
      setLocal({ liked: r.data.liked, count: r.data.likeCount })
      qc.invalidateQueries({ queryKey: ['my-likes'] })
    } catch {
      setLocal(before)
    } finally { setBusy(false) }
  }

  if (variant === 'button') return (
    <button type="button" onClick={toggle} disabled={disabled} aria-pressed={liked} aria-label={liked ? '찜 해제' : '찜하기'}
      className={`flex flex-col items-center justify-center w-16 h-12 shrink-0 rounded-xl border transition-colors disabled:opacity-40 ${liked ? 'border-rose-400/40 bg-rose-500/10 text-rose-400' : 'border-line bg-surface text-muted hover:text-fg hover:border-line-strong'}`}>
      <Heart size={17} className={liked ? 'fill-rose-400' : ''} />
      <span className="text-[10px] tabular-nums leading-none mt-0.5">{count}</span>
    </button>
  )

  return (
    <button type="button" onClick={toggle} aria-pressed={liked} aria-label={liked ? '찜 해제' : '찜하기'}
      className="w-8 h-8 rounded-full bg-black/45 backdrop-blur-sm flex items-center justify-center text-white hover:scale-110 transition-transform">
      <Heart size={15} className={liked ? 'fill-rose-500 text-rose-500' : ''} />
    </button>
  )
}

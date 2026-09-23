'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { useRouter } from 'next/navigation'
import { Heart, X, Target } from 'lucide-react'

interface WishlistItem {
  id: string
  targetPrice: number | null
}

interface Props {
  cardId: string
  cardName: string
  size?: 'sm' | 'md'
}

export function WishlistButton({ cardId, cardName, size = 'md' }: Props) {
  const { user } = useAuthStore()
  const router = useRouter()
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [targetInput, setTargetInput] = useState('')

  const { data: status, isLoading } = useQuery<WishlistItem | null>({
    queryKey: ['wishlist-status', cardId],
    queryFn: () => api.get(`/wishlist/status/${cardId}`).then(r => r.data),
    enabled: !!user,
  })

  const isWishlisted = status != null

  const add = useMutation({
    mutationFn: (targetPrice: number | null) =>
      api.post('/wishlist', { cardId, targetPrice }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wishlist-status', cardId] })
      qc.invalidateQueries({ queryKey: ['my-wishlist'] })
      setShowModal(false)
      setTargetInput('')
    },
  })

  const remove = useMutation({
    mutationFn: () => api.delete(`/wishlist/${cardId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wishlist-status', cardId] })
      qc.invalidateQueries({ queryKey: ['my-wishlist'] })
    },
  })

  const update = useMutation({
    mutationFn: (targetPrice: number | null) =>
      api.patch(`/wishlist/${cardId}`, { cardId, targetPrice }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wishlist-status', cardId] })
      qc.invalidateQueries({ queryKey: ['my-wishlist'] })
      setShowModal(false)
      setTargetInput('')
    },
  })

  function handleClick() {
    if (!user) { router.push('/login'); return }
    if (isWishlisted) {
      remove.mutate()
    } else {
      setTargetInput('')
      setShowModal(true)
    }
  }

  function handleSubmit() {
    const price = targetInput.trim() ? Number(targetInput.replace(/,/g, '')) : null
    if (price !== null && (isNaN(price) || price <= 0)) return
    if (isWishlisted) {
      update.mutate(price)
    } else {
      add.mutate(price)
    }
  }

  const iconSize = size === 'sm' ? 14 : 18
  const isPending = add.isPending || remove.isPending || update.isPending

  return (
    <>
      <button
        onClick={handleClick}
        disabled={isLoading || isPending}
        title={isWishlisted ? '위시리스트에서 제거' : '위시리스트에 추가'}
        className={`flex items-center justify-center rounded-xl border transition-all duration-200 ${
          size === 'sm'
            ? 'h-7 w-7'
            : 'h-9 w-9'
        } ${
          isWishlisted
            ? 'bg-red-500/15 border-red-500/40 text-red-400 hover:bg-red-500/25'
            : 'bg-surface border-line text-subtle hover:border-accent/40 hover:text-accent-fg'
        } disabled:opacity-40`}
      >
        <Heart
          size={iconSize}
          className={`transition-all ${isWishlisted ? 'fill-red-400' : ''}`}
        />
      </button>

      {/* 목표가 설정 모달 */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/70 backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div className="bg-sunken border border-line rounded-2xl p-6 w-full max-w-sm space-y-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-base text-fg flex items-center gap-2">
                  <Heart size={15} className="text-red-400 fill-red-400" />
                  위시리스트 추가
                </h3>
                <p className="text-xs text-muted-2 mt-0.5 truncate max-w-[220px]">{cardName}</p>
              </div>
              <button onClick={() => setShowModal(false)} className="text-subtle hover:text-fg-3 transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-1.5 text-xs text-muted-2 uppercase tracking-wider font-semibold">
                <Target size={11} /> 목표 가격 <span className="font-normal normal-case text-subtle">(선택)</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={targetInput}
                  onChange={e => setTargetInput(e.target.value)}
                  placeholder="이 가격 이하 등록 시 알림"
                  min={1}
                  className="w-full bg-surface border border-line hover:border-line-strong focus:border-accent/40 rounded-xl px-4 py-3 pr-10 text-sm text-fg placeholder:text-subtle focus:outline-none transition-colors"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-subtle">P</span>
              </div>
              <p className="text-[11px] text-subtle">
                설정하면 해당 가격 이하 리스팅 등록 시 알림을 받습니다.
              </p>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setShowModal(false)}
                className="flex-1 bg-surface border border-line hover:border-line-strong text-fg-3 hover:text-fg-2 py-2.5 rounded-xl text-sm transition-colors">
                취소
              </button>
              <button
                onClick={handleSubmit}
                disabled={isPending}
                className="flex-1 bg-red-500/80 hover:bg-red-500 disabled:opacity-40 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-1.5"
              >
                {isPending
                  ? <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  : <Heart size={13} className="fill-white" />
                }
                추가하기
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// 목표가 수정 전용 버튼 (위시리스트 페이지 내)
export function WishlistTargetEditButton({
  cardId, cardName, currentTarget, onSaved,
}: { cardId: string; cardName: string; currentTarget: number | null; onSaved?: () => void }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [val, setVal] = useState(currentTarget?.toString() ?? '')

  const mut = useMutation({
    mutationFn: (price: number | null) => api.patch(`/wishlist/${cardId}`, { cardId, targetPrice: price }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-wishlist'] })
      qc.invalidateQueries({ queryKey: ['wishlist-status', cardId] })
      onSaved?.()
      setOpen(false)
    },
  })

  return (
    <>
      <button
        onClick={() => { setVal(currentTarget?.toString() ?? ''); setOpen(true) }}
        className="flex items-center gap-1 text-[11px] text-subtle hover:text-accent-fg transition-colors px-2 py-1 rounded-lg hover:bg-accent-tint"
      >
        <Target size={11} />
        {currentTarget ? `${currentTarget.toLocaleString()}P` : '목표가 설정'}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="bg-sunken border border-line rounded-2xl p-5 w-full max-w-xs space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-fg">목표가 수정</h3>
              <button onClick={() => setOpen(false)} className="text-subtle hover:text-fg-3"><X size={14} /></button>
            </div>
            <p className="text-xs text-subtle truncate">{cardName}</p>
            <div className="relative">
              <input
                type="number" value={val} onChange={e => setVal(e.target.value)}
                placeholder="목표 가격 (비우면 해제)"
                className="w-full bg-surface border border-line focus:border-accent/40 rounded-xl px-4 py-2.5 pr-8 text-sm text-fg placeholder:text-subtle focus:outline-none"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-subtle">P</span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setOpen(false)} className="flex-1 bg-surface border border-line text-fg-3 py-2 rounded-xl text-sm">취소</button>
              <button
                onClick={() => {
                  const p = val.trim() ? Number(val) : null
                  if (p !== null && (isNaN(p) || p <= 0)) return
                  mut.mutate(p)
                }}
                disabled={mut.isPending}
                className="flex-1 bg-accent hover:bg-accent-strong disabled:opacity-40 text-white py-2 rounded-xl text-sm font-semibold"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

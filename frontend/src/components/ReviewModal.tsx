'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { StarRating } from './StarRating'
import { X, AlertCircle } from 'lucide-react'

interface Props {
  transactionId: string
  targetNickname: string    // 리뷰 대상 닉네임
  role: 'BUYER' | 'SELLER' // 내 역할 (구매자면 판매자 평가)
  onClose: () => void
  onSuccess?: () => void
}

export function ReviewModal({ transactionId, targetNickname, role, onClose, onSuccess }: Props) {
  const qc = useQueryClient()
  const [rating, setRating]   = useState(0)
  const [comment, setComment] = useState('')
  const [error, setError]     = useState<string | null>(null)

  const targetLabel = role === 'BUYER' ? '판매자' : '구매자'

  const mut = useMutation({
    mutationFn: () => api.post('/reviews', { transactionId, rating, comment: comment.trim() || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my', 'purchases'] })
      qc.invalidateQueries({ queryKey: ['my', 'sales'] })
      onSuccess?.()
      onClose()
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      setError(e.response?.data?.message ?? '리뷰 작성에 실패했습니다.')
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#150f0c] border border-[#2e2318] rounded-2xl p-6 w-full max-w-sm space-y-5" onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-bold text-base text-[#f5ead8]">{targetLabel} 평가</h3>
            <p className="text-xs text-[#7a6040] mt-0.5">{targetNickname}님과의 거래는 어떠셨나요?</p>
          </div>
          <button onClick={onClose} className="text-[#5a4830] hover:text-[#9e8a6a] transition-colors mt-0.5">
            <X size={16} />
          </button>
        </div>

        {/* 별점 */}
        <div className="space-y-2">
          <p className="text-xs text-[#7a6040] uppercase tracking-wider font-semibold">별점 *</p>
          <StarRating value={rating} onChange={setRating} size={32} showLabel />
        </div>

        {/* 코멘트 */}
        <div className="space-y-1.5">
          <label className="text-xs text-[#7a6040] uppercase tracking-wider font-semibold">
            한줄 평 <span className="font-normal normal-case text-[#4a3820]">(선택)</span>
          </label>
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            maxLength={300}
            rows={3}
            placeholder={`${targetLabel}에 대한 경험을 공유해주세요.`}
            className="w-full bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] focus:border-[#d4a853]/40 rounded-xl px-4 py-3 text-sm text-[#f5ead8] placeholder:text-[#5a4830] focus:outline-none transition-colors resize-none"
          />
          <p className="text-right text-[10px] text-[#4a3820]">{comment.length}/300</p>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-xs text-red-400 bg-red-950/30 border border-red-800/40 rounded-xl px-3 py-2">
            <AlertCircle size={13} /> {error}
          </div>
        )}

        {/* 버튼 */}
        <div className="flex gap-2">
          <button type="button" onClick={onClose}
            className="flex-1 bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] text-[#9e8a6a] hover:text-[#e8d5b0] py-2.5 rounded-xl text-sm transition-colors">
            취소
          </button>
          <button
            type="button"
            onClick={() => { setError(null); mut.mutate() }}
            disabled={rating === 0 || mut.isPending}
            className="flex-1 bg-[#d4a853] hover:bg-[#c49440] disabled:opacity-40 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors"
          >
            {mut.isPending
              ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />전송 중</span>
              : '리뷰 등록'}
          </button>
        </div>
      </div>
    </div>
  )
}

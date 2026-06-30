'use client'

import { useState } from 'react'
import { Star } from 'lucide-react'

interface Props {
  value: number       // 0 ~ 5 (0 = 미선택)
  onChange?: (v: number) => void
  size?: number
  readonly?: boolean
  showLabel?: boolean
}

const LABELS = ['', '별로예요', '아쉬워요', '보통이에요', '좋아요', '최고예요!']

export function StarRating({ value, onChange, size = 20, readonly = false, showLabel = false }: Props) {
  const [hover, setHover] = useState(0)
  const display = readonly ? value : (hover || value)

  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          type="button"
          disabled={readonly}
          onClick={() => onChange?.(star)}
          onMouseEnter={() => !readonly && setHover(star)}
          onMouseLeave={() => !readonly && setHover(0)}
          className={`transition-transform ${!readonly ? 'hover:scale-110 cursor-pointer' : 'cursor-default'}`}
        >
          <Star
            size={size}
            className={`transition-colors ${
              star <= display
                ? 'text-[#f0a832] fill-[#f0a832]'
                : 'text-[#3a2810] fill-[#1a1208]'
            }`}
          />
        </button>
      ))}
      {showLabel && !readonly && (
        <span className="ml-1 text-xs text-[#8a7055] min-w-[60px]">
          {LABELS[hover || value] ?? ''}
        </span>
      )}
      {readonly && value > 0 && (
        <span className="ml-1 text-xs text-[#8a7055] tabular-nums">{value.toFixed(1)}</span>
      )}
    </div>
  )
}

// 간결한 표시용 (평균 평점 + 건수)
export function RatingBadge({ avgRating, reviewCount, size = 13 }: { avgRating: number | null; reviewCount: number; size?: number }) {
  if (!avgRating || reviewCount === 0) return (
    <span className="text-[11px] text-[#4a3820]">평점 없음</span>
  )
  return (
    <span className="inline-flex items-center gap-1">
      <Star size={size} className="text-[#f0a832] fill-[#f0a832]" />
      <span className="text-xs font-semibold text-[#f0a832] tabular-nums">{avgRating.toFixed(1)}</span>
      <span className="text-[11px] text-[#5a4830]">({reviewCount.toLocaleString()})</span>
    </span>
  )
}

'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Flag, Loader2, AlertCircle, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

const REASONS = [
  { value: 'FRAUD',        label: '사기 의심' },
  { value: 'FAKE_ITEM',    label: '위조 / 가짜 카드' },
  { value: 'WRONG_ITEM',   label: '다른 물품 발송' },
  { value: 'DAMAGED_ITEM', label: '손상 물품 수령' },
  { value: 'NO_SHIPMENT',  label: '미발송 / 잠수' },
  { value: 'OTHER',        label: '기타' },
] as const

function DisputeForm() {
  const router = useRouter()
  const params = useSearchParams()
  const txId = params.get('txId') ?? ''

  const [reason, setReason] = useState<string>('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')

  const mut = useMutation({
    mutationFn: () => api.post('/disputes', {
      transactionId: txId,
      reason,
      description,
      evidenceUrls: [],
    }),
    onSuccess: () => {
      router.push('/my?tab=disputes')
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } }
      setError(err.response?.data?.message ?? '분쟁 신청에 실패했습니다.')
    },
  })

  if (!txId) {
    return (
      <div className="text-center py-16">
        <AlertCircle className="mx-auto mb-3 text-red-400 w-8 h-8" />
        <p className="text-sm text-[#8a7055]">거래 정보가 없습니다.</p>
        <Link href="/my" className="text-[#d4a853] text-sm hover:underline mt-2 inline-block">마이페이지로 돌아가기</Link>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto py-8 px-4 space-y-6">
      <div>
        <Link href="/my?tab=purchases" className="flex items-center gap-1.5 text-sm text-[#5a4830] hover:text-[#d4a853] transition-colors mb-4">
          <ArrowLeft size={14} /> 구매 내역으로 돌아가기
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-900/30 border border-red-700/30 flex items-center justify-center">
            <Flag className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#e8d5b0]">분쟁 신청</h1>
            <p className="text-xs text-[#5a4830]">판매자와 문제가 해결되지 않은 경우에만 신청하세요</p>
          </div>
        </div>
      </div>

      <div className="bg-[#1a1208] border border-[#3d2e1a] rounded-2xl p-6 space-y-5">
        {error && (
          <div className="flex items-start gap-2 bg-red-900/30 border border-red-700/40 text-red-300 text-sm px-4 py-3 rounded-xl">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        <div className="space-y-2">
          <label className="text-xs text-[#7a6040] uppercase tracking-wider font-semibold">분쟁 사유</label>
          <div className="grid grid-cols-1 gap-2">
            {REASONS.map(r => (
              <button
                key={r.value}
                type="button"
                onClick={() => setReason(r.value)}
                className={`px-4 py-2.5 rounded-xl text-sm text-left transition-colors border ${
                  reason === r.value
                    ? 'bg-red-900/30 border-red-700/50 text-red-300 font-medium'
                    : 'bg-[#120e0a] border-[#2e2318] text-[#7a6040] hover:border-[#4a3520] hover:text-[#9e8a6a]'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs text-[#7a6040] uppercase tracking-wider font-semibold">
            상세 내용 <span className="normal-case text-[#5a4830]">(최소 10자)</span>
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={5}
            placeholder="구체적인 상황을 설명해 주세요. 예) 배송된 카드가 사진과 다른 상태이며, 스크래치가 심합니다."
            className="w-full bg-[#120e0a] border border-[#2e2318] focus:border-[#d4a853]/40 rounded-xl px-4 py-3 text-sm text-[#e8d5b0] placeholder:text-[#3a2e1e] outline-none resize-none"
          />
          <p className="text-[11px] text-[#4a3520] text-right">{description.length} / 1000</p>
        </div>

        <div className="pt-1">
          <button
            onClick={() => { setError(''); mut.mutate() }}
            disabled={mut.isPending || !reason || description.length < 10}
            className="w-full h-11 bg-red-700 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
          >
            {mut.isPending ? <Loader2 size={16} className="animate-spin" /> : <Flag size={15} />}
            분쟁 신청하기
          </button>
          <p className="text-[11px] text-[#4a3520] text-center mt-2">
            신청 후 고객센터에서 검토 후 연락드립니다
          </p>
        </div>
      </div>
    </div>
  )
}

export default function DisputeNewPage() {
  return (
    <Suspense>
      <DisputeForm />
    </Suspense>
  )
}

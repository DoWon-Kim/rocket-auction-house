'use client'

import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { XCircle, RotateCcw, ArrowLeft } from 'lucide-react'

function FailContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const message = searchParams.get('message') ?? '결제가 취소되었거나 실패했습니다.'

  return (
    <div className="max-w-sm mx-auto text-center py-20 space-y-6">
      <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-950/60 border border-red-800/40">
        <XCircle size={40} className="text-red-400" />
      </div>
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">결제 실패</h1>
        <p className="text-sm text-[#7a6040]">{decodeURIComponent(message)}</p>
      </div>
      <div className="flex gap-3">
        <button onClick={() => router.push('/charge')}
          className="flex-1 h-11 flex items-center justify-center gap-1.5 bg-[#d4a853] hover:bg-[#c49440] text-white rounded-xl text-sm font-semibold transition-all shadow-[0_0_16px_rgba(212,168,83,0.25)]">
          <RotateCcw size={14} /> 다시 충전하기
        </button>
        <button onClick={() => router.back()}
          className="flex-1 h-11 flex items-center justify-center gap-1.5 bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] text-[#9e8a6a] hover:text-[#e8d5b0] rounded-xl text-sm transition-all">
          <ArrowLeft size={14} /> 돌아가기
        </button>
      </div>
    </div>
  )
}

export default function ChargeFailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-[#2e2318] border-t-[#d4a853] animate-spin" />
      </div>
    }>
      <FailContent />
    </Suspense>
  )
}

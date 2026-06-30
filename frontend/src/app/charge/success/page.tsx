'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { CheckCircle, Wallet, AlertCircle, ArrowRight } from 'lucide-react'
import Link from 'next/link'

function SuccessContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { updateBalance } = useAuthStore()
  const [status, setStatus] = useState<'loading' | 'done' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const [newBalance, setNewBalance] = useState(0)
  const [confirmed, setConfirmed] = useState(false)

  useEffect(() => {
    if (confirmed) return
    const paymentKey = searchParams.get('paymentKey')
    const orderId = searchParams.get('orderId')
    const amount = searchParams.get('amount')
    if (!paymentKey || !orderId || !amount) { setStatus('error'); setMessage('결제 정보가 올바르지 않습니다.'); return }
    api.post('/payments/confirm', { paymentKey, orderId, amount: Number(amount) })
      .then(res => { setNewBalance(res.data.balance); updateBalance(res.data.balance); setConfirmed(true); setStatus('done') })
      .catch(err => { setStatus('error'); setMessage(err.response?.data?.message ?? '결제 확인에 실패했습니다.') })
  }, [searchParams, updateBalance, confirmed])

  if (status === 'loading') return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
      <div className="w-10 h-10 rounded-full border-2 border-[#2e2318] border-t-[#d4a853] animate-spin" />
      <p className="text-[#7a6040] text-sm">결제를 확인하는 중입니다...</p>
    </div>
  )

  if (status === 'error') return (
    <div className="max-w-sm mx-auto text-center py-20 space-y-5">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-950/60 border border-red-800/40">
        <AlertCircle size={32} className="text-red-400" />
      </div>
      <div>
        <p className="text-xl font-bold text-white mb-1">결제 오류</p>
        <p className="text-sm text-[#7a6040]">{message}</p>
      </div>
      <button onClick={() => router.push('/charge')}
        className="h-11 px-8 bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] text-[#9e8a6a] hover:text-[#e8d5b0] rounded-xl text-sm transition-all">
        다시 시도
      </button>
    </div>
  )

  return (
    <div className="max-w-sm mx-auto text-center py-16 space-y-6">
      <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-950/60 border border-emerald-800/40 shadow-[0_0_32px_rgba(16,185,129,0.15)]">
        <CheckCircle size={40} className="text-emerald-400" />
      </div>

      <div>
        <h1 className="text-2xl font-bold text-white mb-1">충전 완료!</h1>
        <p className="text-sm text-[#7a6040]">포인트가 성공적으로 충전되었습니다.</p>
      </div>

      <div className="bg-[#1a1410] border border-[#2e2318] rounded-2xl p-5 text-left">
        <p className="text-xs text-[#5a4830] uppercase tracking-wider font-semibold mb-3">현재 잔액</p>
        <div className="flex items-end gap-2">
          <Wallet size={20} className="text-[#f0a832] mb-0.5" />
          <span className="text-3xl font-bold text-[#f0a832] tabular-nums">{newBalance.toLocaleString()}</span>
          <span className="text-lg text-[#6b4c1a] mb-0.5">P</span>
        </div>
      </div>

      <div className="flex gap-3">
        <Link href="/listings"
          className="flex-1 h-11 flex items-center justify-center gap-1.5 bg-[#d4a853] hover:bg-[#c49440] text-white rounded-xl text-sm font-semibold transition-all shadow-[0_0_16px_rgba(212,168,83,0.25)]">
          마켓플레이스 <ArrowRight size={14} />
        </Link>
        <Link href="/my"
          className="flex-1 h-11 flex items-center justify-center bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] text-[#9e8a6a] hover:text-[#e8d5b0] rounded-xl text-sm transition-all">
          마이페이지
        </Link>
      </div>
    </div>
  )
}

export default function ChargeSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-[#2e2318] border-t-[#d4a853] animate-spin" />
      </div>
    }>
      <SuccessContent />
    </Suspense>
  )
}

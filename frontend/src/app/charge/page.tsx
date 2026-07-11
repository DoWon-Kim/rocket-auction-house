'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import { Wallet, Zap, AlertCircle, CreditCard, ChevronRight } from 'lucide-react'

const CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY!
const PRESETS = [5000, 10000, 30000, 50000, 100000, 300000]

export default function ChargePage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) router.replace('/login')
  }, [user, router])

  if (!user) return null

  const u = user

  async function handleCharge() {
    const value = Number(amount)
    if (!value || value < 1000) { setError('최소 충전 금액은 1,000P 입니다.'); return }
    if (value > 5_000_000) { setError('1회 최대 충전 금액은 5,000,000P 입니다.'); return }
    setError(''); setLoading(true)
    try {
      const { loadTossPayments } = await import('@tosspayments/tosspayments-sdk')
      const tossPayments = await loadTossPayments(CLIENT_KEY)
      const payment = tossPayments.payment({ customerKey: u.id })
      await payment.requestPayment({
        method: 'CARD',
        amount: { currency: 'KRW', value },
        orderId: `charge-${u.id}-${Date.now()}`,
        orderName: `포인트 ${value.toLocaleString()}P 충전`,
        successUrl: `${window.location.origin}/charge/success`,
        failUrl: `${window.location.origin}/charge/fail`,
        customerEmail: u.email,
        customerName: u.nickname,
      })
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string }
      if (e.code !== 'USER_CANCEL') setError(e.message ?? '결제 오류가 발생했습니다.')
      setLoading(false)
    }
  }

  const numAmount = Number(amount) || 0

  return (
    <div className="max-w-md mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">포인트 충전</h1>
        <p className="text-sm text-[#7a6040] mt-1">충전 포인트로 카드 구매, 경매 입찰이 가능합니다</p>
      </div>

      {/* Current balance */}
      <div className="bg-[#1a1410] border border-[#2e2318] rounded-2xl p-5">
        <p className="text-xs text-[#5a4830] uppercase tracking-wider font-semibold mb-3">현재 잔액</p>
        <div className="flex items-end gap-2">
          <Wallet size={20} className="text-[#f0a832] mb-0.5" />
          <span className="text-3xl font-bold text-[#f0a832] tabular-nums">{user.balance.toLocaleString()}</span>
          <span className="text-lg text-[#6b4c1a] mb-0.5">P</span>
        </div>
      </div>

      {/* Presets */}
      <div>
        <p className="text-xs text-[#5a4830] uppercase tracking-wider font-semibold mb-3">빠른 선택</p>
        <div className="grid grid-cols-3 gap-2">
          {PRESETS.map(p => (
            <button key={p} onClick={() => { setAmount(String(p)); setError('') }}
              className={`py-3 rounded-xl text-sm font-semibold border transition-all duration-150 ${
                amount === String(p)
                  ? 'bg-[#2a1c08] border-[#3d2a0c] text-[#e0b878] shadow-[0_0_12px_rgba(212,168,83,0.12)]'
                  : 'bg-[#1a1410] border-[#2e2318] text-[#8a7055] hover:border-[#4a3520] hover:text-[#e8d5b0]'
              }`}>
              {p.toLocaleString()}P
            </button>
          ))}
        </div>
      </div>

      {/* Custom amount */}
      <div>
        <label className="text-xs text-[#5a4830] uppercase tracking-wider font-semibold block mb-3">직접 입력</label>
        <div className="relative">
          <input type="number" min="1000" max="5000000" step="1000" value={amount}
            onChange={e => { setAmount(e.target.value); setError('') }}
            placeholder="금액 입력 (최소 1,000P)"
            className="w-full bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] focus:border-[#d4a853]/50 rounded-xl px-4 py-3 pr-10 text-sm text-[#f5ead8] placeholder:text-[#5a4830] focus:outline-none transition-colors tabular-nums" />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#5a4830] text-sm">P</span>
        </div>
        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm mt-2">
            <AlertCircle size={13} /> {error}
          </div>
        )}
      </div>

      {/* Summary */}
      {numAmount > 0 && (
        <div className="bg-[#1a1410] border border-[#2e2318] rounded-2xl p-4 space-y-2.5">
          <p className="text-xs text-[#5a4830] uppercase tracking-wider font-semibold">충전 내역</p>
          <div className="flex justify-between items-center text-sm">
            <span className="text-[#8a7055]">충전 금액</span>
            <span className="text-[#e8d5b0] font-medium tabular-nums">{numAmount.toLocaleString()}원</span>
          </div>
          <div className="h-px bg-[#2e2318]" />
          <div className="flex justify-between items-center">
            <span className="text-sm text-[#8a7055]">충전 후 잔액</span>
            <span className="text-[#f0a832] font-bold tabular-nums text-base">{(user.balance + numAmount).toLocaleString()}P</span>
          </div>
        </div>
      )}

      {/* CTA */}
      <button onClick={handleCharge}
        disabled={loading || numAmount < 1000}
        className="w-full h-14 flex items-center justify-center gap-2.5 bg-[#d4a853] hover:bg-[#c49440] disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all duration-200 shadow-[0_0_24px_rgba(212,168,83,0.3)] hover:shadow-[0_0_32px_rgba(212,168,83,0.5)] text-base">
        {loading ? (
          <span className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
        ) : (
          <>
            <CreditCard size={18} />
            {numAmount > 0 ? `${numAmount.toLocaleString()}P 충전하기` : '금액을 선택하세요'}
            {numAmount >= 1000 && <ChevronRight size={16} />}
          </>
        )}
      </button>

      <div className="flex items-center gap-2 justify-center text-[11px] text-[#4a3820]">
        <Zap size={11} />
        토스페이먼츠를 통해 안전하게 처리됩니다 · 충전 포인트는 환불 불가
      </div>
    </div>
  )
}

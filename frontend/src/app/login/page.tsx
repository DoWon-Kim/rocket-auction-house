'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import { api } from '@/lib/api'
import { Rocket, Mail, Lock, AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react'

const inputCls = 'w-full bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] focus:border-[#d4a853]/50 rounded-xl px-4 py-3 text-sm text-[#f5ead8] placeholder:text-[#5a4830] focus:outline-none transition-colors pl-11'

export default function LoginPage() {
  const router = useRouter()
  const { setAuth } = useAuthStore()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [requires2FA, setRequires2FA] = useState(false)
  const [totpCode, setTotpCode] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const payload = requires2FA
        ? { ...form, totpCode }
        : form
      const { data } = await api.post('/auth/login', payload)

      if (data.requiresTwoFa) {
        setRequires2FA(true)
        setLoading(false)
        return
      }

      setAuth(data.user, data.token, data.refreshToken)
      router.push('/')
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      setError(e.response?.data?.message ?? '로그인에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-[#d4a853] to-[#b8860b] shadow-[0_0_28px_rgba(212,168,83,0.4)] mb-4">
            <Rocket size={24} className="text-white" strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">
            {requires2FA ? '2단계 인증' : '로그인'}
          </h1>
          <p className="text-sm text-[#7a6040]">
            {requires2FA ? '인증 앱의 6자리 코드를 입력하세요' : 'Rocket Auction House에 오신 걸 환영합니다'}
          </p>
        </div>

        {/* Form card */}
        <div className="bg-[#1a1410] border border-[#2e2318] rounded-2xl p-6 space-y-4">
          {error && (
            <div className="flex items-start gap-2.5 bg-red-950/50 border border-red-800/50 text-red-400 rounded-xl px-4 py-3 text-sm">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {requires2FA ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex justify-center py-2">
                <ShieldCheck className="w-12 h-12 text-[#d4a853]" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-[#7a6040] uppercase tracking-wider font-semibold">인증 코드</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={totpCode}
                  onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))}
                  autoFocus
                  placeholder="123456"
                  className="w-full h-14 bg-[#120e0a] border border-[#2e2318] focus:border-[#d4a853]/60 rounded-xl px-4 text-center text-2xl tracking-[0.5em] text-[#e8d5b0] outline-none"
                />
              </div>
              <button type="submit" disabled={loading || totpCode.length !== 6}
                className="w-full h-11 flex items-center justify-center gap-2 bg-[#d4a853] hover:bg-[#c49440] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all duration-200 shadow-[0_0_20px_rgba(212,168,83,0.25)] hover:shadow-[0_0_28px_rgba(212,168,83,0.4)] mt-2">
                {loading ? (
                  <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                ) : (
                  <>확인 <ArrowRight size={15} /></>
                )}
              </button>
              <button type="button" onClick={() => { setRequires2FA(false); setTotpCode(''); setError('') }}
                className="w-full text-xs text-[#5a4830] hover:text-[#7a6040] transition-colors py-1">
                ← 뒤로 가기
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs text-[#7a6040] uppercase tracking-wider font-semibold">이메일</label>
                <div className="relative">
                  <Mail size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#5a4830] pointer-events-none" />
                  <input type="email" value={form.email}
                    onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                    required placeholder="you@example.com" className={inputCls} />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-[#7a6040] uppercase tracking-wider font-semibold">비밀번호</label>
                  <Link href="/forgot-password" className="text-xs text-[#d4a853] hover:text-[#e0b878] transition-colors">
                    찾기
                  </Link>
                </div>
                <div className="relative">
                  <Lock size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#5a4830] pointer-events-none" />
                  <input type="password" value={form.password}
                    onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                    required placeholder="••••••••" className={inputCls} />
                </div>
              </div>

              <button type="submit" disabled={loading}
                className="w-full h-11 flex items-center justify-center gap-2 bg-[#d4a853] hover:bg-[#c49440] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all duration-200 shadow-[0_0_20px_rgba(212,168,83,0.25)] hover:shadow-[0_0_28px_rgba(212,168,83,0.4)] mt-2">
                {loading ? (
                  <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                ) : (
                  <>로그인 <ArrowRight size={15} /></>
                )}
              </button>
            </form>
          )}
        </div>

        {!requires2FA && (
          <p className="text-center text-sm text-[#5a4830] mt-6">
            계정이 없으신가요?{' '}
            <Link href="/register" className="text-[#d4a853] hover:text-[#e0b878] font-medium transition-colors">
              무료 가입
            </Link>
          </p>
        )}
      </div>
    </div>
  )
}

'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import Link from 'next/link'
import { Rocket, KeyRound, Eye, EyeOff, CheckCircle, AlertCircle, ArrowLeft, ArrowRight } from 'lucide-react'

function ResetPasswordForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('token')

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) setError('유효하지 않은 링크입니다. 비밀번호 찾기를 다시 시도해주세요.')
  }, [token])

  const pwStrength = password.length >= 12 ? 3 : password.length >= 10 ? 2 : password.length >= 8 ? 1 : 0
  const strengthColor = ['', 'bg-red-500', 'bg-yellow-500', 'bg-emerald-500'][pwStrength]
  const strengthLabel = ['', '약함', '보통', '강함'][pwStrength]
  const pwMatch = confirm && password === confirm

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setError('비밀번호가 일치하지 않습니다.'); return }
    if (password.length < 8) { setError('비밀번호는 최소 8자 이상이어야 합니다.'); return }
    setError(null); setLoading(true)
    try {
      await api.post('/auth/reset-password', { token, password })
      setDone(true)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      setError(e.response?.data?.message ?? '오류가 발생했습니다. 링크가 만료되었을 수 있습니다.')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="w-full max-w-sm">
        <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-[#7a6040] hover:text-[#e8d5b0] transition-colors mb-8 group">
          <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
          로그인으로 돌아가기
        </Link>

        <div className="flex items-center gap-2.5 mb-8">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#d4a853] to-[#b8860b] flex items-center justify-center shadow-[0_0_16px_rgba(212,168,83,0.35)]">
            <Rocket size={17} className="text-white" strokeWidth={2.5} />
          </div>
          <span className="text-lg font-bold text-white">Rocket <span className="text-[#d4a853]">AH</span></span>
        </div>

        <div className="bg-[#1a1410] border border-[#2e2318] rounded-2xl p-6 space-y-5">
          {done ? (
            <div className="space-y-4 text-center py-2">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-950/60 border border-emerald-800/40 mx-auto">
                <CheckCircle size={28} className="text-emerald-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white mb-1">비밀번호 변경 완료!</h2>
                <p className="text-sm text-[#7a6040]">새 비밀번호로 로그인해주세요.</p>
              </div>
              <Link href="/login"
                className="flex items-center justify-center gap-2 h-11 w-full bg-[#d4a853] hover:bg-[#c49440] text-white rounded-xl font-semibold transition-all shadow-[0_0_20px_rgba(212,168,83,0.25)]">
                로그인하기 <ArrowRight size={14} />
              </Link>
            </div>
          ) : (
            <>
              <div>
                <h2 className="text-base font-bold text-white mb-1">새 비밀번호 설정</h2>
                <p className="text-sm text-[#7a6040]">사용할 새 비밀번호를 입력해주세요.</p>
              </div>

              {error && (
                <div className="flex items-start gap-2 text-sm text-red-400 bg-red-950/50 border border-red-800/40 rounded-xl px-4 py-3">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" /> {error}
                </div>
              )}

              {!token ? (
                <Link href="/forgot-password"
                  className="flex items-center justify-center h-11 w-full bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] text-[#8a7055] hover:text-[#e8d5b0] rounded-xl text-sm transition-all">
                  비밀번호 찾기로 이동
                </Link>
              ) : (
                <form onSubmit={submit} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs text-[#7a6040] uppercase tracking-wider font-semibold">새 비밀번호</label>
                    <div className="relative">
                      <KeyRound size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#5a4830] pointer-events-none" />
                      <input type={showPw ? 'text' : 'password'} value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="8자 이상" required autoFocus
                        className="w-full bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] focus:border-[#d4a853]/50 rounded-xl px-4 py-3 pl-11 pr-11 text-sm text-[#f5ead8] placeholder:text-[#5a4830] focus:outline-none transition-colors" />
                      <button type="button" onClick={() => setShowPw(v => !v)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-[#5a4830] hover:text-[#9e8a6a] transition-colors">
                        {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                    {password && (
                      <div className="space-y-1">
                        <div className="flex gap-1">
                          {[1, 2, 3].map(lvl => (
                            <div key={lvl} className={`h-1 flex-1 rounded-full transition-colors ${pwStrength >= lvl ? strengthColor : 'bg-[#2e2318]'}`} />
                          ))}
                        </div>
                        <p className={`text-[11px] ${['', 'text-red-400', 'text-yellow-400', 'text-emerald-400'][pwStrength]}`}>{strengthLabel}</p>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-[#7a6040] uppercase tracking-wider font-semibold">비밀번호 확인</label>
                    <div className="relative">
                      <KeyRound size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#5a4830] pointer-events-none" />
                      <input type={showPw ? 'text' : 'password'} value={confirm}
                        onChange={e => setConfirm(e.target.value)}
                        placeholder="비밀번호를 다시 입력" required
                        className={`w-full bg-[#1a1410] border rounded-xl px-4 py-3 pl-11 text-sm text-[#f5ead8] placeholder:text-[#5a4830] focus:outline-none transition-colors ${
                          confirm && !pwMatch ? 'border-red-800/60 focus:border-red-700/60' : 'border-[#2e2318] hover:border-[#4a3520] focus:border-[#d4a853]/50'
                        }`} />
                      {pwMatch && <CheckCircle size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-400" />}
                    </div>
                    {confirm && !pwMatch && (
                      <p className="text-[11px] text-red-400">비밀번호가 일치하지 않습니다.</p>
                    )}
                  </div>

                  <button type="submit" disabled={loading || !password || !confirm}
                    className="w-full h-11 flex items-center justify-center gap-2 bg-[#d4a853] hover:bg-[#c49440] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all shadow-[0_0_20px_rgba(212,168,83,0.25)]">
                    {loading ? <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <>비밀번호 변경 <ArrowRight size={14} /></>}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-[#2e2318] border-t-[#d4a853] animate-spin" />
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  )
}

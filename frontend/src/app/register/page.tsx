'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import { api } from '@/lib/api'
import { Rocket, Mail, Lock, User, AlertCircle, ArrowRight, Check } from 'lucide-react'

const inputCls = 'w-full bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] focus:border-[#d4a853]/50 rounded-xl px-4 py-3 text-sm text-[#f5ead8] placeholder:text-[#5a4830] focus:outline-none transition-colors pl-11'

export default function RegisterPage() {
  const router = useRouter()
  const { user, setAuth } = useAuthStore()
  const [form, setForm] = useState({ email: '', nickname: '', password: '', confirm: '' })
  const [agreed, setAgreed] = useState({ terms: false, privacy: false })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const allAgreed = agreed.terms && agreed.privacy
  const toggleAll = (v: boolean) => setAgreed({ terms: v, privacy: v })

  useEffect(() => { if (user) router.replace('/') }, [user, router])

  const pwMatch = form.confirm && form.password === form.confirm
  const pwStrength = form.password.length >= 12 ? 3 : form.password.length >= 8 ? 2 : form.password.length > 0 ? 1 : 0
  const strengthColor = ['', 'bg-red-500', 'bg-yellow-500', 'bg-emerald-500'][pwStrength]
  const strengthLabel = ['', '약함', '보통', '강함'][pwStrength]

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!allAgreed) { setError('이용약관 및 개인정보 처리방침에 동의해주세요.'); return }
    if (form.password !== form.confirm) { setError('비밀번호가 일치하지 않습니다.'); return }
    if (form.password.length < 8) { setError('비밀번호는 8자 이상이어야 합니다.'); return }
    if (form.nickname.length < 2) { setError('닉네임은 2자 이상이어야 합니다.'); return }
    setLoading(true)
    try {
      const { data } = await api.post('/auth/register', { email: form.email, nickname: form.nickname, password: form.password })
      setAuth(data.user, data.token)
      router.push('/')
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { message?: string; errors?: { fieldErrors?: Record<string, string[]> } } } }
      const status = e.response?.status
      const msg = e.response?.data?.message
      const fieldErrors = e.response?.data?.errors?.fieldErrors
      if (status === 409) setError('이미 사용 중인 이메일 또는 닉네임입니다.')
      else if (fieldErrors) setError(Object.values(fieldErrors).flat()[0] ?? msg ?? '입력값을 확인해주세요.')
      else setError(msg ?? '회원가입에 실패했습니다.')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-8">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-[#d4a853] to-[#b8860b] shadow-[0_0_28px_rgba(212,168,83,0.4)] mb-4">
            <Rocket size={24} className="text-white" strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">회원가입</h1>
          <p className="text-sm text-[#7a6040]">무료로 시작하세요</p>
        </div>

        <div className="bg-[#1a1410] border border-[#2e2318] rounded-2xl p-6">
          {error && (
            <div className="flex items-start gap-2.5 bg-red-950/50 border border-red-800/50 text-red-400 rounded-xl px-4 py-3 text-sm mb-4">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}

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
              <label className="text-xs text-[#7a6040] uppercase tracking-wider font-semibold">닉네임</label>
              <div className="relative">
                <User size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#5a4830] pointer-events-none" />
                <input type="text" value={form.nickname}
                  onChange={e => setForm(p => ({ ...p, nickname: e.target.value }))}
                  required minLength={2} maxLength={20} placeholder="2~20자" className={inputCls} />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-[#7a6040] uppercase tracking-wider font-semibold">비밀번호</label>
              <div className="relative">
                <Lock size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#5a4830] pointer-events-none" />
                <input type="password" value={form.password}
                  onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                  required minLength={8} placeholder="8자 이상" className={inputCls} />
              </div>
              {form.password && (
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
                <Lock size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#5a4830] pointer-events-none" />
                <input type="password" value={form.confirm}
                  onChange={e => setForm(p => ({ ...p, confirm: e.target.value }))}
                  required placeholder="••••••••" className={`${inputCls} ${form.confirm && !pwMatch ? 'border-red-800/50' : ''}`} />
                {pwMatch && (
                  <Check size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-400" />
                )}
              </div>
            </div>

            {/* 약관 동의 */}
            <div className="space-y-2 pt-1">
              {/* 전체 동의 */}
              <label className="flex items-center gap-3 p-3 rounded-xl bg-[#1a1208] border border-[#2e2318] cursor-pointer hover:border-[#4a3520] transition-colors">
                <div onClick={() => toggleAll(!allAgreed)}
                  className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-colors ${allAgreed ? 'bg-[#d4a853] border-[#d4a853]' : 'border-[#4a3520]'}`}>
                  {allAgreed && <Check size={10} className="text-white" />}
                </div>
                <span className="text-sm font-semibold text-[#e8d5b0]" onClick={() => toggleAll(!allAgreed)}>전체 동의</span>
              </label>
              {/* 이용약관 */}
              <label className="flex items-center gap-3 pl-2 cursor-pointer group">
                <div onClick={() => setAgreed(p => ({ ...p, terms: !p.terms }))}
                  className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-colors ${agreed.terms ? 'bg-[#d4a853] border-[#d4a853]' : 'border-[#4a3520]'}`}>
                  {agreed.terms && <Check size={10} className="text-white" />}
                </div>
                <span className="text-xs text-[#8a7055] flex-1" onClick={() => setAgreed(p => ({ ...p, terms: !p.terms }))}>
                  <span className="text-[#f0a832]">[필수]</span> 이용약관 동의
                </span>
                <Link href="/terms" target="_blank" className="text-xs text-[#5a4830] hover:text-[#d4a853] underline transition-colors shrink-0">보기</Link>
              </label>
              {/* 개인정보 처리방침 */}
              <label className="flex items-center gap-3 pl-2 cursor-pointer group">
                <div onClick={() => setAgreed(p => ({ ...p, privacy: !p.privacy }))}
                  className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-colors ${agreed.privacy ? 'bg-[#d4a853] border-[#d4a853]' : 'border-[#4a3520]'}`}>
                  {agreed.privacy && <Check size={10} className="text-white" />}
                </div>
                <span className="text-xs text-[#8a7055] flex-1" onClick={() => setAgreed(p => ({ ...p, privacy: !p.privacy }))}>
                  <span className="text-[#f0a832]">[필수]</span> 개인정보 처리방침 동의
                </span>
                <Link href="/privacy" target="_blank" className="text-xs text-[#5a4830] hover:text-[#d4a853] underline transition-colors shrink-0">보기</Link>
              </label>
            </div>

            <button type="submit" disabled={loading || !allAgreed}
              className="w-full h-11 flex items-center justify-center gap-2 bg-[#d4a853] hover:bg-[#c49440] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all duration-200 shadow-[0_0_20px_rgba(212,168,83,0.25)] hover:shadow-[0_0_28px_rgba(212,168,83,0.4)] mt-2">
              {loading ? (
                <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              ) : (
                <>가입하기 <ArrowRight size={15} /></>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-[#5a4830] mt-6">
          이미 계정이 있으신가요?{' '}
          <Link href="/login" className="text-[#d4a853] hover:text-[#e0b878] font-medium transition-colors">
            로그인
          </Link>
        </p>
      </div>
    </div>
  )
}

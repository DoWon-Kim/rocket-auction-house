'use client'

import { useState } from 'react'
import { api } from '@/lib/api'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Rocket, Mail, User, Phone, AlertCircle, CheckCircle, ArrowLeft, ArrowRight, Lock } from 'lucide-react'

type Tab = 'find-id' | 'forgot-pw'
interface FindIdResult { found: boolean; nickname?: string; email?: string }

const inputCls = 'w-full bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] focus:border-[#d4a853]/50 rounded-xl px-4 py-3 pl-11 text-sm text-[#f5ead8] placeholder:text-[#5a4830] focus:outline-none transition-colors'

export default function ForgotPasswordPage() {
  const [tab, setTab] = useState<Tab>('find-id')

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

        <div className="flex bg-[#1a1410] border border-[#2e2318] rounded-xl p-1 mb-6">
          {(['find-id', 'forgot-pw'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all duration-150 ${
                tab === t
                  ? 'bg-[#2a1c08] text-[#e0b878] shadow-[0_0_10px_rgba(212,168,83,0.1)]'
                  : 'text-[#7a6040] hover:text-[#9e8a6a]'
              }`}>
              {t === 'find-id' ? '아이디 찾기' : '비밀번호 찾기'}
            </button>
          ))}
        </div>

        {tab === 'find-id' ? <FindIdTab /> : <ForgotPwTab />}
      </div>
    </div>
  )
}

function FindIdTab() {
  const [email, setEmail] = useState('')
  const [result, setResult] = useState<FindIdResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setResult(null); setLoading(true)
    try {
      const res = await api.post<FindIdResult>('/auth/find-id', { email })
      setResult(res.data)
    } catch { setError('조회 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.') }
    finally { setLoading(false) }
  }

  return (
    <div className="bg-[#1a1410] border border-[#2e2318] rounded-2xl p-6 space-y-5">
      <div>
        <h2 className="text-base font-bold text-white mb-1">아이디 찾기</h2>
        <p className="text-sm text-[#7a6040]">가입 시 사용한 이메일로 닉네임을 확인합니다.</p>
      </div>

      {!result ? (
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs text-[#7a6040] uppercase tracking-wider font-semibold">이메일</label>
            <div className="relative">
              <Mail size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#5a4830] pointer-events-none" />
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="가입 시 사용한 이메일" required autoFocus className={inputCls} />
            </div>
          </div>
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-400 bg-red-950/50 border border-red-800/40 rounded-xl px-4 py-3">
              <AlertCircle size={14} /> {error}
            </div>
          )}
          <button type="submit" disabled={loading}
            className="w-full h-11 flex items-center justify-center gap-2 bg-[#d4a853] hover:bg-[#c49440] disabled:opacity-50 text-white font-semibold rounded-xl transition-all shadow-[0_0_20px_rgba(212,168,83,0.25)]">
            {loading ? <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <>조회하기 <ArrowRight size={14} /></>}
          </button>
        </form>
      ) : result.found ? (
        <div className="space-y-4">
          <div className="bg-[#0d1a2e] border border-[#3d2a0c]/60 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-[#d4a853] text-sm font-medium">
              <CheckCircle size={15} /> 회원 정보를 찾았습니다
            </div>
            <div className="space-y-2.5">
              <div className="flex justify-between items-center">
                <span className="text-xs text-[#7a6040] uppercase tracking-wider">닉네임</span>
                <div className="flex items-center gap-1.5">
                  <User size={12} className="text-[#d4a853]" />
                  <span className="font-bold text-white">{result.nickname}</span>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-[#7a6040] uppercase tracking-wider">이메일</span>
                <span className="text-[#9e8a6a] text-sm">{result.email}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setResult(null); setEmail('') }}
              className="flex-1 h-10 bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] text-[#8a7055] hover:text-[#e8d5b0] rounded-xl text-sm transition-all">
              다시 찾기
            </button>
            <Link href="/login"
              className="flex-1 h-10 flex items-center justify-center bg-[#d4a853] hover:bg-[#c49440] text-white rounded-xl text-sm font-semibold transition-all">
              로그인하기
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-[#8a7055] bg-[#1a1410] border border-[#2e2318] rounded-xl px-4 py-4">
            <AlertCircle size={15} className="text-[#f0a832] shrink-0" />
            해당 이메일로 가입된 계정을 찾을 수 없습니다.
          </div>
          <button onClick={() => { setResult(null); setEmail('') }}
            className="w-full h-10 bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] text-[#8a7055] hover:text-[#e8d5b0] rounded-xl text-sm transition-all">
            다시 시도
          </button>
        </div>
      )}
    </div>
  )
}

type PwStep = 'phone' | 'otp' | 'done'

function ForgotPwTab() {
  const router = useRouter()
  const [step, setStep] = useState<PwStep>('phone')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function requestOtp(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setLoading(true)
    try {
      await api.post('/auth/request-phone-otp', { phone: phone.replace(/-/g, '') })
      setStep('otp')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message
      setError(msg ?? '인증번호 발송에 실패했습니다.')
    } finally { setLoading(false) }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (newPassword !== confirm) { setError('비밀번호가 일치하지 않습니다.'); return }
    if (newPassword.length < 8) { setError('비밀번호는 최소 8자 이상이어야 합니다.'); return }
    setLoading(true)
    try {
      await api.post('/auth/verify-phone-otp', {
        phone: phone.replace(/-/g, ''),
        otp,
        newPassword,
      })
      setStep('done')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message
      setError(msg ?? '인증에 실패했습니다.')
    } finally { setLoading(false) }
  }

  if (step === 'done') {
    return (
      <div className="bg-[#1a1410] border border-[#2e2318] rounded-2xl p-6 space-y-5">
        <div className="bg-emerald-950/40 border border-emerald-800/40 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
            <CheckCircle size={15} /> 비밀번호가 변경되었습니다
          </div>
          <p className="text-sm text-[#9e8a6a]">새 비밀번호로 로그인해주세요.</p>
        </div>
        <button onClick={() => router.push('/login')}
          className="w-full h-11 flex items-center justify-center gap-2 bg-[#d4a853] hover:bg-[#c49440] text-white font-semibold rounded-xl transition-all">
          로그인하기 <ArrowRight size={14} />
        </button>
      </div>
    )
  }

  return (
    <div className="bg-[#1a1410] border border-[#2e2318] rounded-2xl p-6 space-y-5">
      <div>
        <h2 className="text-base font-bold text-white mb-1">비밀번호 찾기</h2>
        <p className="text-sm text-[#7a6040]">
          {step === 'phone' ? '가입 시 등록한 휴대폰 번호로 인증합니다.' : '인증번호를 입력하고 새 비밀번호를 설정하세요.'}
        </p>
      </div>

      {/* 진행 단계 표시 */}
      <div className="flex items-center gap-2">
        {['휴대폰 번호', '인증 & 변경'].map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 text-xs font-medium ${
              (step === 'phone' && i === 0) || (step === 'otp' && i === 1)
                ? 'text-[#d4a853]' : i < (step === 'otp' ? 1 : 0) ? 'text-emerald-400' : 'text-[#4a3820]'
            }`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                (step === 'phone' && i === 0) || (step === 'otp' && i === 1)
                  ? 'bg-[#d4a853] text-white' : i < (step === 'otp' ? 1 : 0) ? 'bg-emerald-600 text-white' : 'bg-[#2e2318] text-[#5a4830]'
              }`}>{i < (step === 'otp' ? 1 : 0) ? '✓' : i + 1}</span>
              {label}
            </div>
            {i === 0 && <div className="flex-1 h-px bg-[#2e2318] w-6" />}
          </div>
        ))}
      </div>

      {step === 'phone' ? (
        <form onSubmit={requestOtp} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs text-[#7a6040] uppercase tracking-wider font-semibold">휴대폰 번호</label>
            <div className="relative">
              <Phone size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#5a4830] pointer-events-none" />
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="01012345678" required autoFocus className={inputCls} />
            </div>
            <p className="text-[11px] text-[#4a3820]">가입 시 등록한 번호를 입력해주세요.</p>
          </div>
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-400 bg-red-950/50 border border-red-800/40 rounded-xl px-4 py-3">
              <AlertCircle size={14} /> {error}
            </div>
          )}
          <button type="submit" disabled={loading}
            className="w-full h-11 flex items-center justify-center gap-2 bg-[#d4a853] hover:bg-[#c49440] disabled:opacity-50 text-white font-semibold rounded-xl transition-all shadow-[0_0_20px_rgba(212,168,83,0.25)]">
            {loading ? <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <>인증번호 받기 <ArrowRight size={14} /></>}
          </button>
        </form>
      ) : (
        <form onSubmit={verifyOtp} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs text-[#7a6040] uppercase tracking-wider font-semibold">인증번호</label>
            <div className="relative">
              <Phone size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#5a4830] pointer-events-none" />
              <input type="text" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6자리 인증번호" maxLength={6} required autoFocus className={inputCls} />
            </div>
            <p className="text-[11px] text-[#4a3820]">{phone}으로 발송된 6자리 번호를 입력하세요. (5분 이내)</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-[#7a6040] uppercase tracking-wider font-semibold">새 비밀번호</label>
            <div className="relative">
              <Lock size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#5a4830] pointer-events-none" />
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                placeholder="8자 이상" required className={inputCls} />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-[#7a6040] uppercase tracking-wider font-semibold">비밀번호 확인</label>
            <div className="relative">
              <Lock size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#5a4830] pointer-events-none" />
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                placeholder="비밀번호 재입력" required className={inputCls} />
            </div>
            {confirm && newPassword !== confirm && (
              <p className="text-[11px] text-red-400">비밀번호가 일치하지 않습니다.</p>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-400 bg-red-950/50 border border-red-800/40 rounded-xl px-4 py-3">
              <AlertCircle size={14} /> {error}
            </div>
          )}

          <div className="flex gap-2">
            <button type="button" onClick={() => { setStep('phone'); setOtp(''); setError(null) }}
              className="h-11 px-4 bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] text-[#8a7055] hover:text-[#e8d5b0] rounded-xl text-sm transition-all">
              재발송
            </button>
            <button type="submit" disabled={loading || otp.length !== 6}
              className="flex-1 h-11 flex items-center justify-center gap-2 bg-[#d4a853] hover:bg-[#c49440] disabled:opacity-50 text-white font-semibold rounded-xl transition-all">
              {loading ? <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <>비밀번호 변경 <ArrowRight size={14} /></>}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

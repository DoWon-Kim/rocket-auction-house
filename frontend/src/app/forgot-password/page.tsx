'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Rocket, Mail, User, Phone, Lock, Eye, EyeOff,
  AlertCircle, CheckCircle, ArrowLeft, ArrowRight, Clock, RefreshCw,
} from 'lucide-react'

type Tab = 'find-id' | 'forgot-pw'
type FindMethod = 'email' | 'phone'
interface FindIdResult { found: boolean; nickname?: string; email?: string; joinedAt?: string }
type ApiErr = { response?: { data?: { message?: string; retryAfter?: number } } }

const inputCls = 'w-full bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] focus:border-[#d4a853]/50 rounded-xl px-4 py-3 pl-11 text-sm text-[#f5ead8] placeholder:text-[#5a4830] focus:outline-none transition-colors'

function formatTime(s: number) {
  const m = Math.floor(s / 60)
  return `${m}:${(s % 60).toString().padStart(2, '0')}`
}

function formatDate(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 가입`
}

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

        {tab === 'find-id' ? <FindIdTab setTab={setTab} /> : <ForgotPwTab />}
      </div>
    </div>
  )
}

// ── 아이디 찾기 ───────────────────────────────────────────────────────────────

function FindIdTab({ setTab }: { setTab: (t: Tab) => void }) {
  const [method, setMethod] = useState<FindMethod>('email')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [result, setResult] = useState<FindIdResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setResult(null); setLoading(true)
    try {
      const body = method === 'email'
        ? { email }
        : { phone: phone.replace(/-/g, '') }
      const res = await api.post<FindIdResult>('/auth/find-id', body)
      setResult(res.data)
    } catch { setError('조회 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.') }
    finally { setLoading(false) }
  }

  function reset() {
    setResult(null); setEmail(''); setPhone(''); setError(null)
  }

  return (
    <div className="bg-[#1a1410] border border-[#2e2318] rounded-2xl p-6 space-y-5">
      <div>
        <h2 className="text-base font-bold text-white mb-1">아이디 찾기</h2>
        <p className="text-sm text-[#7a6040]">가입 시 사용한 정보로 닉네임을 확인합니다.</p>
      </div>

      {/* 찾기 방법 선택 */}
      <div className="flex bg-[#0f0d0b] border border-[#1e1810] rounded-xl p-0.5">
        {(['email', 'phone'] as FindMethod[]).map(m => (
          <button key={m} type="button" onClick={() => { setMethod(m); setError(null) }}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              method === m ? 'bg-[#2a1c08] text-[#d4a853]' : 'text-[#5a4830] hover:text-[#8a7055]'
            }`}>
            {m === 'email' ? '이메일로 찾기' : '휴대폰으로 찾기'}
          </button>
        ))}
      </div>

      {!result ? (
        <form onSubmit={submit} className="space-y-4">
          {method === 'email' ? (
            <div className="space-y-1.5">
              <label className="text-xs text-[#7a6040] uppercase tracking-wider font-semibold">이메일</label>
              <div className="relative">
                <Mail size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#5a4830] pointer-events-none" />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="가입 시 사용한 이메일" required autoFocus className={inputCls} />
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="text-xs text-[#7a6040] uppercase tracking-wider font-semibold">휴대폰 번호</label>
              <div className="relative">
                <Phone size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#5a4830] pointer-events-none" />
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                  placeholder="01012345678" required autoFocus className={inputCls} />
              </div>
              <p className="text-[11px] text-[#4a3820]">가입 시 등록한 휴대폰 번호를 입력해주세요.</p>
            </div>
          )}
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
          <div className="bg-[#0a1520] border border-[#1a3040]/60 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-[#d4a853] text-sm font-medium">
              <CheckCircle size={15} /> 회원 정보를 찾았습니다
            </div>
            <div className="h-px bg-[#1a2a3a]/60" />
            <div className="space-y-2.5">
              <div className="flex justify-between items-center">
                <span className="text-xs text-[#4a6070] uppercase tracking-wider">닉네임</span>
                <div className="flex items-center gap-1.5">
                  <User size={12} className="text-[#d4a853]" />
                  <span className="font-bold text-white">{result.nickname}</span>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-[#4a6070] uppercase tracking-wider">이메일</span>
                <span className="text-[#9e8a6a] text-sm font-mono">{result.email}</span>
              </div>
              {result.joinedAt && (
                <div className="flex justify-between items-center">
                  <span className="text-xs text-[#4a6070] uppercase tracking-wider">가입일</span>
                  <span className="text-[#6a8090] text-xs">{formatDate(result.joinedAt)}</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={reset}
              className="flex-1 h-10 bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] text-[#8a7055] hover:text-[#e8d5b0] rounded-xl text-sm transition-all">
              다시 찾기
            </button>
            <button onClick={() => setTab('forgot-pw')}
              className="flex-1 h-10 flex items-center justify-center gap-1.5 bg-[#2a1c08] border border-[#4a3520] hover:bg-[#3a2810] text-[#d4a853] rounded-xl text-sm font-medium transition-all">
              <Lock size={12} /> 비밀번호 찾기
            </button>
          </div>
          <Link href="/login"
            className="w-full h-10 flex items-center justify-center gap-2 bg-[#d4a853] hover:bg-[#c49440] text-white rounded-xl text-sm font-semibold transition-all">
            로그인하기 <ArrowRight size={13} />
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 text-sm text-[#8a7055] bg-[#1a1208] border border-[#2e2010] rounded-xl px-4 py-4">
            <AlertCircle size={15} className="text-[#f0a832] shrink-0 mt-0.5" />
            <span>
              {method === 'email' ? '해당 이메일로' : '해당 휴대폰 번호로'} 가입된 계정을 찾을 수 없습니다.
            </span>
          </div>
          <button onClick={reset}
            className="w-full h-10 bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] text-[#8a7055] hover:text-[#e8d5b0] rounded-xl text-sm transition-all">
            다시 시도
          </button>
        </div>
      )}
    </div>
  )
}

// ── 비밀번호 찾기 ──────────────────────────────────────────────────────────────

type PwStep = 'phone' | 'otp' | 'done'

function ForgotPwTab() {
  const router = useRouter()
  const [step, setStep] = useState<PwStep>('phone')
  const [phone, setPhone] = useState('')
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', ''])
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [otpExpiry, setOtpExpiry] = useState(0)
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])

  // 재발송 쿨다운
  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [resendCooldown])

  // OTP 만료 카운트다운
  useEffect(() => {
    if (step !== 'otp' || otpExpiry <= 0) return
    const t = setTimeout(() => setOtpExpiry(e => e - 1), 1000)
    return () => clearTimeout(t)
  }, [step, otpExpiry])

  async function sendOtp(phoneNum: string) {
    setLoading(true); setError(null)
    try {
      await api.post('/auth/request-phone-otp', { phone: phoneNum.replace(/-/g, '') })
      setOtpDigits(['', '', '', '', '', ''])
      setResendCooldown(60)
      setOtpExpiry(300)
      setStep('otp')
      setTimeout(() => otpRefs.current[0]?.focus(), 50)
    } catch (err: unknown) {
      const e = err as ApiErr
      const msg = e.response?.data?.message
      const retry = e.response?.data?.retryAfter
      setError(msg ?? '인증번호 발송에 실패했습니다.')
      if (retry) setResendCooldown(retry)
    } finally { setLoading(false) }
  }

  async function requestOtp(e: React.FormEvent) {
    e.preventDefault()
    await sendOtp(phone)
  }

  async function resendOtp() {
    if (resendCooldown > 0) return
    await sendOtp(phone)
  }

  function handleOtpChange(i: number, val: string) {
    const digit = val.replace(/\D/g, '').slice(-1)
    const next = [...otpDigits]
    next[i] = digit
    setOtpDigits(next)
    if (digit && i < 5) otpRefs.current[i + 1]?.focus()
  }

  function handleOtpKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !otpDigits[i] && i > 0) {
      otpRefs.current[i - 1]?.focus()
    }
    if (e.key === 'ArrowLeft' && i > 0) otpRefs.current[i - 1]?.focus()
    if (e.key === 'ArrowRight' && i < 5) otpRefs.current[i + 1]?.focus()
  }

  function handleOtpPaste(e: React.ClipboardEvent) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted.length > 0) {
      e.preventDefault()
      const next = [...pasted.split(''), ...Array(6).fill('')].slice(0, 6)
      setOtpDigits(next)
      const focusIdx = Math.min(pasted.length, 5)
      otpRefs.current[focusIdx]?.focus()
    }
  }

  const setOtpRef = useCallback((i: number) => (el: HTMLInputElement | null) => {
    otpRefs.current[i] = el
  }, [])

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (newPassword !== confirm) { setError('비밀번호가 일치하지 않습니다.'); return }
    if (newPassword.length < 8) { setError('비밀번호는 최소 8자 이상이어야 합니다.'); return }
    setLoading(true)
    try {
      await api.post('/auth/verify-phone-otp', {
        phone: phone.replace(/-/g, ''),
        otp: otpDigits.join(''),
        newPassword,
      })
      setStep('done')
    } catch (err: unknown) {
      const msg = (err as ApiErr).response?.data?.message
      setError(msg ?? '인증에 실패했습니다.')
    } finally { setLoading(false) }
  }

  const otp = otpDigits.join('')
  const pwStrength = newPassword.length >= 12 ? 3 : newPassword.length >= 8 ? 2 : newPassword.length > 0 ? 1 : 0
  const strengthColor = ['', 'bg-red-500', 'bg-yellow-500', 'bg-emerald-500'][pwStrength]
  const strengthLabel = ['', '약함', '보통', '강함'][pwStrength]
  const pwMatch = confirm.length > 0 && newPassword === confirm
  const otpExpired = step === 'otp' && otpExpiry === 0

  if (step === 'done') {
    return (
      <div className="bg-[#1a1410] border border-[#2e2318] rounded-2xl p-6 space-y-5">
        <div className="bg-emerald-950/40 border border-emerald-800/40 rounded-xl p-5 text-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-emerald-900/50 flex items-center justify-center mx-auto mb-3">
            <CheckCircle size={22} className="text-emerald-400" />
          </div>
          <p className="font-bold text-white">비밀번호 변경 완료</p>
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
          {step === 'phone' ? '가입 시 등록한 휴대폰 번호로 인증합니다.' : '발송된 인증번호를 입력하고 새 비밀번호를 설정하세요.'}
        </p>
      </div>

      {/* 단계 표시 */}
      <div className="flex items-center gap-0">
        {[{ label: '번호 입력', s: 'phone' }, { label: '인증 & 변경', s: 'otp' }].map(({ label, s }, i) => {
          const isActive = step === s
          const isDone = (s === 'phone' && step === 'otp')
          return (
            <div key={s} className="flex items-center gap-0 flex-1">
              <div className={`flex items-center gap-1.5 text-xs font-medium ${isActive ? 'text-[#d4a853]' : isDone ? 'text-emerald-400' : 'text-[#3a2c1a]'}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                  isActive ? 'bg-[#d4a853] text-white' : isDone ? 'bg-emerald-600 text-white' : 'bg-[#2e2318] text-[#4a3820]'
                }`}>{isDone ? '✓' : i + 1}</span>
                {label}
              </div>
              {i === 0 && <div className="flex-1 h-px bg-[#2e2318] mx-2" />}
            </div>
          )
        })}
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
              <AlertCircle size={14} className="shrink-0" /> {error}
            </div>
          )}
          <button type="submit" disabled={loading}
            className="w-full h-11 flex items-center justify-center gap-2 bg-[#d4a853] hover:bg-[#c49440] disabled:opacity-50 text-white font-semibold rounded-xl transition-all shadow-[0_0_20px_rgba(212,168,83,0.25)]">
            {loading
              ? <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              : <>인증번호 받기 <ArrowRight size={14} /></>}
          </button>
        </form>
      ) : (
        <form onSubmit={verifyOtp} className="space-y-4">
          {/* OTP 박스 */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-xs text-[#7a6040] uppercase tracking-wider font-semibold">인증번호</label>
              <span className={`text-xs font-mono flex items-center gap-1 ${
                otpExpired ? 'text-red-400' : otpExpiry <= 60 ? 'text-orange-400' : 'text-[#6a7a6a]'
              }`}>
                <Clock size={11} />
                {otpExpired ? '만료됨' : formatTime(otpExpiry)}
              </span>
            </div>
            <div className="flex gap-2 justify-between" onPaste={handleOtpPaste}>
              {otpDigits.map((digit, i) => (
                <input key={i} ref={setOtpRef(i)}
                  type="text" inputMode="numeric" maxLength={2} value={digit}
                  onChange={e => handleOtpChange(i, e.target.value)}
                  onKeyDown={e => handleOtpKeyDown(i, e)}
                  className={`w-10 h-12 text-center text-lg font-bold bg-[#120f0b] rounded-xl text-[#f5ead8] focus:outline-none transition-all border ${
                    digit
                      ? 'border-[#d4a853]/70 shadow-[0_0_8px_rgba(212,168,83,0.15)]'
                      : 'border-[#2e2318] hover:border-[#4a3520] focus:border-[#d4a853]/50'
                  } ${otpExpired ? 'opacity-50' : ''}`}
                />
              ))}
            </div>
            <div className="flex justify-between items-center">
              <p className="text-[11px] text-[#4a3820]">{phone}으로 발송된 6자리 번호</p>
              <button type="button" onClick={resendOtp} disabled={resendCooldown > 0 || loading}
                className="flex items-center gap-1 text-[11px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-[#7a6040] hover:text-[#d4a853] enabled:hover:text-[#d4a853]">
                <RefreshCw size={10} />
                {resendCooldown > 0 ? `재발송 (${resendCooldown}초)` : '재발송'}
              </button>
            </div>
          </div>

          {otpExpired && (
            <div className="flex items-center gap-2 text-xs text-orange-400 bg-orange-950/40 border border-orange-800/30 rounded-xl px-3 py-2.5">
              <Clock size={12} className="shrink-0" />
              인증번호가 만료되었습니다. 재발송 버튼을 눌러주세요.
            </div>
          )}

          {/* 새 비밀번호 */}
          <div className="space-y-1.5">
            <label className="text-xs text-[#7a6040] uppercase tracking-wider font-semibold">새 비밀번호</label>
            <div className="relative">
              <Lock size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#5a4830] pointer-events-none" />
              <input type={showPw ? 'text' : 'password'} value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="8자 이상" required className={`${inputCls} pr-11`} />
              <button type="button" onClick={() => setShowPw(p => !p)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[#5a4830] hover:text-[#9e8a6a] transition-colors">
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            {newPassword && (
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

          {/* 비밀번호 확인 */}
          <div className="space-y-1.5">
            <label className="text-xs text-[#7a6040] uppercase tracking-wider font-semibold">비밀번호 확인</label>
            <div className="relative">
              <Lock size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#5a4830] pointer-events-none" />
              <input type={showConfirm ? 'text' : 'password'} value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="비밀번호 재입력" required
                className={`${inputCls} pr-11 ${confirm && !pwMatch ? 'border-red-800/50' : pwMatch ? 'border-emerald-700/50' : ''}`} />
              <button type="button" onClick={() => setShowConfirm(p => !p)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[#5a4830] hover:text-[#9e8a6a] transition-colors">
                {showConfirm ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            {confirm && !pwMatch && (
              <p className="text-[11px] text-red-400">비밀번호가 일치하지 않습니다.</p>
            )}
            {pwMatch && (
              <p className="text-[11px] text-emerald-400 flex items-center gap-1"><CheckCircle size={10} /> 비밀번호가 일치합니다.</p>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-400 bg-red-950/50 border border-red-800/40 rounded-xl px-4 py-3">
              <AlertCircle size={14} className="shrink-0" /> {error}
            </div>
          )}

          <button type="submit" disabled={loading || otp.length !== 6 || !pwMatch || otpExpired}
            className="w-full h-11 flex items-center justify-center gap-2 bg-[#d4a853] hover:bg-[#c49440] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all">
            {loading
              ? <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              : <>비밀번호 변경 <ArrowRight size={14} /></>}
          </button>
        </form>
      )}
    </div>
  )
}

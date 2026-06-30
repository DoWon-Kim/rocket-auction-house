'use client'

import { useState } from 'react'
import { api } from '@/lib/api'
import Link from 'next/link'
import { Rocket, Mail, User, AlertCircle, CheckCircle, ArrowLeft, ArrowRight } from 'lucide-react'

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

        {/* Tab switcher */}
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

function ForgotPwTab() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setLoading(true)
    try { await api.post('/auth/forgot-password', { email }); setSent(true) }
    catch { setError('요청 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.') }
    finally { setLoading(false) }
  }

  return (
    <div className="bg-[#1a1410] border border-[#2e2318] rounded-2xl p-6 space-y-5">
      <div>
        <h2 className="text-base font-bold text-white mb-1">비밀번호 찾기</h2>
        <p className="text-sm text-[#7a6040]">이메일로 비밀번호 재설정 링크를 보내드립니다.</p>
      </div>

      {!sent ? (
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
            {loading ? <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <>재설정 링크 보내기 <ArrowRight size={14} /></>}
          </button>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="bg-emerald-950/40 border border-emerald-800/40 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
              <CheckCircle size={15} /> 이메일을 전송했습니다
            </div>
            <p className="text-sm text-[#9e8a6a]"><strong className="text-[#e8d5b0]">{email}</strong>로 재설정 링크를 보냈습니다.</p>
            <p className="text-xs text-[#5a4830]">메일이 오지 않으면 스팸함을 확인하세요. 링크는 1시간 후 만료됩니다.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setSent(false); setEmail('') }}
              className="flex-1 h-10 bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] text-[#8a7055] hover:text-[#e8d5b0] rounded-xl text-sm transition-all">
              다시 보내기
            </button>
            <Link href="/login"
              className="flex-1 h-10 flex items-center justify-center bg-[#d4a853] hover:bg-[#c49440] text-white rounded-xl text-sm font-semibold transition-all">
              로그인하기
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

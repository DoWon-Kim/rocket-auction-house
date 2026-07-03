'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Shield, ShieldCheck, ShieldOff, Loader2, Copy, Check } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

export default function TwoFAPage() {
  const qc = useQueryClient()
  const [step, setStep] = useState<'idle' | 'scan' | 'confirm'>('idle')
  const [code, setCode] = useState('')
  const [disableCode, setDisableCode] = useState('')
  const [qrData, setQrData] = useState<{ qrCode: string; secret: string } | null>(null)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['2fa-status'],
    queryFn: () => api.get('/auth/2fa/status').then(r => r.data as { twoFaEnabled: boolean }),
  })

  const setupMut = useMutation({
    mutationFn: () => api.post('/auth/2fa/setup').then(r => r.data),
    onSuccess: (d) => { setQrData(d); setStep('scan') },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } }
      setMsg({ type: 'err', text: err.response?.data?.message ?? '설정 시작 실패' })
    },
  })

  const confirmMut = useMutation({
    mutationFn: () => api.post('/auth/2fa/confirm', { code }),
    onSuccess: () => {
      setMsg({ type: 'ok', text: '2단계 인증이 활성화되었습니다!' })
      setStep('idle'); setCode(''); setQrData(null)
      qc.invalidateQueries({ queryKey: ['2fa-status'] })
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } }
      setMsg({ type: 'err', text: err.response?.data?.message ?? '코드 확인 실패' })
    },
  })

  const disableMut = useMutation({
    mutationFn: () => api.post('/auth/2fa/disable', { code: disableCode }),
    onSuccess: () => {
      setMsg({ type: 'ok', text: '2단계 인증이 비활성화되었습니다.' })
      setDisableCode('')
      qc.invalidateQueries({ queryKey: ['2fa-status'] })
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } }
      setMsg({ type: 'err', text: err.response?.data?.message ?? '비활성화 실패' })
    },
  })

  function copySecret() {
    if (!qrData) return
    navigator.clipboard.writeText(qrData.secret)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <Loader2 className="w-8 h-8 text-[#d4a853] animate-spin" />
    </div>
  )

  const enabled = data?.twoFaEnabled ?? false

  return (
    <div className="max-w-lg mx-auto space-y-6 py-8 px-4">
      <div className="flex items-center gap-3 mb-2">
        <Link href="/my" className="text-[#5a4830] hover:text-[#d4a853] text-sm transition-colors">← 마이페이지</Link>
      </div>

      <div className="bg-[#1a1208] border border-[#3d2e1a] rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-3">
          {enabled
            ? <ShieldCheck className="w-8 h-8 text-emerald-400" />
            : <Shield className="w-8 h-8 text-[#5a4830]" />}
          <div>
            <h1 className="text-lg font-bold text-[#e8d5b0]">2단계 인증 (TOTP)</h1>
            <p className="text-xs text-[#5a4830]">
              {enabled ? '활성화됨 — Google Authenticator 앱과 연동 중' : '비활성화됨 — 계정 보안을 강화하세요'}
            </p>
          </div>
        </div>

        {msg && (
          <div className={`px-4 py-3 rounded-xl text-sm ${msg.type === 'ok' ? 'bg-emerald-900/30 text-emerald-300 border border-emerald-700/40' : 'bg-red-900/30 text-red-300 border border-red-700/40'}`}>
            {msg.text}
          </div>
        )}

        {!enabled && step === 'idle' && (
          <div className="space-y-4">
            <p className="text-sm text-[#7a6040] leading-relaxed">
              Google Authenticator, Authy 등 TOTP 앱을 사용해 로그인 시 추가 코드를 요구합니다.
              비밀번호가 유출되어도 계정을 보호할 수 있습니다.
            </p>
            <button
              onClick={() => setupMut.mutate()}
              disabled={setupMut.isPending}
              className="w-full h-11 bg-[#d4a853] hover:bg-[#c49440] disabled:opacity-50 text-[#0f0b08] font-bold rounded-xl transition-all flex items-center justify-center gap-2"
            >
              {setupMut.isPending ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
              2FA 설정 시작
            </button>
          </div>
        )}

        {step === 'scan' && qrData && (
          <div className="space-y-4">
            <p className="text-sm text-[#7a6040]">1. 인증 앱으로 아래 QR 코드를 스캔하세요.</p>
            <div className="flex justify-center">
              <div className="bg-white p-3 rounded-xl inline-block">
                <Image src={qrData.qrCode} alt="2FA QR Code" width={180} height={180} unoptimized />
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-[#5a4830]">QR 스캔이 안 되면 아래 키를 앱에 직접 입력하세요:</p>
              <div className="flex items-center gap-2 bg-[#120e0a] border border-[#2e2318] rounded-lg px-3 py-2">
                <code className="flex-1 text-xs text-[#c9a860] font-mono break-all">{qrData.secret}</code>
                <button onClick={copySecret} className="text-[#5a4830] hover:text-[#d4a853] transition-colors shrink-0">
                  {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                </button>
              </div>
            </div>
            <p className="text-sm text-[#7a6040]">2. 앱에 표시된 6자리 코드를 입력하세요.</p>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="6자리 코드"
              className="w-full h-11 bg-[#120e0a] border border-[#2e2318] focus:border-[#d4a853]/60 rounded-xl px-4 text-center text-xl tracking-[0.4em] text-[#e8d5b0] outline-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setStep('idle'); setQrData(null); setCode('') }}
                className="flex-1 h-10 border border-[#2e2318] text-[#5a4830] hover:border-[#4a3520] rounded-xl text-sm transition-all"
              >
                취소
              </button>
              <button
                onClick={() => confirmMut.mutate()}
                disabled={confirmMut.isPending || code.length !== 6}
                className="flex-1 h-10 bg-[#d4a853] hover:bg-[#c49440] disabled:opacity-50 text-[#0f0b08] font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-1.5"
              >
                {confirmMut.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
                활성화
              </button>
            </div>
          </div>
        )}

        {enabled && (
          <div className="space-y-4 pt-2 border-t border-[#2e2318]">
            <div className="flex items-center gap-2 text-sm text-emerald-400">
              <ShieldCheck size={14} /> 2FA가 활성화되어 있습니다
            </div>
            <p className="text-xs text-[#5a4830]">비활성화하려면 현재 인증 앱의 코드를 입력하세요.</p>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={disableCode}
              onChange={e => setDisableCode(e.target.value.replace(/\D/g, ''))}
              placeholder="6자리 코드"
              className="w-full h-11 bg-[#120e0a] border border-[#2e2318] focus:border-red-500/60 rounded-xl px-4 text-center text-xl tracking-[0.4em] text-[#e8d5b0] outline-none"
            />
            <button
              onClick={() => disableMut.mutate()}
              disabled={disableMut.isPending || disableCode.length !== 6}
              className="w-full h-10 border border-red-700/50 text-red-400 hover:bg-red-900/20 disabled:opacity-50 rounded-xl text-sm transition-all flex items-center justify-center gap-1.5"
            >
              {disableMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <ShieldOff size={14} />}
              2FA 비활성화
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

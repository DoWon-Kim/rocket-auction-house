'use client'

import { useState, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import {
  Settings, Mail, Bell, CheckCircle2, Shield, User,
  Camera, Lock, Eye, EyeOff, AlertCircle,
} from 'lucide-react'

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      role="switch" aria-checked={checked} onClick={() => onChange(!checked)} disabled={disabled}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 transition-colors duration-200 focus:outline-none disabled:opacity-40 ${
        checked ? 'bg-[#d4a853] border-[#d4a853]' : 'bg-[#2e2318] border-[#3a2818]'
      }`}>
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  )
}

function SectionCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#1a1410] border border-[#2e2318] rounded-2xl overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-[#2e2318]">
        <span className="text-[#d4a853]">{icon}</span>
        <h2 className="font-semibold text-sm text-[#f5ead8]">{title}</h2>
      </div>
      {children}
    </div>
  )
}

const EMAIL_EVENTS = [
  { label: '입찰 초과', desc: '다른 사람이 내 입찰을 넘어설 때' },
  { label: '경매 낙찰', desc: '경매에 낙찰되었을 때' },
  { label: '제안 수신/응답', desc: '제안이 오거나 수락/거절될 때' },
  { label: '배송 시작', desc: '판매자가 상품을 발송했을 때' },
  { label: '거래 완료', desc: '에스크로 금액이 지급될 때' },
  { label: '위시리스트 가격 알림', desc: '목표가 이하 리스팅이 등록될 때' },
  { label: '리뷰 도착', desc: '나에 대한 리뷰가 작성될 때' },
  { label: '친구 요청/수락', desc: '친구 관련 알림' },
]

export default function SettingsPage() {
  const { user, updateUser } = useAuthStore()
  const router = useRouter()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)

  // 프로필 폼
  const [nickname, setNickname] = useState('')
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // 비밀번호 변경
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })
  const [showPw, setShowPw] = useState({ current: false, next: false, confirm: false })
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // 이메일 알림
  const [emailSaved, setEmailSaved] = useState(false)

  const profileMut = useMutation({
    mutationFn: (data: { nickname?: string; avatarUrl?: string }) =>
      api.patch('/auth/profile', data).then(r => r.data),
    onSuccess: (data) => {
      updateUser(data)
      qc.invalidateQueries({ queryKey: ['me'] })
      setNickname('')
      setProfileMsg({ ok: true, text: '프로필이 업데이트됐습니다.' })
      setTimeout(() => setProfileMsg(null), 3000)
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      setProfileMsg({ ok: false, text: e.response?.data?.message ?? '업데이트 실패' }),
  })

  const avatarMut = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData(); fd.append('file', file)
      return api.post('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data.url as string)
    },
    onSuccess: (url) => profileMut.mutate({ avatarUrl: url }),
    onError: () => setProfileMsg({ ok: false, text: '이미지 업로드 실패' }),
  })

  const pwMut = useMutation({
    mutationFn: () => api.patch('/auth/profile', {
      currentPassword: pwForm.current,
      newPassword: pwForm.next,
    }).then(r => r.data),
    onSuccess: () => {
      setPwForm({ current: '', next: '', confirm: '' })
      setPwMsg({ ok: true, text: '비밀번호가 변경됐습니다.' })
      setTimeout(() => setPwMsg(null), 3000)
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      setPwMsg({ ok: false, text: e.response?.data?.message ?? '변경 실패' }),
  })

  const emailMut = useMutation({
    mutationFn: (enabled: boolean) =>
      api.patch('/auth/email-notifications', { enabled }).then(r => r.data),
    onSuccess: (data: { emailNotifications: boolean }) => {
      updateUser({ emailNotifications: data.emailNotifications })
      setEmailSaved(true)
      setTimeout(() => setEmailSaved(false), 2500)
    },
  })

  if (!user) { router.replace('/login'); return null }

  const emailOn = user.emailNotifications !== false

  const pwValid = pwForm.current && pwForm.next.length >= 8 && pwForm.next === pwForm.confirm

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Settings size={20} className="text-[#d4a853]" />
        <h1 className="text-xl font-bold text-[#f5ead8]">설정</h1>
      </div>

      {/* ── 프로필 편집 ── */}
      <SectionCard icon={<User size={16} />} title="프로필 편집">
        <div className="p-5 space-y-5">
          {/* 아바타 */}
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-full overflow-hidden bg-[#2a1c0c] border-2 border-[#3a2510]">
                {user.avatarUrl
                  ? <Image src={user.avatarUrl} alt={user.nickname} width={64} height={64} className="object-cover w-full h-full" />
                  : <div className="flex items-center justify-center h-full text-[#5a4830] text-2xl font-bold">
                      {user.nickname[0].toUpperCase()}
                    </div>}
              </div>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={avatarMut.isPending}
                className="absolute -bottom-1 -right-1 w-6 h-6 bg-[#d4a853] hover:bg-[#c49440] rounded-full flex items-center justify-center transition-colors disabled:opacity-50">
                <Camera size={12} className="text-white" />
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) avatarMut.mutate(f); e.target.value = '' }} />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#f5ead8]">{user.nickname}</p>
              <p className="text-xs text-[#5a4830]">{user.email}</p>
              <p className="text-[11px] text-[#4a3820] mt-0.5">카메라 아이콘을 눌러 프로필 사진 변경</p>
            </div>
          </div>

          {/* 닉네임 변경 */}
          <div className="space-y-1.5">
            <label className="block text-xs text-[#7a6040]">닉네임 변경</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={nickname}
                onChange={e => setNickname(e.target.value)}
                placeholder={`현재: ${user.nickname}`}
                maxLength={20}
                className="flex-1 bg-[#1a1208] border border-[#2e2318] focus:border-[#d4a853]/60 rounded-xl px-3 py-2 text-sm text-[#f5ead8] placeholder:text-[#4a3820] outline-none transition-colors"
              />
              <button
                onClick={() => { if (nickname.trim().length >= 2) profileMut.mutate({ nickname: nickname.trim() }) }}
                disabled={nickname.trim().length < 2 || profileMut.isPending}
                className="px-4 py-2 bg-[#d4a853] hover:bg-[#c49440] disabled:opacity-40 text-white rounded-xl text-sm font-medium transition-colors">
                변경
              </button>
            </div>
            <p className="text-[11px] text-[#4a3820]">2~20자, 중복 불가</p>
          </div>

          {profileMsg && (
            <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs ${
              profileMsg.ok
                ? 'bg-emerald-950/50 border border-emerald-800/50 text-emerald-400'
                : 'bg-red-950/50 border border-red-800/50 text-red-400'
            }`}>
              {profileMsg.ok ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
              {profileMsg.text}
            </div>
          )}
        </div>
      </SectionCard>

      {/* ── 비밀번호 변경 ── */}
      <SectionCard icon={<Lock size={16} />} title="비밀번호 변경">
        <div className="p-5 space-y-3">
          {[
            { key: 'current' as const, label: '현재 비밀번호', placeholder: '현재 비밀번호 입력' },
            { key: 'next'    as const, label: '새 비밀번호',   placeholder: '8자 이상' },
            { key: 'confirm' as const, label: '새 비밀번호 확인', placeholder: '새 비밀번호 재입력' },
          ].map(({ key, label, placeholder }) => (
            <div key={key} className="space-y-1">
              <label className="block text-xs text-[#7a6040]">{label}</label>
              <div className="relative">
                <input
                  type={showPw[key] ? 'text' : 'password'}
                  value={pwForm[key]}
                  onChange={e => setPwForm(p => ({ ...p, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full bg-[#1a1208] border border-[#2e2318] focus:border-[#d4a853]/60 rounded-xl px-3 py-2 pr-10 text-sm text-[#f5ead8] placeholder:text-[#4a3820] outline-none transition-colors"
                />
                <button type="button"
                  onClick={() => setShowPw(p => ({ ...p, [key]: !p[key] }))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5a4830] hover:text-[#9e8a6a]">
                  {showPw[key] ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {key === 'confirm' && pwForm.confirm && pwForm.next !== pwForm.confirm && (
                <p className="text-[11px] text-red-400">비밀번호가 일치하지 않습니다.</p>
              )}
            </div>
          ))}

          {pwMsg && (
            <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs ${
              pwMsg.ok
                ? 'bg-emerald-950/50 border border-emerald-800/50 text-emerald-400'
                : 'bg-red-950/50 border border-red-800/50 text-red-400'
            }`}>
              {pwMsg.ok ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
              {pwMsg.text}
            </div>
          )}

          <button
            onClick={() => pwMut.mutate()}
            disabled={!pwValid || pwMut.isPending}
            className="w-full bg-[#d4a853] hover:bg-[#c49440] disabled:opacity-40 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors">
            {pwMut.isPending ? '변경 중...' : '비밀번호 변경'}
          </button>
        </div>
      </SectionCard>

      {/* ── 알림 설정 ── */}
      <SectionCard icon={<Bell size={16} />} title="알림 설정">
        <div>
          <div className="px-5 py-4 border-b border-[#2e2318]">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <Mail size={16} className="text-[#7a6040] mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-[#f5ead8]">이메일 알림 수신</p>
                  <p className="text-[12px] text-[#5a4830] mt-0.5">
                    중요한 거래 알림을 {user.email}로 발송합니다.
                  </p>
                </div>
              </div>
              <Toggle checked={emailOn} onChange={v => emailMut.mutate(v)} disabled={emailMut.isPending} />
            </div>
          </div>

          <div className={`transition-opacity ${emailOn ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
            {EMAIL_EVENTS.map((ev, i) => (
              <div key={ev.label} className={`flex items-center justify-between px-5 py-3 ${i < EMAIL_EVENTS.length - 1 ? 'border-b border-[#1e1810]' : ''}`}>
                <div className="pl-7">
                  <p className="text-sm text-[#c8b48a]">{ev.label}</p>
                  <p className="text-[11px] text-[#4a3820] mt-0.5">{ev.desc}</p>
                </div>
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${emailOn ? 'border-[#d4a853] bg-[#d4a853]/20' : 'border-[#2e2318]'}`}>
                  {emailOn && <div className="w-1.5 h-1.5 rounded-full bg-[#d4a853]" />}
                </div>
              </div>
            ))}
          </div>

          {emailSaved && (
            <div className="flex items-center gap-2 px-5 py-3 border-t border-[#2e2318] bg-[#d4a853]/5">
              <CheckCircle2 size={14} className="text-[#d4a853]" />
              <span className="text-xs text-[#d4a853]">설정이 저장되었습니다.</span>
            </div>
          )}
        </div>
      </SectionCard>

      {/* SMTP 안내 */}
      <div className="flex items-start gap-3 bg-[#1a1410] border border-[#2e2318] rounded-2xl px-5 py-4 text-[12px] text-[#5a4830]">
        <Shield size={14} className="shrink-0 mt-0.5 text-[#4a3820]" />
        <span>
          이메일 발송은 서버의 SMTP 설정이 완료된 경우에만 작동합니다.
          관리자가 <code className="text-[#7a6040] bg-[#120d08] px-1 rounded">SMTP_HOST</code>,{' '}
          <code className="text-[#7a6040] bg-[#120d08] px-1 rounded">SMTP_USER</code>,{' '}
          <code className="text-[#7a6040] bg-[#120d08] px-1 rounded">SMTP_PASS</code> 환경 변수를 설정해야 합니다.
        </span>
      </div>
    </div>
  )
}

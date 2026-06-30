'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { useRouter } from 'next/navigation'
import { Settings, Mail, Bell, CheckCircle2, Shield } from 'lucide-react'

function Toggle({
  checked, onChange, disabled,
}: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 transition-colors duration-200 focus:outline-none disabled:opacity-40 ${
        checked ? 'bg-[#d4a853] border-[#d4a853]' : 'bg-[#2e2318] border-[#3a2818]'
      }`}
    >
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${
        checked ? 'translate-x-5' : 'translate-x-0.5'
      }`} />
    </button>
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

  // 모든 훅은 early return 전에 선언 (Rules of Hooks)
  const [saved, setSaved] = useState(false)

  const mut = useMutation({
    mutationFn: (enabled: boolean) =>
      api.patch('/auth/email-notifications', { enabled }).then(r => r.data),
    onSuccess: (data: { emailNotifications: boolean }) => {
      updateUser({ emailNotifications: data.emailNotifications })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    },
  })

  if (!user) { router.replace('/login'); return null }

  const emailOn = user.emailNotifications !== false

  return (
    <div className="max-w-xl mx-auto space-y-5">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <Settings size={20} className="text-[#d4a853]" />
        <h1 className="text-xl font-bold text-[#f5ead8]">설정</h1>
      </div>

      {/* 알림 설정 카드 */}
      <div className="bg-[#1a1410] border border-[#2e2318] rounded-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[#2e2318]">
          <Bell size={16} className="text-[#d4a853]" />
          <h2 className="font-semibold text-sm text-[#f5ead8]">알림 설정</h2>
        </div>

        {/* 이메일 알림 마스터 토글 */}
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
            <Toggle
              checked={emailOn}
              onChange={v => mut.mutate(v)}
              disabled={mut.isPending}
            />
          </div>
        </div>

        {/* 알림 항목 목록 */}
        <div className={`transition-opacity ${emailOn ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
          {EMAIL_EVENTS.map((ev, i) => (
            <div key={ev.label} className={`flex items-center justify-between px-5 py-3 ${i < EMAIL_EVENTS.length - 1 ? 'border-b border-[#1e1810]' : ''}`}>
              <div className="pl-7">
                <p className="text-sm text-[#c8b48a]">{ev.label}</p>
                <p className="text-[11px] text-[#4a3820] mt-0.5">{ev.desc}</p>
              </div>
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                emailOn ? 'border-[#d4a853] bg-[#d4a853]/20' : 'border-[#2e2318]'
              }`}>
                {emailOn && <div className="w-1.5 h-1.5 rounded-full bg-[#d4a853]" />}
              </div>
            </div>
          ))}
        </div>

        {/* 저장 피드백 */}
        {saved && (
          <div className="flex items-center gap-2 px-5 py-3 border-t border-[#2e2318] bg-[#d4a853]/5">
            <CheckCircle2 size={14} className="text-[#d4a853]" />
            <span className="text-xs text-[#d4a853]">설정이 저장되었습니다.</span>
          </div>
        )}
      </div>

      {/* SMTP 설정 안내 */}
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

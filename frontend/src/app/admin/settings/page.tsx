'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Construction, Clock, Save, Power } from 'lucide-react'

interface MaintenanceConfig {
  enabled: boolean
  message: string
  endsAt: string | null
}

const inputCls = 'w-full bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] focus:border-[#d4a853]/40 rounded-xl px-4 py-2.5 text-sm text-[#f5ead8] placeholder:text-[#5a4830] focus:outline-none transition-colors'

export default function AdminSettingsPage() {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery<MaintenanceConfig>({
    queryKey: ['admin', 'maintenance'],
    queryFn: () => api.get('/site-config/maintenance').then(r => r.data),
  })

  const [message, setMessage] = useState('')
  const [endsAt, setEndsAt]   = useState('')

  useEffect(() => {
    if (data) {
      setMessage(data.message ?? '')
      setEndsAt(data.endsAt ? data.endsAt.slice(0, 16) : '')
    }
  }, [data])

  const mut = useMutation({
    mutationFn: (payload: Partial<MaintenanceConfig>) =>
      api.patch('/admin/site-config/maintenance', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'maintenance'] })
      qc.invalidateQueries({ queryKey: ['maintenance-status'] })
    },
  })

  const isEnabled = data?.enabled ?? false

  function saveMessage() {
    mut.mutate({ message, endsAt: endsAt || null })
  }

  function toggleMaintenance() {
    const turning = !isEnabled
    if (turning) {
      if (!confirm('점검 모드를 활성화하면 일반 유저에게 점검 안내 화면이 표시됩니다.\n계속할까요?')) return
    }
    mut.mutate({ enabled: turning, message, endsAt: endsAt || null })
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-[#f5ead8]">사이트 설정</h1>
        <div className="h-48 bg-[#1a1410] border border-[#2e2318] rounded-2xl animate-pulse" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#f5ead8]">사이트 설정</h1>
        <p className="text-sm text-[#8a7055] mt-1">점검 모드 및 공지 안내를 관리합니다.</p>
      </div>

      {/* 점검 모드 카드 */}
      <div className={`bg-[#1a1410] border rounded-2xl p-6 space-y-5 transition-colors ${
        isEnabled ? 'border-amber-500/40' : 'border-[#2e2318]'
      }`}>
        {/* 헤더 */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
              isEnabled ? 'bg-amber-500/10 text-amber-400' : 'bg-[#2a1c0c] text-[#7a6040]'
            }`}>
              <Construction size={20} />
            </div>
            <div>
              <h2 className="font-semibold text-[#f5ead8]">서버 점검 모드</h2>
              <p className="text-xs text-[#7a6040] mt-0.5">
                {isEnabled
                  ? '현재 점검 중 — 일반 유저에게 안내 화면이 표시됩니다'
                  : '비활성화 상태 — 사이트가 정상 운영 중입니다'}
              </p>
            </div>
          </div>

          {/* 토글 버튼 */}
          <button
            onClick={toggleMaintenance}
            disabled={mut.isPending}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${
              isEnabled
                ? 'bg-green-600/20 hover:bg-green-600/30 text-green-400 border border-green-600/30'
                : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30'
            }`}
          >
            <Power size={14} />
            {isEnabled ? '점검 종료' : '점검 시작'}
          </button>
        </div>

        {/* 상태 인디케이터 */}
        <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs ${
          isEnabled
            ? 'bg-amber-500/10 border border-amber-500/20 text-amber-400'
            : 'bg-green-500/5 border border-green-500/10 text-green-500/70'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${isEnabled ? 'bg-amber-400 animate-pulse' : 'bg-green-500/70'}`} />
          {isEnabled ? '점검 모드 활성화 중' : '정상 운영 중'}
        </div>

        <hr className="border-[#2e2318]" />

        {/* 안내 메시지 */}
        <div className="space-y-1.5">
          <label className="text-xs text-[#7a6040] uppercase tracking-wider font-semibold">
            점검 안내 메시지
          </label>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="더 나은 서비스를 위해 점검을 진행하고 있습니다. 잠시 후 다시 접속해 주세요."
            rows={3}
            className={`${inputCls} resize-none leading-relaxed`}
          />
        </div>

        {/* 예상 종료 시간 */}
        <div className="space-y-1.5">
          <label className="text-xs text-[#7a6040] uppercase tracking-wider font-semibold flex items-center gap-1.5">
            <Clock size={11} /> 예상 종료 시간 <span className="normal-case font-normal text-[#4a3820]">(선택)</span>
          </label>
          <input
            type="datetime-local"
            value={endsAt}
            onChange={e => setEndsAt(e.target.value)}
            className={inputCls}
          />
        </div>

        {/* 저장 버튼 */}
        <div className="flex justify-end">
          <button
            onClick={saveMessage}
            disabled={mut.isPending}
            className="flex items-center gap-2 px-5 py-2 bg-[#d4a853] hover:bg-[#c49440] disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors"
          >
            <Save size={14} />
            {mut.isPending ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}

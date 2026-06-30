'use client'

import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { Construction, Clock, AlertTriangle } from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'

// ─── 인증 동기화 ──────────────────────────────────────────────────────────────

function AuthSync() {
  const token = useAuthStore((s) => s.token)
  const setAuth = useAuthStore((s) => s.setAuth)

  useEffect(() => {
    if (!token) return
    api.get('/auth/me')
      .then(({ data }) => setAuth(data, token))
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  return null
}

// ─── 점검 모드 가드 ───────────────────────────────────────────────────────────

interface MaintenanceData {
  enabled: boolean
  message: string
  endsAt: string | null
}

function MaintenanceGuard({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user)

  const { data } = useQuery<MaintenanceData>({
    queryKey: ['maintenance-status'],
    queryFn: () => api.get('/site-config/maintenance').then(r => r.data),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  const isSuperAdmin = user?.role === 'SUPER_ADMIN'

  // 점검 중 + 최종 관리자가 아닌 경우 → 안내 화면
  if (data?.enabled && !isSuperAdmin) {
    return <MaintenancePage data={data} />
  }

  // 최종 관리자는 사이트 정상 이용 + 점검 중 배너 표시
  return (
    <>
      {data?.enabled && isSuperAdmin && <MaintenanceBanner />}
      {children}
    </>
  )
}

function MaintenancePage({ data }: { data: MaintenanceData }) {
  return (
    <div className="fixed inset-0 z-[9999] bg-[#04070f] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6">
        {/* 아이콘 */}
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-2xl bg-[#1a2a4a] border border-[#d4a853]/20 flex items-center justify-center shadow-[0_0_40px_rgba(212,168,83,0.1)]">
            <Construction size={36} className="text-[#d4a853]" />
          </div>
        </div>

        {/* 제목 */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-white">서버 점검 중</h1>
          <p className="text-[#8a7055] text-sm leading-relaxed">
            {data.message || '더 나은 서비스를 위해 점검을 진행하고 있습니다.\n잠시 후 다시 접속해 주세요.'}
          </p>
        </div>

        {/* 예상 종료 시간 */}
        {data.endsAt && (
          <div className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#1a1410] border border-[#2e2318] rounded-xl text-sm text-[#9e8a6a]">
            <Clock size={14} className="text-[#d4a853]" />
            <span>
              예상 종료:{' '}
              <span className="text-[#e8d5b0] font-semibold">
                {format(new Date(data.endsAt), 'M월 d일 (E) HH:mm', { locale: ko })}
              </span>
            </span>
          </div>
        )}

        {/* 장식선 */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-[#2e2318]" />
          <span className="text-xs text-[#4a3820]">Rocket Auction House</span>
          <div className="flex-1 h-px bg-[#2e2318]" />
        </div>

        <p className="text-xs text-[#4a3820]">
          불편을 드려 죄송합니다. 빠르게 점검을 마치겠습니다.
        </p>
      </div>
    </div>
  )
}

function MaintenanceBanner() {
  return (
    <div className="fixed top-0 left-0 right-0 z-[9998] bg-amber-500/10 border-b border-amber-500/30 px-4 py-2 flex items-center justify-center gap-2 text-xs text-amber-400">
      <AlertTriangle size={13} />
      현재 서버 점검 모드가 활성화되어 있습니다. 일반 유저에게는 점검 안내 화면이 표시됩니다.
    </div>
  )
}

// ─── Provider 루트 ────────────────────────────────────────────────────────────

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000 } },
  }))

  return (
    <QueryClientProvider client={queryClient}>
      <AuthSync />
      <MaintenanceGuard>
        {children}
      </MaintenanceGuard>
    </QueryClientProvider>
  )
}

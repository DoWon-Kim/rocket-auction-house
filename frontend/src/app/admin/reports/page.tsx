'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '@/lib/api'
import { ShieldAlert, Search, ChevronLeft, ChevronRight } from 'lucide-react'

const REASON_LABELS: Record<string, string> = {
  FAKE_ITEM:    '가짜/위조 카드',
  NO_SHIPMENT:  '미발송/잠수',
  WRONG_ITEM:   '다른 물품 발송',
  DAMAGED_ITEM: '손상 물품 발송',
  FRAUD:        '사기 의심',
  HARASSMENT:   '괴롭힘/욕설',
  OTHER:        '기타',
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  PENDING:       { label: '접수',   cls: 'bg-yellow-900/40 text-yellow-400 border-yellow-700/40' },
  INVESTIGATING: { label: '조사 중', cls: 'bg-blue-900/40 text-blue-400 border-blue-700/40' },
  RESOLVED:      { label: '해결됨', cls: 'bg-emerald-900/40 text-emerald-400 border-emerald-700/40' },
  DISMISSED:     { label: '기각',   cls: 'bg-line text-muted-2 border-line-strong' },
}

const STATUS_OPTIONS = ['ALL', 'PENDING', 'INVESTIGATING', 'RESOLVED', 'DISMISSED']
const NEXT_STATUS: Record<string, string[]> = {
  PENDING:       ['INVESTIGATING', 'RESOLVED', 'DISMISSED'],
  INVESTIGATING: ['RESOLVED', 'DISMISSED'],
  RESOLVED:      [],
  DISMISSED:     [],
}

interface Report {
  id: string
  reason: string
  detail?: string
  status: string
  adminNote?: string
  resolvedAt?: string
  createdAt: string
  reporter:     { id: string; nickname: string }
  reportedUser: { id: string; nickname: string }
  listing?:     { id: string; card: { name: string; nameKo?: string | null } }
  transaction?: { id: string; finalPrice: number; txStatus: string }
}

export default function AdminReportsPage() {
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('PENDING')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)

  // 선택한 신고의 처리 모달
  const [selected, setSelected] = useState<Report | null>(null)
  const [nextStatus, setNextStatus] = useState('')
  const [adminNote, setAdminNote] = useState('')
  const [refundBuyer, setRefundBuyer] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'reports', statusFilter, q, page],
    queryFn: () =>
      api.get('/admin/reports', {
        params: { status: statusFilter === 'ALL' ? undefined : statusFilter, q: q || undefined, page, limit: 20 },
      }).then(r => r.data),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, status, adminNote, refundBuyer }: { id: string; status: string; adminNote: string; refundBuyer: boolean }) =>
      api.patch(`/admin/reports/${id}`, { status, adminNote, refundBuyer }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'reports'] })
      setSelected(null)
      setAdminNote('')
      setRefundBuyer(false)
    },
  })

  function openModal(report: Report) {
    setSelected(report)
    setAdminNote(report.adminNote ?? '')
    setNextStatus(NEXT_STATUS[report.status]?.[0] ?? '')
    setRefundBuyer(false)
  }

  const reports: Report[] = data?.list ?? []
  const totalPages = data?.totalPages ?? 0

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ShieldAlert size={20} className="text-red-400" />
        <h1 className="text-xl font-bold text-fg">신고 관리</h1>
        {data?.total > 0 && (
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-900/40 text-red-400 border border-red-700/40">
            {data.total}건
          </span>
        )}
      </div>

      {/* 필터 */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex gap-1.5">
          {STATUS_OPTIONS.map(s => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(1) }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                statusFilter === s
                  ? 'bg-accent/10 text-accent-soft border-accent/30'
                  : 'bg-transparent text-muted-2 border-line hover:border-line-strong hover:text-fg-3'
              }`}
            >
              {s === 'ALL' ? '전체' : STATUS_LABELS[s]?.label}
            </button>
          ))}
        </div>
        <div className="relative ml-auto">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <input
            value={q}
            onChange={e => { setQ(e.target.value); setPage(1) }}
            placeholder="닉네임·내용 검색..."
            className="pl-8 pr-4 py-1.5 bg-sunken border border-line hover:border-line-strong focus:border-accent/40 rounded-lg text-sm text-fg placeholder:text-subtle focus:outline-none transition-colors w-52"
          />
        </div>
      </div>

      {/* 테이블 */}
      <div className="bg-sunken border border-line rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-subtle text-xs uppercase tracking-wider">
              <th className="px-4 py-3 text-left">신고 유형</th>
              <th className="px-4 py-3 text-left">피신고자</th>
              <th className="px-4 py-3 text-left">신고자</th>
              <th className="px-4 py-3 text-left hidden md:table-cell">관련 거래</th>
              <th className="px-4 py-3 text-left">상태</th>
              <th className="px-4 py-3 text-left hidden md:table-cell">접수일</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-line rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : reports.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-subtle text-sm">
                  신고 내역이 없습니다.
                </td>
              </tr>
            ) : (
              reports.map(r => {
                const st = STATUS_LABELS[r.status]
                return (
                  <tr key={r.id} className="hover:bg-surface transition-colors">
                    <td className="px-4 py-3">
                      <span className="text-fg-2 font-medium">{REASON_LABELS[r.reason] ?? r.reason}</span>
                      {r.detail && (
                        <p className="text-xs text-muted-2 mt-0.5 line-clamp-1">{r.detail}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-fg-3 font-semibold">{r.reportedUser.nickname}</td>
                    <td className="px-4 py-3 text-muted-2">{r.reporter.nickname}</td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {r.transaction ? (
                        <span className="text-xs text-muted-2">
                          거래 {r.transaction.finalPrice.toLocaleString()}P
                        </span>
                      ) : r.listing ? (
                        <span className="text-xs text-muted-2">
                          {r.listing.card.nameKo ?? r.listing.card.name}
                        </span>
                      ) : (
                        <span className="text-xs text-subtle">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {st && (
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold border ${st.cls}`}>
                          {st.label}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-subtle text-xs hidden md:table-cell">
                      {new Date(r.createdAt).toLocaleDateString('ko-KR')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openModal(r)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface border border-line hover:border-line-strong text-fg-3 hover:text-fg transition-colors"
                      >
                        처리
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="p-2 rounded-lg bg-surface border border-line text-muted-2 disabled:opacity-30 hover:border-line-strong hover:text-fg-3 transition-colors">
            <ChevronLeft size={14} />
          </button>
          <span className="text-sm text-muted-2">{page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="p-2 rounded-lg bg-surface border border-line text-muted-2 disabled:opacity-30 hover:border-line-strong hover:text-fg-3 transition-colors">
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      {/* 처리 모달 */}
      {selected && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-sunken border border-line rounded-2xl w-full max-w-lg space-y-5 p-6">
            <h3 className="text-base font-bold text-fg flex items-center gap-2">
              <ShieldAlert size={16} className="text-red-400" />
              신고 처리
            </h3>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-2">신고 유형</span>
                <span className="text-fg-2 font-medium">{REASON_LABELS[selected.reason]}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-2">피신고자</span>
                <span className="text-fg-2 font-semibold">{selected.reportedUser.nickname}</span>
              </div>
              {selected.detail && (
                <div className="bg-surface border border-line rounded-xl p-3 text-xs text-fg-3 whitespace-pre-wrap leading-relaxed">
                  {selected.detail}
                </div>
              )}
            </div>

            {selected.transaction && (
              <div className="bg-surface-2 border border-line rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-muted-2 uppercase tracking-wider">관련 거래</p>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-2">거래금액</span>
                  <span className="text-accent-2 font-semibold">{selected.transaction.finalPrice.toLocaleString()}P</span>
                </div>
                <label className="flex items-center gap-2.5 cursor-pointer group">
                  <div
                    onClick={() => setRefundBuyer(v => !v)}
                    className={`w-10 h-5 rounded-full border transition-colors relative cursor-pointer ${
                      refundBuyer ? 'bg-red-500 border-red-500' : 'bg-line border-line-strong'
                    }`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${refundBuyer ? 'left-5' : 'left-0.5'}`} />
                  </div>
                  <span className="text-sm text-fg-3 group-hover:text-fg-2 transition-colors">
                    구매자 에스크로 환불 처리
                  </span>
                </label>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs text-muted-2 font-semibold uppercase tracking-wider">상태 변경</label>
              <div className="flex flex-wrap gap-1.5">
                {NEXT_STATUS[selected.status]?.length > 0 ? (
                  NEXT_STATUS[selected.status].map(s => (
                    <button
                      key={s}
                      onClick={() => setNextStatus(s)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        nextStatus === s
                          ? 'bg-accent/10 text-accent-soft border-accent/30'
                          : 'bg-transparent text-muted-2 border-line hover:border-line-strong hover:text-fg-3'
                      }`}
                    >
                      {STATUS_LABELS[s]?.label}
                    </button>
                  ))
                ) : (
                  <span className="text-xs text-subtle">이미 처리 완료된 신고입니다.</span>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-muted-2 font-semibold uppercase tracking-wider">관리자 메모</label>
              <textarea
                value={adminNote}
                onChange={e => setAdminNote(e.target.value)}
                rows={3}
                placeholder="처리 내용, 사유 등 메모..."
                className="w-full bg-surface border border-line hover:border-line-strong focus:border-accent/40 rounded-xl px-4 py-2.5 text-sm text-fg placeholder:text-subtle focus:outline-none resize-none transition-colors"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { setSelected(null); setAdminNote(''); setRefundBuyer(false) }}
                className="flex-1 py-2.5 rounded-xl border border-line text-muted-2 hover:text-fg-3 hover:border-line-strong text-sm transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => {
                  if (!nextStatus && NEXT_STATUS[selected.status]?.length > 0) return
                  updateMut.mutate({
                    id: selected.id,
                    status: nextStatus || selected.status,
                    adminNote,
                    refundBuyer,
                  })
                }}
                disabled={updateMut.isPending || (NEXT_STATUS[selected.status]?.length > 0 && !nextStatus)}
                className="flex-1 py-2.5 rounded-xl bg-accent hover:bg-accent-strong text-white font-semibold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {updateMut.isPending ? '처리 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

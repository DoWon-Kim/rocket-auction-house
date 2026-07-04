'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '@/lib/api'
import { Shield, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'

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
  OPEN:      { label: '접수',    cls: 'bg-yellow-900/40 text-yellow-400 border-yellow-700/40' },
  REVIEWING: { label: '검토 중', cls: 'bg-blue-900/40 text-blue-400 border-blue-700/40' },
  RESOLVED:  { label: '해결됨', cls: 'bg-emerald-900/40 text-emerald-400 border-emerald-700/40' },
  REJECTED:  { label: '기각',   cls: 'bg-[#2e2318] text-[#7a6040] border-[#4a3520]' },
  REFUNDED:  { label: '환불',   cls: 'bg-purple-900/40 text-purple-400 border-purple-700/40' },
}

const FILTER_OPTIONS = ['ALL', 'OPEN', 'REVIEWING', 'RESOLVED', 'REJECTED', 'REFUNDED']
const NEXT_STATUS_OPTIONS: Record<string, { value: string; label: string }[]> = {
  OPEN:      [
    { value: 'REVIEWING', label: '검토 시작' },
    { value: 'RESOLVED',  label: '구매자 승인' },
    { value: 'REJECTED',  label: '기각 (판매자 승)' },
    { value: 'REFUNDED',  label: '환불 처리' },
  ],
  REVIEWING: [
    { value: 'RESOLVED', label: '구매자 승인' },
    { value: 'REJECTED', label: '기각 (판매자 승)' },
    { value: 'REFUNDED', label: '환불 처리' },
  ],
  RESOLVED: [],
  REJECTED: [],
  REFUNDED: [],
}

interface Dispute {
  id: string
  reason: string
  description: string
  status: string
  adminNote?: string
  resolvedAt?: string
  createdAt: string
  buyer:  { id: string; nickname: string }
  seller: { id: string; nickname: string }
  transaction: { finalPrice: number; listing: { card: { nameKo: string | null; name: string } } }
}

export default function AdminDisputesPage() {
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('OPEN')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Dispute | null>(null)
  const [nextStatus, setNextStatus] = useState('')
  const [adminNote, setAdminNote] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'disputes', statusFilter, page],
    queryFn: () => api.get('/admin/disputes', { params: { status: statusFilter, page, limit: 20 } }).then(r => r.data),
  })
  const disputes: Dispute[] = data?.disputes ?? []
  const totalPages = data ? Math.ceil(data.total / data.limit) : 0

  const resolveMut = useMutation({
    mutationFn: () => api.patch(`/admin/disputes/${selected!.id}`, { status: nextStatus, adminNote }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'disputes'] })
      setSelected(null)
      setNextStatus('')
      setAdminNote('')
    },
  })

  function openModal(d: Dispute) {
    setSelected(d)
    setNextStatus('')
    setAdminNote('')
  }

  const nextOptions = selected ? (NEXT_STATUS_OPTIONS[selected.status] ?? []) : []

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-purple-900/30 border border-purple-700/30 flex items-center justify-center">
          <Shield className="w-4 h-4 text-purple-400" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-[#f5ead8]">분쟁 관리</h1>
          <p className="text-xs text-[#5a4830]">접수된 거래 분쟁을 검토하고 처리합니다</p>
        </div>
      </div>

      {/* 필터 */}
      <div className="flex gap-1.5 flex-wrap">
        {FILTER_OPTIONS.map(s => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); setPage(1) }}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors border ${
              statusFilter === s
                ? 'bg-[#2a1c0c] text-white border-[#d4a853]/40'
                : 'bg-[#1a1410] border-[#2e2318] text-[#7a6040] hover:border-[#4a3520]'
            }`}
          >
            {s === 'ALL' ? '전체' : STATUS_LABELS[s]?.label ?? s}
          </button>
        ))}
      </div>

      {/* 목록 */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-[#d4a853] animate-spin" /></div>
      ) : disputes.length === 0 ? (
        <div className="text-center py-16 text-[#5a4830] text-sm">분쟁 내역이 없습니다.</div>
      ) : (
        <div className="space-y-2">
          {disputes.map(d => {
            const st = STATUS_LABELS[d.status] ?? { label: d.status, cls: '' }
            const cardName = d.transaction.listing.card.nameKo ?? d.transaction.listing.card.name
            return (
              <div key={d.id} className="bg-[#1a1410] border border-[#2e2318] rounded-2xl p-4 hover:border-[#4a3520] transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-lg text-xs font-medium border ${st.cls}`}>{st.label}</span>
                      <span className="px-2 py-0.5 rounded-lg text-xs bg-[#2e2318] text-[#7a6040]">{REASON_LABELS[d.reason] ?? d.reason}</span>
                    </div>
                    <p className="font-semibold text-sm text-[#f5ead8]">{cardName}</p>
                    <p className="text-xs text-[#5a4830]">
                      구매자: <span className="text-[#9e8a6a]">{d.buyer.nickname}</span> →
                      판매자: <span className="text-[#9e8a6a]">{d.seller.nickname}</span> ·
                      {d.transaction.finalPrice.toLocaleString()} P ·
                      {format(new Date(d.createdAt), 'yy.MM.dd', { locale: ko })}
                    </p>
                    <p className="text-xs text-[#7a6040] line-clamp-1">{d.description}</p>
                  </div>
                  {nextOptions.length > 0 || !['RESOLVED', 'REJECTED', 'REFUNDED'].includes(d.status) ? (
                    <button
                      onClick={() => openModal(d)}
                      className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium bg-[#d4a853]/15 border border-[#d4a853]/30 text-[#d4a853] hover:bg-[#d4a853]/25 transition-colors"
                    >
                      처리
                    </button>
                  ) : (
                    <span className="shrink-0 text-xs text-[#5a4830] px-2">완료</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-1">
          <button onClick={() => setPage(p => p - 1)} disabled={page === 1}
            className="w-8 h-8 rounded-lg text-sm bg-[#1a1410] border border-[#2e2318] text-[#8a7055] hover:border-[#4a3520] disabled:opacity-30 transition-colors">
            <ChevronLeft size={14} className="mx-auto" />
          </button>
          <span className="px-3 h-8 flex items-center text-sm text-[#8a7055]">{page} / {totalPages}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={page === totalPages}
            className="w-8 h-8 rounded-lg text-sm bg-[#1a1410] border border-[#2e2318] text-[#8a7055] hover:border-[#4a3520] disabled:opacity-30 transition-colors">
            <ChevronRight size={14} className="mx-auto" />
          </button>
        </div>
      )}

      {/* 처리 모달 */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={() => setSelected(null)}>
          <div className="bg-[#1a1208] border border-[#3d2e1a] rounded-2xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-bold text-[#e8d5b0]">분쟁 처리</h2>

            <div className="bg-[#120e0a] border border-[#2e2318] rounded-xl p-3 space-y-1">
              <p className="text-xs text-[#5a4830]">사유: {REASON_LABELS[selected.reason] ?? selected.reason}</p>
              <p className="text-sm text-[#c9a860]">{selected.description}</p>
            </div>

            {nextOptions.length > 0 ? (
              <>
                <div className="space-y-2">
                  <label className="text-xs text-[#7a6040] uppercase tracking-wider font-semibold">처리 결과</label>
                  <div className="grid grid-cols-1 gap-1.5">
                    {nextOptions.map(o => (
                      <button key={o.value} onClick={() => setNextStatus(o.value)}
                        className={`px-3 py-2 rounded-xl text-sm text-left border transition-colors ${
                          nextStatus === o.value
                            ? 'bg-[#d4a853]/15 border-[#d4a853]/40 text-[#d4a853]'
                            : 'bg-[#120e0a] border-[#2e2318] text-[#7a6040] hover:border-[#4a3520]'
                        }`}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-[#7a6040] uppercase tracking-wider font-semibold">관리자 메모 (선택)</label>
                  <textarea value={adminNote} onChange={e => setAdminNote(e.target.value)} rows={3}
                    placeholder="처리 사유 또는 메모를 입력하세요"
                    className="w-full bg-[#120e0a] border border-[#2e2318] focus:border-[#d4a853]/40 rounded-xl px-3 py-2 text-sm text-[#e8d5b0] placeholder:text-[#3a2e1e] outline-none resize-none" />
                </div>

                {nextStatus === 'REFUNDED' && (
                  <div className="bg-purple-900/20 border border-purple-700/30 rounded-xl px-3 py-2 text-xs text-purple-300">
                    환불 처리 시 구매자 계정에 <strong>{selected.transaction.finalPrice.toLocaleString()} P</strong>가 즉시 반환됩니다.
                  </div>
                )}

                <div className="flex gap-2">
                  <button onClick={() => setSelected(null)}
                    className="flex-1 h-10 border border-[#2e2318] text-[#5a4830] hover:border-[#4a3520] rounded-xl text-sm transition-all">
                    취소
                  </button>
                  <button onClick={() => resolveMut.mutate()}
                    disabled={resolveMut.isPending || !nextStatus}
                    className="flex-1 h-10 bg-[#d4a853] hover:bg-[#c49440] disabled:opacity-50 text-[#0f0b08] font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-1.5">
                    {resolveMut.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
                    처리 완료
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center py-4 text-sm text-[#5a4830]">
                이미 처리된 분쟁입니다.
                {selected.adminNote && <p className="mt-1 text-[#7a6040]">메모: {selected.adminNote}</p>}
                <button onClick={() => setSelected(null)} className="mt-3 text-[#d4a853] text-xs hover:underline">닫기</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

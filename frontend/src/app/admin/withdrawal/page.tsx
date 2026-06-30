'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Check, X, Clock, Banknote, Search, ChevronDown, ChevronUp, Send, AlertCircle, RefreshCw } from 'lucide-react'

interface WithdrawalUser {
  id: string; nickname: string; email: string; balance: number
}
interface WithdrawalRecord {
  id: string
  amount: number
  bankName: string
  accountNumber: string
  accountHolder: string
  status: string
  adminNote: string | null
  transferId: string | null
  transferError: string | null
  processedAt: string | null
  createdAt: string
  user: WithdrawalUser
}

const STATUS_TABS = [
  { value: 'ALL',       label: '전체' },
  { value: 'PENDING',   label: '대기 중' },
  { value: 'APPROVED',  label: '처리 중' },
  { value: 'COMPLETED', label: '완료' },
  { value: 'REJECTED',  label: '거절' },
  { value: 'CANCELLED', label: '취소' },
]

const STATUS_STYLE: Record<string, string> = {
  PENDING:   'bg-yellow-500/20 text-yellow-300',
  APPROVED:  'bg-blue-500/20 text-blue-300',
  COMPLETED: 'bg-emerald-500/20 text-emerald-300',
  REJECTED:  'bg-red-500/20 text-red-300',
  CANCELLED: 'bg-gray-500/20 text-gray-400',
}
const STATUS_KO: Record<string, string> = {
  PENDING: '검토 중', APPROVED: '처리 중', COMPLETED: '완료', REJECTED: '거절', CANCELLED: '취소됨',
}

interface ProcessModalProps {
  item: WithdrawalRecord
  onClose: () => void
}

function ProcessModal({ item, onClose }: ProcessModalProps) {
  const qc = useQueryClient()
  const [status, setStatus] = useState<'APPROVED' | 'COMPLETED' | 'REJECTED'>('APPROVED')
  const [note, setNote] = useState(item.adminNote ?? '')
  const [error, setError] = useState<string | null>(null)
  const [transferResult, setTransferResult] = useState<{ ok: boolean; msg: string; id?: string } | null>(null)
  const [confirmTransfer, setConfirmTransfer] = useState(false)

  const mut = useMutation({
    mutationFn: () => api.patch(`/admin/withdrawal/${item.id}`, { status, adminNote: note || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-withdrawal'] }); onClose() },
    onError: (e: { response?: { data?: { message?: string } } }) => setError(e.response?.data?.message ?? '처리 실패'),
  })

  const transferMut = useMutation({
    mutationFn: () => api.post(`/admin/withdrawal/${item.id}/transfer`),
    onSuccess: (res) => {
      const d = res.data as { message: string; transferId?: string }
      setTransferResult({ ok: true, msg: d.message, id: d.transferId })
      qc.invalidateQueries({ queryKey: ['admin-withdrawal'] })
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      setTransferResult({ ok: false, msg: e.response?.data?.message ?? '이체 실패' })
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md space-y-4"
        onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start">
          <h2 className="text-base font-bold">환전 신청 처리</h2>
          <button onClick={onClose}><X size={18} className="text-gray-500" /></button>
        </div>

        {/* 신청 정보 */}
        <div className="bg-gray-800/60 rounded-xl p-4 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">신청자</span>
            <span>{item.user.nickname} ({item.user.email})</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">금액</span>
            <span className="font-semibold text-amber-400">{item.amount.toLocaleString()} P = {item.amount.toLocaleString()}원</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">은행</span>
            <span>{item.bankName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">계좌</span>
            <span className="font-mono">{item.accountHolder} · {item.accountNumber}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">신청일</span>
            <span className="text-xs">{format(new Date(item.createdAt), 'yyyy.MM.dd HH:mm', { locale: ko })}</span>
          </div>
          {item.transferId && (
            <div className="flex justify-between pt-1 border-t border-gray-700">
              <span className="text-gray-400">이체 ID</span>
              <span className="text-emerald-400 font-mono text-xs">{item.transferId}</span>
            </div>
          )}
          {item.transferError && (
            <div className="flex justify-between pt-1 border-t border-gray-700">
              <span className="text-gray-400">이전 오류</span>
              <span className="text-red-400 text-xs">{item.transferError}</span>
            </div>
          )}
        </div>

        {/* 이체 실행 섹션 */}
        {['PENDING', 'APPROVED'].includes(item.status) && !item.transferId && (
          <div className="bg-amber-950/30 border border-amber-700/40 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
              <Send size={12} /> Toss Payouts API 즉시 이체
            </p>
            <p className="text-xs text-gray-400">
              버튼 클릭 시 <span className="text-white font-semibold">{item.bankName} {item.accountNumber} ({item.accountHolder})</span>으로
              실시간 이체가 실행됩니다. 성공 시 자동으로 완료 처리됩니다.
            </p>

            {!confirmTransfer ? (
              <button onClick={() => setConfirmTransfer(true)}
                className="w-full py-2 rounded-lg text-sm font-semibold bg-amber-600 hover:bg-amber-500 text-white transition-colors flex items-center justify-center gap-2">
                <Send size={14} />
                {item.amount.toLocaleString()}원 이체 실행
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-red-300 text-center">정말 이체를 실행하시겠습니까? 취소할 수 없습니다.</p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmTransfer(false)} disabled={transferMut.isPending}
                    className="flex-1 py-1.5 rounded-lg text-xs bg-gray-800 text-gray-400 hover:bg-gray-700 transition-colors">
                    취소
                  </button>
                  <button onClick={() => transferMut.mutate()} disabled={transferMut.isPending}
                    className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-500 text-white transition-colors flex items-center justify-center gap-1">
                    {transferMut.isPending
                      ? <><RefreshCw size={11} className="animate-spin" /> 이체 중...</>
                      : <><Check size={11} /> 확인 — 이체 실행</>}
                  </button>
                </div>
              </div>
            )}

            {transferResult && (
              <div className={`rounded-lg p-3 text-xs flex items-start gap-2 ${transferResult.ok ? 'bg-emerald-900/40 text-emerald-300' : 'bg-red-900/40 text-red-300'}`}>
                {transferResult.ok ? <Check size={12} className="mt-0.5 shrink-0" /> : <AlertCircle size={12} className="mt-0.5 shrink-0" />}
                <span>{transferResult.msg}{transferResult.id && ` (ID: ${transferResult.id})`}</span>
              </div>
            )}
          </div>
        )}

        {item.transferId && (
          <div className="bg-emerald-900/20 border border-emerald-700/40 rounded-xl p-3 text-xs text-emerald-400 flex items-center gap-2">
            <Check size={13} /> 이미 이체 완료된 신청입니다.
          </div>
        )}

        <hr className="border-gray-800" />

        {/* 수동 상태 변경 */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-400">수동 상태 변경</p>
          <div className="flex gap-2">
            {(['APPROVED', 'COMPLETED', 'REJECTED'] as const).map(s => (
              <button key={s} onClick={() => setStatus(s)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${status === s ? (s === 'REJECTED' ? 'bg-red-600 text-white' : s === 'COMPLETED' ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white') : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                {STATUS_KO[s]}
              </button>
            ))}
          </div>
          {status === 'REJECTED' && (
            <p className="text-xs text-red-400">* 거절 시 {item.amount.toLocaleString()}P가 즉시 환불됩니다.</p>
          )}
        </div>

        {/* 메모 */}
        <div className="space-y-1">
          <label className="text-xs text-gray-400">관리자 메모 (선택, 거절 사유 등)</label>
          <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="거절 시 사유를 입력하세요"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500 resize-none" />
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-sm bg-gray-800 text-gray-400 hover:bg-gray-700 transition-colors">
            닫기
          </button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 transition-colors">
            {mut.isPending ? '처리 중...' : '수동 적용'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AdminWithdrawalPage() {
  const [statusFilter, setStatusFilter] = useState('PENDING')
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<WithdrawalRecord | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-withdrawal', statusFilter, search, page],
    queryFn: () => api.get('/admin/withdrawal', {
      params: { status: statusFilter === 'ALL' ? undefined : statusFilter, q: search || undefined, page, limit: 20 },
    }).then(r => r.data as { list: WithdrawalRecord[]; total: number }),
  })

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / 20))

  const pendingCount = useQuery({
    queryKey: ['admin-withdrawal-pending-count'],
    queryFn: () => api.get('/admin/withdrawal', { params: { status: 'PENDING', limit: 1 } })
      .then(r => (r.data as { total: number }).total),
    refetchInterval: 30000,
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold">환전 관리</h1>
          {(pendingCount.data ?? 0) > 0 && (
            <span className="bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {pendingCount.data}
            </span>
          )}
        </div>
      </div>

      {/* 상태 필터 + 검색 */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1">
          {STATUS_TABS.map(t => (
            <button key={t.value} onClick={() => { setStatusFilter(t.value); setPage(1) }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${statusFilter === t.value ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2 ml-auto">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input type="text" placeholder="닉네임 / 이메일" value={q} onChange={e => setQ(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { setSearch(q); setPage(1) } }}
              className="pl-8 pr-3 py-1.5 bg-gray-900 border border-gray-800 rounded-xl text-sm focus:outline-none focus:border-indigo-500 w-48" />
          </div>
          <button onClick={() => { setSearch(q); setPage(1) }}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm transition-colors">
            검색
          </button>
        </div>
      </div>

      {/* 목록 */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl h-16 animate-pulse" />
          ))}
        </div>
      ) : !data?.list.length ? (
        <div className="text-center py-16 text-gray-500 text-sm">
          <Banknote size={32} className="mx-auto mb-3 opacity-30" />
          환전 신청이 없습니다.
        </div>
      ) : (
        <div className="space-y-2">
          {data.list.map(wr => (
            <div key={wr.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="flex items-center gap-4 px-4 py-3">
                {/* 금액 + 상태 */}
                <div className="min-w-[120px]">
                  <p className="font-semibold text-amber-400">{wr.amount.toLocaleString()} P</p>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[wr.status] ?? ''}`}>
                    {STATUS_KO[wr.status] ?? wr.status}
                  </span>
                </div>

                {/* 유저 + 계좌 */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{wr.user.nickname}
                    <span className="text-gray-500 text-xs ml-1">({wr.user.email})</span>
                  </p>
                  <p className="text-xs text-gray-400">{wr.bankName} · {wr.accountHolder} · {wr.accountNumber}</p>
                </div>

                {/* 날짜 */}
                <div className="text-xs text-gray-500 shrink-0">
                  {format(new Date(wr.createdAt), 'MM.dd HH:mm', { locale: ko })}
                </div>

                {/* 액션 */}
                <div className="flex items-center gap-2 shrink-0">
                  {/* 이체 실패 경고 */}
                  {wr.transferError && !wr.transferId && (
                    <span title={wr.transferError}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-900/40 text-red-400 text-xs">
                      <AlertCircle size={11} /> 이체실패
                    </span>
                  )}
                  {/* 이체완료 표시 */}
                  {wr.transferId && (
                    <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-900/30 text-emerald-400 text-xs">
                      <Check size={11} /> 이체완료
                    </span>
                  )}
                  {['PENDING', 'APPROVED'].includes(wr.status) && !wr.transferId && (
                    <button onClick={() => setSelected(wr)}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-700 hover:bg-amber-600 text-white rounded-lg text-xs font-medium transition-colors">
                      <Send size={11} /> 이체
                    </button>
                  )}
                  {(wr.status === 'PENDING' || wr.status === 'APPROVED') && (
                    <button onClick={() => setSelected(wr)}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-700 hover:bg-indigo-600 text-white rounded-lg text-xs font-medium transition-colors">
                      <Clock size={11} /> 처리
                    </button>
                  )}
                  <button onClick={() => setExpanded(p => p === wr.id ? null : wr.id)}
                    className="p-1.5 rounded-lg bg-gray-800 text-gray-400 hover:text-white transition-colors">
                    {expanded === wr.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                </div>
              </div>

              {/* 상세 */}
              {expanded === wr.id && (
                <div className="border-t border-gray-800 px-4 py-3 text-xs space-y-1.5 text-gray-400">
                  <div className="flex gap-6 flex-wrap">
                    <span>신청 ID: <span className="font-mono text-gray-300">{wr.id.slice(0, 8)}</span></span>
                    <span>잔액: <span className="text-white">{wr.user.balance.toLocaleString()} P</span></span>
                    {wr.processedAt && <span>처리일: {format(new Date(wr.processedAt), 'yyyy.MM.dd HH:mm', { locale: ko })}</span>}
                    {wr.adminNote && <span className="text-yellow-400">메모: {wr.adminNote}</span>}
                  </div>
                  {wr.transferId && (
                    <p className="text-emerald-400">이체 ID: <span className="font-mono">{wr.transferId}</span></p>
                  )}
                  {wr.transferError && !wr.transferId && (
                    <p className="text-red-400 flex items-center gap-1">
                      <AlertCircle size={11} /> 이체 오류: {wr.transferError}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-1">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="w-8 h-8 rounded-lg text-sm bg-gray-800 text-gray-400 hover:bg-gray-700 disabled:opacity-30">‹</button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
            <button key={p} onClick={() => setPage(p)}
              className={`w-8 h-8 rounded-lg text-sm transition-colors ${p === page ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
              {p}
            </button>
          ))}
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="w-8 h-8 rounded-lg text-sm bg-gray-800 text-gray-400 hover:bg-gray-700 disabled:opacity-30">›</button>
        </div>
      )}

      {selected && <ProcessModal item={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

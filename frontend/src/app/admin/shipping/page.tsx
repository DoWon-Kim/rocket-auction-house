'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Truck, ChevronDown, ChevronUp, X, Check } from 'lucide-react'
import Image from 'next/image'
import Badge from '@/components/ui/Badge'

interface CardInfo { id: string; name: string; imageUrl?: string }
interface InventoryItem { id: string; card: CardInfo }
interface ShippingItem { id: string; quantity: number; inventoryItem: InventoryItem }
interface User { id: string; nickname: string; email: string }

interface ShippingRequest {
  id: string
  status: 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED'
  recipientName: string
  phone: string
  zipCode: string
  address: string
  addressDetail?: string
  memo?: string
  trackingNumber?: string
  courier?: string
  createdAt: string
  user: User
  items: ShippingItem[]
}

const STATUS_META: Record<string, { label: string; next: string; nextLabel: string; v: 'yellow' | 'indigo' | 'green' | 'red' | 'default' }> = {
  PENDING:    { label: '신청됨',   next: 'PROCESSING', nextLabel: '처리 시작',  v: 'yellow' },
  PROCESSING: { label: '처리 중',  next: 'SHIPPED',    nextLabel: '발송 완료',  v: 'indigo' },
  SHIPPED:    { label: '발송됨',   next: 'DELIVERED',  nextLabel: '배송 완료',  v: 'green'  },
  DELIVERED:  { label: '배송완료', next: '',           nextLabel: '',           v: 'green'  },
  CANCELLED:  { label: '취소',     next: '',           nextLabel: '',           v: 'red'    },
}

const STATUS_FILTERS = [
  { value: '', label: '전체' },
  { value: 'PENDING', label: '신청됨' },
  { value: 'PROCESSING', label: '처리 중' },
  { value: 'SHIPPED', label: '발송됨' },
  { value: 'DELIVERED', label: '배송완료' },
  { value: 'CANCELLED', label: '취소' },
]

function UpdateModal({ request, onClose }: { request: ShippingRequest; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    status: request.status,
    trackingNumber: request.trackingNumber ?? '',
    courier: request.courier ?? '',
  })
  const [err, setErr] = useState('')

  const mut = useMutation({
    mutationFn: () => api.patch(`/admin/shipping/${request.id}`, form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'shipping'] }); onClose() },
    onError: () => setErr('업데이트에 실패했습니다.'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-lg">배송 상태 업데이트</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18} /></button>
        </div>

        <div className="text-sm text-gray-400 space-y-0.5">
          <p>신청자: <span className="text-white">{request.user.nickname}</span> ({request.user.email})</p>
          <p>수령인: <span className="text-white">{request.recipientName}</span> · {request.phone}</p>
          <p>주소: [{request.zipCode}] {request.address} {request.addressDetail}</p>
          {request.memo && <p>메모: {request.memo}</p>}
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">상태</label>
            <select value={form.status}
              onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as typeof form.status }))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
              {Object.entries(STATUS_META).map(([v, m]) => (
                <option key={v} value={v}>{m.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">택배사</label>
            <input value={form.courier}
              onChange={(e) => setForm((p) => ({ ...p, courier: e.target.value }))}
              placeholder="예: CJ대한통운"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">운송장 번호</label>
            <input value={form.trackingNumber}
              onChange={(e) => setForm((p) => ({ ...p, trackingNumber: e.target.value }))}
              placeholder="운송장 번호"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
          </div>
        </div>

        {err && <p className="text-sm text-red-400">{err}</p>}

        <div className="flex gap-2">
          <button onClick={() => mut.mutate()}
            disabled={mut.isPending}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            <Check size={14} /> {mut.isPending ? '저장 중...' : '저장'}
          </button>
          <button onClick={onClose}
            className="flex items-center gap-1.5 bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm transition-colors">
            취소
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AdminShippingPage() {
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editTarget, setEditTarget] = useState<ShippingRequest | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'shipping', statusFilter, page],
    queryFn: () => api.get('/admin/shipping', {
      params: { status: statusFilter || undefined, page },
    }).then((r) => r.data),
  })

  const requests: ShippingRequest[] = data?.requests ?? []
  const total: number = data?.total ?? 0
  const limit: number = data?.limit ?? 20
  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Truck size={20} className="text-indigo-400" /> 배송 관리
          {total > 0 && <span className="text-sm font-normal text-gray-400">총 {total}건</span>}
        </h1>

        {/* 상태 필터 */}
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button key={f.value}
              onClick={() => { setStatusFilter(f.value); setPage(1) }}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                statusFilter === f.value ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4 animate-pulse h-20" />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center text-gray-500">
          배송 신청이 없습니다.
        </div>
      ) : (
        <div className="space-y-2">
          {requests.map((req) => {
            const st = STATUS_META[req.status] ?? { label: req.status, v: 'default' as const }
            const expanded = expandedId === req.id
            return (
              <div key={req.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                {/* 헤더 행 */}
                <div className="flex items-center gap-3 p-4">
                  <button
                    onClick={() => setExpandedId(expanded ? null : req.id)}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="font-semibold text-sm">{req.user.nickname}</span>
                        <span className="text-xs text-gray-500">{req.user.email}</span>
                        <Badge variant={st.v}>{st.label}</Badge>
                        {req.courier && req.trackingNumber && (
                          <span className="text-xs text-gray-400">{req.courier} · {req.trackingNumber}</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">
                        {req.recipientName} · {req.phone} · {req.items.length}종 ·{' '}
                        {format(new Date(req.createdAt), 'yy/MM/dd HH:mm', { locale: ko })}
                      </p>
                    </div>
                    {expanded ? <ChevronUp size={16} className="text-gray-500 shrink-0" /> : <ChevronDown size={16} className="text-gray-500 shrink-0" />}
                  </button>
                  <button
                    onClick={() => setEditTarget(req)}
                    className="shrink-0 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-xs transition-colors">
                    상태 변경
                  </button>
                </div>

                {/* 상세 */}
                {expanded && (
                  <div className="border-t border-gray-800 px-4 pb-4 space-y-3 pt-3">
                    <div className="text-sm text-gray-400 space-y-0.5">
                      <p><span className="text-gray-600">주소</span> [{req.zipCode}] {req.address} {req.addressDetail}</p>
                      {req.memo && <p><span className="text-gray-600">메모</span> {req.memo}</p>}
                    </div>
                    <div className="space-y-1">
                      {req.items.map((si) => (
                        <div key={si.id} className="flex items-center gap-3 py-1.5 border-b border-gray-800/50 last:border-0">
                          <div className="relative w-8 h-10 shrink-0 rounded overflow-hidden bg-gray-800">
                            {si.inventoryItem.card.imageUrl
                              ? <Image src={si.inventoryItem.card.imageUrl} alt={si.inventoryItem.card.name} fill className="object-cover" />
                              : <div className="absolute inset-0 flex items-center justify-center text-xs">🃏</div>}
                          </div>
                          <span className="text-sm text-gray-300 flex-1 truncate">{si.inventoryItem.card.name}</span>
                          <span className="text-xs text-gray-500">×{si.quantity}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-1.5 pt-2">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
            className="px-3 py-1.5 rounded-lg text-sm bg-gray-800 text-gray-400 hover:text-white disabled:opacity-40 transition-colors">
            이전
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button key={p} onClick={() => setPage(p)}
              className={`w-8 h-8 rounded-lg text-sm transition-colors ${p === page ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
              {p}
            </button>
          ))}
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="px-3 py-1.5 rounded-lg text-sm bg-gray-800 text-gray-400 hover:text-white disabled:opacity-40 transition-colors">
            다음
          </button>
        </div>
      )}

      {editTarget && <UpdateModal request={editTarget} onClose={() => setEditTarget(null)} />}
    </div>
  )
}

'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { api } from '@/lib/api'
import { Plus, Pencil, Power, X, Check, ChevronRight } from 'lucide-react'
import Badge from '@/components/ui/Badge'

interface Oripa {
  id: string
  title: string
  description?: string
  imageUrl?: string
  pricePerDraw: number
  totalSlots: number
  remainSlots: number
  isActive: boolean
  _count: { purchases: number }
}

type OripaFormState = { title: string; description: string; imageUrl: string; pricePerDraw: string; totalSlots: string }
const emptyForm: OripaFormState = { title: '', description: '', imageUrl: '', pricePerDraw: '', totalSlots: '' }

const inputCls = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500'
const labelCls = 'block text-xs text-gray-400 mb-1'

// OripaForm을 최상위에 정의 — 내부 정의 시 매 렌더마다 새 컴포넌트로 인식되어 포커스가 해제됨
function OripaForm({
  form,
  setForm,
  onSubmit,
  onCancel,
  loading,
}: {
  form: OripaFormState
  setForm: React.Dispatch<React.SetStateAction<OripaFormState>>
  onSubmit: () => void
  onCancel: () => void
  loading: boolean
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2">
        <label className={labelCls}>제목 *</label>
        <input className={inputCls} value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="오리파 이름" />
      </div>
      <div>
        <label className={labelCls}>1회 가격 (P) *</label>
        <input type="number" className={inputCls} value={form.pricePerDraw} onChange={(e) => setForm((p) => ({ ...p, pricePerDraw: e.target.value }))} placeholder="500" />
      </div>
      <div>
        <label className={labelCls}>전체 슬롯 수 *</label>
        <input type="number" className={inputCls} value={form.totalSlots} onChange={(e) => setForm((p) => ({ ...p, totalSlots: e.target.value }))} placeholder="100" />
      </div>
      <div className="col-span-2">
        <label className={labelCls}>이미지 URL</label>
        <input className={inputCls} value={form.imageUrl} onChange={(e) => setForm((p) => ({ ...p, imageUrl: e.target.value }))} placeholder="https://..." />
      </div>
      <div className="col-span-2">
        <label className={labelCls}>설명</label>
        <textarea className={inputCls} rows={2} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
      </div>
      <div className="col-span-2 flex gap-2">
        <button onClick={onSubmit} disabled={loading || !form.title || !form.pricePerDraw || !form.totalSlots}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1">
          <Check size={14} /> {loading ? '저장 중...' : '저장'}
        </button>
        <button onClick={onCancel} className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm transition-colors flex items-center gap-1">
          <X size={14} /> 취소
        </button>
      </div>
    </div>
  )
}

export default function AdminOripasPage() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editOripa, setEditOripa] = useState<Oripa | null>(null)
  const [form, setForm] = useState<OripaFormState>(emptyForm)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const { data: oripas, isLoading } = useQuery<Oripa[]>({
    queryKey: ['admin', 'oripas'],
    queryFn: () => api.get('/admin/oripas').then((r) => r.data),
  })

  const createMut = useMutation({
    mutationFn: (body: OripaFormState) => api.post('/admin/oripas', {
      title: body.title, description: body.description || undefined,
      imageUrl: body.imageUrl || undefined,
      pricePerDraw: Number(body.pricePerDraw), totalSlots: Number(body.totalSlots),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'oripas'] }); setShowForm(false); setForm(emptyForm); setMsg({ type: 'ok', text: '오리파가 등록되었습니다.' }) },
    onError: (e: unknown) => { const err = e as { response?: { data?: { message?: string } } }; setMsg({ type: 'err', text: err.response?.data?.message ?? '오류가 발생했습니다.' }) },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: OripaFormState }) => api.patch(`/admin/oripas/${id}`, {
      title: body.title, description: body.description || undefined,
      imageUrl: body.imageUrl || undefined,
      pricePerDraw: Number(body.pricePerDraw), totalSlots: Number(body.totalSlots),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'oripas'] }); setEditOripa(null); setMsg({ type: 'ok', text: '수정되었습니다.' }) },
    onError: (e: unknown) => { const err = e as { response?: { data?: { message?: string } } }; setMsg({ type: 'err', text: err.response?.data?.message ?? '오류가 발생했습니다.' }) },
  })

  const toggleMut = useMutation({
    mutationFn: (id: string) => api.patch(`/admin/oripas/${id}/toggle`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'oripas'] }),
  })

  function openEdit(o: Oripa) {
    setEditOripa(o)
    setShowForm(false)
    setForm({ title: o.title, description: o.description ?? '', imageUrl: o.imageUrl ?? '', pricePerDraw: String(o.pricePerDraw), totalSlots: String(o.totalSlots) })
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">오리파 관리</h1>
        <button onClick={() => { setShowForm(true); setEditOripa(null); setForm(emptyForm) }}
          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          <Plus size={16} /> 오리파 생성
        </button>
      </div>

      {msg && (
        <div className={`px-4 py-2 rounded-lg text-sm flex items-center justify-between ${msg.type === 'ok' ? 'bg-emerald-900/30 border border-emerald-700 text-emerald-300' : 'bg-red-900/30 border border-red-700 text-red-300'}`}>
          {msg.text}
          <button onClick={() => setMsg(null)}><X size={14} /></button>
        </div>
      )}

      {/* 생성 폼 */}
      {showForm && (
        <div className="bg-gray-900 border border-indigo-500/50 rounded-xl p-5">
          <h2 className="font-semibold mb-4">새 오리파 생성</h2>
          <OripaForm
            form={form}
            setForm={setForm}
            onSubmit={() => createMut.mutate(form)}
            onCancel={() => { setShowForm(false); setEditOripa(null) }}
            loading={createMut.isPending}
          />
        </div>
      )}

      {/* 수정 폼 */}
      {editOripa && (
        <div className="bg-gray-900 border border-yellow-500/50 rounded-xl p-5">
          <h2 className="font-semibold mb-4">오리파 수정: {editOripa.title}</h2>
          <OripaForm
            form={form}
            setForm={setForm}
            onSubmit={() => updateMut.mutate({ id: editOripa.id, body: form })}
            onCancel={() => { setShowForm(false); setEditOripa(null) }}
            loading={updateMut.isPending}
          />
        </div>
      )}

      {/* 오리파 목록 */}
      <div className="space-y-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl h-20 animate-pulse" />
          ))
        ) : oripas?.length === 0 ? (
          <div className="text-center py-16 text-gray-600 bg-gray-900 border border-gray-800 rounded-xl">오리파가 없습니다.</div>
        ) : oripas?.map((o) => (
          <div key={o.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold">{o.title}</span>
                <Badge variant={o.isActive ? 'green' : 'default'}>{o.isActive ? '활성' : '비활성'}</Badge>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span>{o.pricePerDraw.toLocaleString()}P / 1회</span>
                <span>슬롯 {o.remainSlots}/{o.totalSlots}</span>
                <span>참여 {o._count.purchases}명</span>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => openEdit(o)} className="p-2 text-gray-400 hover:text-indigo-400 hover:bg-indigo-400/10 rounded-lg transition-colors">
                <Pencil size={15} />
              </button>
              <button onClick={() => toggleMut.mutate(o.id)} title={o.isActive ? '비활성화' : '활성화'}
                className={`p-2 rounded-lg transition-colors ${o.isActive ? 'text-emerald-400 hover:bg-emerald-400/10' : 'text-gray-500 hover:bg-gray-700'}`}>
                <Power size={15} />
              </button>
              <Link href={`/admin/oripas/${o.id}`} className="p-2 text-gray-400 hover:text-yellow-400 hover:bg-yellow-400/10 rounded-lg transition-colors" title="아이템 관리">
                <ChevronRight size={15} />
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

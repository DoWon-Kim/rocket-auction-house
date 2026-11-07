'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Plus, Ticket, X, Loader2, ChevronRight } from 'lucide-react'
import { api } from '@/lib/api'
import { TCG_LABELS } from '@/lib/utils'
import { ImageUpload } from '@/components/ImageUpload'
import { ORIPA_STATUS } from '@/lib/oripa'

interface Row {
  id: string; title: string; imageUrl: string | null; status: 'DRAFT' | 'LIVE' | 'PAUSED' | 'SOLD_OUT'
  pricePerDraw: number; totalSlots: number; remainSlots: number; createdAt: string; earned: number
  _count: { items: number; purchases: number }
}
const EMPTY = { title: '', description: '', imageUrl: '', tcgType: 'POKEMON', pricePerDraw: '1000', totalSlots: '100', maxPerDraw: '10' }

export default function AdminOripasPage() {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [f, setF] = useState(EMPTY)
  const [error, setError] = useState('')
  const { data, isLoading } = useQuery<Row[]>({ queryKey: ['admin', 'oripas'], queryFn: () => api.get('/admin/oripas').then(r => r.data) })
  const create = useMutation({
    mutationFn: () => api.post<{ id: string }>('/admin/oripas', {
      title: f.title.trim(), description: f.description.trim() || null, imageUrl: f.imageUrl || null, tcgType: f.tcgType,
      pricePerDraw: Number(f.pricePerDraw), totalSlots: Number(f.totalSlots), maxPerDraw: Number(f.maxPerDraw),
    }).then(r => r.data),
    onSuccess: d => router.push(`/admin/oripas/${d.id}`),
    onError: (e: unknown) => setError((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? '생성에 실패했어요.'),
  })
  const field = 'w-full h-10 bg-sunken border border-line rounded-xl px-3 text-sm text-fg focus:outline-none focus:border-accent/50'

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-bold text-fg flex items-center gap-2"><Ticket size={19} className="text-accent-fg" />오리파 관리</h1>
        <button onClick={() => { setF(EMPTY); setCreating(true) }} className="ml-auto h-9 px-3.5 rounded-xl bg-accent text-sm font-semibold text-white inline-flex items-center gap-1.5"><Plus size={15} />새 오리파</button>
      </div>
      <p className="text-xs text-muted">준비 중에 상품을 구성하고 <b>판매 시작</b>을 누르면 티켓 순서가 봉인돼요. 봉인 뒤에는 상품 구성·가격·티켓 수를 바꿀 수 없어요.</p>

      {isLoading ? <div className="h-40 rounded-2xl bg-surface animate-pulse" /> : !data?.length ? (
        <p className="py-16 text-center text-sm text-subtle">오리파가 없어요.</p>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {data.map(o => {
            const pct = o.totalSlots ? ((o.totalSlots - o.remainSlots) / o.totalSlots) * 100 : 0
            const st = ORIPA_STATUS[o.status]
            return (
              <Link key={o.id} href={`/admin/oripas/${o.id}`} className="rounded-2xl border border-line bg-surface p-4 hover:border-line-strong space-y-3">
                <div className="flex items-center gap-3">
                  <span className="relative w-12 h-12 shrink-0 rounded-xl overflow-hidden bg-sunken border border-line">{o.imageUrl ? <Image src={o.imageUrl} alt="" fill sizes="48px" className="object-cover" /> : <Ticket size={18} className="m-auto mt-3.5 text-subtle" />}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-fg truncate">{o.title}</p>
                    <p className="text-xs text-muted">상품 {o._count.items}종 · {o.pricePerDraw.toLocaleString()}P</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${st.cls}`}>{st.label}</span>
                  <ChevronRight size={16} className="text-subtle" />
                </div>
                <div>
                  <div className="h-1.5 rounded-full bg-sunken overflow-hidden"><div className="h-full bg-gradient-to-r from-amber-400 to-fuchsia-500" style={{ width: `${pct}%` }} /></div>
                  <div className="flex justify-between text-[11px] text-muted mt-1 tabular-nums"><span>{(o.totalSlots - o.remainSlots).toLocaleString()} / {o.totalSlots.toLocaleString()}장</span><span>매출 {o.earned.toLocaleString()}P</span></div>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {creating && (
        <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4" onClick={() => setCreating(false)} role="dialog" aria-modal="true" aria-label="새 오리파">
          <div className="w-full max-w-lg rounded-2xl border border-line bg-bg p-5 space-y-3 max-h-[90dvh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center"><h2 className="font-bold text-fg">새 오리파</h2><button onClick={() => setCreating(false)} aria-label="닫기" className="ml-auto text-muted hover:text-fg"><X size={18} /></button></div>
            <label className="block space-y-1"><span className="text-xs text-muted">제목</span><input className={field} value={f.title} maxLength={60} onChange={e => setF({ ...f, title: e.target.value })} placeholder="예: 151 레전드 오리파" /></label>
            <label className="block space-y-1"><span className="text-xs text-muted">설명</span><textarea className={`${field} h-20 py-2`} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></label>
            <ImageUpload label="대표 이미지 (없으면 최상위 상품 사진)" value={f.imageUrl} onChange={url => setF({ ...f, imageUrl: url })} />
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1"><span className="text-xs text-muted">TCG</span>
                <select className={field} value={f.tcgType} onChange={e => setF({ ...f, tcgType: e.target.value })}>{Object.entries(TCG_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
              <label className="space-y-1"><span className="text-xs text-muted">1회 가격 (P)</span><input type="number" min={1} className={field} value={f.pricePerDraw} onChange={e => setF({ ...f, pricePerDraw: e.target.value })} /></label>
              <label className="space-y-1"><span className="text-xs text-muted">전체 티켓 수</span><input type="number" min={1} className={field} value={f.totalSlots} onChange={e => setF({ ...f, totalSlots: e.target.value })} /></label>
              <label className="space-y-1"><span className="text-xs text-muted">한 번에 최대</span><input type="number" min={1} max={100} className={field} value={f.maxPerDraw} onChange={e => setF({ ...f, maxPerDraw: e.target.value })} /></label>
            </div>
            {error && <p className="text-xs text-rose-300">{error}</p>}
            <button onClick={() => create.mutate()} disabled={!f.title.trim() || create.isPending} className="w-full h-10 rounded-xl bg-accent text-sm font-semibold text-white disabled:opacity-40 inline-flex items-center justify-center gap-1.5">{create.isPending && <Loader2 size={14} className="animate-spin" />}만들고 상품 구성하기</button>
          </div>
        </div>
      )}
    </div>
  )
}

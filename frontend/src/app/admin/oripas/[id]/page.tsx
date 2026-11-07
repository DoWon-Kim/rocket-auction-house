'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useParams, useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Play, Pause, Trash2, Lock, Coins, Crown, Search, Loader2, ExternalLink, AlertTriangle, CheckCircle2, Pencil } from 'lucide-react'
import { api } from '@/lib/api'
import { GRADE, gradeOf, LAST_ONE, prizeName, ORIPA_STATUS, type OripaPrize } from '@/lib/oripa'

interface AdminOripa {
  id: string; title: string; description: string | null; imageUrl: string | null; tcgType: string
  pricePerDraw: number; totalSlots: number; remainSlots: number; maxPerDraw: number
  status: 'DRAFT' | 'LIVE' | 'PAUSED' | 'SOLD_OUT'; seedHash: string | null; serverSeed?: string; sealed?: boolean
  items: (OripaPrize & { cardId: string | null; sortOrder: number })[]
  readiness: { tickets: number; problems: string[]; ready: boolean }
  economics: { value: number; revenue: number; rate: number; sold: number; earned: number }
  _count: { purchases: number }
}
interface CardHit { id: string; name: string; nameKo: string | null; imageUrl: string | null; setName: string; rarity: string; snkrdunkPrice: number | null }
const EMPTY_PRIZE = { prizeType: 'CARD' as 'CARD' | 'POINT', card: null as CardHit | null, pointAmount: '', label: '', grade: 1, quantity: '1', exchangeValue: '', isLastOne: false }
const errMsg = (e: unknown, fb: string) => (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? fb

export default function AdminOripaEditor() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const qc = useQueryClient()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [prize, setPrize] = useState(EMPTY_PRIZE)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const { data: o } = useQuery<AdminOripa>({ queryKey: ['admin', 'oripa', id], queryFn: () => api.get(`/admin/oripas/${id}`).then(r => r.data) })
  const { data: cards } = useQuery<{ cards: CardHit[] }>({ queryKey: ['admin', 'card-search', q], queryFn: () => api.get('/admin/cards', { params: { q, limit: 8 } }).then(r => r.data), enabled: q.trim().length >= 1 })

  const apply = (d: AdminOripa, text?: string) => { qc.setQueryData(['admin', 'oripa', id], d); qc.invalidateQueries({ queryKey: ['admin', 'oripas'] }); if (text) setMsg({ ok: true, text }) }
  const onErr = (fb: string) => (e: unknown) => setMsg({ ok: false, text: errMsg(e, fb) })
  const body = () => ({
    prizeType: prize.prizeType, cardId: prize.card?.id ?? null, pointAmount: prize.pointAmount ? Number(prize.pointAmount) : null,
    label: prize.label.trim() || null, grade: prize.grade, quantity: Number(prize.quantity) || 1,
    exchangeValue: prize.exchangeValue ? Number(prize.exchangeValue) : null, isLastOne: prize.isLastOne,
  })
  const save = useMutation({
    mutationFn: () => (editingId ? api.patch(`/admin/oripas/${id}/items/${editingId}`, body()) : api.post(`/admin/oripas/${id}/items`, body())).then(r => r.data),
    onSuccess: d => { apply(d, editingId ? '상품을 수정했어요.' : '상품을 추가했어요.'); setPrize(EMPTY_PRIZE); setEditingId(null); setQ('') },
    onError: onErr('저장에 실패했어요.'),
  })
  const del = useMutation({ mutationFn: (itemId: string) => api.delete(`/admin/oripas/${id}/items/${itemId}`).then(r => r.data), onSuccess: d => apply(d, '삭제했어요.'), onError: onErr('삭제 실패') })
  const act = useMutation({ mutationFn: (a: 'start' | 'pause' | 'resume') => api.post(`/admin/oripas/${id}/${a}`).then(r => r.data), onSuccess: (d, a) => apply(d, a === 'start' ? '판매를 시작했어요. 티켓 순서가 봉인되었어요.' : a === 'pause' ? '일시중지했어요.' : '판매를 재개했어요.'), onError: onErr('처리 실패') })
  const remove = useMutation({ mutationFn: () => api.delete(`/admin/oripas/${id}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'oripas'] }); router.push('/admin/oripas') }, onError: onErr('삭제 실패') })

  if (!o) return <div className="h-96 rounded-2xl bg-surface animate-pulse" />
  const draft = o.status === 'DRAFT'
  const st = ORIPA_STATUS[o.status]
  const e = o.economics
  const field = 'h-9 bg-sunken border border-line rounded-lg px-2.5 text-sm text-fg focus:outline-none focus:border-accent/50'
  const pickCard = (c: CardHit) => setPrize(p => ({ ...p, card: c, exchangeValue: p.exchangeValue || (c.snkrdunkPrice ? String(Math.round((c.snkrdunkPrice * 0.7) / 100) * 100) : '') }))
  const startEdit = (i: AdminOripa['items'][number]) => {
    setEditingId(i.id)
    setPrize({ prizeType: i.prizeType, card: i.card ? { ...i.card, setName: i.card.setName ?? '', snkrdunkPrice: i.card.snkrdunkPrice ?? null } : null, pointAmount: i.pointAmount ? String(i.pointAmount) : '', label: i.label ?? '', grade: i.grade, quantity: String(i.quantity), exchangeValue: i.exchangeValue ? String(i.exchangeValue) : '', isLastOne: i.isLastOne })
  }

  return (
    <div className="space-y-4">
      <Link href="/admin/oripas" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ChevronLeft size={15} />오리파 관리</Link>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold text-fg">{o.title}</h1>
        <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${st.cls}`}>{st.label}</span>
        <div className="ml-auto flex gap-2">
          {o.status !== 'DRAFT' && <Link href={`/oripas/${o.id}`} target="_blank" className="h-9 px-3 rounded-lg border border-line text-sm text-fg-2 inline-flex items-center gap-1.5"><ExternalLink size={14} />화면 보기</Link>}
          {draft && <button onClick={() => { if (confirm('판매를 시작할까요? 시작하면 상품 구성·가격·티켓 수를 바꿀 수 없어요.')) act.mutate('start') }} disabled={!o.readiness.ready || act.isPending} className="h-9 px-3.5 rounded-lg bg-emerald-500 text-sm font-semibold text-white disabled:opacity-40 inline-flex items-center gap-1.5"><Play size={14} />판매 시작</button>}
          {o.status === 'LIVE' && <button onClick={() => act.mutate('pause')} className="h-9 px-3.5 rounded-lg border border-amber-400/40 text-sm text-amber-200 inline-flex items-center gap-1.5"><Pause size={14} />일시중지</button>}
          {o.status === 'PAUSED' && <button onClick={() => act.mutate('resume')} className="h-9 px-3.5 rounded-lg bg-emerald-500 text-sm font-semibold text-white inline-flex items-center gap-1.5"><Play size={14} />재개</button>}
          {draft && o._count.purchases === 0 && <button onClick={() => { if (confirm('이 오리파를 삭제할까요?')) remove.mutate() }} className="h-9 px-3 rounded-lg border border-line text-sm text-muted hover:text-rose-300 inline-flex items-center gap-1.5"><Trash2 size={14} />삭제</button>}
        </div>
      </div>
      {msg && <p className={`text-sm ${msg.ok ? 'text-emerald-400' : 'text-rose-300'}`}>{msg.text}</p>}

      {/* 준비 상태 · 수익 구조 */}
      <div className="grid lg:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-line bg-surface p-4 space-y-2">
          <p className="text-xs font-semibold text-muted">구성 점검</p>
          <p className="text-sm text-fg tabular-nums">상품 수량 합계 <b className={!draft || o.readiness.tickets === o.remainSlots ? 'text-emerald-400' : 'text-amber-300'}>{o.readiness.tickets.toLocaleString()}</b> / 티켓 {(draft ? o.remainSlots : o.totalSlots).toLocaleString()}</p>
          {draft ? (o.readiness.ready
            ? <p className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle2 size={13} />판매를 시작할 수 있어요.</p>
            : o.readiness.problems.map(p => <p key={p} className="text-xs text-amber-300 flex items-start gap-1"><AlertTriangle size={13} className="shrink-0 mt-px" />{p}</p>))
            : <p className="text-xs text-muted flex items-center gap-1"><Lock size={12} />봉인됨 — 구성 변경 불가</p>}
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4 space-y-1.5 text-sm">
          <p className="text-xs font-semibold text-muted">수익 구조 (완판 기준)</p>
          <p className="flex justify-between"><span className="text-muted">판매 총액</span><b className="tabular-nums">{e.revenue.toLocaleString()}P</b></p>
          <p className="flex justify-between"><span className="text-muted">상품 가치 합계</span><b className="tabular-nums">{e.value.toLocaleString()}P</b></p>
          <p className="flex justify-between"><span className="text-muted">환원율</span><b className={`tabular-nums ${e.rate > 1 ? 'text-rose-300' : e.rate > 0.85 ? 'text-amber-300' : 'text-emerald-400'}`}>{(e.rate * 100).toFixed(1)}%</b></p>
          <p className="text-[11px] text-subtle">가치 = 카드 교환가 또는 포인트 지급액 × 수량</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4 space-y-1.5 text-sm">
          <p className="text-xs font-semibold text-muted">판매 현황</p>
          <p className="flex justify-between"><span className="text-muted">판매</span><b className="tabular-nums">{e.sold.toLocaleString()} / {o.totalSlots.toLocaleString()}장</b></p>
          <p className="flex justify-between"><span className="text-muted">매출</span><b className="tabular-nums">{e.earned.toLocaleString()}P</b></p>
          <p className="flex justify-between"><span className="text-muted">1회 가격 · 최대</span><b className="tabular-nums">{o.pricePerDraw.toLocaleString()}P · {o.maxPerDraw}장</b></p>
          {o.seedHash && <p className="text-[10px] text-subtle font-mono break-all pt-1">해시 {o.seedHash}</p>}
          {o.serverSeed && <p className="text-[10px] text-amber-300 font-mono break-all">시드 {o.serverSeed}</p>}
        </div>
      </div>

      {/* 상품 목록 */}
      <div className="rounded-2xl border border-line bg-surface overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead><tr className="border-b border-line text-xs text-subtle">
            <th className="text-left px-4 py-2.5">등급</th><th className="text-left px-2 py-2.5">상품</th><th className="text-right px-2 py-2.5">수량</th>
            <th className="text-right px-2 py-2.5">남은</th><th className="text-right px-2 py-2.5">교환가/지급</th><th className="text-right px-2 py-2.5">1장 확률</th><th className="px-4 py-2.5" />
          </tr></thead>
          <tbody>
            {o.items.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-subtle">아래에서 상품을 추가해주세요.</td></tr>}
            {o.items.map(i => (
              <tr key={i.id} className={`border-b border-line/60 ${editingId === i.id ? 'bg-accent-tint/30' : ''}`}>
                <td className="px-4 py-2"><span className={`px-1.5 py-0.5 rounded-md text-[10px] font-extrabold ${i.isLastOne ? LAST_ONE.chip : gradeOf(i.grade).chip}`}>{i.isLastOne ? '라스트원' : gradeOf(i.grade).label}</span></td>
                <td className="px-2 py-2">
                  <span className="flex items-center gap-2">
                    <span className="relative w-9 h-9 shrink-0 rounded-md overflow-hidden bg-sunken border border-line">{i.prizeType === 'POINT' ? <Coins size={16} className="m-auto mt-2.5 text-amber-300" /> : i.card?.imageUrl && <Image src={i.card.imageUrl} alt="" fill sizes="36px" className="object-contain" />}</span>
                    <span className="truncate max-w-[260px] text-fg-2">{prizeName(i)}</span>
                  </span>
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{i.quantity}</td>
                <td className="px-2 py-2 text-right tabular-nums text-muted">{draft ? '-' : i.remaining}</td>
                <td className="px-2 py-2 text-right tabular-nums">{i.prizeType === 'POINT' ? `${(i.pointAmount ?? 0).toLocaleString()}P` : i.exchangeValue ? `${i.exchangeValue.toLocaleString()}P` : <span className="text-subtle">교환 불가</span>}</td>
                <td className="px-2 py-2 text-right tabular-nums text-muted">{i.isLastOne ? '마지막 1장' : `${((i.quantity / Math.max(1, o.readiness.tickets)) * 100).toFixed(2)}%`}</td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  {draft && <>
                    <button onClick={() => startEdit(i)} aria-label="수정" className="p-1.5 text-muted hover:text-fg"><Pencil size={14} /></button>
                    <button onClick={() => del.mutate(i.id)} aria-label="삭제" className="p-1.5 text-muted hover:text-rose-300"><Trash2 size={14} /></button>
                  </>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 상품 추가·수정 */}
      {draft && (
        <div className="rounded-2xl border border-line bg-surface p-4 space-y-3">
          <p className="text-sm font-semibold text-fg">{editingId ? '상품 수정' : '상품 추가'}</p>
          <div className="flex flex-wrap gap-2">
            {(['CARD', 'POINT'] as const).map(t => (
              <button key={t} onClick={() => setPrize(p => ({ ...p, prizeType: t }))} className={`h-8 px-3 rounded-lg text-xs font-semibold border ${prize.prizeType === t ? 'bg-accent-tint border-accent-line text-accent-soft' : 'border-line text-muted'}`}>{t === 'CARD' ? '카드' : '포인트'}</button>
            ))}
            <span className="w-px bg-line mx-1" />
            {[4, 3, 2, 1].map(g => (
              <button key={g} onClick={() => setPrize(p => ({ ...p, grade: g }))} className={`h-8 px-3 rounded-lg text-xs font-bold ${prize.grade === g ? GRADE[g as 1 | 2 | 3 | 4].chip : 'border border-line text-muted'}`}>{GRADE[g as 1 | 2 | 3 | 4].label}</button>
            ))}
            <label className="h-8 px-3 rounded-lg border border-line text-xs text-fg-2 inline-flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={prize.isLastOne} onChange={e => setPrize(p => ({ ...p, isLastOne: e.target.checked }))} /><Crown size={12} />라스트원상</label>
          </div>

          {prize.prizeType === 'CARD' ? (
            <div className="space-y-2">
              {prize.card ? (
                <div className="flex items-center gap-3 rounded-xl bg-sunken px-3 py-2">
                  <span className="relative w-10 h-12 rounded-md overflow-hidden">{prize.card.imageUrl && <Image src={prize.card.imageUrl} alt="" fill sizes="40px" className="object-contain" />}</span>
                  <span className="flex-1 min-w-0 text-sm"><span className="block truncate text-fg">{prize.card.nameKo ?? prize.card.name}</span><span className="text-xs text-muted">{prize.card.setName}{prize.card.snkrdunkPrice ? ` · 시세 ${prize.card.snkrdunkPrice.toLocaleString()}원` : ''}</span></span>
                  <button onClick={() => setPrize(p => ({ ...p, card: null }))} className="text-xs text-muted hover:text-fg">바꾸기</button>
                </div>
              ) : (
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
                  <input value={q} onChange={e => setQ(e.target.value)} placeholder="카드 이름·번호로 검색" className={`${field} w-full pl-8`} />
                  {!!cards?.cards.length && q && (
                    <div className="absolute z-10 mt-1 w-full rounded-xl border border-line bg-bg shadow-xl max-h-72 overflow-y-auto">
                      {cards.cards.map(c => (
                        <button key={c.id} onClick={() => { pickCard(c); setQ('') }} className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-2">
                          <span className="relative w-8 h-10 shrink-0">{c.imageUrl && <Image src={c.imageUrl} alt="" fill sizes="32px" className="object-contain" />}</span>
                          <span className="min-w-0 text-sm"><span className="block truncate text-fg">{c.nameKo ?? c.name}</span><span className="text-[11px] text-muted">{c.setName} · {c.rarity}{c.snkrdunkPrice ? ` · 시세 ${c.snkrdunkPrice.toLocaleString()}원` : ''}</span></span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : null}

          <div className="grid sm:grid-cols-4 gap-2">
            <label className="space-y-1"><span className="text-[11px] text-muted">표시 이름 (선택)</span><input className={`${field} w-full`} value={prize.label} onChange={e => setPrize(p => ({ ...p, label: e.target.value }))} placeholder="예: 1등 · PSA10" /></label>
            {!prize.isLastOne && <label className="space-y-1"><span className="text-[11px] text-muted">수량 (티켓 수)</span><input type="number" min={1} className={`${field} w-full`} value={prize.quantity} onChange={e => setPrize(p => ({ ...p, quantity: e.target.value }))} /></label>}
            {prize.prizeType === 'CARD'
              ? <label className="space-y-1"><span className="text-[11px] text-muted">포인트 교환가 (비우면 교환 불가)</span><input type="number" min={0} className={`${field} w-full`} value={prize.exchangeValue} onChange={e => setPrize(p => ({ ...p, exchangeValue: e.target.value }))} /></label>
              : <label className="space-y-1"><span className="text-[11px] text-muted">지급 포인트</span><input type="number" min={1} className={`${field} w-full`} value={prize.pointAmount} onChange={e => setPrize(p => ({ ...p, pointAmount: e.target.value }))} /></label>}
            <div className="flex items-end gap-2">
              <button onClick={() => save.mutate()} disabled={save.isPending || (prize.prizeType === 'CARD' ? !prize.card : !Number(prize.pointAmount))} className="h-9 flex-1 rounded-lg bg-accent text-sm font-semibold text-white disabled:opacity-40 inline-flex items-center justify-center gap-1.5">{save.isPending && <Loader2 size={14} className="animate-spin" />}{editingId ? '수정' : '추가'}</button>
              {editingId && <button onClick={() => { setEditingId(null); setPrize(EMPTY_PRIZE) }} className="h-9 px-3 rounded-lg border border-line text-sm text-muted">취소</button>}
            </div>
          </div>
          <p className="text-[11px] text-subtle">교환가는 시세의 70%로 자동 제안돼요. 하위상은 포인트 상품(예: 500P)으로 채우면 티켓 수를 맞추기 쉬워요.</p>
        </div>
      )}
    </div>
  )
}

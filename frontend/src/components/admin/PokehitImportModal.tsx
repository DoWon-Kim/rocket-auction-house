'use client'

import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Download, Loader2, ExternalLink, RefreshCw, Info } from 'lucide-react'
import { api } from '@/lib/api'
import { TCG_LABELS } from '@/lib/utils'
import { CATEGORY_LABELS } from '@/lib/shop'

interface PreviewItem {
  sourceId: string; name: string; price: number; originalPrice: number | null; soldOut: boolean; url: string
  isBreak: boolean; category: string; tcgType: string; suggestedPrice: number
  existing: { id: string; price: number; isActive: boolean } | null
}
interface Row { checked: boolean; name: string; price: string; category: string; tcgType: string }

const DEFAULT_URL = 'https://pokehit.co.kr/17'
const errMsg = (e: unknown, fb: string) => (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? fb
const CATEGORIES = ['BOOSTER_BOX', 'SINGLE_PACK', 'STARTER_DECK', 'GIFT_SET', 'SPECIAL', 'OTHER']
const TCGS = ['POKEMON', 'ONEPIECE', 'YUGIOH', 'DIGIMON', 'MTG', 'WEISS', 'OTHER']

// 포케히트 상품 목록에서 상품명·종류·가격만 읽어와 비공개 초안으로 등록
export function PokehitImportModal({ onClose, onDone }: { onClose: () => void; onDone: (msg: string) => void }) {
  const qc = useQueryClient()
  const [url, setUrl] = useState(DEFAULT_URL)
  const [items, setItems] = useState<PreviewItem[] | null>(null)
  const [rows, setRows] = useState<Record<string, Row>>({})
  const [hideBreak, setHideBreak] = useState(true)
  const [error, setError] = useState('')

  const preview = useMutation({
    mutationFn: () => api.get<{ items: PreviewItem[] }>('/admin/shop/import/pokehit', { params: { url } }).then(r => r.data),
    onSuccess: d => {
      setError('')
      setItems(d.items)
      setRows(Object.fromEntries(d.items.map(i => [i.sourceId, {
        checked: !i.existing && !i.isBreak, name: i.name, price: String(i.suggestedPrice), category: i.category, tcgType: i.tcgType,
      }])))
    },
    onError: e => setError(errMsg(e, '목록을 불러오지 못했어요.')),
  })

  const shown = useMemo(() => (items ?? []).filter(i => !hideBreak || !i.isBreak), [items, hideBreak])
  const selected = shown.filter(i => rows[i.sourceId]?.checked && !i.existing)

  const importMut = useMutation({
    mutationFn: () => api.post('/admin/shop/import/pokehit', {
      url,
      items: selected.map(i => { const r = rows[i.sourceId]; return { sourceId: i.sourceId, name: r.name.trim(), price: Number(r.price), category: r.category, tcgType: r.tcgType } }),
    }).then(r => r.data as { message: string }),
    onSuccess: d => { qc.invalidateQueries({ queryKey: ['admin-shop'] }); onDone(d.message) },
    onError: e => setError(errMsg(e, '등록에 실패했어요.')),
  })

  const setRow = (id: string, patch: Partial<Row>) => setRows(r => ({ ...r, [id]: { ...r[id], ...patch } }))
  const toggleAll = (on: boolean) => setRows(r => { const n = { ...r }; for (const i of shown) if (!i.existing) n[i.sourceId] = { ...n[i.sourceId], checked: on }; return n })
  const invalid = selected.some(i => !(Number(rows[i.sourceId].price) > 0) || !rows[i.sourceId].name.trim())
  const cell = 'h-8 bg-sunken border border-line rounded-lg px-2 text-xs text-fg focus:outline-none focus:border-accent/50'

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label="포케히트 상품 가져오기">
      <div className="w-full max-w-5xl max-h-[90dvh] flex flex-col rounded-2xl border border-line bg-bg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 py-4 border-b border-line">
          <Download size={17} className="text-accent-fg" />
          <h2 className="font-bold text-fg">포케히트 상품 가져오기</h2>
          <button onClick={onClose} aria-label="닫기" className="ml-auto w-8 h-8 rounded-full flex items-center justify-center text-muted hover:text-fg hover:bg-surface-2"><X size={17} /></button>
        </div>

        <div className="px-5 py-3 space-y-2 border-b border-line">
          <p className="text-xs text-muted flex items-start gap-1.5"><Info size={13} className="shrink-0 mt-0.5" />
            상품명·종류·가격만 가져와 <b className="text-fg-2">비공개 초안</b>으로 등록해요. 사진·설명은 가져오지 않으니, 등록 후 직접 올리고 재고를 채운 뒤 판매를 켜주세요.</p>
          <div className="flex gap-2">
            <input value={url} onChange={e => setUrl(e.target.value)} aria-label="포케히트 목록 주소" className="flex-1 h-9 bg-sunken border border-line rounded-lg px-3 text-sm text-fg focus:outline-none focus:border-accent/50" />
            <button onClick={() => preview.mutate()} disabled={preview.isPending} className="h-9 px-4 rounded-lg bg-accent text-sm font-semibold text-white disabled:opacity-50 inline-flex items-center gap-1.5">
              {preview.isPending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}목록 불러오기
            </button>
          </div>
          {error && <p className="text-xs text-rose-300">{error}</p>}
        </div>

        <div className="flex-1 overflow-y-auto">
          {!items ? (
            <p className="py-16 text-center text-sm text-subtle">‘목록 불러오기’를 눌러주세요.</p>
          ) : (
            <table className="w-full text-sm min-w-[860px]">
              <thead className="sticky top-0 bg-bg z-10">
                <tr className="border-b border-line text-xs text-subtle">
                  <th className="px-4 py-2 w-8"><input type="checkbox" aria-label="전체 선택" checked={selected.length > 0 && selected.length === shown.filter(i => !i.existing).length} onChange={e => toggleAll(e.target.checked)} /></th>
                  <th className="text-left font-semibold px-2 py-2">상품명</th>
                  <th className="text-left font-semibold px-2 py-2">종류</th>
                  <th className="text-left font-semibold px-2 py-2">TCG</th>
                  <th className="text-right font-semibold px-2 py-2">포케히트가</th>
                  <th className="text-right font-semibold px-4 py-2">우리 판매가 (P)</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(i => {
                  const r = rows[i.sourceId]
                  const done = !!i.existing
                  return (
                    <tr key={i.sourceId} className={`border-b border-line/60 ${done ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-2"><input type="checkbox" aria-label={`${i.name} 선택`} disabled={done} checked={!!r?.checked && !done} onChange={e => setRow(i.sourceId, { checked: e.target.checked })} /></td>
                      <td className="px-2 py-2">
                        <input value={r?.name ?? ''} onChange={e => setRow(i.sourceId, { name: e.target.value })} disabled={done} className={`${cell} w-full`} aria-label="상품명" />
                        <span className="flex items-center gap-1.5 mt-1 text-[10px]">
                          {done && <span className="px-1.5 rounded bg-emerald-500/15 text-emerald-300">이미 등록됨{i.existing!.isActive ? ' · 판매중' : ' · 비공개'}</span>}
                          {i.isBreak && <span className="px-1.5 rounded bg-amber-500/15 text-amber-300">팩 브레이크·모집형</span>}
                          {i.soldOut && <span className="px-1.5 rounded bg-rose-500/15 text-rose-300">포케히트 품절</span>}
                          <a href={i.url} target="_blank" rel="noreferrer" className="text-subtle hover:text-fg inline-flex items-center gap-0.5">원본<ExternalLink size={10} /></a>
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        <select value={r?.category} onChange={e => setRow(i.sourceId, { category: e.target.value })} disabled={done} className={cell} aria-label="종류">
                          {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <select value={r?.tcgType} onChange={e => setRow(i.sourceId, { tcgType: e.target.value })} disabled={done} className={cell} aria-label="TCG">
                          {TCGS.map(t => <option key={t} value={t}>{TCG_LABELS[t] ?? t}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-muted whitespace-nowrap">{i.price.toLocaleString()}원</td>
                      <td className="px-4 py-2 text-right">
                        <input type="number" min={1} value={r?.price ?? ''} onChange={e => setRow(i.sourceId, { price: e.target.value })} disabled={done} className={`${cell} w-28 text-right`} aria-label="우리 판매가" />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex items-center gap-3 px-5 py-3 border-t border-line">
          <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer">
            <input type="checkbox" checked={hideBreak} onChange={e => setHideBreak(e.target.checked)} />팩 브레이크·모집형 숨기기
          </label>
          <span className="ml-auto text-xs text-muted">{selected.length}개 선택</span>
          <button onClick={onClose} className="h-9 px-4 rounded-lg border border-line text-sm text-muted">닫기</button>
          <button onClick={() => importMut.mutate()} disabled={selected.length === 0 || invalid || importMut.isPending}
            className="h-9 px-4 rounded-lg bg-accent text-sm font-semibold text-white disabled:opacity-40 inline-flex items-center gap-1.5">
            {importMut.isPending && <Loader2 size={14} className="animate-spin" />}초안으로 등록
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

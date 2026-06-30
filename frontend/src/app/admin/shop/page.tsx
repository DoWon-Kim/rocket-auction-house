'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import Image from 'next/image'
import { TCG_LABELS } from '@/lib/utils'
import { ImageUpload } from '@/components/ImageUpload'
import {
  Plus, Pencil, Eye, EyeOff, Package, X, Layers, AlertCircle,
  Search, ShoppingBag, BarChart2, TrendingUp, ShoppingCart,
  Boxes, CreditCard, ChevronLeft, ChevronRight, User, Trash2,
  CheckCircle2, Filter,
} from 'lucide-react'
import Badge from '@/components/ui/Badge'
import { formatDistanceToNow } from 'date-fns'
import { ko } from 'date-fns/locale'

// ─── 상수 ─────────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  BOOSTER_BOX:  '부스터 박스',
  STARTER_DECK: '스타터 덱',
  SINGLE_PACK:  '단품 팩',
  GIFT_SET:     '기프트 세트',
  SPECIAL:      '특별판',
  OTHER:        '기타',
}

const TCG_TYPES = Object.keys(TCG_LABELS)
const CATEGORIES = Object.keys(CATEGORY_LABELS)

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface ShopItem {
  id: string; name: string; description: string | null
  tcgType: string; category: string; price: number; stock: number
  imageUrl: string | null; isActive: boolean; isSoldOut: boolean; createdAt: string
  _count?: { orders: number }
}
interface DayData   { date: string; revenue: number; orders: number }
interface TopItem   { shopItemId: string; name: string; tcgType: string; imageUrl: string | null; totalRevenue: number; totalQuantity: number; orderCount: number }
interface ShopStats { totalRevenue: number; totalOrders: number; totalQuantity: number; avgOrderValue: number; topItems: TopItem[]; dailyRevenue: DayData[] }
interface ShopOrder { id: string; quantity: number; unitPrice: number; totalPrice: number; createdAt: string; user: { id: string; nickname: string; avatarUrl: string | null }; shopItem: { id: string; name: string; imageUrl: string | null; tcgType: string; category: string } }
interface OrdersResponse { orders: ShopOrder[]; total: number; page: number; totalPages: number }
interface NaverItem { productId: string; title: string; image: string; lprice: number; hprice: number; mallName: string; brand: string; category: string }

const EMPTY_FORM = { name: '', description: '', tcgType: 'POKEMON', category: 'BOOSTER_BOX', price: '', stock: '', imageUrl: '' }

// ─── 토스트 ────────────────────────────────────────────────────────────────────

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 2500); return () => clearTimeout(t) }, [onDone])
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2 bg-emerald-950/90 border border-emerald-700/50 text-emerald-300 text-sm px-4 py-2.5 rounded-xl shadow-2xl backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2">
      <CheckCircle2 size={15} /> {message}
    </div>
  )
}

// ─── 확인 모달 ────────────────────────────────────────────────────────────────

function ConfirmModal({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm" onClick={onCancel}>
      <div className="bg-[#150f0c] border border-[#3d2a0c] rounded-2xl p-5 w-full max-w-xs space-y-4" onClick={e => e.stopPropagation()}>
        <p className="text-sm text-[#e8d5b0] leading-relaxed">{message}</p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] text-[#9e8a6a] hover:text-[#e8d5b0] py-2 rounded-xl text-sm transition-colors">취소</button>
          <button onClick={onConfirm} className="flex-1 bg-red-900/60 hover:bg-red-900/90 border border-red-700/40 text-red-300 hover:text-red-200 py-2 rounded-xl text-sm font-semibold transition-colors">확인</button>
        </div>
      </div>
    </div>
  )
}

// ─── 네이버 쇼핑 검색 ─────────────────────────────────────────────────────────

function NaverSearchBox({ onSelect }: { onSelect: (item: NaverItem) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<NaverItem[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function handler(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function handleInput(value: string) {
    setQ(value)
    if (timer.current) clearTimeout(timer.current)
    if (value.length < 2) { setResults([]); setOpen(false); return }
    timer.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await api.get<{ items: NaverItem[] }>('/admin/naver-shopping/search', { params: { q: value } })
        setResults(res.data.items); setOpen(true)
      } catch { setResults([]) }
      finally { setLoading(false) }
    }, 400)
  }

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a4830] pointer-events-none" />
        {loading && <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-[#d4a853]/30 border-t-[#d4a853] animate-spin" />}
        <input value={q} onChange={e => handleInput(e.target.value)} onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="네이버 쇼핑에서 검색 후 자동 입력..."
          className="w-full pl-8 pr-8 py-2.5 bg-[#1a1410] border border-[#d4a853]/30 hover:border-[#d4a853]/50 focus:border-[#d4a853]/70 rounded-xl text-sm text-[#f5ead8] placeholder:text-[#5a4830] focus:outline-none transition-colors" />
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 top-full mt-1.5 w-full bg-[#150f0c] border border-[#2e2318] rounded-xl shadow-2xl overflow-hidden max-h-64 overflow-y-auto">
          {results.map(item => (
            <button key={item.productId} type="button" onClick={() => { onSelect(item); setQ(''); setResults([]); setOpen(false) }}
              className="flex items-center gap-3 w-full px-3 py-2.5 hover:bg-[#1a1410] transition-colors text-left border-b border-[#2e2318] last:border-0">
              {item.image && (
                <div className="relative w-10 h-10 shrink-0 rounded-lg overflow-hidden bg-[#2e2318]">
                  <Image src={item.image} alt={item.title} fill className="object-cover" unoptimized sizes="40px" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-[#e8d5b0] line-clamp-1">{item.title}</p>
                <p className="text-[10px] text-[#7a6040] mt-0.5">{item.lprice.toLocaleString()}원{item.mallName && <span className="ml-1.5 text-[#5a4830]">· {item.mallName}</span>}</p>
              </div>
              <ShoppingBag size={12} className="text-[#d4a853] shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── 상품 등록/수정 모달 ──────────────────────────────────────────────────────

function ItemFormModal({ initial, onSave, onCancel, title }: {
  initial?: Partial<typeof EMPTY_FORM>
  onSave: (data: typeof EMPTY_FORM) => Promise<void>
  onCancel: () => void
  title: string
}) {
  const [form, setForm] = useState({ ...EMPTY_FORM, ...initial })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (key: keyof typeof EMPTY_FORM) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(null)
    if (!form.name.trim()) { setError('상품명을 입력하세요.'); return }
    if (!Number(form.price) || Number(form.price) < 1) { setError('올바른 가격을 입력하세요.'); return }
    if (Number(form.stock) < 0) { setError('재고는 0 이상이어야 합니다.'); return }
    setLoading(true)
    try { await onSave({ ...form, price: Number(form.price) as unknown as string, stock: Number(form.stock) as unknown as string }) }
    catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      setError(e.response?.data?.message ?? '저장 실패')
    } finally { setLoading(false) }
  }

  function applyNaverItem(item: NaverItem) {
    setForm(f => ({
      ...f,
      name: item.title,
      imageUrl: item.image,
      price: String(Math.round((item.lprice + item.hprice) / 2)),
      description: f.description || `출처: ${item.mallName}${item.brand ? ` · 브랜드: ${item.brand}` : ''}`,
    }))
  }

  const field = 'w-full bg-[#120e0a] border border-[#2e2318] hover:border-[#4a3520] focus:border-[#d4a853]/40 rounded-xl px-4 py-2.5 text-sm text-[#f5ead8] placeholder:text-[#5a4830] focus:outline-none transition-colors'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/70 backdrop-blur-sm" onClick={onCancel}>
      <div
        className="bg-[#150f0c] border border-[#2e2318] rounded-2xl w-full max-w-lg max-h-[90dvh] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* 모달 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2e2318] shrink-0">
          <h3 className="font-bold text-base text-[#f5ead8]">{title}</h3>
          <button type="button" onClick={onCancel} className="text-[#5a4830] hover:text-[#9e8a6a] transition-colors"><X size={16} /></button>
        </div>

        {/* 스크롤 가능한 폼 영역 */}
        <form id="item-modal-form" onSubmit={submit} className="flex-1 overflow-y-auto px-5 py-4 space-y-4 scrollbar-thin">
          {/* 네이버 자동 입력 */}
          <div className="space-y-1">
            <label className="text-xs text-[#d4a853] uppercase tracking-wider font-semibold flex items-center gap-1.5">
              <ShoppingBag size={11} /> 네이버 쇼핑 자동 입력
            </label>
            <NaverSearchBox onSelect={applyNaverItem} />
            <p className="text-[10px] text-[#5a4830]">검색 후 클릭하면 상품명·이미지·가격이 자동으로 채워집니다.</p>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs text-red-400 bg-red-950/30 border border-red-800/40 rounded-xl px-3 py-2">
              <AlertCircle size={13} /> {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {/* 상품명 */}
            <div className="col-span-2 space-y-1">
              <label className="text-xs text-[#7a6040] uppercase tracking-wider font-semibold">상품명 *</label>
              <input value={form.name} onChange={set('name')} placeholder="예) 포켓몬 스칼렛앤바이올렛 부스터박스" className={field} required />
            </div>

            {/* TCG 종류 */}
            <div className="space-y-1">
              <label className="text-xs text-[#7a6040] uppercase tracking-wider font-semibold">TCG 종류 *</label>
              <select value={form.tcgType} onChange={set('tcgType')} className={field}>
                {TCG_TYPES.map(t => <option key={t} value={t}>{TCG_LABELS[t]}</option>)}
              </select>
            </div>

            {/* 카테고리 */}
            <div className="space-y-1">
              <label className="text-xs text-[#7a6040] uppercase tracking-wider font-semibold">카테고리 *</label>
              <select value={form.category} onChange={set('category')} className={field}>
                {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
              </select>
            </div>

            {/* 가격 */}
            <div className="space-y-1">
              <label className="text-xs text-[#7a6040] uppercase tracking-wider font-semibold">가격 (P) *</label>
              <input type="number" value={form.price} onChange={set('price')} min={1} placeholder="0" className={field} required />
            </div>

            {/* 재고 */}
            <div className="space-y-1">
              <label className="text-xs text-[#7a6040] uppercase tracking-wider font-semibold">재고 수량 *</label>
              <input type="number" value={form.stock} onChange={set('stock')} min={0} placeholder="0" className={field} required />
            </div>

            {/* 상품 설명 */}
            <div className="col-span-2 space-y-1">
              <label className="text-xs text-[#7a6040] uppercase tracking-wider font-semibold">상품 설명</label>
              <textarea value={form.description} onChange={set('description')} rows={3}
                placeholder="수록 카드, 구성 등 상세 설명"
                className={`${field} resize-none`} />
            </div>
          </div>

          {/* 이미지 업로드 */}
          <ImageUpload
            label="상품 이미지"
            value={form.imageUrl}
            onChange={url => setForm(f => ({ ...f, imageUrl: url }))}
          />
        </form>

        {/* 푸터 */}
        <div className="px-5 py-4 border-t border-[#2e2318] flex gap-2 shrink-0">
          <button type="button" onClick={onCancel}
            className="flex-1 bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] text-[#9e8a6a] hover:text-[#e8d5b0] py-2.5 rounded-xl text-sm transition-colors">
            취소
          </button>
          <button type="submit" form="item-modal-form" disabled={loading}
            className="flex-1 bg-[#d4a853] hover:bg-[#c49440] disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors"
          >
            {loading
              ? <span className="flex items-center justify-center gap-2"><div className="w-4 h-4 rounded-full border-2 border-[#c49440] border-t-white animate-spin" /> 저장 중...</span>
              : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── 재고 입고 모달 ────────────────────────────────────────────────────────────

function RestockModal({ item, onClose, onSuccess }: { item: ShopItem; onClose: () => void; onSuccess: (msg: string) => void }) {
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const qc = useQueryClient()
  const mut = useMutation({
    mutationFn: () => api.post(`/admin/shop/${item.id}/restock`, { amount: Number(amount) }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['admin-shop'] })
      onSuccess(res.data.message)
      onClose()
    },
    onError: (e: { response?: { data?: { message?: string } } }) => setError(e.response?.data?.message ?? '실패'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#150f0c] border border-[#2e2318] rounded-2xl p-5 w-full max-w-xs space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-[#f5ead8] flex items-center gap-2"><Layers size={15} className="text-[#d4a853]" /> 재고 추가 입고</h3>
          <button onClick={onClose} className="text-[#5a4830] hover:text-[#8a7055] transition-colors"><X size={16} /></button>
        </div>
        <div className="space-y-0.5">
          <p className="text-sm text-[#e8d5b0] font-medium truncate">{item.name}</p>
          <p className="text-xs text-[#5a4830]">현재 재고: <span className={`font-semibold ${item.stock === 0 ? 'text-red-400' : 'text-[#f5ead8]'}`}>{item.stock}개</span></p>
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex gap-2">
          <input
            type="number" value={amount} onChange={e => setAmount(e.target.value)} min={1}
            placeholder="추가 수량" autoFocus
            onKeyDown={e => e.key === 'Enter' && amount && mut.mutate()}
            className="flex-1 bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] focus:border-[#d4a853]/40 rounded-xl px-4 py-2.5 text-sm text-[#f5ead8] placeholder:text-[#5a4830] focus:outline-none transition-colors"
          />
          <button onClick={() => mut.mutate()} disabled={!amount || mut.isPending}
            className="bg-[#d4a853] hover:bg-[#c49440] disabled:opacity-40 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors">
            {mut.isPending ? <div className="w-4 h-4 rounded-full border-2 border-[#c49440] border-t-white animate-spin" /> : '입고'}
          </button>
        </div>
        <p className="text-[10px] text-[#4a3820]">입고 후 총 재고: <span className="text-[#8a7055]">{amount ? item.stock + Number(amount) : item.stock}개</span></p>
      </div>
    </div>
  )
}

// ─── 매출 바 차트 ──────────────────────────────────────────────────────────────

function RevenueChart({ data }: { data: DayData[] }) {
  const [tooltip, setTooltip] = useState<{ day: DayData; idx: number } | null>(null)
  const maxRevenue = Math.max(...data.map(d => d.revenue), 1)

  return (
    <div className="space-y-2">
      <div className="relative flex items-end gap-px h-32">
        {data.map((day, i) => {
          const pct = (day.revenue / maxRevenue) * 100
          const isToday = i === data.length - 1
          return (
            <div key={day.date}
              className="flex-1 min-w-[6px] flex flex-col items-center justify-end h-full relative cursor-pointer"
              onMouseEnter={() => setTooltip({ day, idx: i })}
              onMouseLeave={() => setTooltip(null)}
            >
              <div className={`w-full rounded-t transition-all duration-200 ${
                day.revenue === 0 ? 'bg-[#2e2318]' :
                isToday ? 'bg-[#d4a853] hover:bg-[#f0c060]' :
                'bg-[#7a5a28] hover:bg-[#d4a853]'
              }`} style={{ height: `${Math.max(pct, day.revenue > 0 ? 4 : 2)}%` }} />
              {tooltip?.idx === i && (
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-10 pointer-events-none whitespace-nowrap">
                  <div className="bg-[#0f0b08] border border-[#3d2a0c] rounded-lg px-2.5 py-1.5 text-[11px] shadow-xl">
                    <p className="text-[#f0a832] font-bold">{day.revenue.toLocaleString()}P</p>
                    <p className="text-[#5a4830]">{day.date.slice(5)} · {day.orders}건</p>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="flex justify-between text-[10px] text-[#4a3820] px-0.5">
        <span>{data[0]?.date.slice(5)}</span>
        <span>{data[Math.floor(data.length / 2)]?.date.slice(5)}</span>
        <span>{data[data.length - 1]?.date.slice(5)}</span>
      </div>
    </div>
  )
}

// ─── 매출 현황 탭 ─────────────────────────────────────────────────────────────

function SalesTab() {
  const [ordersPage, setOrdersPage] = useState(1)
  const [dateFrom, setDateFrom]     = useState('')
  const [dateTo, setDateTo]         = useState('')

  const { data: stats, isLoading: statsLoading } = useQuery<ShopStats>({
    queryKey: ['admin-shop-stats'],
    queryFn: () => api.get('/admin/shop/stats').then(r => r.data),
    staleTime: 60_000,
  })
  const { data: ordersData, isLoading: ordersLoading } = useQuery<OrdersResponse>({
    queryKey: ['admin-shop-orders', ordersPage, dateFrom, dateTo],
    queryFn: () => api.get('/admin/shop/orders', { params: {
      page: ordersPage,
      dateFrom: dateFrom || undefined,
      dateTo:   dateTo   || undefined,
    }}).then(r => r.data),
    staleTime: 30_000,
  })

  const orders = ordersData?.orders ?? []
  const SUMMARY = stats ? [
    { icon: <CreditCard size={16} className="text-[#d4a853]" />,    label: '총 매출',    value: `${stats.totalRevenue.toLocaleString()}P`,   sub: '누적' },
    { icon: <ShoppingCart size={16} className="text-blue-400" />,   label: '총 주문',    value: `${stats.totalOrders.toLocaleString()}건`,    sub: '누적' },
    { icon: <Boxes size={16} className="text-purple-400" />,        label: '판매 수량',  value: `${stats.totalQuantity.toLocaleString()}개`,  sub: '누적' },
    { icon: <TrendingUp size={16} className="text-emerald-400" />,  label: '평균 주문가', value: `${stats.avgOrderValue.toLocaleString()}P`,  sub: '주문당' },
  ] : []

  const hasFilter = dateFrom || dateTo

  return (
    <div className="space-y-6">
      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {statsLoading
          ? [1,2,3,4].map(i => <div key={i} className="h-20 bg-[#1a1410] border border-[#2e2318] rounded-xl animate-pulse" />)
          : SUMMARY.map(s => (
            <div key={s.label} className="bg-[#1a1410] border border-[#2e2318] rounded-xl px-4 py-3 space-y-1">
              <div className="flex items-center gap-2 text-xs text-[#5a4830]">{s.icon}{s.label}</div>
              <p className="text-xl font-bold text-[#f5ead8] tabular-nums">{s.value}</p>
              <p className="text-[10px] text-[#4a3820]">{s.sub}</p>
            </div>
          ))
        }
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        {/* 일별 차트 */}
        <div className="bg-[#1a1410] border border-[#2e2318] rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-[#f5ead8] flex items-center gap-2">
            <BarChart2 size={15} className="text-[#d4a853]" /> 일별 매출 (최근 30일)
          </h2>
          {statsLoading
            ? <div className="h-32 bg-[#1a1208] rounded-lg animate-pulse" />
            : stats?.dailyRevenue.length
              ? <RevenueChart data={stats.dailyRevenue} />
              : <div className="h-32 flex items-center justify-center text-[#4a3820] text-sm">주문 데이터가 없습니다.</div>
          }
        </div>

        {/* TOP 10 */}
        <div className="bg-[#1a1410] border border-[#2e2318] rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-[#f5ead8] flex items-center gap-2">
            <TrendingUp size={15} className="text-[#d4a853]" /> 상품별 매출 TOP 10
          </h2>
          {statsLoading
            ? <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-10 bg-[#1a1208] rounded-lg animate-pulse" />)}</div>
            : !stats?.topItems.length
              ? <div className="py-8 text-center text-[#4a3820] text-sm">데이터 없음</div>
              : (
                <div className="space-y-1.5">
                  {stats.topItems.map((item, i) => (
                    <div key={item.shopItemId} className="flex items-center gap-2.5 py-1.5">
                      <span className={`w-5 text-center text-xs font-bold shrink-0 ${i === 0 ? 'text-[#f0a832]' : i === 1 ? 'text-[#c0c0c0]' : i === 2 ? 'text-[#cd7f32]' : 'text-[#4a3820]'}`}>{i + 1}</span>
                      {item.imageUrl
                        ? <div className="relative w-7 h-9 shrink-0 rounded overflow-hidden bg-[#1a1208]"><Image src={item.imageUrl} alt={item.name} fill className="object-cover" /></div>
                        : <div className="w-7 h-9 shrink-0 rounded bg-[#1a1208] flex items-center justify-center"><Package size={12} className="text-[#4a3820]" /></div>
                      }
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-[#e8d5b0] truncate">{item.name}</p>
                        <p className="text-[10px] text-[#5a4830]">{item.totalQuantity}개 · {item.orderCount}건</p>
                      </div>
                      <p className="text-xs font-bold text-[#f0a832] tabular-nums shrink-0">{item.totalRevenue.toLocaleString()}P</p>
                    </div>
                  ))}
                </div>
              )
          }
        </div>
      </div>

      {/* 주문 내역 */}
      <div className="bg-[#1a1410] border border-[#2e2318] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#2e2318] flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-semibold text-[#f5ead8] flex items-center gap-2">
            <ShoppingCart size={15} className="text-[#d4a853]" />
            전체 주문 내역
            {ordersData && <span className="text-xs font-normal text-[#5a4830]">{ordersData.total.toLocaleString()}건</span>}
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setOrdersPage(1) }}
              className="bg-[#1a1208] border border-[#2e2318] hover:border-[#4a3520] focus:border-[#d4a853]/40 rounded-lg px-3 py-1.5 text-xs text-[#f5ead8] focus:outline-none transition-colors" />
            <span className="text-[#5a4830] text-xs">~</span>
            <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setOrdersPage(1) }}
              className="bg-[#1a1208] border border-[#2e2318] hover:border-[#4a3520] focus:border-[#d4a853]/40 rounded-lg px-3 py-1.5 text-xs text-[#f5ead8] focus:outline-none transition-colors" />
            {hasFilter && (
              <button onClick={() => { setDateFrom(''); setDateTo(''); setOrdersPage(1) }}
                className="flex items-center gap-1 text-xs text-[#5a4830] hover:text-[#9e8a6a] transition-colors">
                <X size={11} /> 초기화
              </button>
            )}
          </div>
        </div>

        <div className="hidden md:flex items-center gap-4 px-5 py-2.5 border-b border-[#1a1208] bg-[#120e0a] text-[10px] text-[#5a4830] uppercase tracking-wider font-semibold">
          <span className="w-32 shrink-0">주문일시</span>
          <span className="w-28 shrink-0">구매자</span>
          <span className="flex-1">상품</span>
          <span className="w-16 text-center shrink-0">수량</span>
          <span className="w-24 text-right shrink-0">결제금액</span>
        </div>

        {ordersLoading ? (
          <div className="divide-y divide-[#1a1208]">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-3.5 animate-pulse">
                <div className="w-32 h-3 bg-[#2e2318] rounded" /><div className="w-20 h-3 bg-[#2e2318] rounded" />
                <div className="flex-1 h-3 bg-[#2e2318] rounded" /><div className="w-12 h-3 bg-[#2e2318] rounded" />
              </div>
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3 text-[#4a3820]">
            <ShoppingCart size={36} className="opacity-30" />
            <p className="text-sm">{hasFilter ? '해당 기간에 주문이 없습니다.' : '주문 내역이 없습니다.'}</p>
          </div>
        ) : (
          <div className="divide-y divide-[#1a1208]">
            {orders.map(order => (
              <div key={order.id} className="flex items-center gap-4 px-5 py-3 hover:bg-[#1a1208] transition-colors">
                <div className="w-32 shrink-0">
                  <p className="text-xs text-[#8a7055] tabular-nums">{new Date(order.createdAt).toLocaleDateString('ko-KR')}</p>
                  <p className="text-[10px] text-[#4a3820]">{formatDistanceToNow(new Date(order.createdAt), { addSuffix: true, locale: ko })}</p>
                </div>
                <div className="w-28 shrink-0 flex items-center gap-1.5 min-w-0">
                  <User size={11} className="text-[#5a4830] shrink-0" />
                  <span className="text-xs text-[#e8d5b0] truncate">{order.user.nickname}</span>
                </div>
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  {order.shopItem.imageUrl
                    ? <div className="relative w-7 h-9 shrink-0 rounded overflow-hidden bg-[#1a1208]"><Image src={order.shopItem.imageUrl} alt={order.shopItem.name} fill className="object-cover" /></div>
                    : <div className="w-7 h-9 shrink-0 rounded bg-[#1a1208] flex items-center justify-center"><Package size={11} className="text-[#4a3820]" /></div>
                  }
                  <div className="min-w-0">
                    <p className="text-xs text-[#f5ead8] truncate">{order.shopItem.name}</p>
                    <p className="text-[10px] text-[#5a4830]">{TCG_LABELS[order.shopItem.tcgType] ?? order.shopItem.tcgType} · {CATEGORY_LABELS[order.shopItem.category] ?? order.shopItem.category}</p>
                  </div>
                </div>
                <div className="w-16 text-center shrink-0">
                  <span className="text-xs text-[#8a7055]">{order.quantity}개</span>
                </div>
                <div className="w-24 text-right shrink-0">
                  <p className="text-sm font-bold text-[#f0a832] tabular-nums">{order.totalPrice.toLocaleString()}P</p>
                  <p className="text-[10px] text-[#4a3820]">단가 {order.unitPrice.toLocaleString()}P</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {ordersData && ordersData.totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 px-5 py-3 border-t border-[#1a1208]">
            <button onClick={() => setOrdersPage(p => p - 1)} disabled={ordersPage <= 1}
              className="h-8 w-8 flex items-center justify-center rounded-lg bg-[#1a1208] border border-[#2e2318] text-[#7a6040] hover:border-[#4a3520] hover:text-[#e8d5b0] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <ChevronLeft size={13} />
            </button>
            <span className="text-xs text-[#5a4830]">{ordersPage} / {ordersData.totalPages}</span>
            <button onClick={() => setOrdersPage(p => p + 1)} disabled={ordersPage >= ordersData.totalPages}
              className="h-8 w-8 flex items-center justify-center rounded-lg bg-[#1a1208] border border-[#2e2318] text-[#7a6040] hover:border-[#4a3520] hover:text-[#e8d5b0] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <ChevronRight size={13} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── 상품 관리 탭 ─────────────────────────────────────────────────────────────

function ItemsTab({ triggerCreate, onCreateHandled }: { triggerCreate: boolean; onCreateHandled: () => void }) {
  const qc = useQueryClient()
  const [page, setPage]               = useState(1)
  const [search, setSearch]           = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive' | 'soldout'>('all')
  const [creating, setCreating]       = useState(false)
  const [editing, setEditing]         = useState<ShopItem | null>(null)

  useEffect(() => {
    if (triggerCreate) { setCreating(true); onCreateHandled() }
  }, [triggerCreate, onCreateHandled])
  const [restocking, setRestocking]   = useState<ShopItem | null>(null)
  const [confirm, setConfirm]         = useState<{ message: string; action: () => void } | null>(null)
  const [toast, setToast]             = useState<string | null>(null)

  const showToast = useCallback((msg: string) => setToast(msg), [])

  const { data, isLoading } = useQuery({
    queryKey: ['admin-shop', page],
    queryFn: () => api.get('/admin/shop', { params: { page } }).then(r => r.data),
  })

  const allItems: ShopItem[] = data?.items ?? []

  // 클라이언트 사이드 필터 (페이지 내)
  const items = allItems.filter(item => {
    const matchSearch = !search || item.name.toLowerCase().includes(search.toLowerCase())
    const matchStatus =
      filterStatus === 'all'      ? true :
      filterStatus === 'active'   ? item.isActive && !item.isSoldOut :
      filterStatus === 'inactive' ? !item.isActive :
      filterStatus === 'soldout'  ? item.isSoldOut : true
    return matchSearch && matchStatus
  })

  const totalPages = data ? Math.ceil(data.total / data.limit) : 0

  const toggleMut = useMutation({
    mutationFn: (item: ShopItem) => api.patch(`/admin/shop/${item.id}`, { isActive: !item.isActive }),
    onSuccess: (_r, item) => {
      qc.invalidateQueries({ queryKey: ['admin-shop'] })
      showToast(item.isActive ? '상품이 비활성화됐습니다.' : '상품이 활성화됐습니다.')
    },
  })
  const soldOutMut = useMutation({
    mutationFn: (item: ShopItem) => api.patch(`/admin/shop/${item.id}/soldout`),
    onSuccess: (_r, item) => {
      qc.invalidateQueries({ queryKey: ['admin-shop'] })
      showToast(item.isSoldOut ? '품절이 해제됐습니다.' : '품절 처리됐습니다.')
    },
  })
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/shop/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-shop'] }); showToast('상품이 삭제됐습니다.') },
  })

  async function handleCreate(form: typeof EMPTY_FORM) {
    await api.post('/admin/shop', { ...form, price: Number(form.price), stock: Number(form.stock), imageUrl: form.imageUrl || undefined })
    qc.invalidateQueries({ queryKey: ['admin-shop'] })
    setCreating(false)
    showToast('상품이 등록됐습니다.')
  }
  async function handleEdit(form: typeof EMPTY_FORM) {
    if (!editing) return
    await api.patch(`/admin/shop/${editing.id}`, { ...form, price: Number(form.price), imageUrl: form.imageUrl || undefined })
    qc.invalidateQueries({ queryKey: ['admin-shop'] })
    setEditing(null)
    showToast('상품이 수정됐습니다.')
  }

  const STATUS_FILTERS = [
    { key: 'all',      label: '전체' },
    { key: 'active',   label: '판매중' },
    { key: 'soldout',  label: '품절' },
    { key: 'inactive', label: '비활성' },
  ] as const

  return (
    <>
      {/* 검색 + 필터 바 */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a4830] pointer-events-none" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="상품명 검색..."
            className="w-full pl-8 pr-3 py-2 bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] focus:border-[#d4a853]/40 rounded-xl text-sm text-[#f5ead8] placeholder:text-[#5a4830] focus:outline-none transition-colors" />
        </div>
        <div className="flex items-center gap-1 bg-[#150f0c] border border-[#2e2318] rounded-xl p-1">
          <Filter size={11} className="text-[#4a3820] ml-1" />
          {STATUS_FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilterStatus(f.key)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${filterStatus === f.key ? 'bg-[#2a1c08] text-[#e0b878]' : 'text-[#7a6040] hover:text-[#9e8a6a]'}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* 상품 목록 */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-20 bg-[#1a1410] border border-[#2e2318] rounded-2xl animate-pulse" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-[#5a4830]">
          <Package size={36} className="mx-auto mb-3 opacity-30" />
          <p>{search ? `"${search}"에 해당하는 상품이 없습니다.` : '등록된 상품이 없습니다.'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <div key={item.id}
              className={`bg-[#1a1410] border rounded-2xl p-4 flex items-center gap-4 transition-all ${
                !item.isActive ? 'border-[#2e2318] opacity-50' :
                item.stock <= 3 && item.stock > 0 ? 'border-orange-800/30' :
                item.stock === 0 || item.isSoldOut ? 'border-red-900/30' :
                'border-[#2e2318]'
              }`}>
              {/* 이미지 */}
              <div className="w-14 h-16 bg-[#150f0c] border border-[#2e2318] rounded-xl overflow-hidden shrink-0">
                {item.imageUrl
                  ? <Image src={item.imageUrl} alt={item.name} width={56} height={64} className="object-cover w-full h-full" />
                  : <div className="flex items-center justify-center h-full text-[#5a4830]"><Package size={20} /></div>}
              </div>

              {/* 정보 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-semibold text-sm text-[#f5ead8] truncate">{item.name}</span>
                  {!item.isActive && <span className="text-[10px] bg-[#2e2318] text-[#8a7055] border border-[#4a3520] px-1.5 py-0.5 rounded-md font-semibold">비활성</span>}
                  {item.isSoldOut && <span className="text-[10px] bg-red-950/40 text-red-400 border border-red-800/40 px-1.5 py-0.5 rounded-md font-semibold">품절</span>}
                </div>
                <div className="flex items-center gap-3 text-xs text-[#8a7055] flex-wrap">
                  <Badge>{TCG_LABELS[item.tcgType] ?? item.tcgType}</Badge>
                  <span className="text-[#5a4830]">{CATEGORY_LABELS[item.category]}</span>
                  <span className="text-[#f0a832] font-bold tabular-nums">{item.price.toLocaleString()}P</span>
                  <span className={`font-semibold tabular-nums ${
                    item.stock === 0 ? 'text-red-400' :
                    item.stock <= 3  ? 'text-orange-400' :
                    item.stock <= 10 ? 'text-yellow-500' : 'text-[#8a7055]'
                  }`}>재고 {item.stock}개</span>
                  {item._count && <span className="text-[#5a4830]">판매 {item._count.orders}건</span>}
                </div>
              </div>

              {/* 액션 버튼 */}
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => setRestocking(item)} title="재고 입고"
                  className="p-2 text-[#7a6040] hover:text-[#f5ead8] hover:bg-[#2e2318] rounded-xl transition-colors">
                  <Layers size={14} />
                </button>
                <button onClick={() => setConfirm({
                    message: item.isSoldOut ? `"${item.name}"의 품절을 해제하시겠습니까?` : `"${item.name}"을 품절 처리하시겠습니까?`,
                    action: () => soldOutMut.mutate(item),
                  })}
                  title={item.isSoldOut ? '품절 해제' : '품절 처리'}
                  className={`p-2 rounded-xl transition-colors ${item.isSoldOut ? 'text-red-400 bg-red-950/20 hover:bg-red-950/40' : 'text-[#5a4830] hover:text-orange-400 hover:bg-orange-950/20'}`}>
                  <X size={14} />
                </button>
                <button onClick={() => setEditing(item)} title="수정"
                  className="p-2 text-[#7a6040] hover:text-[#d4a853] hover:bg-[#d4a853]/10 rounded-xl transition-colors">
                  <Pencil size={14} />
                </button>
                <button onClick={() => toggleMut.mutate(item)} title={item.isActive ? '비활성화' : '활성화'}
                  className={`p-2 rounded-xl transition-colors ${item.isActive ? 'text-emerald-400 hover:bg-emerald-950/30' : 'text-[#4a3820] hover:bg-[#2e2318] hover:text-emerald-400'}`}>
                  {item.isActive ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <button onClick={() => setConfirm({
                    message: `"${item.name}"을 삭제하시겠습니까? 이 동작은 되돌릴 수 없습니다.`,
                    action: () => deleteMut.mutate(item.id),
                  })}
                  title="삭제" className="p-2 text-[#5a4830] hover:text-red-400 hover:bg-red-950/20 rounded-xl transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage(p => p - 1)} disabled={page <= 1}
            className="h-8 w-8 flex items-center justify-center rounded-lg bg-[#1a1410] border border-[#2e2318] text-[#7a6040] hover:border-[#4a3520] hover:text-[#e8d5b0] disabled:opacity-30 transition-colors">
            <ChevronLeft size={13} />
          </button>
          <span className="text-sm text-[#8a7055] tabular-nums">{page} / {totalPages}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}
            className="h-8 w-8 flex items-center justify-center rounded-lg bg-[#1a1410] border border-[#2e2318] text-[#7a6040] hover:border-[#4a3520] hover:text-[#e8d5b0] disabled:opacity-30 transition-colors">
            <ChevronRight size={13} />
          </button>
        </div>
      )}

      {/* 폼 모달 */}
      {creating && (
        <ItemFormModal title="새 상품 등록" onSave={handleCreate} onCancel={() => setCreating(false)} />
      )}
      {editing && (
        <ItemFormModal
          title={`수정: ${editing.name}`}
          initial={{ name: editing.name, description: editing.description ?? '', tcgType: editing.tcgType, category: editing.category, price: String(editing.price), stock: String(editing.stock), imageUrl: editing.imageUrl ?? '' }}
          onSave={handleEdit}
          onCancel={() => setEditing(null)}
        />
      )}

      {/* 재고 입고 */}
      {restocking && <RestockModal item={restocking} onClose={() => setRestocking(null)} onSuccess={showToast} />}

      {/* 확인 모달 */}
      {confirm && <ConfirmModal message={confirm.message} onConfirm={() => { confirm.action(); setConfirm(null) }} onCancel={() => setConfirm(null)} />}

      {/* 토스트 */}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </>
  )
}

// ─── 메인 페이지 ──────────────────────────────────────────────────────────────

export default function AdminShopPage() {
  const [activeTab, setActiveTab]   = useState<'items' | 'sales'>('items')
  const [creating, setCreating]     = useState(false)

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[#f5ead8]">샵 관리</h1>
        {activeTab === 'items' && (
          <button onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 bg-[#d4a853] hover:bg-[#c49440] active:bg-[#b8832e] text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors shadow-lg shadow-[#d4a853]/20">
            <Plus size={15} /> 상품 추가
          </button>
        )}
      </div>

      {/* 탭 */}
      <div className="flex gap-1 bg-[#150f0c] border border-[#2e2318] rounded-xl p-1 w-fit">
        {([['items', <Package key="p" size={14} />, '상품 관리'], ['sales', <BarChart2 key="b" size={14} />, '매출 현황']] as const).map(([key, icon, label]) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === key ? 'bg-[#2a1c08] text-[#e0b878]' : 'text-[#7a6040] hover:text-[#9e8a6a]'}`}>
            {icon}{label}
          </button>
        ))}
      </div>

      {activeTab === 'items' && <ItemsTab key="items" triggerCreate={creating} onCreateHandled={() => setCreating(false)} />}
      {activeTab === 'sales' && <SalesTab />}
    </div>
  )
}

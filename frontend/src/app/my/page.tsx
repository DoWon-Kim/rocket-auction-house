'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { LISTING_TYPE_LABELS, CONDITION_LABELS, TCG_LABELS } from '@/lib/utils'
import Badge from '@/components/ui/Badge'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import {
  User, Wallet, ShoppingBag, ArrowDownCircle, ArrowUpCircle,
  Handshake, Gavel, Package, X, Check, AlertCircle,
  Archive, Truck, Trash2, ChevronDown, ChevronUp, Banknote, MessageCircle, Store, Star,
  TrendingUp, BarChart2, Shield, Flag, Loader2,
} from 'lucide-react'
import Image from 'next/image'
import { ReviewModal } from '@/components/ReviewModal'
import { RatingBadge } from '@/components/StarRating'

// ─── 탭 정의 ─────────────────────────────────────────────────────────────

const TABS = [
  { id: 'profile',     label: '내 정보',     icon: <User size={15} /> },
  { id: 'inventory',   label: '인벤토리',    icon: <Archive size={15} /> },
  { id: 'shipping',    label: '배송 신청',   icon: <Truck size={15} /> },
  { id: 'listings',    label: '판매 중',     icon: <ShoppingBag size={15} /> },
  { id: 'purchases',   label: '구매 내역',   icon: <ArrowDownCircle size={15} /> },
  { id: 'sales',       label: '판매 내역',   icon: <ArrowUpCircle size={15} /> },
  { id: 'offers-in',   label: '받은 제안',   icon: <Handshake size={15} /> },
  { id: 'offers-out',  label: '보낸 제안',   icon: <Handshake size={15} /> },
  { id: 'bids',        label: '입찰 내역',   icon: <Gavel size={15} /> },
  { id: 'oripas',      label: '오리파 내역', icon: <Package size={15} /> },
  { id: 'shop-orders', label: '샵 구매',     icon: <Store size={15} /> },
  { id: 'withdrawal',  label: '포인트 환전', icon: <Banknote size={15} /> },
  { id: 'disputes',    label: '분쟁 내역',   icon: <Shield size={15} /> },
] as const
type TabId = typeof TABS[number]['id']

// ─── 공용 컴포넌트 ────────────────────────────────────────────────────────

function EmptyState({ text }: { text: string }) {
  return (
    <div className="text-center py-16 text-[#5a4830]">
      <AlertCircle size={32} className="mx-auto mb-3 text-[#4a3520]" />
      <p className="text-sm text-[#8a7055]">{text}</p>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; v: 'green' | 'yellow' | 'red' | 'default' | 'indigo' }> = {
    ACTIVE:    { label: '판매 중',  v: 'green' },
    SOLD:      { label: '판매완료', v: 'indigo' },
    CANCELLED: { label: '취소',    v: 'red' },
    EXPIRED:   { label: '만료',    v: 'default' },
    PENDING:   { label: '대기 중', v: 'yellow' },
    ACCEPTED:  { label: '수락',    v: 'green' },
    DECLINED:  { label: '거절',    v: 'red' },
    WITHDRAWN: { label: '철회',    v: 'default' },
  }
  const m = map[status] ?? { label: status, v: 'default' as const }
  return <Badge variant={m.v}>{m.label}</Badge>
}

function SkeletonList() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-[#1a1410] border border-[#2e2318] rounded-2xl h-16 animate-pulse" />
      ))}
    </div>
  )
}

function Pagination({ page, total, onPageChange }: { page: number; total: number; onPageChange: (p: number) => void }) {
  if (total <= 1) return null
  return (
    <div className="flex justify-center gap-1 pt-2">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
        className="w-8 h-8 rounded-lg text-sm bg-[#1a1410] border border-[#2e2318] text-[#8a7055] hover:border-[#4a3520] hover:text-[#e8d5b0] disabled:opacity-30 transition-colors"
      >
        ‹
      </button>
      {Array.from({ length: total }, (_, i) => i + 1)
        .filter((p) => p === 1 || p === total || Math.abs(p - page) <= 1)
        .reduce<(number | '...')[]>((acc, p, idx, arr) => {
          if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('...')
          acc.push(p)
          return acc
        }, [])
        .map((p, i) =>
          p === '...' ? (
            <span key={`e-${i}`} className="w-8 h-8 flex items-center justify-center text-[#5a4830] text-sm">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p as number)}
              className={`w-8 h-8 rounded-lg text-sm transition-colors ${
                p === page
                  ? 'bg-[#d4a853] text-white font-semibold shadow-[0_0_20px_rgba(212,168,83,0.25)]'
                  : 'bg-[#1a1410] border border-[#2e2318] text-[#8a7055] hover:border-[#4a3520] hover:text-[#e8d5b0]'
              }`}
            >
              {p}
            </button>
          )
        )}
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page === total}
        className="w-8 h-8 rounded-lg text-sm bg-[#1a1410] border border-[#2e2318] text-[#8a7055] hover:border-[#4a3520] hover:text-[#e8d5b0] disabled:opacity-30 transition-colors"
      >
        ›
      </button>
    </div>
  )
}

// 필터 버튼 그룹
function FilterBar({ options, value, onChange }: {
  options: { value: string; label: string }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
            value === o.value
              ? 'bg-[#2a1c0c] text-white border border-[#d4a853]/40'
              : 'bg-[#1a1410] border border-[#2e2318] text-[#7a6040] hover:border-[#4a3520] hover:text-[#9e8a6a]'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ─── 각 탭 컨텐츠 ─────────────────────────────────────────────────────────

function ProfileTab() {
  const { user } = useAuthStore()
  if (!user) return null
  return (
    <div className="space-y-4">
      {/* 프로필 카드 */}
      <div className="bg-[#1a1410] border border-[#2e2318] rounded-2xl p-6 flex items-center gap-5">
        <div className="w-16 h-16 rounded-full bg-[#d4a853]/20 border-2 border-[#d4a853]/60 flex items-center justify-center text-2xl font-bold text-[#d4a853]">
          {user.nickname[0].toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xl font-bold text-[#f5ead8]">{user.nickname}</p>
          <p className="text-sm text-[#8a7055]">{user.email}</p>
          {user.role === 'ADMIN' && <Badge variant="indigo" className="mt-1">관리자</Badge>}
        </div>
      </div>

      {/* 포인트 카드 */}
      <div className="bg-[#1a1410] border border-[#2e2318] rounded-2xl p-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#f0a832]/10 flex items-center justify-center">
            <Wallet size={20} className="text-[#f0a832]" />
          </div>
          <div>
            <p className="text-xs text-[#7a6040] uppercase tracking-wider font-semibold">보유 포인트</p>
            <p className="text-2xl font-bold text-[#f0a832] tabular-nums">{user.balance.toLocaleString()} P</p>
          </div>
        </div>
        <Link
          href="/charge"
          className="flex items-center gap-2 px-4 py-2.5 bg-[#f0a832] hover:bg-[#e09820] text-[#0f0b08] font-semibold rounded-xl text-sm shadow-[0_0_20px_rgba(240,168,50,0.2)] transition-colors"
        >
          <Wallet size={15} />
          포인트 충전
        </Link>
      </div>

      {/* 빠른 링크 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { href: '/wishlist',     icon: '♥',  label: '위시리스트', sub: '저장한 카드'  },
          { href: '/collection',   icon: '📦', label: '컬렉션',     sub: '수집 현황'    },
          { href: '/settings',     icon: '⚙️', label: '설정',       sub: '알림 · 계정'  },
          { href: '/settings/2fa', icon: '🔐', label: '2단계 인증', sub: '보안 설정'    },
        ].map(item => (
          <Link key={item.href} href={item.href}
            className="bg-[#1a1410] hover:bg-[#201810] border border-[#2e2318] hover:border-[#d4a853]/30 rounded-2xl p-4 flex flex-col items-center gap-1.5 transition-colors text-center">
            <span className="text-2xl">{item.icon}</span>
            <span className="text-sm font-semibold text-[#e8d5b0]">{item.label}</span>
            <span className="text-[11px] text-[#5a4830]">{item.sub}</span>
          </Link>
        ))}
      </div>

      {/* 판매자 분석 */}
      <SellerStatsDashboard />
    </div>
  )
}

function SellerStatsDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['my-stats'],
    queryFn: () => api.get('/my/stats').then(r => r.data),
    staleTime: 60_000,
  })
  const s = data?.seller

  return (
    <div className="bg-[#150f0c] border border-[#2e2318] rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <BarChart2 size={14} className="text-[#d4a853]" />
        <p className="text-sm font-semibold text-[#e8d5b0]">판매 분석</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 rounded-xl bg-[#1a1410] animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: '활성 리스팅', value: s?.activeListings?.toLocaleString() ?? '0', icon: <ShoppingBag size={13} className="text-[#d4a853]" /> },
              { label: '전체 판매', value: `${s?.totalSales?.toLocaleString() ?? '0'}건`, icon: <TrendingUp size={13} className="text-emerald-400" /> },
              { label: '30일 거래액', value: s?.revenue30d ? `${(s.revenue30d / 10000).toFixed(1)}만P` : '—', icon: <Wallet size={13} className="text-blue-400" /> },
              { label: '7일 판매', value: `${s?.txCount7d?.toLocaleString() ?? '0'}건`, icon: <ArrowUpCircle size={13} className="text-purple-400" /> },
            ].map(stat => (
              <div key={stat.label} className="bg-[#1a1410] border border-[#2e2318] rounded-xl px-3 py-3 flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5">{stat.icon}<p className="text-[10px] text-[#5a4830] uppercase tracking-wide">{stat.label}</p></div>
                <p className="text-base font-bold text-[#f5ead8] tabular-nums">{stat.value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1 border-t border-[#2e2318]">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#5a4830]">평균 판매가</span>
              <span className="text-xs font-semibold text-[#e8d5b0] tabular-nums">
                {s?.avgSalePrice ? `${s.avgSalePrice.toLocaleString()}P` : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#5a4830]">평균 평점</span>
              <span className="flex items-center gap-1 text-xs font-semibold text-[#f0a832]">
                <Star size={10} fill="currentColor" strokeWidth={0} />
                {s?.avgRating ? `${s.avgRating} (${s.reviewCount}건)` : '없음'}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function ListingsTab() {
  const qc = useQueryClient()
  const [filter, setFilter] = useState('')
  const [msg, setMsg] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['my', 'listings', filter, page],
    queryFn: () => api.get('/my/listings', { params: { status: filter || undefined, page } }).then((r) => r.data),
  })
  const listings = data?.listings ?? []
  const totalPages = data ? Math.ceil(data.total / data.limit) : 0

  const cancelMut = useMutation({
    mutationFn: (id: string) => api.delete(`/my/listings/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['my', 'listings'] }); setMsg('리스팅이 취소되었습니다.') },
  })

  return (
    <div className="space-y-4">
      <FilterBar
        value={filter}
        onChange={(v) => { setFilter(v); setPage(1) }}
        options={[
          { value: '', label: '전체' },
          { value: 'ACTIVE', label: '판매 중' },
          { value: 'SOLD', label: '판매완료' },
          { value: 'CANCELLED', label: '취소' },
        ]}
      />
      {msg && (
        <div className="bg-emerald-950/50 border border-emerald-800/50 text-emerald-400 rounded-xl px-4 py-3 text-sm">
          {msg}
        </div>
      )}
      {isLoading ? <SkeletonList /> : listings.length === 0 ? <EmptyState text="리스팅이 없습니다." /> : (
        <div className="space-y-2">
          {listings.map((l: {
            id: string; listingType: string; condition: string; status: string;
            buyNowPrice?: number; startingPrice?: number; currentPrice?: number; minOfferPrice?: number;
            quantity: number; createdAt: string;
            card: { name: string; tcgType: string; rarity: string; setName: string };
            _count: { bids: number; offers: number };
          }) => (
            <div key={l.id} className="bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] rounded-2xl p-4 flex items-center gap-4 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Link href={`/listings/${l.id}`} className="font-semibold text-[#f5ead8] hover:text-[#d4a853] transition-colors">
                    {l.card.name}
                  </Link>
                  <Badge>{TCG_LABELS[l.card.tcgType]}</Badge>
                  <Badge variant="default">{LISTING_TYPE_LABELS[l.listingType]}</Badge>
                  <StatusBadge status={l.status} />
                </div>
                <div className="flex items-center gap-3 text-xs text-[#7a6040] flex-wrap">
                  <span>{l.card.setName} · {l.card.rarity}</span>
                  <span>{CONDITION_LABELS[l.condition]}</span>
                  <span className="text-[#f0a832] font-bold tabular-nums">
                    {(l.buyNowPrice ?? l.currentPrice ?? l.minOfferPrice ?? 0).toLocaleString()} P
                  </span>
                  {l._count.bids > 0 && <span className="text-[#8a7055]">입찰 {l._count.bids}건</span>}
                  {l._count.offers > 0 && <span className="text-[#8a7055]">제안 {l._count.offers}건</span>}
                  <span>{format(new Date(l.createdAt), 'yy/MM/dd', { locale: ko })}</span>
                </div>
              </div>
              {l.status === 'ACTIVE' && (
                <button
                  onClick={() => { if (confirm('리스팅을 취소할까요?')) cancelMut.mutate(l.id) }}
                  className="p-2 text-[#5a4830] hover:text-red-400 hover:bg-red-950/40 rounded-xl transition-colors shrink-0"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <Pagination page={page} total={totalPages} onPageChange={setPage} />
    </div>
  )
}

// ─── 번개장터식 거래 상태 ──────────────────────────────────────────────────────
const TX_STATUS: Record<string, { label: string; color: string; step: number }> = {
  PENDING_SHIPMENT: { label: '발송 대기',  color: 'bg-[#d4a853]/15 text-[#d4a853]',      step: 1 },
  SHIPPED:          { label: '배송 중',    color: 'bg-[#f0a832]/15 text-[#f0a832]',       step: 2 },
  COMPLETED:        { label: '거래 완료',  color: 'bg-emerald-500/15 text-emerald-400',   step: 3 },
  AUTO_COMPLETED:   { label: '자동 완료',  color: 'bg-emerald-500/15 text-emerald-400',   step: 3 },
  CANCELLED:        { label: '취소',       color: 'bg-red-950/50 text-red-400',           step: 0 },
}

const CARRIERS = [
  'CJ대한통운', '롯데택배', '한진택배', '우체국택배', '로젠택배',
  '카카오T택배', '쿠팡로켓배송', '직접배송', '기타',
]

interface TxPurchase {
  id: string; finalPrice: number; completedAt: string
  txStatus: string; trackingCarrier: string | null; trackingNumber: string | null; shippedAt: string | null
  seller: { nickname: string; avgRating: number | null; reviewCount: number }
  listing: { id: string; card: { name: string; nameKo: string | null; tcgType: string; rarity: string; imageUrl: string | null } }
  chatRoom?: { id: string } | null
  reviews: { id: string }[]
}

interface TxSale extends Omit<TxPurchase, 'seller'> {
  buyer: { nickname: string; avgRating: number | null; reviewCount: number }
}

// 진행 단계 스텝 표시
function TxSteps({ status }: { status: string }) {
  const steps = [
    { key: 'PENDING_SHIPMENT', label: '결제 완료' },
    { key: 'SHIPPED',          label: '발송 완료' },
    { key: 'COMPLETED',        label: '수령 확인' },
  ]
  const cur = TX_STATUS[status]?.step ?? 0
  return (
    <div className="flex items-center gap-0 text-xs">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center gap-0">
          <div className={`px-2 py-0.5 rounded text-[10px] font-medium ${cur >= i + 1 ? 'text-[#d4a853]' : 'text-[#5a4830]'}`}>
            {s.label}
          </div>
          {i < steps.length - 1 && (
            <span className={`mx-0.5 ${cur >= i + 2 ? 'text-[#d4a853]' : 'text-[#2e2318]'}`}>›</span>
          )}
        </div>
      ))}
    </div>
  )
}

// 구매 내역 탭
function PurchasesTab() {
  const [page, setPage] = useState(1)
  const [reviewTarget, setReviewTarget] = useState<TxPurchase | null>(null)
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['my', 'purchases', page],
    queryFn: () => api.get('/my/purchases', { params: { page } }).then(r => r.data),
  })
  const purchases: TxPurchase[] = data?.purchases ?? []
  const totalPages = data ? Math.ceil(data.total / data.limit) : 0

  const confirmMut = useMutation({
    mutationFn: (txId: string) => api.post(`/transactions/${txId}/confirm`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my', 'purchases'] }),
  })

  return (
    <div className="space-y-3">
      {isLoading ? <SkeletonList /> : purchases.length === 0 ? <EmptyState text="구매 내역이 없습니다." /> : (
        purchases.map(tx => {
          const st = TX_STATUS[tx.txStatus]
          const cardName = tx.listing.card.nameKo ?? tx.listing.card.name
          const isShipped = tx.txStatus === 'SHIPPED'
          return (
            <div
              key={tx.id}
              className={`bg-[#1a1410] border rounded-2xl overflow-hidden transition-colors ${
                isShipped ? 'border-[#f0a832]/30' : 'border-[#2e2318]'
              }`}
            >
              {/* 헤더 */}
              <div className="flex items-center gap-3 px-4 pt-3 pb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/listings/${tx.listing.id}`} className="font-semibold text-sm text-[#f5ead8] hover:text-[#d4a853] transition-colors truncate">
                      {cardName}
                    </Link>
                    <Badge>{TCG_LABELS[tx.listing.card.tcgType]}</Badge>
                    {st && (
                      <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${st.color}`}>{st.label}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <p className="text-xs text-[#7a6040]">
                      판매자: {tx.seller.nickname} · {format(new Date(tx.completedAt), 'yy.MM.dd', { locale: ko })}
                    </p>
                    <RatingBadge avgRating={tx.seller.avgRating} reviewCount={tx.seller.reviewCount} size={11} />
                  </div>
                </div>
                <p className="text-[#f0a832] font-bold tabular-nums text-sm shrink-0">
                  {tx.finalPrice.toLocaleString()} P
                </p>
              </div>

              {/* 진행 단계 */}
              <div className="px-4 pb-2">
                <TxSteps status={tx.txStatus} />
              </div>

              {/* 배송 정보 */}
              {tx.trackingNumber && (
                <div className="mx-4 mb-2 bg-[#2a1c0c] border border-[#2e2318] rounded-xl px-3 py-2 text-xs flex items-center gap-2">
                  <Truck size={12} className="text-[#f0a832] shrink-0" />
                  <span className="text-[#9e8a6a]">{tx.trackingCarrier}</span>
                  <span className="font-mono text-[#f0a832] tabular-nums">{tx.trackingNumber}</span>
                  {tx.shippedAt && (
                    <span className="text-[#5a4830] ml-auto">
                      {format(new Date(tx.shippedAt), 'MM.dd HH:mm', { locale: ko })} 발송
                    </span>
                  )}
                </div>
              )}

              {/* 액션 버튼 */}
              <div className="flex gap-2 px-4 pb-3 flex-wrap">
                {isShipped && (
                  <button
                    onClick={() => confirmMut.mutate(tx.id)}
                    disabled={confirmMut.isPending}
                    className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors"
                  >
                    {confirmMut.isPending
                      ? <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      : <Check size={12} />
                    }
                    수령 확인
                  </button>
                )}
                {tx.txStatus === 'PENDING_SHIPMENT' && (
                  <span className="flex items-center gap-1.5 text-xs text-[#d4a853] bg-[#d4a853]/10 border border-[#d4a853]/20 px-3 py-1.5 rounded-xl">
                    <AlertCircle size={12} /> 판매자 발송을 기다리고 있습니다
                  </span>
                )}
                {/* 분쟁 신청 버튼 — 발송 이후 상태 */}
                {['SHIPPED', 'COMPLETED', 'AUTO_COMPLETED'].includes(tx.txStatus) && (
                  <Link
                    href={`/disputes/new?txId=${tx.id}`}
                    className="flex items-center gap-1.5 border border-red-700/40 text-red-400 hover:bg-red-900/20 px-3 py-1.5 rounded-xl text-xs transition-colors"
                  >
                    <Flag size={11} /> 분쟁 신청
                  </Link>
                )}
                {/* 리뷰 버튼 — 완료 거래 + 미작성 */}
                {['COMPLETED', 'AUTO_COMPLETED'].includes(tx.txStatus) && (
                  tx.reviews.length === 0 ? (
                    <button
                      onClick={() => setReviewTarget(tx)}
                      className="flex items-center gap-1.5 bg-[#d4a853]/15 border border-[#d4a853]/30 hover:bg-[#d4a853]/25 text-[#d4a853] px-3 py-1.5 rounded-xl text-xs font-medium transition-colors"
                    >
                      <Star size={12} /> 리뷰 작성
                    </button>
                  ) : (
                    <span className="flex items-center gap-1.5 text-xs text-[#5a4830] px-3 py-1.5">
                      <Star size={11} className="text-[#f0a832] fill-[#f0a832]" /> 리뷰 완료
                    </span>
                  )
                )}
                {tx.chatRoom && (
                  <Link
                    href={`/chat/${tx.chatRoom.id}`}
                    className="flex items-center gap-1.5 bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] text-[#9e8a6a] hover:text-[#e8d5b0] px-3 py-1.5 rounded-xl text-xs transition-colors ml-auto"
                  >
                    <MessageCircle size={12} /> 채팅
                  </Link>
                )}
              </div>
            </div>
          )
        })
      )}
      <Pagination page={page} total={totalPages} onPageChange={setPage} />
      {/* 리뷰 모달 */}
      {reviewTarget && (
        <ReviewModal
          transactionId={reviewTarget.id}
          targetNickname={reviewTarget.seller.nickname}
          role="BUYER"
          onClose={() => setReviewTarget(null)}
        />
      )}
    </div>
  )
}

// 운송장 입력 폼
function TrackingForm({ txId, onDone }: { txId: string; onDone: () => void }) {
  const [carrier, setCarrier] = useState('')
  const [number, setNumber] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const mut = useMutation({
    mutationFn: () => api.post(`/transactions/${txId}/ship`, { trackingCarrier: carrier, trackingNumber: number }),
    onSuccess: onDone,
    onError: (e: { response?: { data?: { message?: string } } }) => setErr(e.response?.data?.message ?? '발송 처리 실패'),
  })

  return (
    <div className="bg-[#2a1c0c] border border-[#2e2318] rounded-xl p-3 space-y-2 mt-2 mb-3">
      <p className="text-xs font-semibold text-[#9e8a6a]">발송 정보 입력</p>
      <div className="flex gap-2 flex-wrap">
        <select
          value={carrier}
          onChange={e => setCarrier(e.target.value)}
          className="flex-1 bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] focus:border-[#d4a853]/40 rounded-xl px-3 py-2 text-xs text-[#f5ead8] focus:outline-none transition-colors"
        >
          <option value="">택배사 선택</option>
          {CARRIERS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input
          type="text"
          placeholder="운송장 번호"
          value={number}
          onChange={e => setNumber(e.target.value)}
          className="flex-1 bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] focus:border-[#d4a853]/40 rounded-xl px-3 py-2 text-xs text-[#f5ead8] placeholder:text-[#5a4830] focus:outline-none transition-colors"
        />
        <button
          onClick={() => mut.mutate()}
          disabled={!carrier || !number || mut.isPending}
          className="flex items-center gap-1.5 bg-[#d4a853] hover:bg-[#c49440] disabled:opacity-40 text-white px-3 py-2 rounded-xl text-xs font-semibold shadow-[0_0_20px_rgba(212,168,83,0.25)] transition-colors"
        >
          {mut.isPending ? <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : null}
          {mut.isPending ? '처리 중' : '발송 처리'}
        </button>
      </div>
      {err && <p className="text-xs text-red-400">{err}</p>}
    </div>
  )
}

// 판매 내역 탭
function SalesTab() {
  const [page, setPage] = useState(1)
  const [reviewTarget, setReviewTarget] = useState<TxSale | null>(null)
  const qc = useQueryClient()
  const [openShip, setOpenShip] = useState<string | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: ['my', 'sales', page],
    queryFn: () => api.get('/my/sales', { params: { page } }).then(r => r.data),
  })
  const sales: TxSale[] = data?.sales ?? []
  const totalPages = data ? Math.ceil(data.total / data.limit) : 0

  return (
    <div className="space-y-3">
      {isLoading ? <SkeletonList /> : sales.length === 0 ? <EmptyState text="판매 내역이 없습니다." /> : (
        sales.map(tx => {
          const st = TX_STATUS[tx.txStatus]
          const cardName = tx.listing.card.nameKo ?? tx.listing.card.name
          const needsShip = tx.txStatus === 'PENDING_SHIPMENT'
          const isDone = ['COMPLETED', 'AUTO_COMPLETED'].includes(tx.txStatus)
          return (
            <div
              key={tx.id}
              className={`bg-[#1a1410] border rounded-2xl overflow-hidden transition-colors ${
                needsShip ? 'border-[#d4a853]/30' : 'border-[#2e2318]'
              }`}
            >
              {needsShip && (
                <div className="bg-[#d4a853]/10 border-b border-[#d4a853]/20 px-4 py-1.5 text-xs text-[#d4a853] font-medium flex items-center gap-1.5">
                  <AlertCircle size={11} /> 발송 처리가 필요합니다
                </div>
              )}
              <div className="flex items-center gap-3 px-4 pt-3 pb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/listings/${tx.listing.id}`} className="font-semibold text-sm text-[#f5ead8] hover:text-[#d4a853] transition-colors truncate">
                      {cardName}
                    </Link>
                    <Badge>{TCG_LABELS[tx.listing.card.tcgType]}</Badge>
                    {st && <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${st.color}`}>{st.label}</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <p className="text-xs text-[#7a6040]">
                      구매자: {tx.buyer.nickname} · {format(new Date(tx.completedAt), 'yy.MM.dd', { locale: ko })}
                    </p>
                    <RatingBadge avgRating={tx.buyer.avgRating} reviewCount={tx.buyer.reviewCount} size={11} />
                  </div>
                </div>
                <p className={`font-bold tabular-nums text-sm shrink-0 ${isDone ? 'text-[#f0a832]' : 'text-[#5a4830]'}`}>
                  {isDone ? `+${tx.finalPrice.toLocaleString()} P` : `${tx.finalPrice.toLocaleString()} P`}
                </p>
              </div>

              {/* 진행 단계 */}
              <div className="px-4 pb-2">
                <TxSteps status={tx.txStatus} />
              </div>

              {/* 배송 정보 */}
              {tx.trackingNumber && (
                <div className="mx-4 mb-2 bg-[#2a1c0c] border border-[#2e2318] rounded-xl px-3 py-2 text-xs flex items-center gap-2">
                  <Truck size={12} className="text-[#f0a832] shrink-0" />
                  <span className="text-[#9e8a6a]">{tx.trackingCarrier}</span>
                  <span className="font-mono text-[#f0a832] tabular-nums">{tx.trackingNumber}</span>
                </div>
              )}

              {/* 발송 폼 */}
              {needsShip && (
                <div className="px-4">
                  {openShip === tx.id
                    ? <TrackingForm txId={tx.id} onDone={() => { setOpenShip(null); qc.invalidateQueries({ queryKey: ['my', 'sales'] }) }} />
                    : (
                      <button
                        onClick={() => setOpenShip(tx.id)}
                        className="w-full flex items-center justify-center gap-1.5 bg-[#d4a853] hover:bg-[#c49440] text-white py-2 rounded-xl text-xs font-semibold shadow-[0_0_20px_rgba(212,168,83,0.25)] transition-colors mb-2"
                      >
                        <Truck size={12} /> 발송 처리하기
                      </button>
                    )
                  }
                </div>
              )}

              {/* 채팅 + 리뷰 */}
              <div className="flex gap-2 px-4 pb-3 flex-wrap">
                {/* 리뷰 버튼 — 완료 거래 + 미작성 */}
                {['COMPLETED', 'AUTO_COMPLETED'].includes(tx.txStatus) && (
                  tx.reviews.length === 0 ? (
                    <button
                      onClick={() => setReviewTarget(tx)}
                      className="flex items-center gap-1.5 bg-[#d4a853]/15 border border-[#d4a853]/30 hover:bg-[#d4a853]/25 text-[#d4a853] px-3 py-1.5 rounded-xl text-xs font-medium transition-colors"
                    >
                      <Star size={12} /> 리뷰 작성
                    </button>
                  ) : (
                    <span className="flex items-center gap-1.5 text-xs text-[#5a4830] px-3 py-1.5">
                      <Star size={11} className="text-[#f0a832] fill-[#f0a832]" /> 리뷰 완료
                    </span>
                  )
                )}
                {tx.chatRoom && (
                  <Link
                    href={`/chat/${tx.chatRoom.id}`}
                    className="inline-flex items-center gap-1.5 bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] text-[#9e8a6a] hover:text-[#e8d5b0] px-3 py-1.5 rounded-xl text-xs transition-colors ml-auto"
                  >
                    <MessageCircle size={12} /> 구매자와 채팅
                  </Link>
                )}
              </div>
            </div>
          )
        })
      )}
      <Pagination page={page} total={totalPages} onPageChange={setPage} />
      {/* 리뷰 모달 */}
      {reviewTarget && (
        <ReviewModal
          transactionId={reviewTarget.id}
          targetNickname={reviewTarget.buyer.nickname}
          role="SELLER"
          onClose={() => setReviewTarget(null)}
        />
      )}
    </div>
  )
}

function OffersInTab() {
  const qc = useQueryClient()
  const [msg, setMsg] = useState('')
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['my', 'offers-in', filter, page],
    queryFn: () => api.get('/my/offers/received', { params: { status: filter || undefined, page } }).then((r) => r.data),
  })
  const offers = data?.offers ?? []
  const totalPages = data ? Math.ceil(data.total / data.limit) : 0

  const respondMut = useMutation({
    mutationFn: ({ offerId, action }: { offerId: string; action: string }) =>
      api.patch(`/offers/${offerId}/respond`, { action }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['my', 'offers-in'] })
      setMsg(vars.action === 'ACCEPTED' ? '제안을 수락했습니다.' : '제안을 거절했습니다.')
    },
  })

  return (
    <div className="space-y-4">
      <FilterBar
        value={filter}
        onChange={(v) => { setFilter(v); setPage(1) }}
        options={[
          { value: '', label: '전체' },
          { value: 'PENDING', label: '대기 중' },
          { value: 'ACCEPTED', label: '수락' },
          { value: 'DECLINED', label: '거절' },
        ]}
      />
      {msg && (
        <div className="bg-emerald-950/50 border border-emerald-800/50 text-emerald-400 rounded-xl px-4 py-3 text-sm">
          {msg}
        </div>
      )}
      {isLoading ? <SkeletonList /> : offers.length === 0 ? <EmptyState text="받은 제안이 없습니다." /> : (
        <div className="space-y-2">
          {offers.map((o: {
            id: string; amount: number; message?: string; status: string; createdAt: string;
            buyer: { nickname: string };
            listing: { id: string; card: { name: string; tcgType: string }; minOfferPrice?: number };
          }) => (
            <div key={o.id} className="bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] rounded-2xl p-4 space-y-2 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <Link href={`/listings/${o.listing.id}`} className="font-semibold text-[#f5ead8] hover:text-[#d4a853] transition-colors">
                      {o.listing.card.name}
                    </Link>
                    <Badge>{TCG_LABELS[o.listing.card.tcgType]}</Badge>
                    <StatusBadge status={o.status} />
                  </div>
                  <p className="text-xs text-[#7a6040]">
                    {o.buyer.nickname} ·{' '}
                    <span className="text-[#f0a832] font-bold tabular-nums">{o.amount.toLocaleString()} P</span>
                    {' '}제안
                    {o.listing.minOfferPrice && (
                      <span> (최소 <span className="tabular-nums">{o.listing.minOfferPrice.toLocaleString()}</span> P)</span>
                    )}
                    {' '}· {format(new Date(o.createdAt), 'yy/MM/dd HH:mm', { locale: ko })}
                  </p>
                  {o.message && (
                    <p className="text-xs text-[#9e8a6a] mt-1 bg-[#2a1c0c] border border-[#2e2318] rounded-lg px-2 py-1">
                      "{o.message}"
                    </p>
                  )}
                </div>
                {o.status === 'PENDING' && (
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      onClick={() => respondMut.mutate({ offerId: o.id, action: 'ACCEPTED' })}
                      disabled={respondMut.isPending}
                      className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors"
                    >
                      <Check size={13} /> 수락
                    </button>
                    <button
                      onClick={() => respondMut.mutate({ offerId: o.id, action: 'DECLINED' })}
                      disabled={respondMut.isPending}
                      className="flex items-center gap-1 bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] text-[#9e8a6a] hover:text-[#e8d5b0] px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors"
                    >
                      <X size={13} /> 거절
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <Pagination page={page} total={totalPages} onPageChange={setPage} />
    </div>
  )
}

function OffersOutTab() {
  const qc = useQueryClient()
  const [msg, setMsg] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['my', 'offers-out', page],
    queryFn: () => api.get('/my/offers/sent', { params: { page } }).then((r) => r.data),
  })
  const offers = data?.offers ?? []
  const totalPages = data ? Math.ceil(data.total / data.limit) : 0

  const withdrawMut = useMutation({
    mutationFn: (id: string) => api.delete(`/my/offers/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['my', 'offers-out'] }); setMsg('제안을 철회했습니다.') },
  })

  return (
    <div className="space-y-4">
      {msg && (
        <div className="bg-emerald-950/50 border border-emerald-800/50 text-emerald-400 rounded-xl px-4 py-3 text-sm">
          {msg}
        </div>
      )}
      {isLoading ? <SkeletonList /> : offers.length === 0 ? <EmptyState text="보낸 제안이 없습니다." /> : (
        <div className="space-y-2">
          {offers.map((o: {
            id: string; amount: number; message?: string; status: string; createdAt: string;
            listing: { id: string; card: { name: string; tcgType: string }; seller: { nickname: string } };
          }) => (
            <div key={o.id} className="bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] rounded-2xl p-4 flex items-center gap-4 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <Link href={`/listings/${o.listing.id}`} className="font-semibold text-[#f5ead8] hover:text-[#d4a853] transition-colors">
                    {o.listing.card.name}
                  </Link>
                  <Badge>{TCG_LABELS[o.listing.card.tcgType]}</Badge>
                  <StatusBadge status={o.status} />
                </div>
                <p className="text-xs text-[#7a6040]">
                  판매자: {o.listing.seller.nickname} ·{' '}
                  <span className="text-[#f0a832] font-bold tabular-nums">{o.amount.toLocaleString()} P</span>
                  {' '}· {format(new Date(o.createdAt), 'yy/MM/dd HH:mm', { locale: ko })}
                </p>
                {o.message && (
                  <p className="text-xs text-[#9e8a6a] mt-1 bg-[#2a1c0c] border border-[#2e2318] rounded-lg px-2 py-1">
                    "{o.message}"
                  </p>
                )}
              </div>
              {o.status === 'PENDING' && (
                <button
                  onClick={() => { if (confirm('제안을 철회할까요?')) withdrawMut.mutate(o.id) }}
                  className="p-2 text-[#5a4830] hover:text-red-400 hover:bg-red-950/40 rounded-xl transition-colors shrink-0"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <Pagination page={page} total={totalPages} onPageChange={setPage} />
    </div>
  )
}

function BidsTab() {
  const [page, setPage] = useState(1)
  const { data, isLoading } = useQuery({
    queryKey: ['my', 'bids', page],
    queryFn: () => api.get('/my/bids', { params: { page } }).then((r) => r.data),
  })
  const bids = data?.bids ?? []
  const totalPages = data ? Math.ceil(data.total / data.limit) : 0
  return (
    <div className="space-y-4">
      {isLoading ? <SkeletonList /> : bids.length === 0 ? <EmptyState text="입찰 내역이 없습니다." /> : (
        <div className="space-y-2">
          {bids.map((b: {
            id: string; amount: number; isWinning: boolean; createdAt: string;
            listing: {
              id: string; status: string; currentPrice?: number; auctionEndsAt?: string;
              card: { name: string; tcgType: string };
              seller: { nickname: string };
            };
          }) => {
            const ended = b.listing.auctionEndsAt ? new Date(b.listing.auctionEndsAt) < new Date() : false
            const won = b.isWinning && ended && b.listing.status === 'SOLD'
            return (
              <div key={b.id} className="bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] rounded-2xl p-4 flex items-center gap-4 transition-colors">
                <Gavel size={20} className={b.isWinning ? 'text-[#f0a832]' : 'text-[#5a4830]'} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <Link href={`/listings/${b.listing.id}`} className="font-semibold text-[#f5ead8] hover:text-[#d4a853] transition-colors">
                      {b.listing.card.name}
                    </Link>
                    <Badge>{TCG_LABELS[b.listing.card.tcgType]}</Badge>
                    {won && <Badge variant="green">낙찰</Badge>}
                    {b.isWinning && !ended && <Badge variant="yellow">최고 입찰자</Badge>}
                    {!b.isWinning && <Badge variant="red">입찰 실패</Badge>}
                  </div>
                  <p className="text-xs text-[#7a6040]">
                    내 입찰가:{' '}
                    <span className="text-[#f0a832] font-bold tabular-nums">{b.amount.toLocaleString()} P</span>
                    {' '}· 현재가:{' '}
                    <span className="tabular-nums">{b.listing.currentPrice?.toLocaleString()} P</span>
                    {' '}· 판매자: {b.listing.seller.nickname}
                    {b.listing.auctionEndsAt && (
                      <> · 마감: {format(new Date(b.listing.auctionEndsAt), 'MM/dd HH:mm', { locale: ko })}</>
                    )}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
      <Pagination page={page} total={totalPages} onPageChange={setPage} />
    </div>
  )
}

// ─── 인벤토리 타입 ────────────────────────────────────────────────────────

interface InventoryItem {
  id: string
  cardId: string
  quantity: number
  source: 'PURCHASE' | 'ORIPA'
  condition?: string
  gradingCompany?: string
  gradingGrade?: string
  imageUrls: string[]
  createdAt: string
  card: { id: string; name: string; tcgType: string; rarity: string; setName: string; imageUrl?: string }
  ids?: string[]  // 그룹된 오리파 아이템의 구성 ID 목록
}

interface ShippingRequestItem {
  id: string
  quantity: number
  inventoryItem: InventoryItem
}

interface ShippingRequestRecord {
  id: string
  recipientName: string
  phone: string
  zipCode: string
  address: string
  addressDetail?: string
  memo?: string
  status: 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED'
  trackingNumber?: string
  courier?: string
  createdAt: string
  items: ShippingRequestItem[]
}

const SHIPPING_STATUS_LABEL: Record<string, { text: string; v: 'yellow' | 'indigo' | 'green' | 'red' | 'default' }> = {
  PENDING:    { text: '신청됨',   v: 'yellow' },
  PROCESSING: { text: '처리 중',  v: 'indigo' },
  SHIPPED:    { text: '발송됨',   v: 'green' },
  DELIVERED:  { text: '배송완료', v: 'green' },
  CANCELLED:  { text: '취소',     v: 'red' },
}

// ─── 인벤토리 탭 ─────────────────────────────────────────────────────────

function InventoryTab() {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [source, setSource] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [showShipForm, setShowShipForm] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['my', 'inventory', source, page],
    queryFn: () => api.get('/my/inventory', { params: { source: source || undefined, page } }).then((r) => r.data),
  })
  const items: InventoryItem[] = data?.items ?? []
  const totalPages = data ? Math.ceil(data.total / data.limit) : 0

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/my/inventory/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my', 'inventory'] }),
  })

  // 그룹 아이템: ids 배열의 모든 ID를 토글, 개별 아이템: id 하나만 토글
  const toggleSelect = (item: InventoryItem) => {
    const itemIds = item.ids ?? [item.id]
    setSelectedIds((prev) => {
      const allSelected = itemIds.every((x) => prev.includes(x))
      if (allSelected) return prev.filter((x) => !itemIds.includes(x))
      return [...new Set([...prev, ...itemIds])]
    })
  }

  const isSelected = (item: InventoryItem) => {
    const itemIds = item.ids ?? [item.id]
    return itemIds.some((x) => selectedIds.includes(x))
  }

  const handleDelete = (item: InventoryItem) => (e: React.MouseEvent) => {
    e.stopPropagation()
    const itemIds = item.ids ?? [item.id]
    const msg = itemIds.length > 1
      ? `${item.card.name} ${itemIds.length}장을 인벤토리에서 모두 삭제할까요?`
      : '인벤토리에서 삭제할까요?'
    if (!confirm(msg)) return
    itemIds.forEach((id) => deleteMut.mutate(id))
  }

  return (
    <div className="space-y-4">
      {/* 필터 + 배송 신청 버튼 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <FilterBar
          value={source}
          onChange={(v) => { setSource(v); setPage(1); setSelectedIds([]) }}
          options={[
            { value: '', label: '전체' },
            { value: 'PURCHASE', label: '구매' },
            { value: 'ORIPA', label: '오리파' },
          ]}
        />
        {selectedIds.length > 0 && (
          <button
            onClick={() => setShowShipForm(true)}
            className="flex items-center gap-1.5 bg-[#d4a853] hover:bg-[#c49440] text-white px-3 py-1.5 rounded-xl text-sm font-semibold shadow-[0_0_20px_rgba(212,168,83,0.25)] transition-colors"
          >
            <Truck size={14} /> 선택 {selectedIds.length}개 배송 신청
          </button>
        )}
      </div>

      {/* 배송 신청 폼 (인라인) */}
      {showShipForm && (
        <ShipForm
          selectedItems={items.filter((i) => isSelected(i))}
          onClose={() => { setShowShipForm(false); setSelectedIds([]) }}
          onSuccess={() => { setShowShipForm(false); setSelectedIds([]); qc.invalidateQueries({ queryKey: ['my', 'inventory'] }) }}
        />
      )}

      {isLoading ? <SkeletonList /> : items.length === 0 ? (
        <EmptyState text="인벤토리가 비어 있습니다. 카드를 구매하거나 오리파를 뽑으면 여기에 쌓입니다." />
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const selected = isSelected(item)
            const displayImg = item.imageUrls?.[0] ?? item.card.imageUrl
            const isStacked = item.quantity > 1
            return (
              <div
                key={item.ids ? item.cardId : item.id}
                onClick={() => toggleSelect(item)}
                className={`bg-[#1a1410] border rounded-2xl p-4 flex items-center gap-4 cursor-pointer transition-colors ${
                  selected
                    ? 'border-[#d4a853]/50 bg-[#d4a853]/5'
                    : 'border-[#2e2318] hover:border-[#4a3520]'
                }`}
              >
                {/* 체크박스 */}
                <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center shrink-0 transition-colors ${
                  selected ? 'bg-[#d4a853] border-[#d4a853]' : 'border-[#4a3520]'
                }`}>
                  {selected && <Check size={12} className="text-white" />}
                </div>
                {/* 이미지 (스택 시 겹친 효과) */}
                <div className="relative shrink-0" style={{ width: 40, height: 56 }}>
                  {isStacked && (
                    <div className="absolute inset-0 rounded-lg bg-[#2a1c0c] border border-[#2e2318]" style={{ transform: 'translate(3px, 3px)' }} />
                  )}
                  <div className="absolute inset-0 rounded-lg overflow-hidden bg-[#2a1c0c]">
                    {displayImg
                      ? <Image src={displayImg} alt={item.card.name} fill className="object-cover" />
                      : <div className="absolute inset-0 flex items-center justify-center text-lg">🃏</div>
                    }
                  </div>
                </div>
                {/* 정보 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <p className="font-semibold text-sm text-[#f5ead8] truncate">{item.card.name}</p>
                    <Badge>{TCG_LABELS[item.card.tcgType] ?? item.card.tcgType}</Badge>
                    <Badge variant={item.source === 'PURCHASE' ? 'indigo' : 'green'}>
                      {item.source === 'PURCHASE' ? '구매' : '오리파'}
                    </Badge>
                  </div>
                  <p className="text-xs text-[#7a6040]">
                    {item.card.setName} · {item.card.rarity}
                    {item.condition && ` · ${CONDITION_LABELS[item.condition] ?? item.condition}`}
                    {item.gradingCompany && ` · ${item.gradingCompany}${item.gradingGrade ? ` ${item.gradingGrade}` : ''}`}
                  </p>
                  <p className="text-xs text-[#5a4830]">{format(new Date(item.createdAt), 'yy/MM/dd', { locale: ko })}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {/* 수량 배지: 2장 이상이면 강조 표시 */}
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    isStacked
                      ? 'bg-[#1a2a4a] text-[#d4a853] border border-[#d4a853]/30'
                      : 'text-[#8a7055]'
                  }`}>
                    ×{item.quantity}
                  </span>
                  <button
                    onClick={handleDelete(item)}
                    className="p-1.5 text-[#5a4830] hover:text-red-400 hover:bg-red-950/40 rounded-xl transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
      <Pagination page={page} total={totalPages} onPageChange={setPage} />
    </div>
  )
}

// ─── 배송 신청 폼 ─────────────────────────────────────────────────────────

function ShipForm({ selectedItems, onClose, onSuccess }: {
  selectedItems: InventoryItem[]
  onClose: () => void
  onSuccess: () => void
}) {
  const [form, setForm] = useState({
    recipientName: '', phone: '', zipCode: '', address: '', addressDetail: '', memo: '',
  })
  const [err, setErr] = useState('')

  const shipMut = useMutation({
    mutationFn: () => api.post('/my/shipping', {
      ...form,
      items: selectedItems.flatMap((i) =>
        (i.ids ?? [i.id]).map((id) => ({ inventoryItemId: id, quantity: 1 }))
      ),
    }),
    onSuccess: () => onSuccess(),
    onError: (e: unknown) => {
      const er = e as { response?: { data?: { message?: string } } }
      setErr(er.response?.data?.message ?? '배송 신청에 실패했습니다.')
    },
  })

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [k]: e.target.value }))

  const inputCls = "w-full bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] focus:border-[#d4a853]/40 rounded-xl px-4 py-3 text-sm text-[#f5ead8] placeholder:text-[#5a4830] focus:outline-none transition-colors"

  return (
    <div className="bg-[#1a1410] border border-[#d4a853]/30 rounded-2xl p-5 space-y-4">
      <h3 className="font-semibold text-[#f5ead8] flex items-center gap-2">
        <Truck size={16} className="text-[#d4a853]" /> 배송 신청
      </h3>

      {/* 신청 아이템 목록 */}
      <div className="bg-[#2a1c0c] border border-[#2e2318] rounded-xl p-3 space-y-1">
        {selectedItems.map((i) => (
          <div key={i.id} className="flex items-center gap-2 text-sm">
            <span className="text-[#9e8a6a] truncate flex-1">{i.card.name}</span>
            <span className="text-[#7a6040] text-xs">×{i.quantity}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {([
          ['recipientName', '수령인 이름 *'],
          ['phone', '연락처 * (예: 010-1234-5678)'],
          ['zipCode', '우편번호 *'],
          ['address', '주소 *'],
          ['addressDetail', '상세 주소'],
        ] as [keyof typeof form, string][]).map(([key, label]) => (
          <div key={key} className={key === 'address' || key === 'addressDetail' ? 'col-span-2' : ''}>
            <label className="block text-xs text-[#7a6040] uppercase tracking-wider font-semibold mb-1.5">{label}</label>
            <input value={form[key]} onChange={set(key)} className={inputCls} />
          </div>
        ))}
        <div className="col-span-2">
          <label className="block text-xs text-[#7a6040] uppercase tracking-wider font-semibold mb-1.5">배송 메모</label>
          <textarea
            value={form.memo}
            onChange={set('memo')}
            rows={2}
            className={`${inputCls} resize-none`}
          />
        </div>
      </div>

      {err && (
        <div className="bg-red-950/50 border border-red-800/50 text-red-400 rounded-xl px-4 py-3 text-sm">
          {err}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => shipMut.mutate()}
          disabled={shipMut.isPending || !form.recipientName || !form.phone || !form.zipCode || !form.address}
          className="flex items-center gap-1.5 bg-[#d4a853] hover:bg-[#c49440] disabled:opacity-50 text-white font-semibold px-4 py-2.5 rounded-xl text-sm shadow-[0_0_20px_rgba(212,168,83,0.25)] transition-colors"
        >
          {shipMut.isPending
            ? <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            : <Truck size={14} />
          }
          {shipMut.isPending ? '신청 중...' : '배송 신청'}
        </button>
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] text-[#9e8a6a] hover:text-[#e8d5b0] px-4 py-2.5 rounded-xl text-sm transition-colors"
        >
          <X size={14} /> 취소
        </button>
      </div>
    </div>
  )
}

// ─── 배송 탭 ─────────────────────────────────────────────────────────────

function ShippingTab() {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['my', 'shipping', page],
    queryFn: () => api.get('/my/shipping', { params: { page } }).then((r) => r.data),
  })
  const requests: ShippingRequestRecord[] = data?.requests ?? []
  const totalPages = data ? Math.ceil(data.total / data.limit) : 0

  const cancelMut = useMutation({
    mutationFn: (id: string) => api.patch(`/my/shipping/${id}/cancel`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my', 'shipping'] }),
  })

  return (
    <div className="space-y-4">
      {isLoading ? <SkeletonList /> : requests.length === 0 ? (
        <EmptyState text="배송 신청 내역이 없습니다." />
      ) : (
        <div className="space-y-3">
          {requests.map((req) => {
            const st = SHIPPING_STATUS_LABEL[req.status] ?? { text: req.status, v: 'default' as const }
            const expanded = expandedId === req.id
            return (
              <div key={req.id} className="bg-[#1a1410] border border-[#2e2318] rounded-2xl overflow-hidden">
                {/* 헤더 */}
                <button
                  onClick={() => setExpandedId(expanded ? null : req.id)}
                  className="w-full flex items-center gap-4 p-4 hover:bg-[#2a1c0c]/50 transition-colors text-left"
                >
                  <Truck size={18} className="text-[#d4a853] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="font-semibold text-sm text-[#f5ead8]">{req.recipientName}</span>
                      <Badge variant={st.v}>{st.text}</Badge>
                      {req.courier && req.trackingNumber && (
                        <span className="text-xs text-[#8a7055]">{req.courier} · {req.trackingNumber}</span>
                      )}
                    </div>
                    <p className="text-xs text-[#7a6040]">
                      {req.items.length}종 · {format(new Date(req.createdAt), 'yy/MM/dd HH:mm', { locale: ko })}
                    </p>
                  </div>
                  {expanded
                    ? <ChevronUp size={16} className="text-[#5a4830] shrink-0" />
                    : <ChevronDown size={16} className="text-[#5a4830] shrink-0" />
                  }
                </button>

                {/* 상세 */}
                {expanded && (
                  <div className="border-t border-[#2e2318] px-4 pb-4 space-y-3">
                    <div className="pt-3 space-y-1 text-sm text-[#8a7055]">
                      <p><span className="text-[#5a4830]">주소</span> [{req.zipCode}] {req.address} {req.addressDetail}</p>
                      <p><span className="text-[#5a4830]">연락처</span> {req.phone}</p>
                      {req.memo && <p><span className="text-[#5a4830]">메모</span> {req.memo}</p>}
                    </div>
                    <div className="space-y-1">
                      {req.items.map((si) => (
                        <div key={si.id} className="flex items-center gap-3 py-1.5 border-b border-[#2e2318]/50 last:border-0">
                          <div className="relative w-8 h-10 shrink-0 rounded-lg overflow-hidden bg-[#2a1c0c]">
                            {si.inventoryItem.card.imageUrl
                              ? <Image src={si.inventoryItem.card.imageUrl} alt={si.inventoryItem.card.name} fill className="object-cover" />
                              : <div className="absolute inset-0 flex items-center justify-center text-xs">🃏</div>
                            }
                          </div>
                          <span className="text-sm text-[#9e8a6a] flex-1 truncate">{si.inventoryItem.card.name}</span>
                          <span className="text-xs text-[#7a6040]">×{si.quantity}</span>
                        </div>
                      ))}
                    </div>
                    {req.status === 'PENDING' && (
                      <button
                        onClick={() => { if (confirm('배송 신청을 취소할까요?')) cancelMut.mutate(req.id) }}
                        className="flex items-center gap-1 text-xs bg-red-950/60 border border-red-800/40 text-red-400 hover:bg-red-900/60 px-3 py-1.5 rounded-xl transition-colors"
                      >
                        <X size={12} /> 신청 취소
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      <Pagination page={page} total={totalPages} onPageChange={setPage} />
    </div>
  )
}

function OripasTab() {
  const [page, setPage] = useState(1)
  const { data, isLoading } = useQuery({
    queryKey: ['my', 'oripas', page],
    queryFn: () => api.get('/my/oripas', { params: { page } }).then((r) => r.data),
  })
  const history = data?.history ?? []
  const totalPages = data ? Math.ceil(data.total / data.limit) : 0
  return (
    <div className="space-y-4">
      {isLoading ? <SkeletonList /> : history.length === 0 ? <EmptyState text="오리파 뽑기 내역이 없습니다." /> : (
        <div className="space-y-2">
          {history.map((p: {
            id: string; draws: number; totalPaid: number; createdAt: string;
            results: Array<{ card: { name: string; rarity: string }; grade: number }>;
            oripa: { title: string };
          }) => (
            <div key={p.id} className="bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] rounded-2xl p-4 space-y-3 transition-colors">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="font-semibold text-[#f5ead8]">{p.oripa.title}</p>
                  <p className="text-xs text-[#7a6040] mt-0.5">
                    {p.draws}회 뽑기 ·{' '}
                    <span className="text-[#f0a832] font-bold tabular-nums">{p.totalPaid.toLocaleString()} P</span>
                    {' '}· {format(new Date(p.createdAt), 'yy/MM/dd HH:mm', { locale: ko })}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {p.results.map((r, i) => (
                  <div
                    key={i}
                    className={`border rounded-lg px-2 py-1 text-xs ${
                      r.grade === 3
                        ? 'border-[#f0a832]/50 bg-[#f0a832]/10 text-[#f0a832]'
                        : r.grade === 2
                          ? 'border-[#d4a853]/40 bg-[#d4a853]/10 text-[#d4a853]'
                          : 'border-[#2e2318] text-[#8a7055]'
                    }`}
                  >
                    {r.card.name} <span className="opacity-60">{r.card.rarity}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <Pagination page={page} total={totalPages} onPageChange={setPage} />
    </div>
  )
}

// ─── 포인트 환전 탭 ───────────────────────────────────────────────────────────

const BANK_LIST = [
  '국민은행', '신한은행', '하나은행', '우리은행', 'IBK기업은행',
  '농협은행', '카카오뱅크', '토스뱅크', '케이뱅크', '씨티은행',
  'SC제일은행', '광주은행', '전북은행', '경남은행', '대구은행',
  '부산은행', '우체국', '새마을금고', '수협은행', '신협',
]

const WITHDRAWAL_STATUS_LABEL: Record<string, { label: string; color: string }> = {
  PENDING:   { label: '검토 중', color: 'bg-[#f0a832]/15 text-[#f0a832]' },
  APPROVED:  { label: '처리 중', color: 'bg-[#d4a853]/15 text-[#d4a853]' },
  COMPLETED: { label: '완료',    color: 'bg-emerald-500/15 text-emerald-400' },
  REJECTED:  { label: '거절',    color: 'bg-red-950/50 text-red-400' },
  CANCELLED: { label: '취소됨',  color: 'bg-[#2e2318] text-[#7a6040]' },
}

interface WithdrawalRecord {
  id: string
  amount: number
  bankName: string
  accountNumber: string
  accountHolder: string
  status: string
  adminNote: string | null
  processedAt: string | null
  createdAt: string
}

const SHOP_CAT: Record<string, string> = {
  BOOSTER_BOX: '부스터 박스', STARTER_DECK: '스타터 덱', SINGLE_PACK: '단품 팩',
  GIFT_SET: '기프트 세트', SPECIAL: '특별판', OTHER: '기타',
}

const SHIP_STATUS_MY: Record<string, { label: string; color: string }> = {
  PENDING:   { label: '배송 준비 중', color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20' },
  PREPARING: { label: '포장 중',      color: 'text-blue-400 bg-blue-400/10 border-blue-400/20' },
  SHIPPED:   { label: '배송 중',      color: 'text-indigo-400 bg-indigo-400/10 border-indigo-400/20' },
  DELIVERED: { label: '배송 완료',    color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' },
}

function ShopOrdersTab() {
  const [page, setPage] = useState(1)
  const { data, isLoading } = useQuery({
    queryKey: ['my', 'shop-orders', page],
    queryFn: () => api.get('/my/shop-orders', { params: { page } }).then(r => r.data),
  })
  const orders = data?.orders ?? []
  const totalPages = data ? Math.ceil(data.total / data.limit) : 0

  return (
    <div className="space-y-3">
      {isLoading ? <SkeletonList /> : orders.length === 0 ? <EmptyState text="샵 구매 내역이 없습니다." /> : (
        orders.map((order: {
          id: string; quantity: number; unitPrice: number; totalPrice: number; createdAt: string
          shippingStatus: string; trackingNumber: string | null; courier: string | null
          recipientName: string | null; address: string | null
          shopItem: { name: string; imageUrl: string | null; tcgType: string; category: string }
        }) => {
          const st = SHIP_STATUS_MY[order.shippingStatus] ?? { label: order.shippingStatus, color: '' }
          return (
            <div key={order.id} className="bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] rounded-2xl p-4 transition-colors">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-[#0e0c09] rounded-xl overflow-hidden shrink-0 border border-[#2e2318]">
                  {order.shopItem.imageUrl
                    ? <Image src={order.shopItem.imageUrl} alt={order.shopItem.name} width={40} height={40} className="object-contain w-full h-full" />
                    : <div className="flex items-center justify-center h-full text-[#5a4830]"><Store size={14} /></div>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-[#f5ead8] truncate">{order.shopItem.name}</p>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${st.color}`}>{st.label}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[#7a6040] mt-0.5 flex-wrap">
                    <span>{TCG_LABELS[order.shopItem.tcgType]}</span>
                    <span>{SHOP_CAT[order.shopItem.category]}</span>
                    <span>·</span><span>{order.quantity}개</span>
                    <span>·</span><span>{format(new Date(order.createdAt), 'yy.MM.dd', { locale: ko })}</span>
                  </div>
                </div>
                <p className="text-[#f0a832] font-bold tabular-nums text-sm shrink-0">{order.totalPrice.toLocaleString()}P</p>
              </div>
              {(order.courier || order.trackingNumber || order.address) && (
                <div className="mt-3 pt-3 border-t border-[#2e2318] text-xs text-[#7a6040] space-y-0.5">
                  {order.address && <p>배송지: {order.recipientName} · {order.address}</p>}
                  {order.courier && order.trackingNumber && (
                    <p className="text-[#d4a853]/80">{order.courier} · 운송장: {order.trackingNumber}</p>
                  )}
                </div>
              )}
            </div>
          )
        })
      )}
      <Pagination page={page} total={totalPages} onPageChange={setPage} />
    </div>
  )
}

function WithdrawalTab() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const [page, setPage] = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ amount: '', bankName: '', accountNumber: '', accountHolder: '' })
  const [formError, setFormError] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['my-withdrawal', page],
    queryFn: () => api.get(`/my/withdrawal?page=${page}&limit=10`).then(r => r.data as { list: WithdrawalRecord[]; total: number }),
  })

  const createMut = useMutation({
    mutationFn: (body: { amount: number; bankName: string; accountNumber: string; accountHolder: string }) =>
      api.post('/my/withdrawal', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-withdrawal'] })
      qc.invalidateQueries({ queryKey: ['me'] })
      setShowForm(false)
      setForm({ amount: '', bankName: '', accountNumber: '', accountHolder: '' })
      setFormError(null)
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      setFormError(e.response?.data?.message ?? '환전 신청에 실패했습니다.')
    },
  })

  const cancelMut = useMutation({
    mutationFn: (id: string) => api.patch(`/my/withdrawal/${id}/cancel`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-withdrawal'] })
      qc.invalidateQueries({ queryKey: ['me'] })
    },
  })

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    const amount = Number(form.amount)
    if (!amount || amount < 10000) { setFormError('최소 10,000P 이상 입력해주세요.'); return }
    if (!form.bankName) { setFormError('은행을 선택해주세요.'); return }
    if (!form.accountNumber.trim()) { setFormError('계좌번호를 입력해주세요.'); return }
    if (!form.accountHolder.trim()) { setFormError('예금주를 입력해주세요.'); return }
    createMut.mutate({ amount, bankName: form.bankName, accountNumber: form.accountNumber.trim(), accountHolder: form.accountHolder.trim() })
  }

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / 10))

  const inputCls = "w-full bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] focus:border-[#d4a853]/40 rounded-xl px-4 py-3 text-sm text-[#f5ead8] placeholder:text-[#5a4830] focus:outline-none transition-colors"

  return (
    <div className="space-y-4">
      {/* 잔액 + 신청 버튼 */}
      <div className="bg-[#1a1410] border border-[#2e2318] rounded-2xl p-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs text-[#7a6040] uppercase tracking-wider font-semibold mb-1">현재 잔액</p>
          <p className="text-2xl font-bold text-[#f0a832] tabular-nums">{(user?.balance ?? 0).toLocaleString()} P</p>
          <p className="text-xs text-[#5a4830] mt-1">최소 환전 금액: 10,000P · 1P = 1원</p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-2 bg-[#f0a832] hover:bg-[#e09820] text-[#0f0b08] font-semibold px-4 py-2.5 rounded-xl text-sm shadow-[0_0_20px_rgba(240,168,50,0.2)] transition-colors"
        >
          <Banknote size={15} />
          환전 신청
        </button>
      </div>

      {/* 신청 폼 */}
      {showForm && (
        <form onSubmit={submit} className="bg-[#1a1410] border border-[#f0a832]/30 rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-[#f0a832] flex items-center gap-2">
            <Banknote size={15} /> 환전 신청
          </h3>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <label className="text-xs text-[#7a6040] uppercase tracking-wider font-semibold">환전할 포인트</label>
              <input
                type="number"
                min={10000}
                step={1000}
                placeholder="10000"
                value={form.amount}
                onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
                className={inputCls}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-[#7a6040] uppercase tracking-wider font-semibold">은행</label>
              <select
                value={form.bankName}
                onChange={e => setForm(p => ({ ...p, bankName: e.target.value }))}
                className={inputCls}
              >
                <option value="">선택</option>
                {BANK_LIST.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-[#7a6040] uppercase tracking-wider font-semibold">예금주</label>
              <input
                type="text"
                placeholder="홍길동"
                value={form.accountHolder}
                onChange={e => setForm(p => ({ ...p, accountHolder: e.target.value }))}
                className={inputCls}
              />
            </div>

            <div className="col-span-2 space-y-1.5">
              <label className="text-xs text-[#7a6040] uppercase tracking-wider font-semibold">계좌번호 (- 없이 숫자만)</label>
              <input
                type="text"
                placeholder="01012345678"
                value={form.accountNumber}
                onChange={e => setForm(p => ({ ...p, accountNumber: e.target.value }))}
                className={inputCls}
              />
            </div>
          </div>

          {formError && (
            <div className="bg-red-950/50 border border-red-800/50 text-red-400 rounded-xl px-4 py-3 text-sm flex items-center gap-1.5">
              <AlertCircle size={14} /> {formError}
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-xl text-sm bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] text-[#9e8a6a] hover:text-[#e8d5b0] transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={createMut.isPending}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm bg-[#f0a832] hover:bg-[#e09820] text-[#0f0b08] font-semibold disabled:opacity-50 shadow-[0_0_20px_rgba(240,168,50,0.2)] transition-colors"
            >
              {createMut.isPending
                ? <span className="w-4 h-4 rounded-full border-2 border-[#0f0b08]/30 border-t-[#0f0b08] animate-spin" />
                : null
              }
              {createMut.isPending ? '신청 중...' : '신청하기'}
            </button>
          </div>

          <div className="text-xs text-[#5a4830] space-y-0.5 border-t border-[#2e2318] pt-3">
            <p>· 신청 금액은 즉시 잔액에서 차감됩니다.</p>
            <p>· 검토 후 1~3 영업일 내 송금 처리됩니다.</p>
            <p>· 대기 중 상태에서만 취소 가능합니다.</p>
          </div>
        </form>
      )}

      {/* 내역 */}
      {isLoading ? (
        <SkeletonList />
      ) : !data?.list.length ? (
        <EmptyState text="환전 신청 내역이 없습니다." />
      ) : (
        <div className="space-y-2">
          {data.list.map(wr => {
            const st = WITHDRAWAL_STATUS_LABEL[wr.status] ?? { label: wr.status, color: 'bg-[#2e2318] text-[#7a6040]' }
            return (
              <div key={wr.id} className="bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] rounded-2xl p-4 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[#f0a832] tabular-nums">{wr.amount.toLocaleString()} P</span>
                      <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${st.color}`}>{st.label}</span>
                    </div>
                    <p className="text-sm text-[#9e8a6a]">{wr.bankName} · {wr.accountHolder} · {wr.accountNumber}</p>
                    <p className="text-xs text-[#7a6040]">
                      신청일: {format(new Date(wr.createdAt), 'yyyy.MM.dd HH:mm', { locale: ko })}
                      {wr.processedAt && ` · 처리일: ${format(new Date(wr.processedAt), 'yyyy.MM.dd', { locale: ko })}`}
                    </p>
                    {wr.adminNote && (
                      <p className="text-xs text-red-400">사유: {wr.adminNote}</p>
                    )}
                  </div>
                  {wr.status === 'PENDING' && (
                    <button
                      onClick={() => cancelMut.mutate(wr.id)}
                      disabled={cancelMut.isPending}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs bg-red-950/60 border border-red-800/40 text-red-400 hover:bg-red-900/60 transition-colors disabled:opacity-40"
                    >
                      <X size={12} /> 취소
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {totalPages > 1 && (
        <Pagination page={page} total={totalPages} onPageChange={setPage} />
      )}
    </div>
  )
}

// 분쟁 내역 탭
const DISPUTE_STATUS: Record<string, { label: string; color: string }> = {
  OPEN:      { label: '접수',    color: 'bg-yellow-950/50 text-yellow-400'    },
  REVIEWING: { label: '검토 중', color: 'bg-blue-950/50 text-blue-400'        },
  RESOLVED:  { label: '해결',    color: 'bg-emerald-950/50 text-emerald-400'  },
  REJECTED:  { label: '기각',    color: 'bg-red-950/50 text-red-400'          },
  REFUNDED:  { label: '환불',    color: 'bg-purple-950/50 text-purple-400'    },
}

function DisputesTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['my', 'disputes'],
    queryFn: () => api.get('/disputes').then(r => r.data),
  })
  const disputes: {
    id: string
    status: string
    description: string
    createdAt: string
    transaction: { finalPrice: number; listing: { card: { nameKo: string | null; name: string } } }
    buyer:  { nickname: string }
    seller: { nickname: string }
  }[] = data?.disputes ?? []

  if (isLoading) return <SkeletonList />
  if (disputes.length === 0) return <EmptyState text="분쟁 내역이 없습니다." />

  return (
    <div className="space-y-3">
      {disputes.map(d => {
        const st = DISPUTE_STATUS[d.status] ?? { label: d.status, color: 'bg-[#2e2318] text-[#8a7055]' }
        const cardName = d.transaction.listing.card.nameKo ?? d.transaction.listing.card.name
        return (
          <div key={d.id} className="bg-[#1a1410] border border-[#2e2318] rounded-2xl p-4 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-sm text-[#f5ead8] truncate">{cardName}</p>
                <p className="text-xs text-[#5a4830] mt-0.5">
                  {format(new Date(d.createdAt), 'yy.MM.dd', { locale: ko })} ·
                  구매자 {d.buyer.nickname} / 판매자 {d.seller.nickname}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${st.color}`}>{st.label}</span>
                <span className="text-[#f0a832] font-bold text-sm tabular-nums">
                  {d.transaction.finalPrice.toLocaleString()} P
                </span>
              </div>
            </div>
            <p className="text-xs text-[#7a6040] line-clamp-2 bg-[#120e0a] border border-[#2e2318] rounded-xl px-3 py-2">
              {d.description}
            </p>
          </div>
        )
      })}
    </div>
  )
}

// ─── 메인 페이지 ──────────────────────────────────────────────────────────

export default function MyPage() {
  const { user } = useAuthStore()
  const router = useRouter()
  const [tab, setTab] = useState<TabId>('profile')

  if (!user) {
    router.replace('/login')
    return null
  }

  const content: Record<TabId, React.ReactNode> = {
    profile:       <ProfileTab />,
    inventory:     <InventoryTab />,
    shipping:      <ShippingTab />,
    listings:      <ListingsTab />,
    purchases:     <PurchasesTab />,
    sales:         <SalesTab />,
    'offers-in':   <OffersInTab />,
    'offers-out':  <OffersOutTab />,
    bids:          <BidsTab />,
    oripas:        <OripasTab />,
    'shop-orders': <ShopOrdersTab />,
    withdrawal:    <WithdrawalTab />,
    disputes:      <DisputesTab />,
  }

  return (
    <div className="min-h-screen bg-[#0f0b08]">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* 페이지 제목 */}
        <h1 className="text-2xl font-bold text-white tracking-tight mb-6">마이페이지</h1>

        <div className="flex gap-6 items-start">
          {/* ── 사이드바 탭 (desktop) ── */}
          <aside className="hidden md:flex flex-col w-44 shrink-0 bg-[#1a1410] border border-[#2e2318] rounded-2xl p-2 sticky top-24">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left w-full ${
                  tab === t.id
                    ? 'bg-[#2a1c0c] text-white border border-[#d4a853]/20'
                    : 'text-[#7a6040] hover:text-[#9e8a6a] hover:bg-[#2a1c0c]/50'
                }`}
              >
                <span className={tab === t.id ? 'text-[#d4a853]' : 'text-[#5a4830]'}>
                  {t.icon}
                </span>
                {t.label}
              </button>
            ))}
          </aside>

          {/* ── 메인 컨텐츠 ── */}
          <div className="flex-1 min-w-0">
            {/* 모바일 탭 (상단 가로 스크롤) */}
            <div className="md:hidden mb-4 -mx-4 px-4">
              <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-hide">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-colors shrink-0 ${
                      tab === t.id
                        ? 'bg-[#2a1c0c] text-white border border-[#d4a853]/30'
                        : 'bg-[#1a1410] border border-[#2e2318] text-[#7a6040] hover:text-[#9e8a6a]'
                    }`}
                  >
                    <span className={tab === t.id ? 'text-[#d4a853]' : 'text-[#5a4830]'}>
                      {t.icon}
                    </span>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 탭 컨텐츠 */}
            <div>{content[tab]}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

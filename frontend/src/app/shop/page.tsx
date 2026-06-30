'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import Image from 'next/image'
import Link from 'next/link'
import { TCG_LABELS } from '@/lib/utils'
import { ShoppingCart, Package, ChevronLeft, ChevronRight, Minus, Plus, X, Store, AlertCircle, CheckCircle, EyeOff, Eye } from 'lucide-react'
import Badge from '@/components/ui/Badge'
import { Suspense } from 'react'

// ─── 공용 상수 ──────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  BOOSTER_BOX: '부스터 박스',
  STARTER_DECK: '스타터 덱',
  SINGLE_PACK: '단품 팩',
  GIFT_SET: '기프트 세트',
  SPECIAL: '특별판',
  OTHER: '기타',
}

const CATEGORY_COLOR: Record<string, string> = {
  BOOSTER_BOX: 'bg-[#d4a853]/20 text-[#8ba8ff]',
  STARTER_DECK: 'bg-emerald-500/20 text-emerald-300',
  SINGLE_PACK:  'bg-yellow-500/20 text-yellow-300',
  GIFT_SET:     'bg-pink-500/20 text-pink-300',
  SPECIAL:      'bg-purple-500/20 text-purple-300',
  OTHER:        'bg-[#2e2318] text-[#8a7055]',
}

interface ShopItem {
  id: string; name: string; description: string | null
  tcgType: string; category: string; price: number; stock: number
  imageUrl: string | null; isActive: boolean; isSoldOut: boolean
}

// ─── TCG 박스 탭 ─────────────────────────────────────────────────────────────

function Pagination({ page, total, onChange }: { page: number; total: number; onChange: (p: number) => void }) {
  if (total <= 1) return null
  return (
    <div className="flex items-center justify-center gap-2 mt-6">
      <button onClick={() => onChange(page - 1)} disabled={page <= 1}
        className="p-2 rounded-xl bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] text-[#9e8a6a] hover:text-[#e8d5b0] disabled:opacity-30 transition-colors">
        <ChevronLeft size={16} />
      </button>
      <span className="text-sm text-[#8a7055]">{page} / {total}</span>
      <button onClick={() => onChange(page + 1)} disabled={page >= total}
        className="p-2 rounded-xl bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] text-[#9e8a6a] hover:text-[#e8d5b0] disabled:opacity-30 transition-colors">
        <ChevronRight size={16} />
      </button>
    </div>
  )
}

const EMPTY_ADDR = { recipientName: '', recipientPhone: '', zipCode: '', address: '', addressDetail: '', shippingMemo: '' }

function BuyModal({ item, onClose }: { item: ShopItem; onClose: () => void }) {
  const { user } = useAuthStore()
  const router = useRouter()
  const qc = useQueryClient()
  const [step, setStep] = useState<'qty' | 'addr' | 'done'>('qty')
  const [qty, setQty] = useState(1)
  const [addr, setAddr] = useState(EMPTY_ADDR)
  const [errMsg, setErrMsg] = useState('')

  const mut = useMutation({
    mutationFn: () => api.post(`/shop/${item.id}/buy`, { quantity: qty, ...addr }),
    onSuccess: () => {
      setStep('done')
      qc.invalidateQueries({ queryKey: ['shop'] })
      qc.invalidateQueries({ queryKey: ['me'] })
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      setErrMsg(e.response?.data?.message ?? '구매 실패'),
  })

  const total = item.price * qty

  const addrValid = addr.recipientName && addr.recipientPhone && addr.zipCode && addr.address

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/70" onClick={onClose}>
      <div className="bg-[#1a1410] border border-[#2e2318] rounded-2xl p-6 w-full max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0 pr-3">
            <h3 className="font-bold text-base leading-tight mb-1 text-[#f5ead8]">{item.name}</h3>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-[#8a7055]">{TCG_LABELS[item.tcgType]}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLOR[item.category]}`}>{CATEGORY_LABELS[item.category]}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-[#5a4830] hover:text-[#f5ead8] shrink-0 transition-colors"><X size={18} /></button>
        </div>

        {/* 스텝 인디케이터 */}
        {step !== 'done' && (
          <div className="flex items-center gap-2 text-xs text-[#5a4830]">
            <span className={step === 'qty' ? 'text-[#d4a853] font-semibold' : 'text-[#5a4830]'}>① 수량 선택</span>
            <span>›</span>
            <span className={step === 'addr' ? 'text-[#d4a853] font-semibold' : 'text-[#5a4830]'}>② 배송지 입력</span>
            <span>›</span>
            <span>③ 구매 완료</span>
          </div>
        )}

        {/* 완료 */}
        {step === 'done' && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-xl px-4 py-3 text-sm bg-emerald-950/50 border border-emerald-800/50 text-emerald-400">
              <CheckCircle size={16} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">구매가 완료됐습니다!</p>
                <p className="text-xs mt-0.5 text-emerald-500/80">{total.toLocaleString()}P 결제 · 마이페이지에서 배송 현황을 확인하세요.</p>
              </div>
            </div>
            <button onClick={onClose} className="w-full bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] text-[#9e8a6a] hover:text-[#e8d5b0] py-2.5 rounded-xl text-sm transition-colors">닫기</button>
          </div>
        )}

        {/* 1단계 - 수량 */}
        {step === 'qty' && (
          <>
            <div className="bg-[#1a1208] border border-[#2e2318] rounded-xl p-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-[#8a7055]">단가</span>
                <span className="font-semibold text-[#f5ead8]">{item.price.toLocaleString()}P</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-[#8a7055]">수량</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setQty(q => Math.max(1, q - 1))}
                    className="w-7 h-7 rounded-lg bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] text-[#9e8a6a] hover:text-[#e8d5b0] flex items-center justify-center transition-colors">
                    <Minus size={12} />
                  </button>
                  <span className="w-8 text-center font-semibold text-[#f5ead8]">{qty}</span>
                  <button onClick={() => setQty(q => Math.min(10, item.stock, q + 1))}
                    className="w-7 h-7 rounded-lg bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] text-[#9e8a6a] hover:text-[#e8d5b0] flex items-center justify-center transition-colors">
                    <Plus size={12} />
                  </button>
                </div>
              </div>
              <div className="border-t border-[#2e2318] pt-3 flex justify-between">
                <span className="font-medium text-[#f5ead8]">합계</span>
                <span className="text-lg text-[#f0a832] font-bold tabular-nums">{total.toLocaleString()}P</span>
              </div>
              {user && (
                <p className={`text-xs text-right ${user.balance < total ? 'text-red-400' : 'text-[#5a4830]'}`}>
                  보유: {user.balance.toLocaleString()}P{user.balance < total && ' · 포인트 부족'}
                </p>
              )}
            </div>
            <button
              onClick={() => { if (!user) { router.push('/login'); return } if (user.balance >= total) setStep('addr') }}
              disabled={!!user && user.balance < total}
              className="w-full bg-[#d4a853] hover:bg-[#c49440] disabled:opacity-50 text-white py-3 rounded-xl font-semibold transition-colors shadow-[0_0_20px_rgba(212,168,83,0.25)]">
              {user ? '다음 — 배송지 입력' : '로그인 후 구매'}
            </button>
          </>
        )}

        {/* 2단계 - 배송지 */}
        {step === 'addr' && (
          <>
            <div className="space-y-2.5">
              {[
                { key: 'recipientName',  label: '수령인',   placeholder: '받으실 분 이름', type: 'text' },
                { key: 'recipientPhone', label: '연락처',   placeholder: '010-0000-0000',  type: 'tel'  },
                { key: 'zipCode',        label: '우편번호', placeholder: '12345',           type: 'text' },
                { key: 'address',        label: '주소',     placeholder: '기본 주소',       type: 'text' },
                { key: 'addressDetail',  label: '상세주소', placeholder: '상세 주소 (선택)', type: 'text' },
                { key: 'shippingMemo',   label: '배송 메모', placeholder: '예: 문 앞에 놔주세요 (선택)', type: 'text' },
              ].map(({ key, label, placeholder, type }) => (
                <div key={key}>
                  <label className="block text-xs text-[#7a6040] mb-1">{label}</label>
                  <input
                    type={type}
                    value={addr[key as keyof typeof addr]}
                    onChange={e => setAddr(p => ({ ...p, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full bg-[#1a1208] border border-[#2e2318] focus:border-[#d4a853]/60 rounded-lg px-3 py-2 text-sm text-[#f5ead8] placeholder:text-[#4a3820] outline-none transition-colors"
                  />
                </div>
              ))}
            </div>
            {errMsg && (
              <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm bg-red-950/50 border border-red-800/50 text-red-400">
                <AlertCircle size={14} className="shrink-0" />{errMsg}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => { setErrMsg(''); setStep('qty') }}
                className="flex-1 bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] text-[#9e8a6a] hover:text-[#e8d5b0] py-2.5 rounded-xl text-sm transition-colors">
                이전
              </button>
              <button
                onClick={() => { setErrMsg(''); mut.mutate() }}
                disabled={mut.isPending || !addrValid}
                className="flex-[2] bg-[#d4a853] hover:bg-[#c49440] disabled:opacity-50 text-white py-2.5 rounded-xl font-semibold text-sm transition-colors shadow-[0_0_20px_rgba(212,168,83,0.25)]">
                {mut.isPending ? '처리 중...' : `${total.toLocaleString()}P 결제 · 구매 완료`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function BoxesTab() {
  const [tcgType, setTcgType] = useState('')
  const [category, setCategory] = useState('')
  const [page, setPage] = useState(1)
  const [hideSoldOut, setHideSoldOut] = useState(false)
  const [buying, setBuying] = useState<ShopItem | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['shop', tcgType, category, page, hideSoldOut],
    queryFn: () => api.get('/shop', { params: { tcgType: tcgType || undefined, category: category || undefined, page, hideSoldOut: hideSoldOut || undefined } }).then(r => r.data),
    staleTime: 60000,
  })
  const items: ShopItem[] = data?.items ?? []
  const totalPages = data ? Math.ceil(data.total / data.limit) : 0

  return (
    <div className="space-y-5">
      {/* 필터 */}
      <div className="bg-[#1a1410] border border-[#2e2318] rounded-xl p-4 space-y-3">
        <div className="space-y-1.5">
          <p className="text-xs text-[#7a6040] uppercase tracking-wider font-semibold">TCG 종류</p>
          <div className="flex flex-wrap gap-1.5">
            {['', ...Object.keys(TCG_LABELS)].map(key => (
              <button key={key} onClick={() => { setTcgType(key); setPage(1) }}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  tcgType === key
                    ? 'bg-[#d4a853] text-white shadow-[0_0_12px_rgba(212,168,83,0.3)]'
                    : 'bg-[#1a1208] border border-[#2e2318] text-[#8a7055] hover:text-[#e8d5b0] hover:border-[#4a3520]'
                }`}>
                {key ? TCG_LABELS[key] : '전체'}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs text-[#7a6040] uppercase tracking-wider font-semibold">카테고리</p>
          <div className="flex flex-wrap gap-1.5">
            {['', ...Object.keys(CATEGORY_LABELS)].map(key => (
              <button key={key} onClick={() => { setCategory(key); setPage(1) }}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  category === key
                    ? 'bg-[#d4a853] text-white shadow-[0_0_12px_rgba(212,168,83,0.3)]'
                    : 'bg-[#1a1208] border border-[#2e2318] text-[#8a7055] hover:text-[#e8d5b0] hover:border-[#4a3520]'
                }`}>
                {key ? CATEGORY_LABELS[key] : '전체'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end pt-1 border-t border-[#2e2318]">
          <button onClick={() => { setHideSoldOut(v => !v); setPage(1) }}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              hideSoldOut
                ? 'bg-[#d4a853]/15 border border-[#d4a853]/40 text-[#e0b878]'
                : 'bg-[#1a1208] border border-[#2e2318] text-[#7a6040] hover:text-[#8a7055] hover:border-[#4a3520]'
            }`}>
            {hideSoldOut ? <EyeOff size={11} /> : <Eye size={11} />}
            품절 {hideSoldOut ? '숨김' : '표시'}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-[#1a1410] border border-[#2e2318] rounded-2xl overflow-hidden animate-pulse">
              <div className="aspect-square bg-[#1a1208]" />
              <div className="p-3 space-y-2">
                <div className="h-3 bg-[#1a1208] rounded w-3/4" />
                <div className="h-3 bg-[#1a1208] rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-20 text-[#5a4830]">
          <Package size={40} className="mx-auto mb-3 opacity-30" />
          <p>등록된 상품이 없습니다.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {items.map(item => (
            <div key={item.id} className="bg-[#1a1410] border border-[#2e2318] rounded-2xl overflow-hidden hover:border-[#d4a853]/40 transition-colors group card-hover">
              {(() => {
                const soldOut = item.isSoldOut || item.stock === 0
                const lowStock = !soldOut && item.stock <= 5
                return (
                  <div className="aspect-square bg-[#0e0c09] relative overflow-hidden">
                    {item.imageUrl
                      ? <Image src={item.imageUrl} alt={item.name} fill sizes="(max-width:640px) 50vw,(max-width:1024px) 33vw,25vw" className={`object-contain transition-transform duration-300 ${soldOut ? 'grayscale opacity-60' : 'group-hover:scale-105'}`} />
                      : <div className="flex items-center justify-center h-full text-[#5a4830]"><Package size={40} /></div>}
                    {soldOut && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <span className="text-sm font-bold text-white bg-[#1a1410]/80 px-3 py-1 rounded-full border border-[#4a3520] backdrop-blur-sm">품절</span>
                      </div>
                    )}
                    {lowStock && (
                      <div className="absolute top-2 right-2 bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg">
                        잔여 {item.stock}개
                      </div>
                    )}
                  </div>
                )
              })()}
              <div className="p-3 space-y-2">
                <div className="flex gap-1 flex-wrap">
                  <Badge>{TCG_LABELS[item.tcgType] ?? item.tcgType}</Badge>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${CATEGORY_COLOR[item.category]}`}>
                    {CATEGORY_LABELS[item.category]}
                  </span>
                </div>
                <p className="text-sm font-semibold leading-tight line-clamp-2 text-[#f5ead8]">{item.name}</p>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[#f0a832] font-bold tabular-nums">{item.price.toLocaleString()}P</span>
                  {(() => {
                    const soldOut = item.isSoldOut || item.stock === 0
                    return (
                      <button onClick={() => setBuying(item)} disabled={soldOut}
                        className="flex items-center gap-1 bg-[#d4a853] hover:bg-[#c49440] disabled:bg-[#1a1208] disabled:border disabled:border-[#2e2318] disabled:text-[#5a4830] text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors shadow-[0_0_12px_rgba(212,168,83,0.2)]">
                        <ShoppingCart size={11} />{soldOut ? '품절' : '구매'}
                      </button>
                    )
                  })()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Pagination page={page} total={totalPages} onChange={setPage} />
      {buying && <BuyModal item={buying} onClose={() => setBuying(null)} />}
    </div>
  )
}

// ─── 오리파 탭 ───────────────────────────────────────────────────────────────

interface OripaCardItem {
  id: string
  grade: number
  card: { imageUrl?: string; name: string }
}

interface Oripa {
  id: string; title: string; description?: string; imageUrl?: string
  pricePerDraw: number; totalSlots: number; remainSlots: number
  items: OripaCardItem[]; _count: { purchases: number }
}

function CardCollage({ items }: { items: OripaCardItem[] }) {
  const picks = [...items].sort((a, b) => b.grade - a.grade).filter(i => i.card.imageUrl).slice(0, 4)
  if (picks.length === 0) return <div className="absolute inset-0 flex items-center justify-center"><Package size={48} className="text-pink-400/40" /></div>
  if (picks.length === 1) return <Image src={picks[0].card.imageUrl!} alt={picks[0].card.name} fill sizes="(max-width:640px) 100vw,50vw" className="object-cover opacity-80" />
  return (
    <div className="absolute inset-0 grid grid-cols-2 gap-0.5">
      {picks.map((item, i) => (
        <div key={item.id} className={`relative overflow-hidden ${picks.length === 3 && i === 0 ? 'row-span-2' : ''}`}>
          <Image src={item.card.imageUrl!} alt={item.card.name} fill sizes="25vw" className="object-cover" />
        </div>
      ))}
    </div>
  )
}

function OripasTab() {
  const { data: oripas, isLoading } = useQuery({
    queryKey: ['oripas'],
    queryFn: () => api.get('/oripas').then(r => r.data),
    staleTime: 60000,
  })

  return (
    <div className="space-y-4">
      <p className="text-sm text-[#8a7055]">랜덤 뽑기로 레어 TCG 카드를 획득하세요</p>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="bg-[#1a1410] border border-[#2e2318] rounded-2xl h-56 animate-pulse" />)}
        </div>
      ) : !oripas?.length ? (
        <div className="text-center py-24 text-[#5a4830]">
          <p className="text-4xl mb-4">📦</p>
          <p>진행 중인 오리파가 없습니다.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(oripas as Oripa[]).map(oripa => {
            const soldPct = ((oripa.totalSlots - oripa.remainSlots) / oripa.totalSlots) * 100
            const almostGone = oripa.remainSlots > 0 && oripa.remainSlots <= 5
            return (
              <Link key={oripa.id} href={`/oripas/${oripa.id}`} className="group">
                <div className="bg-[#1a1410] border border-[#2e2318] rounded-2xl overflow-hidden hover:border-pink-500/50 transition-all duration-200 hover:shadow-lg hover:shadow-pink-500/10 card-hover">
                  <div className="relative h-44 bg-[#1a1208] overflow-hidden">
                    {oripa.imageUrl
                      ? <Image src={oripa.imageUrl} alt={oripa.title} fill className="object-cover group-hover:scale-105 transition-transform duration-300" />
                      : <div className="absolute inset-0 group-hover:scale-105 transition-transform duration-300"><CardCollage items={oripa.items} /></div>}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#1a1410]/80 via-transparent to-transparent" />
                    <div className="absolute top-2 right-2">
                      {almostGone
                        ? <Badge variant="red">라스트 {oripa.remainSlots}장!</Badge>
                        : oripa.remainSlots === 0
                          ? <Badge variant="default">매진</Badge>
                          : <Badge variant="red">{oripa.remainSlots}/{oripa.totalSlots} 남음</Badge>}
                    </div>
                    <div className="absolute bottom-2 left-3">
                      <span className="text-[#f0a832] font-bold tabular-nums text-lg drop-shadow">{oripa.pricePerDraw.toLocaleString()}P</span>
                      <span className="text-[#8a7055] text-xs ml-1">/ 1회</span>
                    </div>
                  </div>
                  <div className="p-4 space-y-2">
                    <h3 className="font-semibold line-clamp-1 text-[#f5ead8]">{oripa.title}</h3>
                    {oripa.description && <p className="text-xs text-[#8a7055] line-clamp-2">{oripa.description}</p>}
                    <div className="flex items-center justify-between text-xs text-[#5a4830]">
                      <span>{oripa._count.purchases}명 참여</span>
                      <span>{Math.round(soldPct)}% 소진</span>
                    </div>
                    <div className="w-full bg-[#2e2318] rounded-full h-1.5">
                      <div className={`h-1.5 rounded-full transition-all ${almostGone ? 'bg-red-500' : 'bg-gradient-to-r from-pink-500 to-purple-500'}`} style={{ width: `${soldPct}%` }} />
                    </div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── 메인 샵 페이지 ──────────────────────────────────────────────────────────

type ShopTab = 'boxes' | 'oripa'

function ShopContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const initialTab = (searchParams.get('tab') as ShopTab) ?? 'boxes'
  const [tab, setTab] = useState<ShopTab>(initialTab)

  function switchTab(t: ShopTab) {
    setTab(t)
    router.replace(t === 'boxes' ? '/shop' : '/shop?tab=oripa', { scroll: false })
  }

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <Store size={22} className="text-[#d4a853]" />
        <div>
          <h1 className="text-2xl font-bold text-[#f5ead8]">샵</h1>
          <p className="text-sm text-[#8a7055]">포인트로 TCG 상품을 구매하세요</p>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex bg-[#1a1410] border border-[#2e2318] rounded-xl p-1 w-fit">
        <button onClick={() => switchTab('boxes')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'boxes'
              ? 'bg-[#d4a853] text-white shadow-[0_0_16px_rgba(212,168,83,0.3)]'
              : 'text-[#8a7055] hover:text-[#e8d5b0]'
          }`}>
          <Package size={14} /> TCG 박스
        </button>
        <button onClick={() => switchTab('oripa')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'oripa'
              ? 'bg-gradient-to-r from-pink-600 to-purple-600 text-white shadow-[0_0_16px_rgba(219,39,119,0.25)]'
              : 'text-[#8a7055] hover:text-[#e8d5b0]'
          }`}>
          🎲 오리파 뽑기
        </button>
      </div>

      {/* 탭 콘텐츠 */}
      {tab === 'boxes' ? <BoxesTab /> : <OripasTab />}
    </div>
  )
}

export default function ShopPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-10">
        <div className="w-6 h-6 rounded-full border-2 border-[#2e2318] border-t-[#d4a853] animate-spin" />
      </div>
    }>
      <ShopContent />
    </Suspense>
  )
}

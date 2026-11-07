'use client'

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Search, X, Tag, Gavel, Handshake, Camera, Check, Loader2, AlertCircle, Truck, Sparkles, ShieldCheck, ChevronDown, PartyPopper, Plus, Store } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { TCG_LABELS, CONDITION_LABELS, rarityLabel, resolveImageSrc } from '@/lib/utils'
import { PhotoPicker } from '@/components/market/PhotoPicker'
import { MarketItemCard } from '@/components/market/MarketItemCard'
import { PriceReferencePanel } from '@/components/sell/PriceReference'
import type { MarketListing } from '@/lib/market'

export interface SellCard { id: string; name: string; nameKo?: string | null; imageUrl?: string | null; setName: string; rarity: string; tcgType: string; cardNumber?: string | null }
type Mode = 'BUY_NOW' | 'OFFER' | 'AUCTION'

const MODES: Array<{ id: Mode; label: string; icon: React.ElementType; desc: string }> = [
  { id: 'BUY_NOW', label: '판매가 정하기', icon: Tag, desc: '정한 가격에 바로 안전결제' },
  { id: 'OFFER', label: '가격 제안 받기', icon: Handshake, desc: '최소 금액만 정하고 제안을 받아요' },
  { id: 'AUCTION', label: '경매', icon: Gavel, desc: '시작가부터 입찰, 기간 끝나면 낙찰' },
]
const CONDITION_HINT: Record<string, string> = {
  MINT: '새것 그대로, 흠집 없음', NEAR_MINT: '거의 새것, 미세한 흔적', EXCELLENT: '가벼운 사용감', GOOD: '사용감 있음, 모서리 약간 마모',
  LIGHT_PLAYED: '눈에 띄는 마모', PLAYED: '뚜렷한 흠집·마모', POOR: '찍힘·꺾임 등 손상',
}
const CONDITIONS = ['MINT', 'NEAR_MINT', 'EXCELLENT', 'GOOD', 'LIGHT_PLAYED', 'PLAYED', 'POOR']
const GRADERS = ['PSA', 'BGS', 'CGC', 'SGC', 'HGA', 'ACE', '기타']
const PHRASES = ['슬리브+탑로더 보관', '개봉 직후 바로 보관', '흠집·찍힘 없어요', '뒷면에 작은 흰점 있어요', '반려동물·흡연 없는 환경', '결제 후 당일·익일 발송']
const DAYS = [1, 3, 5, 7]
const DRAFT_KEY = 'sell-draft-v1'

const EMPTY = {
  card: null as SellCard | null, photos: [] as string[], mode: 'BUY_NOW' as Mode, price: '', negotiable: false,
  days: 3, instantBuy: '', autoExtend: true, condition: 'NEAR_MINT', graded: false, grader: 'PSA', grade: '',
  quantity: 1, title: '', description: '', shipIncluded: true, shippingFee: '3500',
}
type Draft = typeof EMPTY

const num = (s: string) => Number(s.replace(/[^\d]/g, '')) || 0
const comma = (s: string) => { const n = num(s); return n ? n.toLocaleString() : '' }

// 작성 중인 글 (브라우저에만 저장)
const subscribe = (cb: () => void) => { window.addEventListener('storage', cb); return () => window.removeEventListener('storage', cb) }
const readDraft = () => { try { return localStorage.getItem(DRAFT_KEY) } catch { return null } }

function Section({ n, title, hint, children, done }: { n: number; title: string; hint?: string; children: React.ReactNode; done?: boolean }) {
  return (
    <section className="rounded-3xl border border-line bg-surface p-5 sm:p-6 space-y-4">
      <div className="flex items-center gap-2.5">
        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${done ? 'bg-emerald-500 text-white' : 'bg-accent-tint text-accent-soft'}`}>{done ? <Check size={14} /> : n}</span>
        <h2 className="font-bold text-fg">{title}</h2>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </div>
      {children}
    </section>
  )
}

export function QuickSellForm({ initialCard }: { initialCard?: SellCard | null }) {
  const user = useAuthStore(s => s.user)
  const [f, setF] = useState<Draft>(() => ({ ...EMPTY, card: initialCard ?? null }))
  const [q, setQ] = useState('')
  const [draftDismissed, setDraftDismissed] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [done, setDone] = useState<{ id: string } | null>(null)
  const [error, setError] = useState('')
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setF(p => ({ ...p, [k]: v }))
  const searchRef = useRef<HTMLInputElement>(null)

  // 작성 중 자동 저장 (사진·카드 포함) — 새로 고쳐도 이어 쓰기
  const savedRaw = useSyncExternalStore(subscribe, readDraft, () => null)
  const touched = f.card || f.photos.length || f.price || f.description || f.title
  useEffect(() => {
    if (done || !touched) return
    const t = setTimeout(() => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(f)) } catch { /* 저장 불가 무시 */ } }, 400)
    return () => clearTimeout(t)
  }, [f, done, touched])
  const restorable = !draftDismissed && !touched && !!savedRaw

  const { data: search } = useQuery<{ cards: SellCard[] }>({
    queryKey: ['sell-card-search', q], queryFn: () => api.get('/cards', { params: { q, limit: 8 } }).then(r => r.data), enabled: q.trim().length >= 1,
  })
  const { data: mine } = useQuery<{ listings: Array<{ card: SellCard }> }>({
    queryKey: ['my', 'listings', 'recent-cards'], queryFn: () => api.get('/my/listings', { params: { limit: 20 } }).then(r => r.data), enabled: !!user,
  })
  const recentCards = useMemo(() => {
    const seen = new Set<string>()
    return (mine?.listings ?? []).map(l => l.card).filter(c => c && !seen.has(c.id) && seen.add(c.id)).slice(0, 6)
  }, [mine])

  // 필수 확인
  const price = num(f.price)
  const missing = [
    !f.card && '카드를 골라주세요',
    !price && (f.mode === 'AUCTION' ? '시작가를 입력해주세요' : f.mode === 'OFFER' ? '최소 제안가를 입력해주세요' : '판매가를 입력해주세요'),
    f.mode === 'AUCTION' && num(f.instantBuy) > 0 && num(f.instantBuy) <= price && '즉시낙찰가는 시작가보다 높아야 해요',
    f.graded && !f.grade.trim() && '그레이딩 등급을 입력해주세요',
  ].filter(Boolean) as string[]

  const submit = useMutation({
    mutationFn: () => api.post<{ id: string }>('/listings', {
      cardId: f.card!.id, listingType: f.mode, condition: f.condition, quantity: f.quantity,
      title: f.title.trim() || undefined, description: f.description.trim() || undefined,
      imageUrls: f.photos.length ? f.photos : undefined,
      gradingCompany: f.graded ? f.grader : undefined, gradingGrade: f.graded ? f.grade.trim() : undefined,
      shippingFee: f.shipIncluded ? 0 : num(f.shippingFee),
      ...(f.mode === 'BUY_NOW' ? { buyNowPrice: price, negotiable: f.negotiable } : {}),
      ...(f.mode === 'OFFER' ? { minOfferPrice: price } : {}),
      ...(f.mode === 'AUCTION' ? {
        startingPrice: price, auctionEndsAt: new Date(Date.now() + f.days * 86400_000).toISOString(),
        instantBuyPrice: num(f.instantBuy) || undefined, autoExtendMinutes: f.autoExtend ? 5 : undefined,
      } : {}),
    }).then(r => r.data),
    onSuccess: d => { setDone({ id: d.id }); try { localStorage.removeItem(DRAFT_KEY) } catch { /* 무시 */ } window.scrollTo({ top: 0 }) },
    onError: (e: unknown) => setError((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? '등록에 실패했어요. 잠시 후 다시 시도해주세요.'),
  })

  const preview: MarketListing = {
    id: 'preview', listingType: f.mode, status: 'ACTIVE', condition: f.condition, title: f.title.trim() || null,
    buyNowPrice: f.mode === 'BUY_NOW' ? price : null, minOfferPrice: f.mode === 'OFFER' ? price : null,
    startingPrice: f.mode === 'AUCTION' ? price : null, currentPrice: f.mode === 'AUCTION' ? price : null,
    shippingFee: f.shipIncluded ? 0 : num(f.shippingFee), negotiable: f.negotiable, imageUrls: f.photos, likeCount: 0,
    createdAt: new Date(0).toISOString(), bumpedAt: undefined, gradingCompany: f.graded ? f.grader : null, gradingGrade: f.grade || null,
    card: f.card ? { name: f.card.name, nameKo: f.card.nameKo, imageUrl: f.card.imageUrl } : { name: '카드를 골라주세요' },
  }

  // ── 등록 완료 화면 ──
  if (done) return (
    <div className="max-w-lg mx-auto text-center space-y-5 py-10">
      <PartyPopper size={44} className="mx-auto text-amber-300" />
      <div>
        <h1 className="text-2xl font-black text-fg">판매 등록 완료!</h1>
        <p className="text-sm text-muted mt-1">구매자의 채팅·가격 제안은 알림으로 알려드릴게요.</p>
      </div>
      <div className="w-48 mx-auto pointer-events-none"><MarketItemCard listing={{ ...preview, id: done.id }} showLike={false} timeText="방금 전" /></div>
      <div className="grid grid-cols-3 gap-2">
        <Link href={`/listings/${done.id}`} className="h-11 rounded-xl bg-accent text-white text-sm font-bold inline-flex items-center justify-center">상품 보기</Link>
        <button onClick={() => { setF({ ...EMPTY }); setDone(null); setDraftDismissed(true) }} className="h-11 rounded-xl border border-line text-sm font-semibold text-fg-2 inline-flex items-center justify-center gap-1"><Plus size={15} />하나 더</button>
        <Link href={user ? `/users/${user.id}` : '/listings'} className="h-11 rounded-xl border border-line text-sm font-semibold text-fg-2 inline-flex items-center justify-center gap-1"><Store size={15} />내 상점</Link>
      </div>
      <p className="text-xs text-subtle">💡 하루에 한 번 ‘끌올’로 목록 맨 위에 올릴 수 있어요.</p>
    </div>
  )

  const field = 'w-full h-12 bg-sunken border border-line focus:border-accent/60 rounded-2xl px-4 text-[15px] text-fg placeholder:text-subtle focus:outline-none'
  const chip = (on: boolean) => `px-3.5 h-10 rounded-full text-sm font-medium border transition-colors ${on ? 'bg-accent-tint border-accent-line text-accent-soft' : 'border-line text-muted hover:text-fg hover:border-line-strong'}`

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start pb-28 lg:pb-0">
      <div className="space-y-4 min-w-0">
        {restorable && (
          <div className="rounded-2xl border border-accent-line bg-accent-tint/40 px-4 py-3 flex flex-wrap items-center gap-2 text-sm">
            <Sparkles size={15} className="text-accent-fg" /><span className="text-fg-2">작성 중이던 판매글이 있어요.</span>
            <button onClick={() => { try { setF({ ...EMPTY, ...JSON.parse(savedRaw!) }) } catch { /* 무시 */ } }} className="ml-auto h-8 px-3 rounded-lg bg-accent text-xs font-semibold text-white">이어서 쓰기</button>
            <button onClick={() => { setDraftDismissed(true); try { localStorage.removeItem(DRAFT_KEY) } catch { /* 무시 */ } }} className="h-8 px-3 rounded-lg border border-line text-xs text-muted">새로 쓰기</button>
          </div>
        )}

        {/* 1. 사진 */}
        <Section n={1} title="사진" hint="첫 장이 대표 사진 · 최대 10장" done={f.photos.length > 0}>
          <PhotoPicker value={f.photos} onChange={v => set('photos', v)} />
          <p className="text-xs text-subtle flex items-center gap-1.5"><Camera size={13} />앞면·뒷면·모서리를 밝은 곳에서 찍으면 더 빨리 팔려요. 사진이 없으면 공식 카드 이미지가 보여요.</p>
        </Section>

        {/* 2. 카드 */}
        <Section n={2} title="어떤 카드인가요?" done={!!f.card}>
          {f.card ? (
            <div className="flex items-center gap-4 rounded-2xl bg-sunken p-3">
              <span className="relative w-16 h-22 shrink-0 rounded-lg overflow-hidden bg-surface" style={{ height: 88 }}>{resolveImageSrc(f.card.imageUrl) ? <Image src={resolveImageSrc(f.card.imageUrl)!} alt="" fill sizes="64px" className="object-contain" /> : <span className="absolute inset-0 flex items-center justify-center text-2xl opacity-30">🃏</span>}</span>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-fg truncate">{f.card.nameKo ?? f.card.name}</p>
                <p className="text-xs text-muted truncate">{f.card.nameKo ? `${f.card.name} · ` : ''}{f.card.setName}{f.card.cardNumber ? ` #${f.card.cardNumber}` : ''}</p>
                <p className="text-xs text-subtle mt-0.5">{TCG_LABELS[f.card.tcgType] ?? f.card.tcgType} · {rarityLabel(f.card.rarity)}</p>
              </div>
              <button onClick={() => { set('card', null); setTimeout(() => searchRef.current?.focus(), 0) }} className="h-9 px-3 rounded-xl border border-line text-xs text-fg-2 hover:text-fg">바꾸기</button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative">
                <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-subtle" />
                <input ref={searchRef} value={q} onChange={e => setQ(e.target.value)} autoFocus placeholder="카드 이름이나 번호 (예: 리자몽, 151, SV2a)" className={`${field} pl-11`} aria-label="카드 검색" />
                {q && <button onClick={() => setQ('')} aria-label="지우기" className="absolute right-3 top-1/2 -translate-y-1/2 text-subtle hover:text-fg"><X size={16} /></button>}
              </div>
              {q.trim() && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(search?.cards ?? []).map(c => (
                    <button key={c.id} onClick={() => { set('card', c); setQ('') }} className="text-left rounded-2xl border border-line bg-sunken p-2 hover:border-accent/50 group">
                      <span className="relative block aspect-[3/4] rounded-lg overflow-hidden bg-surface">{resolveImageSrc(c.imageUrl) ? <Image src={resolveImageSrc(c.imageUrl)!} alt="" fill sizes="140px" className="object-contain group-hover:scale-105 transition-transform" /> : <span className="absolute inset-0 flex flex-col items-center justify-center text-[10px] text-subtle gap-1"><span className="text-2xl opacity-30">🃏</span>이미지 준비 중</span>}</span>
                      <span className="block mt-1.5 text-xs font-semibold text-fg truncate">{c.nameKo ?? c.name}</span>
                      <span className="block text-[10px] text-muted truncate">{c.setName}{c.cardNumber ? ` #${c.cardNumber}` : ''}</span>
                    </button>
                  ))}
                  {search && search.cards.length === 0 && <p className="col-span-full text-sm text-subtle py-4 text-center">검색 결과가 없어요. 영어·일본어 이름이나 카드 번호로도 찾아보세요.</p>}
                </div>
              )}
              {!q.trim() && recentCards.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted">최근에 판매한 카드</p>
                  <div className="flex flex-wrap gap-2">
                    {recentCards.map(c => (
                      <button key={c.id} onClick={() => set('card', c)} className="h-10 pl-1.5 pr-3 rounded-full border border-line bg-sunken inline-flex items-center gap-2 text-sm text-fg-2 hover:border-accent/50">
                        <span className="relative w-7 h-7 rounded-full overflow-hidden bg-surface">{resolveImageSrc(c.imageUrl) && <Image src={resolveImageSrc(c.imageUrl)!} alt="" fill sizes="28px" className="object-cover" />}</span>{c.nameKo ?? c.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Section>

        {f.card && !f.card.imageUrl && f.photos.length === 0 && (
          <p className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200 flex items-center gap-2"><Camera size={14} />이 카드는 공식 이미지가 없어요. 실물 사진을 올려야 목록에서 눈에 잘 띄어요.</p>
        )}

        {/* 3. 가격 */}
        <Section n={3} title="가격" done={price > 0}>
          <div className="grid grid-cols-3 gap-2">
            {MODES.map(m => (
              <button key={m.id} onClick={() => set('mode', m.id)} className={`rounded-2xl border p-3 text-left transition-colors ${f.mode === m.id ? 'border-accent bg-accent-tint/60' : 'border-line hover:border-line-strong'}`}>
                <m.icon size={18} className={f.mode === m.id ? 'text-accent-fg' : 'text-muted'} />
                <p className={`mt-1.5 text-sm font-bold ${f.mode === m.id ? 'text-fg' : 'text-fg-2'}`}>{m.label}</p>
                <p className="text-[11px] text-muted leading-snug mt-0.5 hidden sm:block">{m.desc}</p>
              </button>
            ))}
          </div>
          <div className="relative">
            <input inputMode="numeric" value={comma(f.price)} onChange={e => set('price', e.target.value)} aria-label="가격"
              placeholder={f.mode === 'AUCTION' ? '시작가' : f.mode === 'OFFER' ? '이 금액 이상만 제안 받아요' : '판매가'} className={`${field} h-14 text-xl font-bold pr-12`} />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-muted">P</span>
          </div>
          {f.card && <PriceReferencePanel cardId={f.card.id} mode={f.mode} value={price} graded={f.graded} onApply={p => set('price', String(p))} />}
          {f.mode === 'BUY_NOW' && (
            <label className="flex items-center gap-2.5 text-sm text-fg-2 cursor-pointer">
              <input type="checkbox" checked={f.negotiable} onChange={e => set('negotiable', e.target.checked)} className="w-4 h-4" />
              가격 제안도 받을게요 <span className="text-xs text-muted">(채팅으로 제안이 와요)</span>
            </label>
          )}
          {f.mode === 'AUCTION' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2"><span className="text-sm text-muted mr-1">기간</span>
                {DAYS.map(d => <button key={d} onClick={() => set('days', d)} className={chip(f.days === d)}>{d}일</button>)}</div>
              <button onClick={() => setShowAdvanced(v => !v)} className="text-xs text-muted hover:text-fg inline-flex items-center gap-1">고급 설정 <ChevronDown size={13} className={showAdvanced ? 'rotate-180' : ''} /></button>
              {showAdvanced && (
                <div className="grid sm:grid-cols-2 gap-3">
                  <label className="space-y-1"><span className="text-xs text-muted">즉시낙찰가 (선택)</span>
                    <input inputMode="numeric" value={comma(f.instantBuy)} onChange={e => set('instantBuy', e.target.value)} placeholder="이 금액 입찰 시 바로 낙찰" className={field} /></label>
                  <label className="flex items-center gap-2 text-sm text-fg-2 cursor-pointer self-end pb-3"><input type="checkbox" checked={f.autoExtend} onChange={e => set('autoExtend', e.target.checked)} />마감 5분 전 입찰 시 5분 연장</label>
                </div>
              )}
            </div>
          )}
        </Section>

        {/* 4. 상태 */}
        <Section n={4} title="카드 상태" done>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {CONDITIONS.map(c => (
              <button key={c} onClick={() => set('condition', c)} className={`rounded-2xl border px-3 py-2.5 text-left ${f.condition === c ? 'border-accent bg-accent-tint/60' : 'border-line hover:border-line-strong'}`}>
                <p className={`text-sm font-bold ${f.condition === c ? 'text-fg' : 'text-fg-2'}`}>{CONDITION_LABELS[c]}</p>
                <p className="text-[11px] text-muted leading-snug">{CONDITION_HINT[c]}</p>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <label className="flex items-center gap-2 text-sm text-fg-2 cursor-pointer"><input type="checkbox" checked={f.graded} onChange={e => set('graded', e.target.checked)} className="w-4 h-4" /><ShieldCheck size={15} className="text-accent-fg" />그레이딩(감정) 카드예요</label>
            <span className="ml-auto flex items-center gap-2 text-sm text-muted">수량
              <button onClick={() => set('quantity', Math.max(1, f.quantity - 1))} aria-label="수량 줄이기" className="w-8 h-8 rounded-lg border border-line text-fg">−</button>
              <b className="w-6 text-center text-fg tabular-nums">{f.quantity}</b>
              <button onClick={() => set('quantity', Math.min(99, f.quantity + 1))} aria-label="수량 늘리기" className="w-8 h-8 rounded-lg border border-line text-fg">+</button>
            </span>
          </div>
          {f.graded && (
            <div className="flex flex-wrap items-center gap-2">
              {GRADERS.map(g => <button key={g} onClick={() => set('grader', g)} className={chip(f.grader === g)}>{g}</button>)}
              <input value={f.grade} onChange={e => set('grade', e.target.value)} placeholder="등급 (예: 10)" maxLength={20} className="h-10 w-28 bg-sunken border border-line rounded-full px-4 text-sm text-fg" aria-label="등급" />
            </div>
          )}
        </Section>

        {/* 5. 설명 · 배송 */}
        <Section n={5} title="설명 · 배송" hint="선택">
          <input value={f.title} onChange={e => set('title', e.target.value)} maxLength={60} className={field} aria-label="제목"
            placeholder={f.card ? `제목 (비우면 ‘${f.card.nameKo ?? f.card.name}’)` : '제목 (비우면 카드 이름)'} />
          <textarea value={f.description} onChange={e => set('description', e.target.value)} maxLength={3000} rows={4} aria-label="설명"
            placeholder="보관 상태, 하자, 구성품을 알려주세요." className="w-full bg-sunken border border-line focus:border-accent/60 rounded-2xl px-4 py-3 text-[15px] text-fg placeholder:text-subtle focus:outline-none resize-none" />
          <div className="flex flex-wrap gap-1.5">
            {PHRASES.map(p => (
              <button key={p} onClick={() => set('description', f.description.includes(p) ? f.description : `${f.description}${f.description && !f.description.endsWith('\n') ? '\n' : ''}${p}`)}
                className="h-8 px-3 rounded-full border border-line text-xs text-fg-2 hover:border-accent/50 hover:text-fg">+ {p}</button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Truck size={16} className="text-muted" /><span className="text-sm text-muted mr-1">배송비</span>
            <button onClick={() => set('shipIncluded', true)} className={chip(f.shipIncluded)}>포함 (무료배송)</button>
            <button onClick={() => set('shipIncluded', false)} className={chip(!f.shipIncluded)}>따로 받기</button>
            {!f.shipIncluded && (
              <span className="relative"><input inputMode="numeric" value={comma(f.shippingFee)} onChange={e => set('shippingFee', e.target.value)} aria-label="배송비"
                className="h-10 w-28 bg-sunken border border-line rounded-full pl-4 pr-8 text-sm text-fg" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">P</span></span>
            )}
          </div>
          <p className="text-xs text-subtle">모든 거래는 안전결제(택배)로 진행돼요. 구매자가 결제하면 3일 안에 발송해주세요.</p>
        </Section>
      </div>

      {/* 오른쪽(PC): 미리보기 · 등록 */}
      <aside className="hidden lg:block lg:sticky lg:top-24 space-y-3">
        <div className="rounded-3xl border border-line bg-surface p-4 space-y-3">
          <p className="text-xs font-semibold text-muted">목록에 이렇게 보여요</p>
          <div className="pointer-events-none"><MarketItemCard listing={preview} showLike={false} timeText="방금 전" /></div>
        </div>
        <SubmitBox missing={missing} pending={submit.isPending} error={error} onSubmit={() => { setError(''); submit.mutate() }} />
      </aside>

      {/* 아래 고정(모바일): 등록 */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-line bg-bg/95 backdrop-blur px-4 py-3">
        {(error || missing[0]) && <p className={`text-xs mb-2 flex items-center gap-1 ${error ? 'text-rose-300' : 'text-muted'}`}><AlertCircle size={12} />{error || missing[0]}</p>}
        <button onClick={() => { setError(''); submit.mutate() }} disabled={missing.length > 0 || submit.isPending}
          className="w-full h-12 rounded-2xl bg-gradient-to-r from-accent to-accent-strong text-white font-bold disabled:opacity-40 inline-flex items-center justify-center gap-2">
          {submit.isPending && <Loader2 size={16} className="animate-spin" />}{price ? `${price.toLocaleString()}P로 등록하기` : '등록하기'}
        </button>
      </div>
    </div>
  )
}

function SubmitBox({ missing, pending, error, onSubmit }: { missing: string[]; pending: boolean; error: string; onSubmit: () => void }) {
  return (
    <div className="rounded-3xl border border-line bg-surface p-4 space-y-3">
      {missing.length > 0
        ? <ul className="space-y-1">{missing.map(m => <li key={m} className="text-xs text-muted flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" />{m}</li>)}</ul>
        : <p className="text-xs text-emerald-400 flex items-center gap-1.5"><Check size={13} />등록할 준비가 됐어요</p>}
      {error && <p className="text-xs text-rose-300">{error}</p>}
      <button onClick={onSubmit} disabled={missing.length > 0 || pending} className="w-full h-12 rounded-2xl bg-gradient-to-r from-accent to-accent-strong text-white font-bold disabled:opacity-40 inline-flex items-center justify-center gap-2">
        {pending && <Loader2 size={16} className="animate-spin" />}등록하기
      </button>
      <p className="text-[11px] text-subtle text-center">작성 중인 내용은 자동으로 저장돼요</p>
    </div>
  )
}

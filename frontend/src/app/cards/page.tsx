'use client'

import { useState, useEffect, useRef, Suspense, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { api } from '@/lib/api'
import { TCG_LABELS, rarityLabel, resolveImageSrc } from '@/lib/utils'
import {
  Search, SlidersHorizontal, X, ChevronLeft, ChevronRight,
  LayoutGrid, Layers, TrendingUp, Sparkles, ChevronDown, Clock, CheckCircle2,
} from 'lucide-react'
import { useRecentlyViewed } from '@/hooks/useRecentlyViewed'
import { useCollection } from '@/hooks/useCollection'

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface Card {
  id: string
  name: string
  nameKo: string | null
  nameJa: string | null
  tcgType: string
  setName: string
  setCode: string | null
  cardNumber: string | null
  rarity: string
  imageUrl: string | null
  supertype: string | null
  subtypes: string | null
  cardTypes: string | null
  hp: number | null
  minPrice: number | null
  _count: { listings: number }
}

interface CardsResponse {
  cards: Card[]
  total: number
  page: number
  totalPages: number
}

interface MetaItem { name: string; count: number }
interface CardMeta { sets: MetaItem[]; rarities: MetaItem[]; supertypes: MetaItem[] }

// ─── 상수 & 유틸 ──────────────────────────────────────────────────────────────

const TCG_TYPES = ['POKEMON', 'YUGIOH', 'MTG', 'DIGIMON', 'ONEPIECE', 'WEISS', 'OTHER'] as const

const TCG_ICONS: Record<string, string> = {
  POKEMON: '🎴', YUGIOH: '⚡', MTG: '🪄', DIGIMON: '💻', ONEPIECE: '⚓', WEISS: '🃏', OTHER: '📦',
}

const SORT_OPTIONS = [
  { value: 'name',    label: '이름순' },
  { value: 'newest',  label: '최신 등록순' },
  { value: 'popular', label: '리스팅 많은순' },
  { value: 'hp_desc', label: 'HP 높은순' },
  { value: 'hp_asc',  label: 'HP 낮은순' },
]

// 포켓몬 에너지 타입 (icu.gg 스타일)
const POKEMON_ENERGY_TYPES = [
  { value: 'Grass',     label: '풀',    color: '#4CAF50', bg: '#1a2e1a', icon: '🌿' },
  { value: 'Fire',      label: '불꽃',  color: '#FF5722', bg: '#2e1a12', icon: '🔥' },
  { value: 'Water',     label: '물',    color: '#2196F3', bg: '#121a2e', icon: '💧' },
  { value: 'Lightning', label: '번개',  color: '#FFC107', bg: '#2e2a12', icon: '⚡' },
  { value: 'Psychic',   label: '초능력', color: '#E91E63', bg: '#2e1222', icon: '🔮' },
  { value: 'Fighting',  label: '격투',  color: '#FF9800', bg: '#2e1e12', icon: '🥊' },
  { value: 'Darkness',  label: '악',    color: '#9C27B0', bg: '#1e1228', icon: '🌑' },
  { value: 'Metal',     label: '강철',  color: '#9E9E9E', bg: '#1e1e1e', icon: '⚙️' },
  { value: 'Dragon',    label: '드래곤', color: '#6A1B9A', bg: '#1a1228', icon: '🐉' },
  { value: 'Fairy',     label: '요정',  color: '#F48FB1', bg: '#2e1222', icon: '✨' },
  { value: 'Colorless', label: '무색',  color: '#B0BEC5', bg: '#1e1e1e', icon: '⭐' },
]

// 포켓몬 카드 분류
const POKEMON_SUPERTYPES = [
  { value: 'Pokémon', label: '포켓몬', icon: '🎴' },
  { value: 'Trainer', label: '트레이너', icon: '🧢' },
  { value: 'Energy',  label: '에너지', icon: '⚡' },
]

function rarityColorClass(rarity: string): string {
  const r = rarity.toLowerCase()
  if (r.includes('hyper') || r.includes('rainbow') || r.includes('starlight') || r.includes('quarter century'))
    return 'text-red-400 border-red-400/40 bg-red-400/8'
  if (r.includes('special illustration') || r.includes('gold rare'))
    return 'text-amber-300 border-amber-300/40 bg-amber-300/8'
  if (r.includes('secret') || r === 'sec')
    return 'text-yellow-300 border-yellow-300/40 bg-yellow-300/8'
  if (r.includes('ultra') || r === 'ur' || r === 'sr' || r.includes('super rare') || r.includes('super parallel'))
    return 'text-orange-400 border-orange-400/40 bg-orange-400/8'
  if (r.includes('illustration') || r.includes('amazing') || r.includes('radiant') || r.includes('shiny'))
    return 'text-pink-400 border-pink-400/40 bg-pink-400/8'
  if (r === 'double rare' || r.includes('vmax') || r.includes('vstar') || r.includes('holo v') || r === 'mythic')
    return 'text-purple-400 border-purple-400/40 bg-purple-400/8'
  if (r === 'rare' || r === 'r' || r.includes('holo') || r === 'rare holo' || r === 'rare holo ex' || r === 'rare holo gx')
    return 'text-blue-400 border-blue-400/40 bg-blue-400/8'
  if (r === 'uncommon' || r === 'u' || r === 'promo' || r === '프로모')
    return 'text-emerald-400 border-emerald-400/40 bg-emerald-400/8'
  return 'text-[#7a6040] border-[#2e2318] bg-[#1a1208]'
}

function CardSkeleton() {
  return (
    <div className="bg-[#1a1410] border border-[#2e2318] rounded-xl overflow-hidden animate-pulse">
      <div className="aspect-[3/4] bg-[#1a1208]" />
      <div className="p-3 space-y-2">
        <div className="h-3.5 bg-[#2e2318] rounded w-4/5" />
        <div className="h-3 bg-[#2e2318] rounded w-2/3" />
        <div className="h-3 bg-[#2e2318] rounded w-1/2" />
      </div>
    </div>
  )
}

// ─── 카드 타일 ────────────────────────────────────────────────────────────────

function CardTile({
  card, displayLang, onHover, isCollected, onToggleCollection,
}: {
  card: Card
  displayLang?: string
  onHover: (info: { card: Card; rect: DOMRect } | null) => void
  isCollected: boolean
  onToggleCollection: () => void
}) {
  const tileRef = useRef<HTMLDivElement>(null)
  const displayName =
    displayLang === 'ja' ? (card.nameJa ?? card.name) :
    (card.nameKo ?? card.name)
  const rColor = rarityColorClass(card.rarity)

  return (
    <div
      ref={tileRef}
      onMouseEnter={() => tileRef.current && onHover({ card, rect: tileRef.current.getBoundingClientRect() })}
      onMouseLeave={() => onHover(null)}
    >
    <Link
      href={`/cards/${card.id}`}
      className="group bg-[#1a1410] border border-[#2e2318] rounded-xl overflow-hidden hover:border-[#d4a853]/40 hover:shadow-[0_0_20px_rgba(212,168,83,0.08)] transition-all duration-200 flex flex-col"
    >
      {/* 이미지 */}
      <div className="relative aspect-[3/4] bg-[#0f0b08] overflow-hidden">
        {card.imageUrl ? (
          <Image
            src={resolveImageSrc(card.imageUrl)!}
            alt={displayName}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
            className="object-contain group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-4xl text-[#2e2318]">
            {TCG_ICONS[card.tcgType] ?? '🃏'}
          </div>
        )}
        {/* 보유 체크 버튼 */}
        <button
          onClick={e => { e.preventDefault(); e.stopPropagation(); onToggleCollection() }}
          title={isCollected ? '보유 해제' : '보유 마킹'}
          className={`absolute top-2 left-2 z-10 w-6 h-6 rounded-full flex items-center justify-center transition-all duration-150 ${
            isCollected
              ? 'bg-emerald-500 border border-emerald-400 text-white shadow-lg'
              : 'bg-[#0f0b08]/70 border border-[#2e2318] text-[#4a3820] opacity-0 group-hover:opacity-100'
          }`}
        >
          <CheckCircle2 size={14} />
        </button>
        {/* 최저가 배지 */}
        {card.minPrice != null && (
          <div className="absolute bottom-2 left-0 right-0 flex justify-center">
            <div className="bg-[#0f0b08]/85 backdrop-blur-sm border border-[#d4a853]/40 text-[#d4a853] text-[10px] font-bold px-2 py-0.5 rounded-full">
              최저 {card.minPrice.toLocaleString()}P
            </div>
          </div>
        )}
        {/* 리스팅 수 배지 */}
        {card._count.listings > 0 && card.minPrice == null && (
          <div className="absolute top-2 right-2 bg-[#0f0b08]/80 backdrop-blur-sm border border-[#d4a853]/30 text-[#d4a853] text-[10px] font-bold px-1.5 py-0.5 rounded-md">
            {card._count.listings}건
          </div>
        )}
      </div>

      {/* 정보 */}
      <div className="p-3 flex flex-col gap-1.5 flex-1">
        <p className="text-sm font-semibold text-[#f5ead8] line-clamp-2 leading-tight group-hover:text-white transition-colors">
          {displayName}
        </p>
        {displayLang === 'ja'
          ? card.name !== displayName && <p className="text-[11px] text-[#5a4830] truncate">{card.name}</p>
          : card.nameKo && card.name !== card.nameKo && <p className="text-[11px] text-[#5a4830] truncate">{card.name}</p>
        }

        {/* 레어도 + 언어 배지 */}
        <div className="flex items-center gap-1 flex-wrap">
          <div className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-semibold ${rColor}`}>
            {rarityLabel(card.rarity)}
          </div>
          {card.nameKo && (
            <div className="inline-flex items-center px-1 py-0.5 rounded border border-emerald-800/50 bg-emerald-900/20 text-[9px] text-emerald-500">
              🇰🇷
            </div>
          )}
          {card.nameJa && (
            <div className="inline-flex items-center px-1 py-0.5 rounded border border-blue-800/50 bg-blue-900/20 text-[9px] text-blue-500">
              🇯🇵
            </div>
          )}
        </div>

        <div className="mt-auto space-y-0.5">
          {/* 에너지 타입 + HP */}
          {(card.cardTypes || card.hp) && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {card.cardTypes && card.cardTypes.split(',').map(t => {
                const et = POKEMON_ENERGY_TYPES.find(e => e.value === t.trim())
                return et ? (
                  <span key={t} className="text-[9px] font-semibold px-1 py-0.5 rounded" style={{ backgroundColor: et.bg, color: et.color }}>
                    {et.icon} {et.label}
                  </span>
                ) : null
              })}
              {card.hp && (
                <span className="text-[9px] font-bold text-red-400">HP {card.hp}</span>
              )}
            </div>
          )}
          <p className="text-[11px] text-[#5a4830] truncate">{card.setName}</p>
          {card.cardNumber && (
            <p className="text-[10px] text-[#d4a853]/70 font-mono tracking-wide">[{card.cardNumber}]</p>
          )}
        </div>
      </div>
    </Link>
    </div>
  )
}

// ─── 검색 인스턴트 드롭다운 ──────────────────────────────────────────────────

function SearchDropdown({
  q, onSelect,
}: {
  q: string
  onSelect: (id: string) => void
}) {
  const { data, isLoading } = useQuery<CardsResponse>({
    queryKey: ['cards-instant', q],
    queryFn: () => api.get('/cards', { params: { q, limit: 6 } }).then(r => r.data),
    enabled: q.length >= 1,
    staleTime: 15_000,
  })

  if (!q || (!isLoading && !data?.cards.length)) return null

  return (
    <div className="absolute top-full left-0 right-0 mt-1 bg-[#150f0c] border border-[#2e2318] rounded-xl shadow-xl z-50 overflow-hidden">
      {isLoading ? (
        <div className="p-4 text-center text-[#5a4830] text-sm">검색 중...</div>
      ) : (
        <>
          {data?.cards.map(card => (
            <button
              key={card.id}
              onClick={() => onSelect(card.id)}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#1a1410] transition-colors text-left border-b border-[#1a1208] last:border-b-0"
            >
              <div className="relative w-8 h-11 shrink-0 rounded overflow-hidden bg-[#0f0b08]">
                {card.imageUrl ? (
                  <Image src={resolveImageSrc(card.imageUrl)!} alt={card.nameKo ?? card.name} fill className="object-contain" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-xs">{TCG_ICONS[card.tcgType] ?? '🃏'}</div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#f5ead8] truncate">{card.nameKo ?? card.name}</p>
                <p className="text-[11px] text-[#5a4830] truncate">
                  {card.cardNumber && <span className="text-[#d4a853]/70 font-mono mr-1">[{card.cardNumber}]</span>}
                  {card.setName} · {card.rarity}
                </p>
              </div>
              <span className="text-[10px] text-[#7a6040] shrink-0 bg-[#1a1208] border border-[#2e2318] px-1.5 py-0.5 rounded">
                {TCG_LABELS[card.tcgType] ?? card.tcgType}
              </span>
            </button>
          ))}
          {data && data.total > 6 && (
            <div className="px-4 py-2.5 text-[11px] text-[#5a4830] text-center border-t border-[#1a1208]">
              +{(data.total - 6).toLocaleString()}개 더 있음 — 검색 버튼으로 전체 보기
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── 필터 사이드바 ────────────────────────────────────────────────────────────

function FilterSidebar({
  tcgType, selectedRarities, setName, hpMin, hpMax,
  onRarityToggle, onClearRarities, onSet, onHpChange,
  metaData, metaLoading,
}: {
  tcgType: string
  selectedRarities: string[]
  setName: string
  hpMin: string
  hpMax: string
  onRarityToggle: (r: string) => void
  onClearRarities: () => void
  onSet: (s: string) => void
  onHpChange: (min: string, max: string) => void
  metaData: CardMeta | undefined
  metaLoading: boolean
}) {
  const [setSearch, setSetSearch] = useState('')
  const [setOpen, setSetOpen] = useState(false)
  const [localMin, setLocalMin] = useState(hpMin)
  const [localMax, setLocalMax] = useState(hpMax)

  useEffect(() => setLocalMin(hpMin), [hpMin])
  useEffect(() => setLocalMax(hpMax), [hpMax])

  const filteredSets = metaData?.sets.filter(s =>
    s.name.toLowerCase().includes(setSearch.toLowerCase())
  ) ?? []

  const showHpRange = tcgType === 'POKEMON' || (tcgType === '' && (metaData?.supertypes?.length ?? 0) > 0)

  return (
    <div className="space-y-5">
      {/* 레어도 — 다중 선택 체크박스 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-[#7a6040] uppercase tracking-wider">레어도</p>
          {selectedRarities.length > 0 && (
            <button onClick={onClearRarities} className="text-[10px] text-[#5a4830] hover:text-[#e0b878] transition-colors">
              초기화
            </button>
          )}
        </div>
        {metaLoading ? (
          <div className="space-y-1.5">
            {[1,2,3,4].map(i => <div key={i} className="h-7 bg-[#1a1208] rounded-lg animate-pulse" />)}
          </div>
        ) : (
          <div className="space-y-0.5 max-h-56 overflow-y-auto pr-0.5">
            {metaData?.rarities.slice(0, 25).map(r => {
              const checked = selectedRarities.includes(r.name)
              return (
                <label
                  key={r.name}
                  className={`flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-lg text-xs transition-colors select-none ${
                    checked ? 'bg-[#2a1c08] text-[#e0b878]' : 'text-[#7a6040] hover:bg-[#1a1208] hover:text-[#9e8a6a]'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onRarityToggle(r.name)}
                    className="w-3 h-3 shrink-0 accent-[#d4a853]"
                  />
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${rarityColorClass(r.name).split(' ')[0].replace('text-', 'bg-')}`} />
                  <span className="flex-1 truncate">{rarityLabel(r.name)}</span>
                  <span className="text-[10px] text-[#4a3820] shrink-0">{r.count.toLocaleString()}</span>
                </label>
              )
            })}
          </div>
        )}
      </div>

      {/* HP 범위 (포켓몬) */}
      {showHpRange && (
        <div>
          <p className="text-xs font-semibold text-[#7a6040] uppercase tracking-wider mb-3">HP 범위</p>
          <div className="flex gap-2 items-center">
            <input
              type="number"
              min="0"
              value={localMin}
              onChange={e => setLocalMin(e.target.value)}
              onBlur={() => onHpChange(localMin, localMax)}
              onKeyDown={e => e.key === 'Enter' && onHpChange(localMin, localMax)}
              placeholder="최소"
              className="w-full bg-[#1a1208] border border-[#2e2318] rounded-lg px-2.5 py-1.5 text-xs text-[#f5ead8] placeholder:text-[#4a3820] focus:outline-none focus:border-[#d4a853]/30 transition-colors"
            />
            <span className="text-[#5a4830] text-xs shrink-0">~</span>
            <input
              type="number"
              min="0"
              value={localMax}
              onChange={e => setLocalMax(e.target.value)}
              onBlur={() => onHpChange(localMin, localMax)}
              onKeyDown={e => e.key === 'Enter' && onHpChange(localMin, localMax)}
              placeholder="최대"
              className="w-full bg-[#1a1208] border border-[#2e2318] rounded-lg px-2.5 py-1.5 text-xs text-[#f5ead8] placeholder:text-[#4a3820] focus:outline-none focus:border-[#d4a853]/30 transition-colors"
            />
          </div>
          {(hpMin || hpMax) && (
            <button
              onClick={() => { setLocalMin(''); setLocalMax(''); onHpChange('', '') }}
              className="mt-1.5 flex items-center gap-1 text-[11px] text-[#7a6040] hover:text-[#9e8a6a] transition-colors"
            >
              <X size={10} /> HP 필터 해제
            </button>
          )}
        </div>
      )}

      {/* 세트 */}
      <div>
        <p className="text-xs font-semibold text-[#7a6040] uppercase tracking-wider mb-3">세트 / 팩</p>
        <div className="relative">
          <button
            onClick={() => setSetOpen(o => !o)}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-xs transition-colors ${
              setName
                ? 'bg-[#2a1c08] border-[#3d2a0c] text-[#e0b878]'
                : 'bg-[#1a1208] border-[#2e2318] text-[#7a6040] hover:border-[#4a3520]'
            }`}
          >
            <span className="truncate">{setName || '전체 세트'}</span>
            <ChevronDown size={12} className={`ml-1 shrink-0 transition-transform ${setOpen ? 'rotate-180' : ''}`} />
          </button>

          {setOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-[#150f0c] border border-[#2e2318] rounded-xl shadow-xl z-40 overflow-hidden">
              <div className="p-2">
                <input
                  value={setSearch}
                  onChange={e => setSetSearch(e.target.value)}
                  placeholder="세트 검색..."
                  className="w-full bg-[#1a1208] border border-[#2e2318] rounded-lg px-3 py-1.5 text-xs text-[#f5ead8] placeholder:text-[#4a3820] focus:outline-none focus:border-[#d4a853]/30"
                />
              </div>
              <div className="max-h-52 overflow-y-auto">
                <button
                  onClick={() => { onSet(''); setSetOpen(false) }}
                  className={`w-full text-left px-3 py-2 text-xs transition-colors ${!setName ? 'text-[#e0b878] bg-[#2a1c08]' : 'text-[#7a6040] hover:bg-[#1a1208]'}`}
                >
                  전체 세트
                </button>
                {filteredSets.slice(0, 80).map(s => (
                  <button
                    key={s.name}
                    onClick={() => { onSet(s.name === setName ? '' : s.name); setSetOpen(false) }}
                    className={`w-full flex items-center justify-between px-3 py-2 text-xs transition-colors ${
                      setName === s.name ? 'text-[#e0b878] bg-[#2a1c08]' : 'text-[#7a6040] hover:bg-[#1a1208] hover:text-[#9e8a6a]'
                    }`}
                  >
                    <span className="truncate">{s.name}</span>
                    <span className="text-[10px] text-[#4a3820] ml-1 shrink-0">{s.count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {setName && (
          <button
            onClick={() => onSet('')}
            className="mt-1.5 flex items-center gap-1 text-[11px] text-[#7a6040] hover:text-[#9e8a6a] transition-colors"
          >
            <X size={10} /> 필터 해제
          </button>
        )}
      </div>
    </div>
  )
}

// ─── 메인 콘텐츠 ──────────────────────────────────────────────────────────────

function RecentlyViewedBar({ onNavigate }: { onNavigate: (id: string) => void }) {
  const { cards, clearAll } = useRecentlyViewed()
  if (cards.length === 0) return null
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[11px] text-[#5a4830] font-semibold uppercase tracking-wider">
          <Clock size={10} className="text-[#d4a853]" /> 최근 본 카드
        </p>
        <button onClick={clearAll} className="text-[10px] text-[#4a3820] hover:text-[#7a6040] transition-colors">지우기</button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
        {cards.map(card => (
          <button
            key={card.id}
            onClick={() => onNavigate(card.id)}
            className="shrink-0 group flex flex-col items-center gap-1.5 w-16"
          >
            <div className="relative w-16 h-[85px] rounded-xl overflow-hidden border border-[#2e2318] group-hover:border-[#d4a853]/40 transition-colors bg-[#1a1410]">
              {card.imageUrl ? (
                <Image src={resolveImageSrc(card.imageUrl)!} alt={card.nameKo ?? card.name} fill sizes="64px" className="object-contain" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-2xl">🃏</div>
              )}
            </div>
            <p className="text-[9px] text-[#7a6040] group-hover:text-[#c9a860] line-clamp-2 text-center leading-tight w-full transition-colors">
              {card.nameKo ?? card.name}
            </p>
          </button>
        ))}
      </div>
    </div>
  )
}

function CardsContent() {
  const searchParams = useSearchParams()
  const router       = useRouter()

  const q            = searchParams.get('q')         ?? ''
  const tcgType      = searchParams.get('tcgType')   ?? ''
  const raritiesParam= searchParams.get('rarities')  ?? ''
  const setName      = searchParams.get('setName')   ?? ''
  const lang         = searchParams.get('lang')      ?? ''
  const supertype    = searchParams.get('supertype') ?? ''
  const cardType     = searchParams.get('cardType')  ?? ''
  const hpMin        = searchParams.get('hpMin')     ?? ''
  const hpMax        = searchParams.get('hpMax')     ?? ''
  const sort         = searchParams.get('sort')      ?? 'name'
  const page         = Math.max(1, Number(searchParams.get('page') ?? '1'))

  const selectedRarities = raritiesParam ? raritiesParam.split(',').filter(Boolean) : []

  const { isCollected, toggle: toggleCollection } = useCollection()

  const [searchInput, setSearchInput] = useState(q)
  const [showInstant, setShowInstant] = useState(false)
  const [showMobileFilter, setShowMobileFilter] = useState(false)
  const [hoverInfo, setHoverInfo] = useState<{ card: Card; rect: DOMRect } | null>(null)
  const searchRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 검색어 변경 시 URL에 반영 (300ms debounce)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      if (searchInput !== q) setParam('q', searchInput)
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [searchInput])

  // URL q 변경 시 입력창 동기화
  useEffect(() => { setSearchInput(q) }, [q])

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!searchRef.current?.contains(e.target as Node)) setShowInstant(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function setParam(key: string, value: string) {
    const p = new URLSearchParams(searchParams.toString())
    if (value) { p.set(key, value) } else { p.delete(key) }
    p.delete('page')
    router.push(`/cards?${p.toString()}`)
  }

  function setPageParam(p: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(p))
    router.push(`/cards?${params.toString()}`)
  }

  const hasFilter = !!(tcgType || raritiesParam || setName || q || lang || supertype || cardType || hpMin || hpMax)

  function clearAll() {
    router.push('/cards')
    setSearchInput('')
  }

  function toggleRarity(r: string) {
    const next = selectedRarities.includes(r)
      ? selectedRarities.filter(x => x !== r)
      : [...selectedRarities, r]
    setParam('rarities', next.join(','))
  }

  function handleHpChange(min: string, max: string) {
    const p = new URLSearchParams(searchParams.toString())
    if (min) p.set('hpMin', min); else p.delete('hpMin')
    if (max) p.set('hpMax', max); else p.delete('hpMax')
    p.delete('page')
    router.push(`/cards?${p.toString()}`)
  }

  // 카드 목록 조회
  const { data, isLoading } = useQuery<CardsResponse>({
    queryKey: ['cards', { q, tcgType, raritiesParam, setName, lang, supertype, cardType, hpMin, hpMax, sort, page }],
    queryFn: () => api.get('/cards', { params: {
      q: q || undefined, tcgType: tcgType || undefined,
      rarities: raritiesParam || undefined,
      setName: setName || undefined,
      lang: lang || undefined,
      supertype: supertype || undefined,
      cardType: cardType || undefined,
      hpMin: hpMin || undefined,
      hpMax: hpMax || undefined,
      sort, page, limit: 24,
    }}).then(r => r.data),
    staleTime: 30_000,
    placeholderData: prev => prev,
  })

  // 필터 옵션 (레어도, 세트, 수퍼타입)
  const { data: metaData, isLoading: metaLoading } = useQuery<CardMeta>({
    queryKey: ['cards-meta', tcgType, lang, supertype],
    queryFn: () => api.get('/cards/meta', { params: {
      tcgType: tcgType || undefined,
      lang: lang || undefined,
      supertype: supertype || undefined,
    }}).then(r => r.data),
    staleTime: 60_000,
  })

  const cards = data?.cards ?? []
  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 0

  const FilterPanel = (
    <FilterSidebar
      tcgType={tcgType}
      selectedRarities={selectedRarities}
      setName={setName}
      hpMin={hpMin}
      hpMax={hpMax}
      onRarityToggle={toggleRarity}
      onClearRarities={() => setParam('rarities', '')}
      onSet={s => setParam('setName', s)}
      onHpChange={handleHpChange}
      metaData={metaData}
      metaLoading={metaLoading}
    />
  )

  return (
    <div className="max-w-7xl mx-auto space-y-6">

      {/* ── 헤더 ── */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-[#f5ead8] tracking-tight flex items-center gap-2">
          <Layers size={22} className="text-[#d4a853]" />
          카드 도감
        </h1>
        <p className="text-xs text-[#5a4830]">
          {total > 0
            ? `${total.toLocaleString()}개 카드 — 포켓몬·유희왕·MTG·디지몬·원피스 통합 한글 검색`
            : '한국어·일어·영어 카드명으로 검색 가능 · 포켓몬·유희왕·MTG·디지몬·원피스'}
        </p>
      </div>

      {/* ── 검색바 ── */}
      <div ref={searchRef} className="relative">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#5a4830] pointer-events-none" />
        <input
          value={searchInput}
          onChange={e => { setSearchInput(e.target.value); setShowInstant(true) }}
          onFocus={() => setShowInstant(true)}
          onKeyDown={e => { if (e.key === 'Escape') setShowInstant(false) }}
          placeholder="한국어·영어·일어로 카드명, 세트명, 번호 검색..."
          className="w-full pl-11 pr-10 py-3.5 bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] focus:border-[#d4a853]/40 rounded-xl text-sm text-[#f5ead8] placeholder:text-[#4a3820] focus:outline-none transition-colors shadow-sm"
        />
        {searchInput && (
          <button
            onClick={() => { setSearchInput(''); setParam('q', ''); setShowInstant(false) }}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-[#5a4830] hover:text-[#9e8a6a] transition-colors"
          >
            <X size={14} />
          </button>
        )}
        {/* 인스턴트 검색 드롭다운 */}
        {showInstant && searchInput.length >= 1 && (
          <SearchDropdown
            q={searchInput}
            onSelect={id => { setShowInstant(false); router.push(`/cards/${id}`) }}
          />
        )}
      </div>

      {/* ── 최근 본 카드 ── */}
      {!q && <RecentlyViewedBar onNavigate={id => router.push(`/cards/${id}`)} />}

      {/* ── TCG 타입 탭 ── */}
      <div className="flex gap-1.5 flex-wrap">
        <button
          onClick={() => setParam('tcgType', '')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
            !tcgType
              ? 'bg-[#2a1c08] text-[#e0b878] border-[#3d2a0c] shadow-[0_0_12px_rgba(212,168,83,0.1)]'
              : 'bg-transparent text-[#7a6040] border-[#2e2318] hover:border-[#4a3520] hover:text-[#9e8a6a]'
          }`}
        >
          전체
        </button>
        {TCG_TYPES.map(t => (
          <button
            key={t}
            onClick={() => setParam('tcgType', t === tcgType ? '' : t)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
              tcgType === t
                ? 'bg-[#2a1c08] text-[#e0b878] border-[#3d2a0c] shadow-[0_0_12px_rgba(212,168,83,0.1)]'
                : 'bg-transparent text-[#7a6040] border-[#2e2318] hover:border-[#4a3520] hover:text-[#9e8a6a]'
            }`}
          >
            <span>{TCG_ICONS[t]}</span>
            {TCG_LABELS[t]}
          </button>
        ))}
      </div>

      {/* ── 언어 필터 탭 ── */}
      <div className="flex gap-1.5 items-center flex-wrap">
        <span className="text-[11px] text-[#5a4830] font-medium mr-1">언어</span>
        {[
          { value: '', label: '전체' },
          { value: 'ko', label: '🇰🇷 한국판' },
          { value: 'ja', label: '🇯🇵 일본판' },
        ].map(opt => (
          <button
            key={opt.value}
            onClick={() => setParam('lang', opt.value)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
              lang === opt.value
                ? 'bg-[#2a1c08] text-[#e0b878] border-[#3d2a0c]'
                : 'bg-transparent text-[#7a6040] border-[#2e2318] hover:border-[#4a3520] hover:text-[#9e8a6a]'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* ── 포켓몬 카드 분류 필터 ── */}
      {(tcgType === 'POKEMON' || (!tcgType && (metaData?.supertypes?.length ?? 0) > 0)) && (
        <div className="flex gap-1.5 items-center flex-wrap">
          <span className="text-[11px] text-[#5a4830] font-medium mr-1">분류</span>
          <button
            onClick={() => setParam('supertype', '')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
              !supertype
                ? 'bg-[#2a1c08] text-[#e0b878] border-[#3d2a0c]'
                : 'bg-transparent text-[#7a6040] border-[#2e2318] hover:border-[#4a3520] hover:text-[#9e8a6a]'
            }`}
          >
            전체
          </button>
          {POKEMON_SUPERTYPES.map(st => (
            <button
              key={st.value}
              onClick={() => setParam('supertype', supertype === st.value ? '' : st.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                supertype === st.value
                  ? 'bg-[#2a1c08] text-[#e0b878] border-[#3d2a0c]'
                  : 'bg-transparent text-[#7a6040] border-[#2e2318] hover:border-[#4a3520] hover:text-[#9e8a6a]'
              }`}
            >
              <span>{st.icon}</span>{st.label}
            </button>
          ))}
        </div>
      )}

      {/* ── 포켓몬 에너지 타입 필터 ── */}
      {(tcgType === 'POKEMON' || supertype === 'Pokémon') && (
        <div className="flex gap-1.5 items-center flex-wrap">
          <span className="text-[11px] text-[#5a4830] font-medium mr-1">타입</span>
          {POKEMON_ENERGY_TYPES.map(et => (
            <button
              key={et.value}
              onClick={() => setParam('cardType', cardType === et.value ? '' : et.value)}
              title={et.label}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                cardType === et.value
                  ? `border-opacity-60 text-white`
                  : 'bg-transparent text-[#7a6040] border-[#2e2318] hover:border-[#4a3520]'
              }`}
              style={cardType === et.value ? {
                backgroundColor: et.bg,
                borderColor: et.color,
                color: et.color,
              } : undefined}
            >
              <span>{et.icon}</span>
              <span className="hidden sm:inline">{et.label}</span>
            </button>
          ))}
          {cardType && (
            <button
              onClick={() => setParam('cardType', '')}
              className="text-[11px] text-[#7a6040] hover:text-[#e0b878] transition-colors ml-1"
            >
              초기화 ×
            </button>
          )}
        </div>
      )}

      <div className="flex gap-6">
        {/* ── 데스크탑 사이드바 ── */}
        <aside className="hidden lg:block w-52 shrink-0 space-y-6">
          <div className="bg-[#1a1410] border border-[#2e2318] rounded-xl p-4">
            {FilterPanel}
          </div>
        </aside>

        {/* ── 카드 그리드 영역 ── */}
        <div className="flex-1 min-w-0 space-y-4">

          {/* 결과 헤더: 정렬 + 필터 토글 + 활성 필터 칩 */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              {/* 모바일 필터 버튼 */}
              <button
                onClick={() => setShowMobileFilter(o => !o)}
                className="lg:hidden flex items-center gap-1.5 px-3 py-2 bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] rounded-xl text-xs text-[#7a6040] hover:text-[#9e8a6a] transition-colors"
              >
                <SlidersHorizontal size={12} />
                필터
                {hasFilter && <span className="w-1.5 h-1.5 rounded-full bg-[#d4a853]" />}
              </button>

              {/* 활성 필터 칩 */}
              {lang && (
                <span className="flex items-center gap-1 text-[11px] bg-[#2a1c08] border border-[#3d2a0c] text-[#e0b878] px-2.5 py-1 rounded-lg">
                  {lang === 'ja' ? '🇯🇵 일본판' : '🇰🇷 한국판'}
                  <button onClick={() => setParam('lang', '')}><X size={9} /></button>
                </span>
              )}
              {supertype && (
                <span className="flex items-center gap-1 text-[11px] bg-[#2a1c08] border border-[#3d2a0c] text-[#e0b878] px-2.5 py-1 rounded-lg">
                  {POKEMON_SUPERTYPES.find(s => s.value === supertype)?.icon} {supertype}
                  <button onClick={() => setParam('supertype', '')}><X size={9} /></button>
                </span>
              )}
              {cardType && (() => {
                const et = POKEMON_ENERGY_TYPES.find(e => e.value === cardType)
                return et ? (
                  <span className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg border"
                    style={{ backgroundColor: et.bg, borderColor: et.color, color: et.color }}>
                    {et.icon} {et.label}
                    <button onClick={() => setParam('cardType', '')}><X size={9} /></button>
                  </span>
                ) : null
              })()}
              {selectedRarities.length > 0 && (
                selectedRarities.length === 1 ? (
                  <span className="flex items-center gap-1 text-[11px] bg-[#2a1c08] border border-[#3d2a0c] text-[#e0b878] px-2.5 py-1 rounded-lg">
                    {rarityLabel(selectedRarities[0])}
                    <button onClick={() => setParam('rarities', '')}><X size={9} /></button>
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[11px] bg-[#2a1c08] border border-[#3d2a0c] text-[#e0b878] px-2.5 py-1 rounded-lg">
                    레어도 {selectedRarities.length}개 선택
                    <button onClick={() => setParam('rarities', '')}><X size={9} /></button>
                  </span>
                )
              )}
              {(hpMin || hpMax) && (
                <span className="flex items-center gap-1 text-[11px] bg-[#2a1c08] border border-[#3d2a0c] text-[#e0b878] px-2.5 py-1 rounded-lg">
                  HP {hpMin || '0'}~{hpMax || '∞'}
                  <button onClick={() => handleHpChange('', '')}><X size={9} /></button>
                </span>
              )}
              {setName && (
                <span className="flex items-center gap-1 text-[11px] bg-[#2a1c08] border border-[#3d2a0c] text-[#e0b878] px-2.5 py-1 rounded-lg max-w-[180px]">
                  <span className="truncate">{setName}</span>
                  <button onClick={() => setParam('setName', '')}><X size={9} /></button>
                </span>
              )}
              {hasFilter && (
                <button
                  onClick={clearAll}
                  className="text-[11px] text-[#5a4830] hover:text-[#9e8a6a] transition-colors"
                >
                  전체 초기화
                </button>
              )}
            </div>

            {/* 정렬 */}
            <div className="flex items-center gap-2">
              <TrendingUp size={12} className="text-[#5a4830]" />
              <select
                value={sort}
                onChange={e => setParam('sort', e.target.value)}
                className="bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] rounded-lg px-3 py-1.5 text-xs text-[#f5ead8] focus:outline-none focus:border-[#d4a853]/40 cursor-pointer transition-colors"
              >
                {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {/* 모바일 필터 패널 */}
          {showMobileFilter && (
            <div className="lg:hidden bg-[#1a1410] border border-[#2e2318] rounded-xl p-4">
              {FilterPanel}
            </div>
          )}

          {/* 카드 그리드 */}
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
              {Array.from({ length: 24 }).map((_, i) => <CardSkeleton key={i} />)}
            </div>
          ) : cards.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <Sparkles size={40} className="text-[#2e2318]" />
              <div className="text-center">
                <p className="text-[#5a4830] font-medium">검색 결과가 없습니다.</p>
                <p className="text-xs text-[#4a3820] mt-1">다른 키워드나 필터를 사용해보세요.</p>
              </div>
              {hasFilter && (
                <button onClick={clearAll} className="text-sm text-[#d4a853] hover:text-[#f0c060] transition-colors">
                  필터 초기화
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
              {cards.map(card => (
                <CardTile
                  key={card.id}
                  card={card}
                  displayLang={lang || undefined}
                  onHover={setHoverInfo}
                  isCollected={isCollected(card.id)}
                  onToggleCollection={() => toggleCollection(card.id)}
                />
              ))}
            </div>
          )}

          {/* 호버 프리뷰 — 데스크탑 xl+ 전용 */}
          {hoverInfo && hoverInfo.card.imageUrl && (() => {
            const r = hoverInfo.rect
            const spaceRight = window.innerWidth - r.right
            const left = spaceRight >= 208 ? r.right + 8 : r.left - 208
            const top  = Math.min(r.top, window.innerHeight - 300)
            return (
              <div
                className="fixed z-[9999] pointer-events-none hidden xl:block"
                style={{ left: Math.max(8, left), top: Math.max(8, top) }}
              >
                <div className="relative w-48 rounded-xl overflow-hidden shadow-2xl border border-[#d4a853]/30 bg-[#0f0b08]" style={{ aspectRatio: '3/4' }}>
                  <Image
                    src={resolveImageSrc(hoverInfo.card.imageUrl)!}
                    alt=""
                    fill
                    className="object-contain"
                    sizes="192px"
                  />
                </div>
                <div className="mt-1.5 px-1">
                  <p className="text-xs font-semibold text-[#f5ead8] line-clamp-1">
                    {hoverInfo.card.nameKo ?? hoverInfo.card.name}
                  </p>
                  <p className="text-[10px] text-[#7a6040] mt-0.5">
                    {hoverInfo.card.setName}
                    {hoverInfo.card.cardNumber && ` · ${hoverInfo.card.cardNumber}`}
                  </p>
                </div>
              </div>
            )
          })()}

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-1 pt-2">
              <button
                onClick={() => setPageParam(page - 1)}
                disabled={page === 1}
                className="h-9 w-9 flex items-center justify-center rounded-lg bg-[#1a1410] border border-[#2e2318] text-[#7a6040] hover:border-[#4a3520] hover:text-[#e8d5b0] disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={15} />
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                .reduce<(number | '...')[]>((acc, p, i, arr) => {
                  if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push('...')
                  acc.push(p)
                  return acc
                }, [])
                .map((p, i) =>
                  p === '...' ? (
                    <span key={`e-${i}`} className="h-9 w-9 flex items-center justify-center text-[#4a3520] text-sm">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setPageParam(p as number)}
                      className={`h-9 w-9 flex items-center justify-center rounded-lg text-sm font-medium transition-all ${
                        p === page
                          ? 'bg-[#2a1c08] text-[#e0b878] border border-[#3d2a0c]'
                          : 'bg-[#1a1410] border border-[#2e2318] text-[#7a6040] hover:border-[#4a3520] hover:text-[#e8d5b0]'
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}

              <button
                onClick={() => setPageParam(page + 1)}
                disabled={page === totalPages}
                className="h-9 w-9 flex items-center justify-center rounded-lg bg-[#1a1410] border border-[#2e2318] text-[#7a6040] hover:border-[#4a3520] hover:text-[#e8d5b0] disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── 페이지 ───────────────────────────────────────────────────────────────────

export default function CardsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-32">
          <div className="w-5 h-5 rounded-full border-2 border-[#2e2318] border-t-[#d4a853] animate-spin" />
        </div>
      }
    >
      <CardsContent />
    </Suspense>
  )
}

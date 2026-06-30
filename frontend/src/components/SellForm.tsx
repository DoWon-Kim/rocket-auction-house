'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery } from '@tanstack/react-query'
import Image from 'next/image'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { TCG_LABELS, CONDITION_LABELS, rarityLabel } from '@/lib/utils'
import Badge from '@/components/ui/Badge'
import { Search, Tag, Gavel, Handshake, Check, ChevronRight, Info, ImagePlus, X as XIcon, Loader2 } from 'lucide-react'

const TCG_TYPES = ['POKEMON', 'YUGIOH', 'MTG', 'DIGIMON', 'WEISS', 'OTHER'] as const
const CONDITIONS = ['MINT', 'NEAR_MINT', 'EXCELLENT', 'GOOD', 'LIGHT_PLAYED', 'PLAYED', 'POOR'] as const
const GRADING_COMPANIES = ['PSA', 'BGS', 'CGC', 'SGC', 'HGA', 'ACE', '기타'] as const
type GradingCompany = typeof GRADING_COMPANIES[number]
type ListingType = 'BUY_NOW' | 'AUCTION' | 'OFFER'
type Condition = typeof CONDITIONS[number]

const LISTING_TYPES = [
  { id: 'BUY_NOW' as const, label: '즉시구매', icon: <Tag size={20} className="text-[#e0b878]" />, desc: '고정 가격을 설정하고 구매자가 바로 구매' },
  { id: 'AUCTION' as const, label: '경매', icon: <Gavel size={20} className="text-[#f0a832]" />, desc: '시작가를 설정하고 시간 제한 경매 진행' },
  { id: 'OFFER' as const, label: '가격 제안', icon: <Handshake size={20} className="text-emerald-400" />, desc: '구매자가 가격을 제안하면 수락/거절' },
]

interface CardResult {
  id: string; name: string; nameKo?: string; nameJa?: string
  tcgType: string; setName: string; cardNumber?: string; rarity: string; imageUrl?: string
}

const inputCls = 'w-full bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] focus:border-[#d4a853]/40 rounded-xl px-4 py-3 text-sm text-[#f5ead8] placeholder:text-[#5a4830] focus:outline-none transition-colors'
const labelCls = 'block text-xs text-[#7a6040] uppercase tracking-wider font-semibold mb-1.5'

function StepIndicator({ step }: { step: number }) {
  const steps = ['카드 선택', '거래 방식', '상세 정보', '확인']
  return (
    <div className="flex items-center gap-0 flex-wrap">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            i + 1 === step ? 'bg-[#d4a853] text-white' :
            i + 1 < step  ? 'bg-[#2a1c08] text-[#e0b878]' : 'bg-[#1a1410] text-[#5a4830]'
          }`}>
            {i + 1 < step ? <Check size={13} /> : <span>{i + 1}</span>}
            {s}
          </div>
          {i < steps.length - 1 && <ChevronRight size={14} className="text-[#2e2318] mx-1" />}
        </div>
      ))}
    </div>
  )
}

interface SellFormProps {
  onSuccess?: (listingId: string) => void
}

export default function SellForm({ onSuccess }: SellFormProps) {
  const router = useRouter()
  const { user } = useAuthStore()
  const [step, setStep] = useState(1)

  const [cardSearch, setCardSearch] = useState('')
  const [tcgFilter, setTcgFilter] = useState('')
  const [selectedCard, setSelectedCard] = useState<CardResult | null>(null)
  const [listingType, setListingType] = useState<ListingType | null>(null)
  const [condition, setCondition] = useState<Condition>('NEAR_MINT')
  const [quantity, setQuantity] = useState('1')
  const [description, setDescription] = useState('')
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [uploadingImages, setUploadingImages] = useState(false)
  const [gradingCompany, setGradingCompany] = useState<GradingCompany | null>(null)
  const [gradingGrade, setGradingGrade] = useState('')
  const [buyNowPrice, setBuyNowPrice] = useState('')
  const [startingPrice, setStartingPrice] = useState('')
  const [auctionDays, setAuctionDays] = useState('3')
  const [auctionHours, setAuctionHours] = useState('0')
  const [instantBuyPrice, setInstantBuyPrice] = useState('')
  const [autoExtendMinutes, setAutoExtendMinutes] = useState('0')
  const [minOfferPrice, setMinOfferPrice] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, 5 - imageUrls.length)
    if (!files.length) return
    setUploadingImages(true)
    try {
      const uploaded = await Promise.all(
        files.map(file => {
          const form = new FormData()
          form.append('file', file)
          return api.post('/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data.url as string)
        })
      )
      setImageUrls(prev => [...prev, ...uploaded])
    } catch { alert('이미지 업로드에 실패했습니다.') }
    finally {
      setUploadingImages(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const { data: searchResults } = useQuery({
    queryKey: ['cards', 'search', cardSearch, tcgFilter],
    queryFn: () => api.get('/cards', { params: { q: cardSearch || undefined, tcgType: tcgFilter || undefined } }).then(r => r.data),
    enabled: cardSearch.length >= 1 || tcgFilter.length > 0,
  })

  const submitMut = useMutation({
    mutationFn: () => {
      const auctionEndsAt = listingType === 'AUCTION'
        ? new Date(Date.now() + (Number(auctionDays) * 86400 + Number(auctionHours) * 3600) * 1000).toISOString()
        : undefined
      return api.post('/listings', {
        cardId: selectedCard!.id, listingType, condition,
        quantity: Number(quantity), description: description || undefined,
        imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
        gradingCompany: gradingCompany ?? undefined,
        gradingGrade: gradingCompany && gradingGrade ? gradingGrade : undefined,
        buyNowPrice: listingType === 'BUY_NOW' ? Number(buyNowPrice) : undefined,
        startingPrice: listingType === 'AUCTION' ? Number(startingPrice) : undefined,
        auctionEndsAt,
        instantBuyPrice: listingType === 'AUCTION' && instantBuyPrice ? Number(instantBuyPrice) : undefined,
        autoExtendMinutes: listingType === 'AUCTION' && Number(autoExtendMinutes) > 0 ? Number(autoExtendMinutes) : undefined,
        minOfferPrice: listingType === 'OFFER' ? Number(minOfferPrice) : undefined,
      })
    },
    onSuccess: res => {
      if (onSuccess) onSuccess(res.data.id)
      else router.push(`/listings/${res.data.id}`)
    },
  })

  if (!user) {
    router.replace('/login')
    return null
  }

  function canGoNext() {
    if (step === 1) return !!selectedCard
    if (step === 2) return !!listingType
    if (step === 3) {
      if (!condition || !quantity || Number(quantity) < 1) return false
      if (listingType === 'BUY_NOW') return Number(buyNowPrice) > 0
      if (listingType === 'AUCTION') return Number(startingPrice) > 0 && (Number(auctionDays) > 0 || Number(auctionHours) > 0)
      if (listingType === 'OFFER') return Number(minOfferPrice) > 0
    }
    return true
  }

  function displayPrice() {
    if (listingType === 'BUY_NOW') return buyNowPrice ? `${Number(buyNowPrice).toLocaleString()}P` : '-'
    if (listingType === 'AUCTION') return startingPrice ? `${Number(startingPrice).toLocaleString()}P ~` : '-'
    if (listingType === 'OFFER') return minOfferPrice ? `${Number(minOfferPrice).toLocaleString()}P 이상` : '-'
    return '-'
  }

  function auctionEndDisplay() {
    const d = Number(auctionDays), h = Number(auctionHours)
    const parts = []
    if (d > 0) parts.push(`${d}일`)
    if (h > 0) parts.push(`${h}시간`)
    return parts.length ? parts.join(' ') + ' 후 종료' : '-'
  }

  return (
    <div className="space-y-6">
      <StepIndicator step={step} />

      {/* 1단계: 카드 선택 */}
      {step === 1 && (
        <div className="space-y-4">
          <h2 className="font-semibold text-lg">어떤 카드를 판매할까요?</h2>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setTcgFilter('')}
              className={`px-3 py-1.5 rounded-full text-sm transition-colors ${!tcgFilter ? 'bg-[#d4a853] text-white' : 'bg-[#1a1410] border border-[#2e2318] text-[#8a7055] hover:text-[#e8d5b0] hover:border-[#4a3520]'}`}>
              전체
            </button>
            {TCG_TYPES.map(t => (
              <button key={t} onClick={() => setTcgFilter(tcgFilter === t ? '' : t)}
                className={`px-3 py-1.5 rounded-full text-sm transition-colors ${tcgFilter === t ? 'bg-[#d4a853] text-white' : 'bg-[#1a1410] border border-[#2e2318] text-[#8a7055] hover:text-[#e8d5b0] hover:border-[#4a3520]'}`}>
                {TCG_LABELS[t]}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#5a4830]" />
            <input value={cardSearch} onChange={e => { setCardSearch(e.target.value); setSelectedCard(null) }}
              placeholder="카드명 또는 카드번호로 검색..."
              className={`${inputCls} pl-11`} />
          </div>
          {selectedCard && (
            <div className="bg-[#0d1a2e] border border-[#3d2a0c]/60 rounded-xl p-4 flex items-center gap-4">
              <div className="relative w-12 h-16 shrink-0 rounded-lg overflow-hidden bg-[#1a1410]">
                {selectedCard.imageUrl
                  ? <Image src={selectedCard.imageUrl} alt={selectedCard.name} fill className="object-cover" />
                  : <div className="absolute inset-0 flex items-center justify-center text-xl">🃏</div>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <p className="font-semibold text-[#f5ead8]">{selectedCard.nameKo ?? selectedCard.name}</p>
                  {selectedCard.nameKo && selectedCard.nameKo !== selectedCard.name && <p className="text-xs text-[#5a4830]">{selectedCard.name}</p>}
                  <Badge>{TCG_LABELS[selectedCard.tcgType]}</Badge>
                </div>
                <p className="text-xs text-[#8a7055]">{selectedCard.setName}{selectedCard.cardNumber && ` #${selectedCard.cardNumber}`} · {rarityLabel(selectedCard.rarity)}</p>
              </div>
              <Check size={20} className="text-[#d4a853] shrink-0" />
            </div>
          )}
          {!selectedCard && searchResults && searchResults.length > 0 && (
            <div className="bg-[#1a1410] border border-[#2e2318] rounded-xl overflow-hidden">
              {searchResults.map((c: CardResult, i: number) => (
                <button key={c.id} onClick={() => { setSelectedCard(c); setCardSearch(c.name) }}
                  className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-[#1a1208] transition-colors text-left ${i > 0 ? 'border-t border-[#2e2318]' : ''}`}>
                  <div className="relative w-9 h-12 shrink-0 rounded bg-[#1a1208] overflow-hidden">
                    {c.imageUrl ? <Image src={c.imageUrl} alt={c.name} fill className="object-cover" /> : <div className="absolute inset-0 flex items-center justify-center text-sm">🃏</div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-[#f5ead8]">{c.nameKo ?? c.name}</span>
                      <Badge>{TCG_LABELS[c.tcgType]}</Badge>
                    </div>
                    {c.nameKo && c.nameKo !== c.name && <p className="text-xs text-[#5a4830] mt-0.5">{c.name}</p>}
                    <p className="text-xs text-[#7a6040] mt-0.5">{c.setName}{c.cardNumber && ` #${c.cardNumber}`} · {rarityLabel(c.rarity)}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
          {!selectedCard && searchResults?.length === 0 && cardSearch && (
            <div className="bg-[#1a1410] border border-[#2e2318] rounded-xl p-6 text-center text-sm">
              <p className="text-[#8a7055] mb-1">"{cardSearch}"에 해당하는 카드가 없습니다.</p>
              <p className="text-xs text-[#5a4830]">관리자에게 카드 등록을 요청하세요.</p>
            </div>
          )}
        </div>
      )}

      {/* 2단계: 거래 방식 */}
      {step === 2 && (
        <div className="space-y-4">
          <h2 className="font-semibold text-lg">어떤 방식으로 판매할까요?</h2>
          <div className="grid grid-cols-1 gap-3">
            {LISTING_TYPES.map(t => (
              <button key={t.id} onClick={() => setListingType(t.id)}
                className={`flex items-center gap-4 p-5 rounded-xl border-2 text-left transition-colors ${listingType === t.id ? 'border-[#d4a853]/60 bg-[#0d1a2e]' : 'border-[#2e2318] bg-[#1a1410] hover:border-[#4a3520]'}`}>
                <div className="p-2.5 bg-[#1a1208] rounded-lg shrink-0">{t.icon}</div>
                <div>
                  <p className="font-semibold text-[#f5ead8]">{t.label}</p>
                  <p className="text-sm text-[#8a7055] mt-0.5">{t.desc}</p>
                </div>
                {listingType === t.id && <Check size={18} className="text-[#d4a853] ml-auto shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 3단계: 상세 정보 */}
      {step === 3 && (
        <div className="space-y-5">
          <h2 className="font-semibold text-lg">상세 정보를 입력해주세요.</h2>
          <div>
            <label className={labelCls}>카드 상태 *</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {CONDITIONS.map(c => (
                <button key={c} onClick={() => setCondition(c)}
                  className={`py-2 px-3 rounded-lg text-sm border transition-colors ${condition === c ? 'border-[#d4a853]/60 bg-[#0d1a2e] text-[#e0b878] font-medium' : 'border-[#2e2318] bg-[#1a1410] text-[#8a7055] hover:border-[#4a3520]'}`}>
                  {CONDITION_LABELS[c]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={labelCls}>수량 *</label>
            <input type="number" min="1" max="99" value={quantity} onChange={e => setQuantity(e.target.value)} className={inputCls} />
          </div>
          {listingType === 'BUY_NOW' && (
            <div>
              <label className={labelCls}>판매 가격 (P) *</label>
              <input type="number" min="1" value={buyNowPrice} onChange={e => setBuyNowPrice(e.target.value)} placeholder="ex) 50000" className={inputCls} />
            </div>
          )}
          {listingType === 'AUCTION' && (
            <div className="space-y-3">
              <div>
                <label className={labelCls}>경매 시작가 (P) *</label>
                <input type="number" min="1" value={startingPrice} onChange={e => setStartingPrice(e.target.value)} placeholder="ex) 10000" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>경매 기간 *</label>
                <div className="flex gap-3">
                  <select value={auctionDays} onChange={e => setAuctionDays(e.target.value)} className={`flex-1 ${inputCls}`}>
                    {[0,1,2,3,5,7,14].map(d => <option key={d} value={d}>{d}일</option>)}
                  </select>
                  <select value={auctionHours} onChange={e => setAuctionHours(e.target.value)} className={`flex-1 ${inputCls}`}>
                    {[0,1,2,3,6,12].map(h => <option key={h} value={h}>{h}시간</option>)}
                  </select>
                </div>
                {(Number(auctionDays) > 0 || Number(auctionHours) > 0) && (
                  <p className="text-xs text-gray-500 mt-1.5">종료: {new Date(Date.now() + (Number(auctionDays) * 86400 + Number(auctionHours) * 3600) * 1000).toLocaleString('ko-KR')}</p>
                )}
              </div>
              <div>
                <label className={labelCls}>즉시낙찰가 (P) <span className="text-gray-500 font-normal">(선택)</span></label>
                <input type="number" min="1" value={instantBuyPrice} onChange={e => setInstantBuyPrice(e.target.value)} placeholder="이 금액 이상 입찰 시 즉시 낙찰" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>스나이핑 방지 <span className="text-gray-500 font-normal">(선택)</span></label>
                <select value={autoExtendMinutes} onChange={e => setAutoExtendMinutes(e.target.value)} className={inputCls}>
                  <option value="0">사용 안 함</option>
                  <option value="3">마감 3분 전 입찰 시 3분 연장</option>
                  <option value="5">마감 5분 전 입찰 시 5분 연장</option>
                  <option value="10">마감 10분 전 입찰 시 10분 연장</option>
                </select>
              </div>
            </div>
          )}
          {listingType === 'OFFER' && (
            <div>
              <label className={labelCls}>최소 제안가 (P) *</label>
              <input type="number" min="1" value={minOfferPrice} onChange={e => setMinOfferPrice(e.target.value)} placeholder="ex) 30000" className={inputCls} />
              <p className="text-xs text-[#5a4830] mt-1.5">이 금액 미만의 제안은 자동 차단됩니다.</p>
            </div>
          )}
          <div>
            <label className={labelCls}>그레이딩 <span className="text-gray-500 font-normal">(선택)</span></label>
            <div className="flex flex-wrap gap-2 mb-3">
              <button onClick={() => { setGradingCompany(null); setGradingGrade('') }}
                className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${!gradingCompany ? 'border-[#d4a853]/60 bg-[#0d1a2e] text-[#e0b878] font-medium' : 'border-[#2e2318] bg-[#1a1410] text-[#8a7055] hover:border-[#4a3520]'}`}>
                None
              </button>
              {GRADING_COMPANIES.map(c => (
                <button key={c} onClick={() => setGradingCompany(c)}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${gradingCompany === c ? 'border-[#d4a853]/60 bg-[#0d1a2e] text-[#e0b878] font-medium' : 'border-[#2e2318] bg-[#1a1410] text-[#8a7055] hover:border-[#4a3520]'}`}>
                  {c}
                </button>
              ))}
            </div>
            {gradingCompany && (
              <input type="text" value={gradingGrade} onChange={e => setGradingGrade(e.target.value)}
                placeholder={`${gradingCompany} 등급 입력 (예: 10, 9.5, 8)`} maxLength={20} className={inputCls} />
            )}
          </div>
          <div>
            <label className={labelCls}>카드 사진 <span className="text-gray-500 font-normal">(선택, 최대 5장)</span></label>
            <div className="flex flex-wrap gap-2">
              {imageUrls.map((url, i) => (
                <div key={url} className="relative w-20 h-28 rounded-lg overflow-hidden border border-[#2e2318] group">
                  <Image src={url} alt={`카드 사진 ${i + 1}`} fill className="object-cover" />
                  <button onClick={() => setImageUrls(prev => prev.filter((_, idx) => idx !== i))}
                    className="absolute top-1 right-1 bg-black/70 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <XIcon size={12} />
                  </button>
                </div>
              ))}
              {imageUrls.length < 5 && (
                <button onClick={() => fileInputRef.current?.click()} disabled={uploadingImages}
                  className="w-20 h-28 rounded-lg border-2 border-dashed border-[#4a3520] hover:border-[#d4a853]/60 flex flex-col items-center justify-center gap-1 text-[#5a4830] hover:text-[#d4a853] transition-colors disabled:opacity-50">
                  {uploadingImages ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}
                  <span className="text-xs">{uploadingImages ? '업로드 중' : '사진 추가'}</span>
                </button>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
          </div>
          <div>
            <label className={labelCls}>추가 설명 <span className="text-gray-500 font-normal">(선택)</span></label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
              placeholder="카드 상태, 특이사항 등을 자유롭게 적어주세요." className={inputCls} />
          </div>
        </div>
      )}

      {/* 4단계: 확인 */}
      {step === 4 && selectedCard && listingType && (
        <div className="space-y-4">
          <h2 className="font-semibold text-lg">등록 내용을 확인해주세요.</h2>
          <div className="bg-[#1a1410] border border-[#2e2318] rounded-2xl overflow-hidden">
            <div className="p-5 flex items-center gap-4 border-b border-[#2e2318]">
              <div className="relative w-14 h-20 shrink-0 rounded-lg overflow-hidden bg-[#1a1208]">
                {selectedCard.imageUrl
                  ? <Image src={selectedCard.imageUrl} alt={selectedCard.name} fill className="object-cover" />
                  : <div className="absolute inset-0 flex items-center justify-center text-2xl">🃏</div>}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <p className="font-bold text-[#f5ead8]">{selectedCard.nameKo ?? selectedCard.name}</p>
                  {selectedCard.nameKo && selectedCard.nameKo !== selectedCard.name && <p className="text-xs text-[#5a4830]">{selectedCard.name}</p>}
                  <Badge>{TCG_LABELS[selectedCard.tcgType]}</Badge>
                </div>
                <p className="text-sm text-[#8a7055]">{selectedCard.setName}{selectedCard.cardNumber && ` #${selectedCard.cardNumber}`} · {rarityLabel(selectedCard.rarity)}</p>
              </div>
            </div>
            <div className="divide-y divide-[#2e2318]">
              {[
                { label: '거래 방식', value: listingType === 'BUY_NOW' ? '즉시구매' : listingType === 'AUCTION' ? '경매' : '가격 제안' },
                { label: '카드 상태', value: CONDITION_LABELS[condition] },
                { label: '그레이딩', value: gradingCompany ? `${gradingCompany}${gradingGrade ? ` ${gradingGrade}` : ''}` : 'None' },
                { label: '수량', value: `${quantity}장` },
                { label: '가격', value: displayPrice() },
                ...(listingType === 'AUCTION' ? [{ label: '경매 기간', value: auctionEndDisplay() }] : []),
                ...(listingType === 'AUCTION' && instantBuyPrice ? [{ label: '즉시낙찰가', value: `${Number(instantBuyPrice).toLocaleString()}P` }] : []),
                ...(description ? [{ label: '설명', value: description }] : []),
              ].map(row => (
                <div key={row.label} className="flex items-start justify-between px-5 py-3 text-sm">
                  <span className="text-[#8a7055]">{row.label}</span>
                  <span className="font-medium text-right max-w-xs text-[#f5ead8]">{row.value}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-start gap-2.5 bg-[#2a1f08]/60 border border-[#3d2e0c] rounded-xl p-4 text-sm text-[#f0a832]">
            <Info size={16} className="shrink-0 mt-0.5" />
            <p>등록 후에는 리스팅을 수정할 수 없습니다. 내용을 다시 한번 확인해주세요.</p>
          </div>
          {submitMut.isError && (
            <p className="text-sm text-red-400">
              {(submitMut.error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '등록에 실패했습니다.'}
            </p>
          )}
        </div>
      )}

      {/* 네비게이션 */}
      <div className="flex items-center justify-between pt-2 border-t border-[#2e2318]">
        <button onClick={() => setStep(s => s - 1)} disabled={step === 1}
          className="px-5 py-2.5 bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] text-[#9e8a6a] disabled:opacity-30 disabled:cursor-not-allowed text-sm rounded-xl transition-colors">
          이전
        </button>
        {step < 4 ? (
          <button onClick={() => setStep(s => s + 1)} disabled={!canGoNext()}
            className="px-6 py-2.5 bg-[#d4a853] hover:bg-[#c49440] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm rounded-xl transition-colors shadow-[0_0_16px_rgba(212,168,83,0.2)]">
            다음
          </button>
        ) : (
          <button onClick={() => submitMut.mutate()} disabled={submitMut.isPending}
            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-sm rounded-xl transition-colors flex items-center gap-2">
            <Check size={16} />
            {submitMut.isPending ? '등록 중...' : '판매 등록'}
          </button>
        )}
      </div>
    </div>
  )
}

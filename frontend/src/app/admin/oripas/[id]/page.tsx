'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import { ChevronLeft, Plus, Trash2, X, Check, Trophy } from 'lucide-react'
import Badge from '@/components/ui/Badge'

interface OripaItem {
  id: string
  quantity: number
  grade: number
  weight: number
  isLastOne: boolean
  card: { id: string; name: string; rarity: string; setName: string }
}

interface Card {
  id: string
  name: string
  setName: string
  rarity: string
  tcgType: string
}

const gradeLabel = (g: number) => g === 3 ? '★★★ 최상위' : g === 2 ? '★★ 레어' : '★ 일반'
const gradeVariant = (g: number): 'yellow' | 'indigo' | 'default' => g === 3 ? 'yellow' : g === 2 ? 'indigo' : 'default'

export default function AdminOripaItemsPage() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [cardSearch, setCardSearch] = useState('')
  const [selectedCard, setSelectedCard] = useState<Card | null>(null)
  const [quantity, setQuantity] = useState('1')
  const [grade, setGrade] = useState('1')
  const [weight, setWeight] = useState('0')
  const [isLastOne, setIsLastOne] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const { data: oripa } = useQuery({
    queryKey: ['admin', 'oripa', id],
    queryFn: () => api.get(`/admin/oripas`).then((r) => (r.data as Array<{ id: string; title: string; items: OripaItem[] }>).find((o) => o.id === id)),
  })

  const { data: cardResults } = useQuery({
    queryKey: ['admin', 'cards', 'search', cardSearch],
    queryFn: () => api.get('/admin/cards', { params: { q: cardSearch || undefined, limit: 10 } }).then((r) => r.data),
    enabled: cardSearch.length > 0,
  })

  const addMut = useMutation({
    mutationFn: () => api.post(`/admin/oripas/${id}/items`, {
      cardId: selectedCard!.id,
      quantity: Number(quantity),
      grade: Number(grade),
      weight: Number(weight),
      isLastOne,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'oripa', id] })
      qc.invalidateQueries({ queryKey: ['admin', 'oripas'] })
      setShowAdd(false); setSelectedCard(null); setCardSearch('')
      setQuantity('1'); setGrade('1'); setWeight('0'); setIsLastOne(false)
      setMsg({ type: 'ok', text: '카드가 추가되었습니다.' })
    },
    onError: (e: unknown) => { const err = e as { response?: { data?: { message?: string } } }; setMsg({ type: 'err', text: err.response?.data?.message ?? '오류가 발생했습니다.' }) },
  })

  const removeMut = useMutation({
    mutationFn: (itemId: string) => api.delete(`/admin/oripas/${id}/items/${itemId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'oripa', id] })
      qc.invalidateQueries({ queryKey: ['admin', 'oripas'] })
    },
  })

  const items: OripaItem[] = oripa?.items ?? []

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/admin/oripas" className="text-gray-400 hover:text-white transition-colors">
          <ChevronLeft size={20} />
        </Link>
        <h1 className="text-2xl font-bold">{oripa?.title ?? '...'} — 수록 카드</h1>
      </div>

      {msg && (
        <div className={`px-4 py-2 rounded-lg text-sm flex items-center justify-between ${msg.type === 'ok' ? 'bg-emerald-900/30 border border-emerald-700 text-emerald-300' : 'bg-red-900/30 border border-red-700 text-red-300'}`}>
          {msg.text}
          <button onClick={() => setMsg(null)}><X size={14} /></button>
        </div>
      )}

      <button onClick={() => setShowAdd(true)}
        className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
        <Plus size={16} /> 카드 추가
      </button>

      {/* 카드 추가 폼 */}
      {showAdd && (
        <div className="bg-gray-900 border border-indigo-500/50 rounded-xl p-5 space-y-4">
          <h2 className="font-semibold">카드 추가</h2>

          {/* 카드 검색 */}
          <div className="space-y-2">
            <label className="block text-xs text-gray-400">카드 검색 *</label>
            <input
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
              value={cardSearch}
              onChange={(e) => { setCardSearch(e.target.value); setSelectedCard(null) }}
              placeholder="카드명 입력..."
            />
            {cardResults?.cards?.length > 0 && !selectedCard && (
              <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                {cardResults.cards.map((c: Card) => (
                  <button key={c.id} onClick={() => { setSelectedCard(c); setCardSearch(c.name) }}
                    className="w-full text-left px-3 py-2.5 hover:bg-gray-700 text-sm border-b border-gray-700/50 last:border-0 transition-colors">
                    <span className="font-medium">{c.name}</span>
                    <span className="text-gray-400 ml-2">{c.setName} · {c.rarity}</span>
                  </button>
                ))}
              </div>
            )}
            {selectedCard && (
              <div className="flex items-center gap-2 bg-indigo-600/20 border border-indigo-500/40 rounded-lg px-3 py-2 text-sm">
                <Check size={14} className="text-indigo-400 shrink-0" />
                <span className="font-medium">{selectedCard.name}</span>
                <span className="text-gray-400">{selectedCard.setName} · {selectedCard.rarity}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">수량</label>
              <input type="number" min="1" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">등급</label>
              <select className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                value={grade} onChange={(e) => setGrade(e.target.value)}>
                <option value="1">★ 일반 (확률 높음)</option>
                <option value="2">★★ 레어 (중간)</option>
                <option value="3">★★★ 최상위 (확률 낮음)</option>
              </select>
            </div>
          </div>

          {/* 커스텀 가중치 & 라스트 원 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                커스텀 가중치
                <span className="text-gray-600 ml-1">(0 = 등급 기반 자동)</span>
              </label>
              <input type="number" min="0" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                value={weight} onChange={(e) => setWeight(e.target.value)} />
            </div>
            <div className="flex flex-col justify-end">
              <label className="flex items-center gap-2.5 cursor-pointer select-none py-2">
                <div
                  onClick={() => setIsLastOne((v) => !v)}
                  className={`relative w-10 h-5 rounded-full transition-colors ${isLastOne ? 'bg-orange-500' : 'bg-gray-700'}`}
                >
                  <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${isLastOne ? 'translate-x-5' : ''}`} />
                </div>
                <div>
                  <div className="flex items-center gap-1 text-sm font-medium">
                    <Trophy size={13} className={isLastOne ? 'text-orange-400' : 'text-gray-500'} />
                    Last One 보장
                  </div>
                  <div className="text-xs text-gray-500">마지막 슬롯 확정 획득</div>
                </div>
              </label>
            </div>
          </div>

          {isLastOne && (
            <div className="flex items-center gap-2 bg-orange-500/10 border border-orange-500/30 rounded-lg px-3 py-2 text-xs text-orange-300">
              <Trophy size={12} /> 이 카드는 오리파의 마지막 슬롯에서 반드시 등장합니다.
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={() => addMut.mutate()} disabled={addMut.isPending || !selectedCard}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1">
              <Check size={14} /> {addMut.isPending ? '추가 중...' : '추가'}
            </button>
            <button onClick={() => { setShowAdd(false); setSelectedCard(null); setCardSearch(''); setWeight('0'); setIsLastOne(false) }}
              className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm transition-colors flex items-center gap-1">
              <X size={14} /> 취소
            </button>
          </div>
        </div>
      )}

      {/* 아이템 목록 */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-500 text-xs">
              <th className="text-left px-4 py-3">카드명</th>
              <th className="text-left px-4 py-3">세트</th>
              <th className="text-left px-4 py-3">등급</th>
              <th className="text-right px-4 py-3">가중치</th>
              <th className="text-right px-4 py-3">수량</th>
              <th className="text-center px-4 py-3">Last One</th>
              <th className="text-right px-4 py-3">관리</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-600">수록 카드가 없습니다.</td></tr>
            ) : items.map((item) => (
              <tr key={item.id} className={`border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors ${item.isLastOne ? 'bg-orange-500/5' : ''}`}>
                <td className="px-4 py-3 font-medium">{item.card.name}</td>
                <td className="px-4 py-3 text-gray-400 text-xs">{item.card.setName}</td>
                <td className="px-4 py-3"><Badge variant={gradeVariant(item.grade)}>{gradeLabel(item.grade)}</Badge></td>
                <td className="px-4 py-3 text-right text-gray-400 text-xs">{item.weight > 0 ? item.weight : '자동'}</td>
                <td className="px-4 py-3 text-right text-gray-300">{item.quantity}장</td>
                <td className="px-4 py-3 text-center">
                  {item.isLastOne && <Trophy size={14} className="text-orange-400 mx-auto" />}
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => { if (confirm('이 카드를 제거할까요?')) removeMut.mutate(item.id) }}
                    className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors">
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-4 py-2 border-t border-gray-800 text-xs text-gray-500">총 {items.length}종 수록</div>
      </div>
    </div>
  )
}

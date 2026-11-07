'use client'

import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAuthStore, useAuthHydrated } from '@/lib/store'
import { connectSocket } from '@/lib/socket'
import Image from 'next/image'
import { MessageCircle, Search } from 'lucide-react'
import { listingTitle, listingThumb, timeAgo } from '@/lib/market'

interface MsgSender { id: string; nickname: string; avatarUrl: string | null }
interface LastMsg { id: string; content: string; createdAt: string; senderId: string; readAt: string | null; type?: string; imageUrls?: string[]; deletedAt?: string | null }
interface RoomRow {
  id: string
  listingId: string
  listing: { id: string; status: string; title: string | null; imageUrls: string[]; card: { name: string; nameKo: string | null; imageUrl: string | null } }
  buyer: MsgSender
  seller: MsgSender
  transaction: { txStatus: string; escrowStatus: string; finalPrice: number } | null
  messages: LastMsg[]
  _count: { messages: number }
  lastMessageAt: string | null
}

// 거래 단계 배지 (내 할 일 우선)
function stageBadge(room: RoomRow, isBuyer: boolean): { label: string; cls: string } | null {
  const tx = room.transaction
  if (tx) {
    if (tx.txStatus === 'PENDING_SHIPMENT') return isBuyer ? { label: '발송 대기', cls: 'bg-surface-2 text-muted' } : { label: '발송 필요', cls: 'bg-amber-500/15 text-amber-300' }
    if (tx.txStatus === 'SHIPPED') return isBuyer ? { label: '구매확정 필요', cls: 'bg-amber-500/15 text-amber-300' } : { label: '배송중', cls: 'bg-surface-2 text-muted' }
    if (tx.txStatus === 'COMPLETED' || tx.txStatus === 'AUTO_COMPLETED') return { label: '거래완료', cls: 'bg-emerald-500/10 text-emerald-300' }
    return null
  }
  if (room.listing.status === 'RESERVED') return { label: '예약중', cls: 'bg-emerald-500/15 text-emerald-300' }
  if (room.listing.status === 'SOLD') return { label: '판매완료', cls: 'bg-surface-2 text-muted' }
  return null
}

// 목록에 보여줄 마지막 메시지 한 줄
function previewOf(last: LastMsg | undefined, meId: string) {
  if (!last) return '메시지 없음'
  if (last.deletedAt) return '삭제된 메시지'
  const icon = last.type === 'SYSTEM' ? '📦 ' : last.type === 'OFFER' ? '💰 ' : ''
  const body = last.content ? last.content.split('\n')[0] : last.imageUrls?.length ? `사진 ${last.imageUrls.length}장` : ''
  return `${last.senderId === meId && last.type === 'TEXT' ? '나: ' : ''}${icon}${body}`
}

export default function ChatListPage() {
  const { user } = useAuthStore()
  const router = useRouter()
  const qc = useQueryClient()
  const hydrated = useAuthHydrated()
  const [filter, setFilter] = useState<'all' | 'buy' | 'sell'>('all')
  const [q, setQ] = useState('')

  useEffect(() => {
    if (!user) return
    const socket = connectSocket()
    const refresh = () => qc.invalidateQueries({ queryKey: ['chat-rooms'] })
    socket.on('chat:room-updated', refresh)
    return () => { socket.off('chat:room-updated', refresh) }
  }, [user, qc])

  const { data: rooms, isLoading } = useQuery({
    queryKey: ['chat-rooms'],
    queryFn: () => api.get<RoomRow[]>('/chat/rooms').then(r => r.data),
    enabled: !!user,
    refetchInterval: 30000,
  })

  useEffect(() => { if (hydrated && !user) router.replace('/login') }, [hydrated, user, router])
  if (!user) return null

  const kw = q.trim().toLowerCase()
  const shown = (rooms ?? [])
    .filter(r => filter === 'all' || (filter === 'buy' ? r.buyer.id === user.id : r.seller.id === user.id))
    .filter(r => !kw || [r.buyer.nickname, r.seller.nickname, listingTitle(r.listing)].some(t => t.toLowerCase().includes(kw)))
  const unreadTotal = (rooms ?? []).reduce((n, r) => n + r._count.messages, 0)

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-fg flex items-center gap-2">
          <MessageCircle size={20} className="text-accent-fg" />채팅
          {unreadTotal > 0 && <span className="text-sm text-accent-fg tabular-nums">{unreadTotal}</span>}
        </h1>
        <div className="flex gap-1 bg-surface border border-line rounded-full p-1 text-xs">
          {([['all', '전체'], ['buy', '구매'], ['sell', '판매']] as const).map(([v, label]) => (
            <button key={v} onClick={() => setFilter(v)} className={`px-3 py-1 rounded-full font-medium ${filter === v ? 'bg-accent-tint text-accent-soft' : 'text-muted hover:text-fg'}`}>{label}</button>
          ))}
        </div>
      </div>

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="닉네임·상품 이름으로 찾기" aria-label="채팅 검색"
          className="w-full h-10 pl-9 pr-3 rounded-xl bg-surface border border-line text-sm text-fg placeholder:text-subtle focus:outline-none focus:border-accent/50" />
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="bg-surface border border-line rounded-xl h-20 animate-pulse" />)}</div>
      ) : !shown.length ? (
        <div className="text-center py-16 text-subtle">
          <MessageCircle size={36} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">채팅 내역이 없어요.</p>
          <p className="text-xs mt-1">마음에 드는 상품에서 &lsquo;채팅하기&rsquo;를 눌러보세요.</p>
        </div>
      ) : (
        <div className="divide-y divide-line rounded-2xl border border-line bg-surface overflow-hidden">
          {shown.map(room => {
            const isBuyer = room.buyer.id === user.id
            const other = isBuyer ? room.seller : room.buyer
            const last = room.messages[0]
            const unread = room._count.messages
            const thumb = listingThumb(room.listing)
            const badge = stageBadge(room, isBuyer)
            return (
              <button key={room.id} onClick={() => router.push(`/chat/${room.id}`)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-2 transition-colors">
                <span className="relative w-11 h-11 shrink-0 rounded-full bg-surface-2 border border-line overflow-hidden flex items-center justify-center text-sm font-semibold text-muted">
                  {other.avatarUrl ? <Image src={other.avatarUrl} alt="" fill sizes="44px" className="object-cover" /> : other.nickname[0]?.toUpperCase()}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-fg truncate">{other.nickname}</span>
                    <span className="text-[10px] text-subtle shrink-0">{isBuyer ? '판매자' : '구매자'}</span>
                    {last && <span className="text-[11px] text-subtle shrink-0">· {timeAgo(last.createdAt)}</span>}
                  </span>
                  <span className={`block text-sm truncate mt-0.5 ${unread > 0 ? 'text-fg font-medium' : 'text-muted'}`}>
                    {previewOf(last, user.id)}
                  </span>
                  <span className="flex items-center gap-1.5 mt-1">
                    {badge && <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${badge.cls}`}>{badge.label}</span>}
                    <span className="text-[11px] text-subtle truncate">{listingTitle(room.listing)}</span>
                  </span>
                </span>
                {unread > 0 && <span className="bg-accent text-white text-[11px] font-bold min-w-5 h-5 px-1 rounded-full flex items-center justify-center shrink-0">{unread > 99 ? '99+' : unread}</span>}
                <span className="relative w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-sunken border border-line">
                  {thumb && <Image src={thumb} alt="" fill sizes="48px" className="object-cover" />}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

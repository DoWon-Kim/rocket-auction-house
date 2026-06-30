'use client'

import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { connectSocket } from '@/lib/socket'
import Image from 'next/image'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { MessageCircle } from 'lucide-react'

interface MsgSender { id: string; nickname: string; avatarUrl: string | null }
interface LastMsg { id: string; content: string; createdAt: string; senderId: string; readAt: string | null }
interface RoomRow {
  id: string
  listingId: string
  listing: { card: { name: string; nameKo: string | null; imageUrl: string | null } }
  buyer: MsgSender
  seller: MsgSender
  transaction: { escrowStatus: string; finalPrice: number } | null
  messages: LastMsg[]
  _count: { messages: number }
  lastMessageAt: string | null
}

function Avatar({ user, size = 8 }: { user: MsgSender; size?: number }) {
  const cls = `w-${size} h-${size} rounded-full bg-[#1a1208] border border-[#2e2318] flex items-center justify-center text-xs font-semibold overflow-hidden shrink-0 text-[#8a7055]`
  return (
    <div className={cls}>
      {user.avatarUrl
        ? <Image src={user.avatarUrl} alt={user.nickname} width={32} height={32} className="object-cover w-full h-full" />
        : <span>{user.nickname[0]?.toUpperCase()}</span>}
    </div>
  )
}

export default function ChatListPage() {
  const { user } = useAuthStore()
  const router = useRouter()

  useEffect(() => { if (user) connectSocket() }, [user])

  const { data: rooms, isLoading } = useQuery({
    queryKey: ['chat-rooms'],
    queryFn: () => api.get<RoomRow[]>('/chat/rooms').then(r => r.data),
    enabled: !!user,
    refetchInterval: 10000,
  })

  if (!user) { router.replace('/login'); return null }

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <MessageCircle size={20} className="text-[#d4a853]" />
        <h1 className="text-xl font-bold text-[#f5ead8]">채팅</h1>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-[#1a1410] border border-[#2e2318] rounded-xl h-20 animate-pulse" />
          ))}
        </div>
      ) : !rooms?.length ? (
        <div className="text-center py-16 text-[#5a4830]">
          <MessageCircle size={36} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">채팅 내역이 없습니다.</p>
          <p className="text-xs mt-1 text-[#5a4830]">거래 상대방과 채팅을 시작해보세요.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {rooms.map(room => {
            const isMe = room.buyer.id === user.id
            const other = isMe ? room.seller : room.buyer
            const last = room.messages[0]
            const unread = room._count.messages
            const cardName = room.listing.card.nameKo ?? room.listing.card.name

            return (
              <button key={room.id} onClick={() => router.push(`/chat/${room.id}`)}
                className="w-full flex items-center gap-3 bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] rounded-xl px-4 py-3 text-left transition-colors group">
                <Avatar user={other} size={11} />
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-[#f5ead8]">{other.nickname}</span>
                    {last && (
                      <span className="text-xs text-[#5a4830] shrink-0">
                        {format(new Date(last.createdAt), 'MM.dd HH:mm', { locale: ko })}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#5a4830] truncate">{cardName}</p>
                  {last ? (
                    <p className={`text-sm truncate ${unread > 0 ? 'text-[#f5ead8] font-medium' : 'text-[#8a7055]'}`}>
                      {last.senderId === user.id ? '나: ' : ''}{last.content}
                    </p>
                  ) : (
                    <p className="text-sm text-[#5a4830]">메시지 없음</p>
                  )}
                </div>
                {unread > 0 && (
                  <span className="bg-[#d4a853] text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center shrink-0 shadow-[0_0_8px_rgba(212,168,83,0.4)]">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
                {room.transaction?.escrowStatus === 'HELD' && isMe && (
                  <span className="text-xs bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 px-2 py-0.5 rounded-full shrink-0">
                    수령확인
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

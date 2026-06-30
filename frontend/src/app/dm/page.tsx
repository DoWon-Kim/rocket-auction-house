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
import { MessageCircle, Users } from 'lucide-react'
import Link from 'next/link'

interface MsgSender { id: string; nickname: string; avatarUrl: string | null }
interface LastMsg { id: string; content: string; createdAt: string; senderId: string; readAt: string | null }
interface DmRoomRow {
  id: string
  user1: MsgSender
  user2: MsgSender
  messages: LastMsg[]
  _count: { messages: number }
  lastMessageAt: string | null
}

function Avatar({ user, size = 9 }: { user: MsgSender; size?: number }) {
  const cls = `w-${size} h-${size} rounded-full bg-[#1a1208] border border-[#2e2318] flex items-center justify-center text-sm font-semibold overflow-hidden shrink-0 text-[#8a7055]`
  return (
    <div className={cls}>
      {user.avatarUrl
        ? <Image src={user.avatarUrl} alt={user.nickname} width={36} height={36} className="object-cover w-full h-full" />
        : <span>{user.nickname[0]?.toUpperCase()}</span>}
    </div>
  )
}

export default function DmListPage() {
  const { user } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    if (user === null) router.replace('/login')
  }, [user, router])

  useEffect(() => {
    if (user) connectSocket()
  }, [user])

  const { data: rooms = [], isLoading } = useQuery({
    queryKey: ['dm-rooms'],
    queryFn: () => api.get<DmRoomRow[]>('/dm/rooms').then(r => r.data),
    enabled: !!user,
    refetchInterval: 15_000,
  })

  if (!user) return null

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-[#f5ead8]">DM</h1>
        <Link href="/my/friends"
          className="flex items-center gap-1.5 text-xs text-[#d4a853] hover:text-[#e0b878] transition-colors">
          <Users size={13} /> 친구 관리
        </Link>
      </div>

      {isLoading && <p className="text-center text-[#5a4830] py-12 text-sm">로딩 중...</p>}

      {!isLoading && rooms.length === 0 && (
        <div className="text-center py-16">
          <MessageCircle size={36} className="mx-auto mb-3 text-[#4a3520]" />
          <p className="text-sm text-[#8a7055]">아직 DM이 없습니다.</p>
          <p className="text-xs text-[#5a4830] mt-1">친구를 추가하면 DM을 시작할 수 있습니다.</p>
          <Link href="/my/friends" className="inline-block mt-4 text-xs text-[#d4a853] hover:text-[#e0b878] border border-[#d4a853]/30 px-3 py-1.5 rounded-lg">
            친구 관리로 이동
          </Link>
        </div>
      )}

      <div className="space-y-1">
        {rooms.map(room => {
          const partner = room.user1.id === user.id ? room.user2 : room.user1
          const lastMsg  = room.messages[0]
          const unread   = room._count.messages
          return (
            <Link key={room.id} href={`/dm/${room.id}`}
              className="flex items-center gap-3 px-4 py-3 bg-[#150f0c] border border-[#2e2318] hover:border-[#4a3520] rounded-xl transition-colors">
              <div className="relative">
                <Avatar user={partner} />
                {unread > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#d4a853] text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <p className={`text-sm font-semibold ${unread > 0 ? 'text-white' : 'text-[#e8d5b0]'}`}>{partner.nickname}</p>
                  {room.lastMessageAt && (
                    <span className="text-[10px] text-[#5a4830] shrink-0">
                      {format(new Date(room.lastMessageAt), 'M/d HH:mm', { locale: ko })}
                    </span>
                  )}
                </div>
                {lastMsg && (
                  <p className={`text-xs truncate mt-0.5 ${unread > 0 ? 'text-[#e8d5b0]' : 'text-[#7a6040]'}`}>
                    {lastMsg.senderId === user.id ? '나: ' : ''}{lastMsg.content}
                  </p>
                )}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

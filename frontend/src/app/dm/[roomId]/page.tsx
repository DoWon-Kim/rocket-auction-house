'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { connectSocket, getSocket } from '@/lib/socket'
import Image from 'next/image'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Send, ArrowLeft, CheckCheck, Users } from 'lucide-react'

interface MsgSender { id: string; nickname: string; avatarUrl: string | null }
interface DmMsg { id: string; content: string; createdAt: string; readAt: string | null; senderId: string; sender: MsgSender }
interface DmRoom {
  id: string
  user1Id: string
  user2Id: string
  user1: MsgSender
  user2: MsgSender
  messages: DmMsg[]
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

export default function DmRoomPage() {
  const { roomId } = useParams<{ roomId: string }>()
  const { user } = useAuthStore()
  const router = useRouter()
  const [messages, setMessages] = useState<DmMsg[]>([])
  const [input, setInput] = useState('')
  const [connected, setConnected] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)

  const { data: room } = useQuery({
    queryKey: ['dm-room-detail', roomId],
    queryFn: () => api.get<DmRoom>(`/dm/rooms/${roomId}`).then(r => r.data),
    enabled: !!user && !!roomId,
    staleTime: Infinity,
  })

  useEffect(() => {
    if (room) setMessages(room.messages)
  }, [room])

  useEffect(() => {
    if (!user) return
    const s = connectSocket()
    s.emit('dm:join', roomId)
    setConnected(s.connected)

    const onConnect    = () => setConnected(true)
    const onDisconnect = () => setConnected(false)
    const onMessage    = (msg: DmMsg) => {
      setMessages(prev => [...prev, msg])
      if (msg.senderId !== user.id) s.emit('dm:read', roomId)
    }
    const onRead = () => {
      setMessages(prev => prev.map(m => ({ ...m, readAt: m.readAt ?? new Date().toISOString() })))
    }

    s.on('connect',     onConnect)
    s.on('disconnect',  onDisconnect)
    s.on('dm:message',  onMessage)
    s.on('dm:read',     onRead)

    return () => {
      s.off('connect',     onConnect)
      s.off('disconnect',  onDisconnect)
      s.off('dm:message',  onMessage)
      s.off('dm:read',     onRead)
    }
  }, [roomId, user])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMsg = useCallback(() => {
    const text = input.trim()
    if (!text || !connected) return
    const s = getSocket()
    s.emit('dm:send', { roomId, content: text })
    setInput('')
    inputRef.current?.focus()
  }, [input, connected, roomId])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg() }
  }

  if (!user) return null

  const partner = room
    ? (room.user1Id === user.id ? room.user2 : room.user1)
    : null

  function groupByDay(msgs: DmMsg[]) {
    const groups: { date: string; items: DmMsg[] }[] = []
    for (const m of msgs) {
      const date = format(new Date(m.createdAt), 'yyyy년 M월 d일', { locale: ko })
      if (!groups.length || groups[groups.length - 1].date !== date) groups.push({ date, items: [m] })
      else groups[groups.length - 1].items.push(m)
    }
    return groups
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* 헤더 */}
      <div className="flex items-center gap-3 px-4 py-3 bg-[#150f0c] border-b border-[#2e2318] shrink-0">
        <button onClick={() => router.back()} className="text-[#8a7055] hover:text-[#f5ead8] transition-colors p-1">
          <ArrowLeft size={18} />
        </button>
        {partner ? (
          <>
            <Avatar user={partner} />
            <div>
              <p className="text-sm font-semibold text-[#f5ead8]">{partner.nickname}</p>
              <p className="text-[10px] text-[#5a4830]">친구</p>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2 text-[#8a7055]">
            <Users size={16} />
            <span className="text-sm">DM</span>
          </div>
        )}
        <div className={`ml-auto w-2 h-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-[#5a4830]'}`} title={connected ? '연결됨' : '연결 중...'} />
      </div>

      {/* 메시지 */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !room && (
          <div className="text-center py-16 text-[#5a4830] text-sm">로딩 중...</div>
        )}
        {messages.length === 0 && room && (
          <div className="text-center py-16 text-[#5a4830] text-sm">첫 메시지를 보내보세요!</div>
        )}

        <div className="space-y-4">
          {groupByDay(messages).map(group => (
            <div key={group.date}>
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px bg-[#2e2318]" />
                <span className="text-[10px] text-[#5a4830] shrink-0">{group.date}</span>
                <div className="flex-1 h-px bg-[#2e2318]" />
              </div>
              <div className="space-y-1">
                {group.items.map((msg, i) => {
                  const isMine = msg.senderId === user.id
                  const isFirstInGroup = i === 0 || group.items[i - 1].senderId !== msg.senderId
                  return (
                    <div key={msg.id} className={`flex items-end gap-2 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
                      {!isMine && isFirstInGroup && msg.sender && (
                        <Avatar user={msg.sender} size={7} />
                      )}
                      {!isMine && !isFirstInGroup && <div className="w-7 shrink-0" />}
                      <div className={`max-w-[70%] flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                        <div className={`px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${isMine
                          ? 'bg-[#d4a853] text-white rounded-br-sm'
                          : 'bg-[#0a1020] border border-[#2e2318] text-[#e8d5b0] rounded-bl-sm'}`}>
                          {msg.content}
                        </div>
                        <div className="flex items-center gap-1 mt-0.5 px-1">
                          <span className="text-[10px] text-[#5a4830]">
                            {format(new Date(msg.createdAt), 'HH:mm')}
                          </span>
                          {isMine && (
                            <CheckCheck size={11} className={msg.readAt ? 'text-[#d4a853]' : 'text-[#5a4830]'} />
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        <div ref={bottomRef} />
      </div>

      {/* 입력창 */}
      <div className="shrink-0 px-4 py-3 bg-[#150f0c] border-t border-[#2e2318]">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="메시지 입력... (Enter 전송, Shift+Enter 줄바꿈)"
            rows={1}
            className="flex-1 bg-[#1a1410] border border-[#2e2318] focus:border-[#d4a853]/40 rounded-xl px-4 py-2.5 text-sm text-[#f5ead8] placeholder:text-[#5a4830] focus:outline-none transition-colors resize-none"
            style={{ maxHeight: '8rem', overflowY: 'auto' }}
            onInput={e => {
              const el = e.currentTarget
              el.style.height = 'auto'
              el.style.height = `${Math.min(el.scrollHeight, 128)}px`
            }}
          />
          <button onClick={sendMsg} disabled={!input.trim() || !connected}
            className="w-10 h-10 rounded-xl bg-[#d4a853] hover:bg-[#c49440] disabled:opacity-40 flex items-center justify-center transition-colors shrink-0">
            <Send size={15} className="text-white" />
          </button>
        </div>
      </div>
    </div>
  )
}

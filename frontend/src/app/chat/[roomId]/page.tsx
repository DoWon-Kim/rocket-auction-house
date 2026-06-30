'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { connectSocket, getSocket } from '@/lib/socket'
import Image from 'next/image'
import Link from 'next/link'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Send, ArrowLeft, CheckCheck, Package, AlertCircle, Truck, Check, ChevronDown } from 'lucide-react'

interface MsgSender { id: string; nickname: string; avatarUrl: string | null }
interface ChatMsg { id: string; content: string; createdAt: string; readAt: string | null; sender: MsgSender }
interface CardInfo { name: string; nameKo: string | null; imageUrl: string | null }
interface RoomTransaction {
  id: string
  txStatus: string
  escrowStatus: string
  finalPrice: number
  trackingCarrier: string | null
  trackingNumber: string | null
  shippedAt: string | null
}
interface ChatRoom {
  id: string
  listingId: string
  listing: { id: string; status: string; card: CardInfo }
  buyer: MsgSender
  seller: MsgSender
  transaction: RoomTransaction | null
  messages: ChatMsg[]
}

const CARRIERS = [
  'CJ대한통운', '롯데택배', '한진택배', '우체국택배', '로젠택배',
  '카카오T택배', '쿠팡로켓배송', '직접배송', '기타',
]

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

export default function ChatRoomPage() {
  const { roomId } = useParams<{ roomId: string }>()
  const { user } = useAuthStore()
  const router = useRouter()
  const qc = useQueryClient()
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [connected, setConnected] = useState(false)
  const [txPanelOpen, setTxPanelOpen] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const { data: room, isLoading } = useQuery({
    queryKey: ['chat-room', roomId],
    queryFn: () => api.get(`/chat/rooms/${roomId}/messages`).then(() =>
      fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api'}/chat/listings/none`, {})
        .then(() => null)
    ).catch(() => null),
    enabled: false,
  })

  // 방 정보 로드
  const [roomData, setRoomData] = useState<ChatRoom | null>(null)
  useEffect(() => {
    if (!user) return
    api.get<ChatMsg[]>(`/chat/rooms/${roomId}/messages`)
      .then(r => setMessages(r.data))
      .catch(() => {})

    api.get<ChatRoom[]>('/chat/rooms')
      .then(r => {
        const found = r.data.find(rm => rm.id === roomId)
        if (found) setRoomData(found)
      })
      .catch(() => {})
  }, [roomId, user])

  // Socket.io
  useEffect(() => {
    if (!user) return
    const socket = connectSocket()

    socket.on('connect', () => {
      setConnected(true)
      socket.emit('chat:join', roomId)
      socket.emit('chat:read', roomId)
    })
    socket.on('disconnect', () => setConnected(false))

    socket.on('chat:message', (msg: ChatMsg) => {
      setMessages(prev => [...prev, msg])
      if (msg.sender.id !== user.id) {
        socket.emit('chat:read', roomId)
        qc.invalidateQueries({ queryKey: ['chat-unread'] })
      }
    })

    socket.on('chat:read', ({ userId }: { userId: string }) => {
      if (userId !== user.id) {
        setMessages(prev => prev.map(m =>
          m.sender.id === user.id && !m.readAt ? { ...m, readAt: new Date().toISOString() } : m
        ))
      }
    })

    if (socket.connected) {
      setConnected(true)
      socket.emit('chat:join', roomId)
      socket.emit('chat:read', roomId)
    }

    return () => {
      socket.off('chat:message')
      socket.off('chat:read')
      socket.off('connect')
      socket.off('disconnect')
    }
  }, [roomId, user, qc])

  // 스크롤 아래
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: messages.length > 10 ? 'smooth' : 'auto' })
  }, [messages])

  const sendMsg = useCallback(() => {
    const content = input.trim()
    if (!content) return
    const socket = getSocket()
    socket.emit('chat:send', { roomId, content })
    setInput('')
    inputRef.current?.focus()
  }, [input, roomId])

  const [showShipForm, setShowShipForm] = useState(false)
  const [carrier, setCarrier] = useState('')
  const [trackNum, setTrackNum] = useState('')

  const confirmMut = useMutation({
    mutationFn: () => api.post(`/transactions/${roomData?.transaction?.id}/confirm`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-purchases'] })
      setRoomData(prev => prev && prev.transaction
        ? { ...prev, transaction: { ...prev.transaction, txStatus: 'COMPLETED', escrowStatus: 'RELEASED' } }
        : prev)
    },
  })

  const shipMut = useMutation({
    mutationFn: () => api.post(`/transactions/${roomData?.transaction?.id}/ship`, { trackingCarrier: carrier, trackingNumber: trackNum }),
    onSuccess: () => {
      setShowShipForm(false)
      setCarrier(''); setTrackNum('')
      setRoomData(prev => prev && prev.transaction
        ? { ...prev, transaction: { ...prev.transaction, txStatus: 'SHIPPED', trackingCarrier: carrier, trackingNumber: trackNum, shippedAt: new Date().toISOString() } }
        : prev)
    },
  })

  if (!user) { router.replace('/login'); return null }

  const isBuyer = roomData ? roomData.buyer.id === user.id : false
  const other = roomData ? (isBuyer ? roomData.seller : roomData.buyer) : null
  const cardName = roomData ? (roomData.listing.card.nameKo ?? roomData.listing.card.name) : ''
  const tx = roomData?.transaction

  return (
    <div className="max-w-2xl mx-auto flex flex-col h-[calc(100vh-5rem)]">

      {/* ── 헤더 ── */}
      <div className="flex items-center gap-3 px-4 py-3 bg-[#1a1410] border border-[#2e2318] rounded-xl mb-2 shrink-0">
        <button onClick={() => router.back()} className="text-[#5a4830] hover:text-[#f5ead8] transition-colors">
          <ArrowLeft size={18} />
        </button>
        {other && <Avatar user={other} size={9} />}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate text-[#f5ead8]">{other?.nickname ?? '...'}</p>
          <p className="text-xs text-[#5a4830] truncate">{cardName}</p>
        </div>
        <div
          className={`w-2 h-2 rounded-full transition-colors ${connected ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]' : 'bg-[#5a4830]'}`}
          title={connected ? '연결됨' : '연결 중'}
        />
      </div>

      {/* ── 에스크로/거래 패널 (접을 수 있는 형태) ── */}
      {tx && (
        <div className="mb-2 shrink-0 bg-[#1a1410] border border-[#2e2318] rounded-xl overflow-hidden">
          {/* 패널 토글 헤더 */}
          <button
            onClick={() => setTxPanelOpen(v => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-xs hover:bg-[#1a1208] transition-colors"
          >
            <span className="flex items-center gap-2 font-medium">
              {tx.txStatus === 'COMPLETED' || tx.txStatus === 'AUTO_COMPLETED' ? (
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <Check size={12} /> 거래 완료
                </span>
              ) : tx.txStatus === 'SHIPPED' ? (
                <span className="flex items-center gap-1.5 text-yellow-300">
                  <Truck size={12} /> 배송 중
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-[#d4a853]">
                  <Package size={12} /> 발송 대기 중
                </span>
              )}
              <span className="text-[#f0a832] font-bold tabular-nums">{tx.finalPrice.toLocaleString()}P</span>
            </span>
            <ChevronDown
              size={14}
              className={`text-[#5a4830] transition-transform duration-200 ${txPanelOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {/* 패널 본문 */}
          {txPanelOpen && (
            <div className="border-t border-[#2e2318] px-4 py-3 space-y-2">
              {tx.txStatus === 'PENDING_SHIPMENT' && (
                <div className="text-xs space-y-2">
                  {isBuyer ? (
                    <p className="text-[#8a7055]">판매자 발송을 기다리고 있습니다.</p>
                  ) : (
                    <>
                      <button
                        onClick={() => setShowShipForm(v => !v)}
                        className="flex items-center gap-1.5 bg-[#d4a853] hover:bg-[#c49440] text-white px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors shadow-[0_0_12px_rgba(212,168,83,0.25)]"
                      >
                        <Truck size={11} /> 발송 처리
                      </button>
                      {showShipForm && (
                        <div className="flex gap-1.5 mt-2">
                          <select
                            value={carrier}
                            onChange={e => setCarrier(e.target.value)}
                            className="flex-1 bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] focus:border-[#d4a853]/40 rounded-xl px-3 py-2 text-xs text-[#f5ead8] focus:outline-none transition-colors"
                          >
                            <option value="">택배사</option>
                            {CARRIERS.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                          <input
                            type="text"
                            placeholder="운송장 번호"
                            value={trackNum}
                            onChange={e => setTrackNum(e.target.value)}
                            className="flex-1 bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] focus:border-[#d4a853]/40 rounded-xl px-3 py-2 text-xs text-[#f5ead8] placeholder:text-[#5a4830] focus:outline-none transition-colors"
                          />
                          <button
                            onClick={() => shipMut.mutate()}
                            disabled={!carrier || !trackNum || shipMut.isPending}
                            className="bg-emerald-400/10 border border-emerald-400/30 hover:bg-emerald-400/20 disabled:opacity-40 text-emerald-400 px-3 py-2 rounded-xl text-xs font-semibold transition-colors"
                          >
                            {shipMut.isPending ? '처리중' : '확인'}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {tx.txStatus === 'SHIPPED' && (
                <div className="text-xs space-y-2">
                  {tx.trackingNumber && (
                    <p className="text-[#8a7055]">
                      {tx.trackingCarrier}{' '}
                      <span className="font-mono text-yellow-300">{tx.trackingNumber}</span>
                    </p>
                  )}
                  {isBuyer ? (
                    <button
                      onClick={() => confirmMut.mutate()}
                      disabled={confirmMut.isPending}
                      className="flex items-center gap-1.5 bg-emerald-400/10 border border-emerald-400/30 hover:bg-emerald-400/20 disabled:opacity-50 text-emerald-400 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors"
                    >
                      <CheckCheck size={12} /> {confirmMut.isPending ? '처리 중' : '수령 확인'}
                    </button>
                  ) : (
                    <p className="flex items-center gap-1 text-yellow-300">
                      <AlertCircle size={11} /> 구매자 수령 확인 후 정산됩니다.
                    </p>
                  )}
                </div>
              )}

              {(tx.txStatus === 'COMPLETED' || tx.txStatus === 'AUTO_COMPLETED') && (
                <p className="text-xs text-[#8a7055]">
                  {tx.txStatus === 'AUTO_COMPLETED' ? '자동으로 거래가 완료되었습니다.' : '구매자가 수령을 확인했습니다.'}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── 메시지 목록 ── */}
      <div className="flex-1 overflow-y-auto space-y-3 px-1 py-2 min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 rounded-full border-2 border-[#2e2318] border-t-[#d4a853] animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center text-[#5a4830] text-sm py-8">
            <p>아직 메시지가 없습니다.</p>
            <p className="text-xs mt-1">{other?.nickname}님에게 먼저 말을 걸어보세요!</p>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isMe = msg.sender.id === user.id
            const showAvatar = !isMe && (idx === 0 || messages[idx - 1]?.sender.id !== msg.sender.id)
            return (
              <div key={msg.id} className={`flex items-end gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                {!isMe && (
                  <div className="w-8 shrink-0">
                    {showAvatar && <Avatar user={msg.sender} size={8} />}
                  </div>
                )}
                <div className={`max-w-[72%] space-y-0.5 ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
                  {showAvatar && !isMe && (
                    <span className="text-xs text-[#5a4830] ml-1">{msg.sender.nickname}</span>
                  )}
                  <div className={`px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                    isMe
                      ? 'bg-[#2a1c08] text-[#e8d5b0] rounded-br-sm'
                      : 'bg-[#221a12] text-[#e8d5b0] rounded-bl-sm'
                  }`}>
                    {msg.content}
                  </div>
                  <div className={`flex items-center gap-1 text-[10px] text-[#5a4830] ${isMe ? 'flex-row-reverse' : ''}`}>
                    <span>{format(new Date(msg.createdAt), 'HH:mm', { locale: ko })}</span>
                    {isMe && msg.readAt && <CheckCheck size={10} className="text-[#d4a853]" />}
                  </div>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── 입력창 ── */}
      <div className="shrink-0 pt-2">
        <div className="flex items-end gap-2 bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] rounded-xl p-2 transition-colors">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg() }
            }}
            placeholder="메시지를 입력하세요..."
            className="flex-1 bg-transparent resize-none text-sm focus:outline-none max-h-32 py-1.5 px-2 text-[#f5ead8] placeholder:text-[#5a4830]"
            style={{ overflowY: 'auto' }}
          />
          <button
            onClick={sendMsg}
            disabled={!input.trim() || !connected}
            className="w-9 h-9 rounded-xl bg-[#d4a853] hover:bg-[#c49440] disabled:opacity-40 text-white flex items-center justify-center transition-colors shrink-0 shadow-[0_0_12px_rgba(212,168,83,0.25)]"
          >
            <Send size={15} />
          </button>
        </div>
        {!connected && (
          <p className="text-xs text-[#5a4830] text-center mt-1">연결 중...</p>
        )}
      </div>
    </div>
  )
}

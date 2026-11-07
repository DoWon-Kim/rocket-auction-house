'use client'

import { Suspense, useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore, useAuthHydrated } from '@/lib/store'
import { connectSocket, getSocket } from '@/lib/socket'
import Image from 'next/image'
import Link from 'next/link'
import {
  ArrowLeft, CheckCheck, Package, Truck, Check, ChevronDown, ShieldCheck,
  Handshake, CalendarCheck, Undo2, MapPin, Star, Info, Ban, Flag, X, Clock,
} from 'lucide-react'
import { type ChatMsg, QUICK_REPLIES, lastSeenLabel, newClientId } from '@/lib/chat'
import { MessageList } from '@/components/chat/MessageList'
import { ChatComposer } from '@/components/chat/ChatComposer'
import { ChatMenu } from '@/components/chat/ChatMenu'
import { listingTitle, listingThumb, listingPrice } from '@/lib/market'
import { AddressForm, EMPTY_ADDRESS, isAddressValid, addressPayload } from '@/components/market/AddressForm'
import { ReviewModal } from '@/components/ReviewModal'

interface MsgSender { id: string; nickname: string; avatarUrl: string | null }
interface RoomListing {
  id: string; status: string; title: string | null; listingType: string; sellerId: string
  buyNowPrice: number | null; minOfferPrice: number | null; currentPrice: number | null
  shippingFee: number; negotiable: boolean; imageUrls: string[]
  reservedForId: string | null; reservedPrice: number | null
  card: { name: string; nameKo: string | null; imageUrl: string | null }
}
interface RoomTransaction {
  id: string; txStatus: string; escrowStatus: string; finalPrice: number; shippingFee: number
  completedAt: string; shipClockAt: string | null
  trackingCarrier: string | null; trackingNumber: string | null; shippedAt: string | null
  recipientName: string | null; recipientPhone: string | null; zipCode: string | null
  address: string | null; addressDetail: string | null; shippingMemo: string | null
}
interface RoomOffer { id: string; amount: number; status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'WITHDRAWN'; createdAt: string }
interface ChatRoom {
  id: string; listingId: string; buyerId: string; sellerId: string
  listing: RoomListing; buyer: MsgSender; seller: MsgSender
  transaction: RoomTransaction | null; offers: RoomOffer[]
  blockedByMe: boolean; blockedMe: boolean
}

const CARRIERS = ['CJ대한통운', '롯데택배', '한진택배', '우체국택배', '로젠택배', '카카오T택배', '쿠팡로켓배송', '직접배송', '기타']
const STATUS_CHIP: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: '판매중', cls: 'bg-accent-tint text-accent-soft' },
  RESERVED: { label: '예약중', cls: 'bg-emerald-500/15 text-emerald-300' },
  SOLD: { label: '판매완료', cls: 'bg-surface-2 text-muted' },
  CANCELLED: { label: '판매중지', cls: 'bg-surface-2 text-muted' },
  EXPIRED: { label: '유찰', cls: 'bg-surface-2 text-muted' },
}
const PAGE = 30
const REPORT_REASONS = [
  ['FRAUD', '사기 의심'], ['FAKE_ITEM', '가짜/위조 카드'], ['HARASSMENT', '욕설·비매너'], ['NO_SHIPMENT', '미발송/잠수'], ['OTHER', '기타'],
] as const
// 발송 대기 거래의 기한 — 배송지가 있으면 발송 기한(배송지 확정 + 3일), 없으면 배송지 입력 기한(결제 + 3일)
const DEADLINE_DAYS = 3
function dueText(fromIso: string) {
  const at = new Date(new Date(fromIso).getTime() + DEADLINE_DAYS * 86400_000)
  const left = at.getTime() - Date.now()
  const when = `${at.getMonth() + 1}/${at.getDate()} ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
  if (left <= 0) return { text: `${when} 마감 (곧 자동 취소돼요)`, urgent: true }
  const h = Math.floor(left / 3600_000)
  return { text: `${when}까지 · ${h >= 24 ? `${Math.floor(h / 24)}일 ${h % 24}시간` : `${Math.max(1, h)}시간`} 남음`, urgent: h < 24 }
}
const errMsg = (e: unknown, fb: string) => (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? fb

function Avatar({ user, size = 32 }: { user: MsgSender; size?: number }) {
  return (
    <span className="relative shrink-0 rounded-full bg-surface-2 border border-line flex items-center justify-center text-xs font-semibold overflow-hidden text-muted" style={{ width: size, height: size }}>
      {user.avatarUrl ? <Image src={user.avatarUrl} alt={user.nickname} fill sizes={`${size}px`} className="object-cover" /> : user.nickname[0]?.toUpperCase()}
    </span>
  )
}

function ChatRoomContent() {
  const { roomId } = useParams<{ roomId: string }>()
  const params = useSearchParams()
  const { user } = useAuthStore()
  const hydrated = useAuthHydrated()
  const router = useRouter()
  const qc = useQueryClient()
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [connected, setConnected] = useState(false)
  const [otherTyping, setOtherTyping] = useState(false)
  const [presence, setPresence] = useState<{ online: boolean; lastSeenAt: string | null } | null>(null)
  const [reportOpen, setReportOpen] = useState(false)
  const [txPanelOpen, setTxPanelOpen] = useState(true)
  const [panel, setPanel] = useState<'offer' | 'reserve' | 'ship' | 'address' | null>(null)
  const [offerAmount, setOfferAmount] = useState('')
  const [reservePrice, setReservePrice] = useState('')
  const [carrier, setCarrier] = useState('')
  const [trackNum, setTrackNum] = useState('')
  const [addr, setAddr] = useState(EMPTY_ADDRESS)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(params.get('paid') ? { ok: true, text: '안전결제가 완료되었어요. 판매자가 발송하면 알려드릴게요.' } : null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { if (hydrated && !user) router.replace('/login') }, [hydrated, user, router])

  const { data: room, refetch: refetchRoom } = useQuery<ChatRoom>({
    queryKey: ['chat-room', roomId],
    queryFn: () => api.get(`/chat/rooms/${roomId}`).then(r => r.data),
    enabled: !!user,
  })

  useEffect(() => {
    if (!user) return
    api.get<ChatMsg[]>(`/chat/rooms/${roomId}/messages`, { params: { limit: PAGE } })
      .then(r => { setMessages(r.data); setHasMore(r.data.length === PAGE) })
      .catch(() => {})
  }, [roomId, user])

  // 위로 스크롤하면 이전 메시지
  const loadOlder = useCallback(async () => {
    const oldest = messages.find(m => !m.pending && !m.failed)
    if (!oldest) return
    const r = await api.get<ChatMsg[]>(`/chat/rooms/${roomId}/messages`, { params: { limit: PAGE, before: oldest.createdAt, beforeId: oldest.id } })
    setMessages(prev => [...r.data.filter(m => !prev.some(p => p.id === m.id)), ...prev])
    setHasMore(r.data.length === PAGE)
  }, [messages, roomId])

  const otherId = room ? (room.buyerId === user?.id ? room.sellerId : room.buyerId) : null

  // Socket.io — 메시지·읽음·입력 중·삭제·전송 실패·상대 접속 상태
  useEffect(() => {
    if (!user) return
    const socket = connectSocket()
    const join = () => {
      setConnected(true)
      socket.emit('chat:join', roomId); socket.emit('chat:read', roomId)
      if (otherId) socket.emit('presence:watch', otherId)
    }
    const onMessage = (msg: ChatMsg) => {
      setMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev
        const i = msg.clientId ? prev.findIndex(m => m.clientId === msg.clientId) : -1
        if (i >= 0) { const next = [...prev]; next[i] = { ...msg, pending: false, failed: undefined }; return next }
        return [...prev, msg]
      })
      if (msg.type && msg.type !== 'TEXT') refetchRoom()
      if (msg.sender.id !== user.id) { setOtherTyping(false); socket.emit('chat:read', roomId) }
    }
    const onRead = ({ userId }: { userId: string }) => {
      if (userId !== user.id) setMessages(prev => prev.map(m => (m.sender.id === user.id && !m.readAt ? { ...m, readAt: new Date().toISOString() } : m)))
    }
    const onUpdated = (msg: ChatMsg) => setMessages(prev => prev.map(m => (m.id === msg.id ? { ...m, ...msg } : m)))
    const onError = (e: { roomId?: string; clientId?: string; message: string }) => {
      if (e.clientId) setMessages(prev => prev.map(m => (m.clientId === e.clientId ? { ...m, pending: false, failed: e.message } : m)))
      else if (!e.roomId || e.roomId === roomId) setNotice({ ok: false, text: e.message })
    }
    const onTyping = (e: { roomId: string; userId: string; typing: boolean }) => {
      if (e.roomId !== roomId || e.userId === user.id) return
      setOtherTyping(e.typing)
      if (typingTimer.current) clearTimeout(typingTimer.current)
      if (e.typing) typingTimer.current = setTimeout(() => setOtherTyping(false), 5000)
    }
    const onPresence = (p: { userId: string; online: boolean; lastSeenAt?: string | null }) => {
      if (p.userId === otherId) setPresence(cur => ({ online: p.online, lastSeenAt: p.lastSeenAt ?? cur?.lastSeenAt ?? null }))
    }
    const onDisconnect = () => setConnected(false)
    socket.on('connect', join)
    socket.on('disconnect', onDisconnect)
    socket.on('chat:message', onMessage)
    socket.on('chat:read', onRead)
    socket.on('chat:updated', onUpdated)
    socket.on('chat:error', onError)
    socket.on('chat:typing', onTyping)
    socket.on('presence', onPresence)
    if (socket.connected) join()
    return () => {
      socket.emit('chat:leave', roomId)
      if (otherId) socket.emit('presence:unwatch', otherId)
      socket.off('connect', join)
      socket.off('disconnect', onDisconnect)
      socket.off('chat:message', onMessage)
      socket.off('chat:read', onRead)
      socket.off('chat:updated', onUpdated)
      socket.off('chat:error', onError)
      socket.off('chat:typing', onTyping)
      socket.off('presence', onPresence)
      if (typingTimer.current) clearTimeout(typingTimer.current)
    }
  }, [roomId, user, otherId, refetchRoom])

  // 보내는 즉시 화면에 표시하고, 서버 응답(clientId)으로 확정
  const emitSend = useCallback((m: ChatMsg) => {
    const socket = getSocket()
    if (!socket.connected) {
      setMessages(prev => prev.map(x => (x.clientId === m.clientId ? { ...x, pending: false, failed: '연결이 끊겼어요.' } : x)))
      return
    }
    socket.emit('chat:send', { roomId, content: m.content, imageUrls: m.imageUrls, clientId: m.clientId })
    // 10초 안에 응답이 없으면 실패로 표시
    setTimeout(() => setMessages(prev => prev.map(x => (x.clientId === m.clientId && x.pending ? { ...x, pending: false, failed: '전송이 지연되고 있어요.' } : x))), 10000)
  }, [roomId])

  const send = useCallback((content: string, imageUrls: string[]) => {
    if (!user) return
    const m: ChatMsg = {
      id: '', clientId: newClientId(), content, imageUrls, createdAt: new Date().toISOString(), readAt: null, type: 'TEXT', pending: true,
      sender: { id: user.id, nickname: user.nickname, avatarUrl: user.avatarUrl ?? null },
    }
    setMessages(prev => [...prev, m])
    emitSend(m)
  }, [user, emitSend])

  const retry = useCallback((m: ChatMsg) => {
    setMessages(prev => prev.map(x => (x.clientId === m.clientId ? { ...x, pending: true, failed: undefined } : x)))
    emitSend(m)
  }, [emitSend])

  const typing = useCallback((t: boolean) => { getSocket()?.emit('chat:typing', { roomId, typing: t }) }, [roomId])
  const deleteMsg = useCallback((m: ChatMsg) => { getSocket()?.emit('chat:delete', { messageId: m.id }) }, [])

  const after = (text: string) => { setNotice({ ok: true, text }); setPanel(null); refetchRoom() }
  const onErr = (fb: string) => (e: unknown) => setNotice({ ok: false, text: errMsg(e, fb) })

  const offerMut = useMutation({ mutationFn: () => api.post(`/listings/${room!.listingId}/offer`, { amount: Number(offerAmount) }), onSuccess: () => { setOfferAmount(''); after('가격을 제안했어요.') }, onError: onErr('제안에 실패했어요.') })
  const respondMut = useMutation({ mutationFn: (v: { offerId: string; action: 'ACCEPTED' | 'DECLINED' }) => api.patch(`/offers/${v.offerId}/respond`, { action: v.action }), onSuccess: (_, v) => after(v.action === 'ACCEPTED' ? '제안을 수락하고 예약했어요.' : '제안을 거절했어요.'), onError: onErr('처리에 실패했어요.') })
  const reserveMut = useMutation({ mutationFn: () => api.post(`/listings/${room!.listingId}/reserve`, { buyerId: room!.buyerId, price: Number(reservePrice) || undefined }), onSuccess: () => after('예약중으로 바꿨어요.'), onError: onErr('예약에 실패했어요.') })
  const unreserveMut = useMutation({ mutationFn: () => api.delete(`/listings/${room!.listingId}/reserve`), onSuccess: () => after('예약을 취소했어요.'), onError: onErr('예약 취소에 실패했어요.') })
  const shipMut = useMutation({ mutationFn: () => api.post(`/transactions/${room!.transaction!.id}/ship`, { trackingCarrier: carrier, trackingNumber: trackNum }), onSuccess: () => { setCarrier(''); setTrackNum(''); after('발송 처리했어요.') }, onError: onErr('발송 처리에 실패했어요.') })
  const confirmMut = useMutation({ mutationFn: () => api.post(`/transactions/${room!.transaction!.id}/confirm`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['my-purchases'] }); after('구매를 확정했어요. 후기를 남겨주세요!') }, onError: onErr('구매 확정에 실패했어요.') })
  const blockMut = useMutation({ mutationFn: () => api.post(`/users/${otherId}/block`), onSuccess: r => { setNotice({ ok: true, text: r.data.message }); refetchRoom() }, onError: onErr('차단 처리에 실패했어요.') })
  const leaveMut = useMutation({ mutationFn: () => api.post(`/chat/rooms/${roomId}/leave`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['chat-rooms'] }); router.push('/chat') }, onError: onErr('나가기에 실패했어요.') })
  const addrMut = useMutation({ mutationFn: () => api.patch(`/transactions/${room!.transaction!.id}/address`, addressPayload(addr)), onSuccess: () => after('배송지를 저장했어요.'), onError: onErr('배송지 저장에 실패했어요.') })

  if (!user) return null
  if (!room) return <div className="max-w-2xl mx-auto h-[calc(100vh-7rem)] rounded-2xl bg-surface animate-pulse" />

  const isBuyer = room.buyerId === user.id
  const other = isBuyer ? room.seller : room.buyer
  const l = room.listing
  const tx = room.transaction
  const thumb = listingThumb(l)
  const reservedForThisBuyer = l.status === 'RESERVED' && l.reservedForId === room.buyerId
  const price = tx ? tx.finalPrice : reservedForThisBuyer ? (l.reservedPrice ?? l.buyNowPrice) : listingPrice({ ...l, condition: '', createdAt: '' })
  const canPay = isBuyer && !tx && (reservedForThisBuyer || (l.status === 'ACTIVE' && l.listingType === 'BUY_NOW'))
  const canOffer = isBuyer && !tx && l.status === 'ACTIVE' && (l.listingType === 'OFFER' || (l.listingType === 'BUY_NOW' && l.negotiable))
  const canReserve = !isBuyer && !tx && l.status === 'ACTIVE' && l.listingType !== 'AUCTION'
  const offersById = new Map(room.offers.map(o => [o.id, o]))
  const pendingOffer = room.offers.find(o => o.status === 'PENDING')
  const chip = STATUS_CHIP[l.status]
  const done = tx && (tx.txStatus === 'COMPLETED' || tx.txStatus === 'AUTO_COMPLETED')
  const actionBtn = 'h-9 px-3.5 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 transition-colors disabled:opacity-40'

  return (
    <div className="max-w-2xl mx-auto flex flex-col h-[calc(100dvh-6rem)]">
      {/* 헤더 */}
      <div className="flex items-center gap-3 px-4 py-3 bg-surface border border-line rounded-t-2xl shrink-0">
        <button onClick={() => router.back()} className="text-subtle hover:text-fg" aria-label="뒤로"><ArrowLeft size={18} /></button>
        <Link href={`/users/${other.id}`} className="flex items-center gap-2.5 flex-1 min-w-0">
          <Avatar user={other} size={36} />
          <span className="min-w-0">
            <span className="block text-sm font-semibold truncate text-fg">{other.nickname}</span>
            <span className={`block text-[11px] ${otherTyping ? 'text-accent-fg' : presence?.online ? 'text-emerald-400' : 'text-subtle'}`}>
              {isBuyer ? '판매자' : '구매자'} · {otherTyping ? '입력 중…' : presence ? lastSeenLabel(presence.online, presence.lastSeenAt) : '상점 보기'}
            </span>
          </span>
        </Link>
        {!connected && <span className="text-[11px] text-amber-300">연결 중…</span>}
        <ChatMenu otherId={other.id} blockedByMe={room.blockedByMe}
          onReport={() => setReportOpen(true)}
          onToggleBlock={() => { if (room.blockedByMe || confirm(`${other.nickname}님을 차단할까요? 서로 채팅을 보낼 수 없어요.`)) blockMut.mutate() }}
          onLeave={() => { if (confirm('채팅방을 나갈까요? 상대가 새 메시지를 보내면 다시 보여요.')) leaveMut.mutate() }} />
      </div>

      {/* 상품 바 + 거래 액션 */}
      <div className="px-4 py-3 bg-surface/70 border-x border-b border-line shrink-0 space-y-2.5">
        <Link href={`/listings/${l.id}`} className="flex items-center gap-3 group">
          <span className="relative w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-sunken border border-line">
            {thumb && <Image src={thumb} alt="" fill sizes="48px" className="object-cover" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              {chip && <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${chip.cls}`}>{chip.label}</span>}
              <span className="text-sm text-fg-2 truncate group-hover:text-fg">{listingTitle(l)}</span>
            </span>
            <span className="block text-sm font-bold text-fg tabular-nums mt-0.5">
              {price != null ? `${price.toLocaleString()}P` : '가격 제안'}
              <span className="ml-1.5 text-[11px] font-normal text-subtle">{l.shippingFee ? `+ 배송비 ${l.shippingFee.toLocaleString()}P` : '배송비 포함'}</span>
            </span>
          </span>
        </Link>

        {(canPay || canOffer || canReserve || (!isBuyer && reservedForThisBuyer && !tx)) && (
          <div className="flex flex-wrap gap-1.5">
            {canPay && (
              <Link href={`/listings/${l.id}/checkout`} className={`${actionBtn} bg-accent text-white hover:bg-accent-strong`}>
                <ShieldCheck size={13} />안전결제{reservedForThisBuyer ? ' (예약가)' : ''}
              </Link>
            )}
            {canOffer && (
              <button onClick={() => setPanel(p => (p === 'offer' ? null : 'offer'))} disabled={!!pendingOffer} className={`${actionBtn} border border-emerald-400/30 text-emerald-300 hover:bg-emerald-500/10`}>
                <Handshake size={13} />{pendingOffer ? '제안 응답 대기중' : '가격 제안'}
              </button>
            )}
            {canReserve && (
              <button onClick={() => { setReservePrice(String(pendingOffer?.amount ?? l.buyNowPrice ?? '')); setPanel(p => (p === 'reserve' ? null : 'reserve')) }} className={`${actionBtn} border border-line bg-surface text-fg-2 hover:text-fg`}>
                <CalendarCheck size={13} />이 구매자와 예약
              </button>
            )}
            {!isBuyer && reservedForThisBuyer && !tx && (
              <button onClick={() => unreserveMut.mutate()} disabled={unreserveMut.isPending} className={`${actionBtn} border border-line bg-surface text-muted hover:text-fg`}>
                <Undo2 size={13} />예약 취소
              </button>
            )}
          </div>
        )}
        {isBuyer && !tx && l.status === 'RESERVED' && !reservedForThisBuyer && (
          <p className="text-[11px] text-muted flex items-center gap-1"><Info size={12} />다른 구매자와 예약중인 상품이에요.</p>
        )}

        {panel === 'offer' && (
          <div className="flex gap-2">
            <input type="number" min={1} value={offerAmount} onChange={e => setOfferAmount(e.target.value)} placeholder={l.buyNowPrice ? `${l.buyNowPrice.toLocaleString()}P보다 낮게` : `최소 ${(l.minOfferPrice ?? 0).toLocaleString()}P`}
              className="flex-1 h-10 bg-sunken border border-line rounded-xl px-3 text-sm text-fg" aria-label="제안 금액" />
            <button onClick={() => offerMut.mutate()} disabled={!Number(offerAmount) || offerMut.isPending} className="h-10 px-4 rounded-xl bg-emerald-500 text-sm font-semibold text-white disabled:opacity-40">제안</button>
          </div>
        )}
        {panel === 'reserve' && (
          <div className="space-y-1.5">
            <p className="text-[11px] text-muted">예약하면 {room.buyer.nickname}님만 이 금액으로 안전결제할 수 있어요.</p>
            <div className="flex gap-2">
              <input type="number" min={1} value={reservePrice} onChange={e => setReservePrice(e.target.value)} placeholder="거래 금액" className="flex-1 h-10 bg-sunken border border-line rounded-xl px-3 text-sm text-fg" aria-label="거래 금액" />
              <button onClick={() => reserveMut.mutate()} disabled={!Number(reservePrice) || reserveMut.isPending} className="h-10 px-4 rounded-xl bg-emerald-500 text-sm font-semibold text-white disabled:opacity-40">예약</button>
            </div>
          </div>
        )}
      </div>

      {/* 안전결제 거래 진행 */}
      {tx && (
        <div className="shrink-0 bg-surface border-x border-b border-line">
          <button onClick={() => setTxPanelOpen(v => !v)} className="w-full flex items-center justify-between px-4 py-2.5 text-xs hover:bg-surface-2">
            <span className="flex items-center gap-2 font-medium">
              {done ? <span className="flex items-center gap-1.5 text-emerald-400"><Check size={12} />거래 완료</span>
                : tx.txStatus === 'SHIPPED' ? <span className="flex items-center gap-1.5 text-yellow-300"><Truck size={12} />배송중</span>
                : tx.txStatus === 'PENDING_SHIPMENT' && !tx.address ? <span className="flex items-center gap-1.5 text-amber-300"><MapPin size={12} />배송지 입력 대기</span>
                : tx.txStatus === 'PENDING_SHIPMENT' ? <span className="flex items-center gap-1.5 text-accent-fg"><Package size={12} />발송 대기</span>
                : <span className="text-muted">{tx.txStatus === 'DISPUTED' ? '분쟁 처리중' : '취소됨'}</span>}
              <span className="text-fg font-bold tabular-nums">{(tx.finalPrice + tx.shippingFee).toLocaleString()}P 안전결제</span>
            </span>
            <ChevronDown size={14} className={`text-subtle transition-transform ${txPanelOpen ? 'rotate-180' : ''}`} />
          </button>
          {txPanelOpen && (
            <div className="border-t border-line px-4 py-3 space-y-2.5 text-xs">
              {/* 단계 표시 */}
              <ol className="flex items-center gap-1 text-[11px]">
                {['결제완료', '발송', '구매확정'].map((s, i) => {
                  const step = done ? 3 : tx.txStatus === 'SHIPPED' ? 2 : 1
                  return <li key={s} className={`flex-1 text-center py-1 rounded-md ${i < step ? 'bg-accent-tint text-accent-soft font-semibold' : 'bg-sunken text-subtle'}`}>{s}</li>
                })}
              </ol>

              {/* 배송지 */}
              {tx.address ? (
                <div className="rounded-lg bg-sunken px-3 py-2 text-fg-3 space-y-0.5">
                  <p className="flex items-center gap-1 text-muted"><MapPin size={11} />배송지</p>
                  <p>{tx.recipientName} · {tx.recipientPhone}</p>
                  <p>({tx.zipCode}) {tx.address} {tx.addressDetail}</p>
                  {tx.shippingMemo && <p className="text-muted">메모: {tx.shippingMemo}</p>}
                  {isBuyer && tx.txStatus === 'PENDING_SHIPMENT' && <button onClick={() => { setAddr({ ...EMPTY_ADDRESS, ...Object.fromEntries(Object.entries({ recipientName: tx.recipientName, recipientPhone: tx.recipientPhone, zipCode: tx.zipCode, address: tx.address, addressDetail: tx.addressDetail, shippingMemo: tx.shippingMemo }).map(([k, v]) => [k, v ?? ''])) }); setPanel('address') }} className="text-accent-fg hover:underline">배송지 변경</button>}
                </div>
              ) : tx.txStatus === 'PENDING_SHIPMENT' && (() => {
                const due = dueText(tx.completedAt)
                return (
                  <div className={`rounded-lg px-3 py-2.5 space-y-2 ${due.urgent ? 'bg-rose-500/10' : 'bg-amber-500/10'}`}>
                    <p className={`flex items-center gap-1.5 font-semibold ${due.urgent ? 'text-rose-300' : 'text-amber-300'}`}><Clock size={12} />배송지 입력 마감 {due.text}</p>
                    {isBuyer ? (
                      <>
                        <p className="text-fg-3">배송지를 입력해야 판매자가 발송할 수 있어요. 마감까지 입력하지 않으면 거래가 자동 취소되고 환불돼요.</p>
                        {panel !== 'address' && <button onClick={() => setPanel('address')} className="w-full h-9 rounded-lg bg-accent text-white font-semibold">배송지 입력하기</button>}
                      </>
                    ) : (
                      <p className="text-fg-3">구매자가 배송지를 입력하면 그때부터 {DEADLINE_DAYS}일 안에 발송하면 돼요.</p>
                    )}
                  </div>
                )
              })()}
              {panel === 'address' && isBuyer && (
                <div className="space-y-2 rounded-lg border border-line p-3">
                  <AddressForm value={addr} onChange={setAddr} compact />
                  <button onClick={() => addrMut.mutate()} disabled={!isAddressValid(addr) || addrMut.isPending} className="w-full h-9 rounded-lg bg-accent text-white font-semibold disabled:opacity-40">배송지 저장</button>
                </div>
              )}

              {tx.txStatus === 'PENDING_SHIPMENT' && tx.address && (() => {
                const due = dueText(tx.shipClockAt ?? tx.completedAt)
                return <p className={`flex items-center gap-1.5 font-medium ${due.urgent ? 'text-rose-300' : 'text-fg-3'}`}><Clock size={12} />발송 기한 {due.text}</p>
              })()}
              {tx.txStatus === 'PENDING_SHIPMENT' && !isBuyer && tx.address && (
                panel === 'ship' ? (
                  <div className="flex gap-1.5">
                    <select value={carrier} onChange={e => setCarrier(e.target.value)} className="flex-1 bg-sunken border border-line rounded-lg px-2 py-2 text-xs text-fg" aria-label="택배사">
                      <option value="">택배사</option>
                      {CARRIERS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input value={trackNum} onChange={e => setTrackNum(e.target.value)} placeholder="운송장 번호" className="flex-1 bg-sunken border border-line rounded-lg px-2 py-2 text-xs text-fg" />
                    <button onClick={() => shipMut.mutate()} disabled={!carrier || !trackNum || shipMut.isPending} className="px-3 rounded-lg bg-emerald-500 text-white font-semibold disabled:opacity-40">확인</button>
                  </div>
                ) : <button onClick={() => setPanel('ship')} className="w-full h-9 rounded-lg bg-accent text-white font-semibold inline-flex items-center justify-center gap-1.5"><Truck size={13} />발송 처리 (운송장 입력)</button>
              )}
              {tx.txStatus === 'PENDING_SHIPMENT' && isBuyer && tx.address && <p className="text-muted">판매자가 발송하면 알려드릴게요. 3일 안에 발송하지 않으면 자동 환불돼요.</p>}

              {tx.txStatus === 'SHIPPED' && (
                <>
                  {tx.trackingNumber && <p className="text-muted">{tx.trackingCarrier} <span className="font-mono text-yellow-300">{tx.trackingNumber}</span></p>}
                  {isBuyer
                    ? <button onClick={() => confirmMut.mutate()} disabled={confirmMut.isPending} className="w-full h-9 rounded-lg bg-emerald-500 text-white font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"><CheckCheck size={13} />상품을 받았어요 · 구매 확정</button>
                    : <p className="text-yellow-300">구매자가 구매를 확정하면 정산돼요. (발송 3일 후 자동 확정)</p>}
                </>
              )}
              {done && (
                <button onClick={() => setReviewOpen(true)} className="w-full h-9 rounded-lg border border-line bg-surface text-fg-2 font-semibold inline-flex items-center justify-center gap-1.5 hover:text-fg"><Star size={13} />거래 후기 남기기</button>
              )}
            </div>
          )}
        </div>
      )}

      {notice && (
        <p className={`shrink-0 px-4 py-2 text-xs border-x border-b border-line ${notice.ok ? 'text-emerald-300 bg-emerald-500/5' : 'text-rose-300 bg-rose-500/5'}`}>{notice.text}</p>
      )}

      {(room.blockedByMe || room.blockedMe) && (
        <div className="shrink-0 px-4 py-2 border-x border-b border-line bg-rose-500/5 text-xs text-rose-200 flex items-center gap-2">
          <Ban size={13} />
          {room.blockedByMe ? <>차단한 사용자예요. <button onClick={() => blockMut.mutate()} className="underline">차단 해제</button></> : '상대방과 대화할 수 없는 상태예요.'}
        </div>
      )}

      {/* 메시지 */}
      <MessageList
        messages={messages} meId={user.id} isBuyer={isBuyer} offersById={offersById}
        onRespond={(offerId, action) => respondMut.mutate({ offerId, action })} respondPending={respondMut.isPending}
        onRetry={retry} onDelete={deleteMsg} hasMore={hasMore} onLoadOlder={loadOlder}
        typingName={otherTyping ? other.nickname : null}
        emptyHint={isBuyer ? '상품 상태, 구성품 등 궁금한 점을 물어보세요.' : '구매자에게 먼저 인사를 건네보세요.'}
      />

      {/* 입력 */}
      <ChatComposer onSend={send} onTyping={typing} quickReplies={isBuyer ? QUICK_REPLIES.buyer : QUICK_REPLIES.seller}
        disabled={room.blockedByMe || room.blockedMe} disabledReason={room.blockedByMe ? '차단을 해제하면 다시 대화할 수 있어요.' : '상대방과 대화할 수 없어요.'} />

      {reportOpen && <ReportModal onClose={() => setReportOpen(false)} target={other} listingId={l.id} transactionId={tx?.id}
        onDone={text => { setReportOpen(false); setNotice({ ok: true, text }) }} />}

      {reviewOpen && tx && (
        <ReviewModal transactionId={tx.id} targetNickname={other.nickname} role={isBuyer ? 'BUYER' : 'SELLER'}
          onClose={() => setReviewOpen(false)} onSuccess={() => { setReviewOpen(false); setNotice({ ok: true, text: '후기를 남겼어요. 감사합니다!' }) }} />
      )}
    </div>
  )
}

function ReportModal({ target, listingId, transactionId, onClose, onDone }: {
  target: MsgSender; listingId: string; transactionId?: string; onClose: () => void; onDone: (text: string) => void
}) {
  const [reason, setReason] = useState('')
  const [detail, setDetail] = useState('')
  const [error, setError] = useState('')
  const report = useMutation({
    mutationFn: () => api.post('/reports', { reportedUserId: target.id, reason, detail: detail.trim() || undefined, listingId, transactionId }),
    onSuccess: () => onDone('신고가 접수되었어요. 운영자가 채팅 내용을 확인할게요.'),
    onError: (e: unknown) => setError(errMsg(e, '신고 접수에 실패했어요.')),
  })
  return (
    <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label="신고하기">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-bg p-5 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2"><Flag size={15} className="text-rose-300" /><h2 className="font-bold text-fg">{target.nickname}님 신고</h2>
          <button onClick={onClose} aria-label="닫기" className="ml-auto text-muted hover:text-fg"><X size={17} /></button></div>
        <div className="grid grid-cols-2 gap-1.5">
          {REPORT_REASONS.map(([v, label]) => (
            <button key={v} onClick={() => setReason(v)} className={`h-9 rounded-lg border text-xs ${reason === v ? 'border-rose-400/50 bg-rose-500/10 text-rose-200' : 'border-line text-muted hover:text-fg'}`}>{label}</button>
          ))}
        </div>
        <textarea value={detail} onChange={e => setDetail(e.target.value)} maxLength={500} rows={3} placeholder="상황을 적어주세요 (선택)"
          className="w-full bg-sunken border border-line rounded-xl px-3 py-2 text-sm text-fg placeholder:text-subtle resize-none focus:outline-none" />
        {error && <p className="text-xs text-rose-300">{error}</p>}
        <button onClick={() => report.mutate()} disabled={!reason || report.isPending} className="w-full h-10 rounded-xl bg-rose-500 text-sm font-semibold text-white disabled:opacity-40">신고하기</button>
      </div>
    </div>
  )
}

export default function ChatRoomPage() {
  return <Suspense fallback={null}><ChatRoomContent /></Suspense>
}

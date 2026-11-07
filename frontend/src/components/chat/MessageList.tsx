'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { Handshake, ShieldAlert, RotateCw, Trash2, Loader2, ArrowDown } from 'lucide-react'
import { type ChatMsg, type ChatSender, dayKey, dayLabel, timeLabel, sameMinute, withinDeleteWindow } from '@/lib/chat'
import { ImageLightbox } from '@/components/chat/ImageLightbox'

interface OfferInfo { id: string; amount: number; status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'WITHDRAWN' }
const OFFER_CHIP: Record<string, string> = { PENDING: '응답 대기', ACCEPTED: '수락됨', DECLINED: '거절됨', WITHDRAWN: '철회됨' }

function Avatar({ user }: { user: ChatSender }) {
  return (
    <span className="relative w-8 h-8 shrink-0 rounded-full bg-surface-2 border border-line flex items-center justify-center text-xs font-semibold overflow-hidden text-muted">
      {user.avatarUrl ? <Image src={user.avatarUrl} alt="" fill sizes="32px" className="object-cover" /> : user.nickname[0]?.toUpperCase()}
    </span>
  )
}

function Photos({ urls, mine, onOpen }: { urls: string[]; mine: boolean; onOpen: (i: number) => void }) {
  const one = urls.length === 1
  return (
    <div className={`grid gap-1 ${one ? 'grid-cols-1' : 'grid-cols-2'} ${mine ? 'justify-items-end' : ''}`}>
      {urls.map((u, i) => (
        <button key={u + i} onClick={() => onOpen(i)} className={`relative overflow-hidden rounded-xl border border-line bg-sunken ${one ? 'w-56 h-56' : 'w-28 h-28'}`} aria-label={`사진 ${i + 1} 크게 보기`}>
          <Image src={u} alt="" fill sizes={one ? '224px' : '112px'} className="object-cover hover:scale-105 transition-transform" />
        </button>
      ))}
    </div>
  )
}

export function MessageList({ messages, meId, isBuyer, offersById, onRespond, respondPending, onRetry, onDelete, hasMore, onLoadOlder, typingName, emptyHint }: {
  messages: ChatMsg[]
  meId: string
  isBuyer: boolean
  offersById: Map<string, OfferInfo>
  onRespond: (offerId: string, action: 'ACCEPTED' | 'DECLINED') => void
  respondPending: boolean
  onRetry: (m: ChatMsg) => void
  onDelete: (m: ChatMsg) => void
  hasMore: boolean
  onLoadOlder: () => Promise<void>
  typingName: string | null
  emptyHint: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const prev = useRef<{ first?: string; last?: string; height: number }>({ height: 0 })
  const nearBottom = useRef(true)
  const loadingOlder = useRef(false)
  const [unseen, setUnseen] = useState(0)
  const [lightbox, setLightbox] = useState<{ images: string[]; start: number } | null>(null)
  const [olderBusy, setOlderBusy] = useState(false)

  // 스크롤 위치 관리: 이전 메시지를 붙이면 보던 위치 유지, 새 메시지는 아래에 있을 때만 따라 내려감
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const first = messages[0]?.id || messages[0]?.clientId
    const lastMsg = messages[messages.length - 1]
    const last = lastMsg?.id || lastMsg?.clientId
    const p = prev.current
    if (p.first && first !== p.first && last === p.last) {
      el.scrollTop += el.scrollHeight - p.height // 위에 붙음
    } else if (last !== p.last) {
      const mine = lastMsg?.sender.id === meId
      if (!p.last || nearBottom.current || mine) { el.scrollTop = el.scrollHeight; setUnseen(0) }
      else setUnseen(n => n + 1)
    } else if (nearBottom.current) {
      el.scrollTop = el.scrollHeight // 타이핑 표시 등 높이 변화
    }
    prev.current = { first, last, height: el.scrollHeight }
  }, [messages, meId, typingName])

  // 입력창·문구 패널이 열려 목록 높이가 바뀌어도, 맨 아래를 보고 있었다면 맨 아래 유지
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => { if (nearBottom.current) el.scrollTop = el.scrollHeight })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  async function onScroll() {
    const el = ref.current
    if (!el) return
    nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    if (nearBottom.current && unseen) setUnseen(0)
    if (el.scrollTop < 80 && hasMore && !loadingOlder.current) {
      loadingOlder.current = true; setOlderBusy(true)
      prev.current.height = el.scrollHeight
      try { await onLoadOlder() } finally { loadingOlder.current = false; setOlderBusy(false) }
    }
  }

  const jumpDown = () => { const el = ref.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); setUnseen(0) }

  return (
    <div className="relative flex-1 min-h-0 border-x border-line bg-bg/40">
      <div ref={ref} onScroll={onScroll} className="h-full overflow-y-auto px-3 py-4">
        {olderBusy && <div className="flex justify-center py-2"><Loader2 size={16} className="animate-spin text-muted" /></div>}
        {!hasMore && messages.length > 0 && <p className="text-center text-[11px] text-subtle pb-3">대화의 시작이에요</p>}
        {messages.length === 0 && (
          <div className="text-center text-subtle text-sm py-8"><p>아직 메시지가 없어요.</p><p className="text-xs mt-1">{emptyHint}</p></div>
        )}
        {messages.map((m, i) => {
          const prevM = messages[i - 1]
          const nextM = messages[i + 1]
          const newDay = !prevM || dayKey(prevM.createdAt) !== dayKey(m.createdAt)
          const mine = m.sender.id === meId
          const key = m.id || m.clientId
          const divider = newDay && (
            <div className="flex items-center gap-3 my-4 text-[11px] text-subtle"><span className="flex-1 h-px bg-line" />{dayLabel(m.createdAt)}<span className="flex-1 h-px bg-line" /></div>
          )

          if (m.type === 'SYSTEM') return (
            <div key={key}>
              {divider}
              <div className="flex justify-center my-3">
                <div className="max-w-[85%] rounded-2xl border border-line bg-surface px-4 py-2.5 text-center">
                  <p className="text-xs text-fg-3 whitespace-pre-wrap leading-relaxed">{m.content}</p>
                  <p className="text-[10px] text-subtle mt-1">{timeLabel(m.createdAt)}</p>
                </div>
              </div>
            </div>
          )

          const groupStart = newDay || !prevM || prevM.sender.id !== m.sender.id || prevM.type === 'SYSTEM'
          const groupEnd = !nextM || nextM.sender.id !== m.sender.id || nextM.type === 'SYSTEM' || !sameMinute(nextM.createdAt, m.createdAt) || dayKey(nextM.createdAt) !== dayKey(m.createdAt)
          const offer = m.type === 'OFFER' && m.offerId ? offersById.get(m.offerId) : undefined
          const deleted = !!m.deletedAt
          const canDelete = mine && !deleted && !m.pending && !m.failed && m.type !== 'OFFER' && withinDeleteWindow(m.createdAt)

          return (
            <div key={key}>
              {divider}
              <div className={`group flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''} ${groupStart ? 'mt-3' : 'mt-1'}`}>
                {!mine && <div className="w-8 shrink-0 self-start">{groupStart && <Avatar user={m.sender} />}</div>}
                <div className={`max-w-[75%] flex flex-col gap-1 ${mine ? 'items-end' : 'items-start'}`}>
                  {!mine && groupStart && <span className="text-[11px] text-muted ml-1">{m.sender.nickname}</span>}
                  {deleted ? (
                    <div className="px-3 py-2 rounded-2xl text-sm italic text-subtle border border-dashed border-line">삭제된 메시지예요</div>
                  ) : m.type === 'OFFER' ? (
                    <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 min-w-[200px]">
                      <p className="text-[11px] text-emerald-300 flex items-center gap-1 font-semibold"><Handshake size={12} />가격 제안</p>
                      <p className="text-sm text-fg whitespace-pre-wrap mt-1">{m.content}</p>
                      {offer && <p className="text-[11px] text-muted mt-1.5">{OFFER_CHIP[offer.status]}</p>}
                      {offer?.status === 'PENDING' && !isBuyer && (
                        <div className="flex gap-1.5 mt-2">
                          <button onClick={() => onRespond(offer.id, 'ACCEPTED')} disabled={respondPending} className="flex-1 h-8 rounded-lg bg-emerald-500 text-xs font-semibold text-white disabled:opacity-50">수락 · 예약</button>
                          <button onClick={() => onRespond(offer.id, 'DECLINED')} disabled={respondPending} className="flex-1 h-8 rounded-lg border border-line text-xs text-muted hover:text-fg disabled:opacity-50">거절</button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      {!!m.imageUrls?.length && <Photos urls={m.imageUrls} mine={mine} onOpen={start => setLightbox({ images: m.imageUrls!, start })} />}
                      {m.content && (
                        <div className={`px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${mine ? 'bg-accent text-white' : 'bg-surface-2 text-fg-2'} ${mine && groupStart ? 'rounded-tr-sm' : ''} ${!mine && groupStart ? 'rounded-tl-sm' : ''} ${m.pending ? 'opacity-60' : ''}`}>{m.content}</div>
                      )}
                    </>
                  )}
                  {m.flagged && !deleted && (
                    <p className={`max-w-[260px] flex items-start gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] leading-snug ${mine ? 'bg-amber-500/10 text-amber-200' : 'bg-rose-500/10 text-rose-200'}`}>
                      <ShieldAlert size={13} className="shrink-0 mt-px" />
                      {mine ? '연락처·계좌·외부 링크 공유는 상대방에게 주의 안내가 함께 표시돼요.' : '외부 메신저·직접 송금 유도는 사기일 수 있어요. 결제는 꼭 안전결제로 하세요.'}
                    </p>
                  )}
                </div>
                {/* 시간 · 읽음 · 상태 */}
                <div className={`flex flex-col text-[10px] leading-tight pb-0.5 ${mine ? 'items-end' : 'items-start'}`}>
                  {m.failed ? (
                    <button onClick={() => onRetry(m)} className="flex items-center gap-0.5 text-rose-300 hover:text-rose-200" title={m.failed}><RotateCw size={11} />재전송</button>
                  ) : m.pending ? (
                    <Loader2 size={11} className="animate-spin text-subtle" />
                  ) : (
                    <>
                      {mine && !m.readAt && !deleted && <span className="text-accent-fg font-bold">1</span>}
                      {groupEnd && <span className="text-subtle whitespace-nowrap">{timeLabel(m.createdAt)}</span>}
                    </>
                  )}
                  {canDelete && (
                    <button onClick={() => { if (confirm('이 메시지를 삭제할까요? 상대방에게도 삭제된 메시지로 보여요.')) onDelete(m) }}
                      className="opacity-0 group-hover:opacity-100 focus:opacity-100 mt-0.5 text-subtle hover:text-rose-300" aria-label="메시지 삭제" title="삭제 (보낸 뒤 5분 이내)"><Trash2 size={11} /></button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
        {typingName && (
          <div className="flex items-center gap-2 mt-3 ml-10 text-xs text-muted">
            <span className="inline-flex gap-0.5">{[0, 1, 2].map(d => <span key={d} className="w-1.5 h-1.5 rounded-full bg-muted animate-bounce" style={{ animationDelay: `${d * 150}ms` }} />)}</span>
            {typingName}님이 입력 중…
          </div>
        )}
      </div>
      {unseen > 0 && (
        <button onClick={jumpDown} className="absolute bottom-3 left-1/2 -translate-x-1/2 h-8 px-3 rounded-full bg-accent text-white text-xs font-semibold shadow-lg inline-flex items-center gap-1"><ArrowDown size={13} />새 메시지 {unseen}</button>
      )}
      {lightbox && <ImageLightbox images={lightbox.images} start={lightbox.start} onClose={() => setLightbox(null)} />}
    </div>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { MoreVertical, Store, Flag, Ban, LogOut } from 'lucide-react'

// 채팅방 더보기: 상점 보기 · 신고 · 차단 · 나가기
export function ChatMenu({ otherId, blockedByMe, onReport, onToggleBlock, onLeave }: {
  otherId: string; blockedByMe: boolean; onReport: () => void; onToggleBlock: () => void; onLeave: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  const item = 'w-full flex items-center gap-2 px-3 py-2 text-sm text-fg-2 hover:bg-surface-2 hover:text-fg text-left'
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(v => !v)} aria-label="더보기" aria-expanded={open} className="w-8 h-8 rounded-full text-muted hover:text-fg hover:bg-surface-2 flex items-center justify-center"><MoreVertical size={17} /></button>
      {open && (
        <div className="absolute right-0 top-9 z-20 w-44 rounded-xl border border-line bg-bg shadow-xl py-1" role="menu">
          <Link href={`/users/${otherId}`} className={item} role="menuitem"><Store size={14} />상점 보기</Link>
          <button onClick={() => { setOpen(false); onReport() }} className={item} role="menuitem"><Flag size={14} />신고하기</button>
          <button onClick={() => { setOpen(false); onToggleBlock() }} className={item} role="menuitem"><Ban size={14} />{blockedByMe ? '차단 해제' : '차단하기'}</button>
          <button onClick={() => { setOpen(false); onLeave() }} className={`${item} text-rose-300 hover:text-rose-200`} role="menuitem"><LogOut size={14} />채팅방 나가기</button>
        </div>
      )}
    </div>
  )
}

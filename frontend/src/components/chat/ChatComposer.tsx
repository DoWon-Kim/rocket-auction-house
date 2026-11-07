'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import { Send, ImagePlus, X, Loader2, MessageSquareText } from 'lucide-react'
import { api } from '@/lib/api'

interface Draft { key: string; url?: string; preview: string; failed?: boolean }
const MAX_IMAGES = 5

// 메시지 입력: 글 · 사진(선택·붙여넣기) · 자주 쓰는 문구 · 입력 중 신호
export function ChatComposer({ onSend, onTyping, quickReplies, disabled, disabledReason }: {
  onSend: (content: string, imageUrls: string[]) => void
  onTyping: (typing: boolean) => void
  quickReplies: string[]
  disabled?: boolean
  disabledReason?: string
}) {
  const [text, setText] = useState('')
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [showQuick, setShowQuick] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const typingAt = useRef(0)
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null)

  const uploading = drafts.some(d => !d.url && !d.failed)
  const ready = drafts.filter(d => d.url).map(d => d.url!)
  const canSend = !disabled && !uploading && (text.trim().length > 0 || ready.length > 0)

  function signalTyping() {
    const now = Date.now()
    if (now - typingAt.current > 2500) { typingAt.current = now; onTyping(true) }
    if (idle.current) clearTimeout(idle.current)
    idle.current = setTimeout(() => { typingAt.current = 0; onTyping(false) }, 3000)
  }

  async function addFiles(files: File[]) {
    const imgs = files.filter(f => f.type.startsWith('image/')).slice(0, MAX_IMAGES - drafts.length)
    for (const file of imgs) {
      const key = `${file.name}-${file.size}-${Math.random()}`
      const preview = URL.createObjectURL(file)
      setDrafts(d => [...d, { key, preview }])
      const fd = new FormData()
      fd.append('file', file)
      api.post<{ url: string }>('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
        .then(r => setDrafts(d => d.map(x => (x.key === key ? { ...x, url: r.data.url } : x))))
        .catch(() => setDrafts(d => d.map(x => (x.key === key ? { ...x, failed: true } : x))))
    }
  }

  function send(content = text) {
    if (disabled || uploading) return
    const c = content.trim()
    if (!c && ready.length === 0) return
    onSend(c, ready)
    drafts.forEach(d => URL.revokeObjectURL(d.preview))
    setText(''); setDrafts([]); setShowQuick(false)
    if (idle.current) clearTimeout(idle.current)
    typingAt.current = 0; onTyping(false)
    inputRef.current?.focus()
  }

  if (disabled) return (
    <div className="shrink-0 p-3 bg-surface border border-line rounded-b-2xl text-center text-xs text-muted">{disabledReason ?? '메시지를 보낼 수 없어요.'}</div>
  )

  return (
    <div className="shrink-0 bg-surface border border-line rounded-b-2xl">
      {showQuick && (
        <div className="flex gap-1.5 overflow-x-auto px-2 pt-2 pb-1">
          {quickReplies.map(q => (
            <button key={q} onClick={() => send(q)} className="shrink-0 h-8 px-3 rounded-full border border-line bg-sunken text-xs text-fg-2 hover:text-fg hover:border-accent/50">{q}</button>
          ))}
        </div>
      )}
      {drafts.length > 0 && (
        <div className="flex gap-2 px-2 pt-2">
          {drafts.map(d => (
            <div key={d.key} className="relative w-16 h-16 rounded-lg overflow-hidden border border-line bg-sunken">
              <Image src={d.preview} alt="" fill sizes="64px" className="object-cover" unoptimized />
              {!d.url && !d.failed && <span className="absolute inset-0 bg-black/50 flex items-center justify-center"><Loader2 size={16} className="animate-spin text-white" /></span>}
              {d.failed && <span className="absolute inset-0 bg-rose-900/70 flex items-center justify-center text-[10px] text-white">실패</span>}
              <button onClick={() => { URL.revokeObjectURL(d.preview); setDrafts(x => x.filter(y => y.key !== d.key)) }} aria-label="사진 빼기"
                className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center"><X size={11} /></button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-end gap-1.5 p-2">
        <button onClick={() => fileRef.current?.click()} disabled={drafts.length >= MAX_IMAGES} aria-label="사진 보내기" title="사진 (최대 5장)"
          className="w-9 h-9 shrink-0 rounded-xl text-muted hover:text-fg hover:bg-surface-2 flex items-center justify-center disabled:opacity-40"><ImagePlus size={18} /></button>
        <button onClick={() => setShowQuick(v => !v)} aria-label="자주 쓰는 문구" title="자주 쓰는 문구"
          className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center ${showQuick ? 'text-accent-fg bg-accent-tint' : 'text-muted hover:text-fg hover:bg-surface-2'}`}><MessageSquareText size={18} /></button>
        <textarea ref={inputRef} rows={1} value={text} aria-label="메시지"
          onChange={e => { setText(e.target.value); signalTyping() }}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send() } }}
          onPaste={e => { const files = Array.from(e.clipboardData.files); if (files.length) { e.preventDefault(); addFiles(files) } }}
          placeholder="메시지를 입력하세요"
          className="flex-1 bg-transparent resize-none text-sm focus:outline-none max-h-32 py-2 px-1 text-fg placeholder:text-subtle" />
        <button onClick={() => send()} disabled={!canSend} aria-label="보내기"
          className="w-9 h-9 shrink-0 rounded-xl bg-accent hover:bg-accent-strong disabled:opacity-40 text-white flex items-center justify-center"><Send size={15} /></button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => { const f = Array.from(e.target.files ?? []); e.target.value = ''; addFiles(f) }} />
      <p className="text-[10px] text-subtle px-3 pb-1.5">외부 메신저·계좌이체 유도는 사기일 수 있어요. 결제는 꼭 안전결제로 해주세요.</p>
    </div>
  )
}

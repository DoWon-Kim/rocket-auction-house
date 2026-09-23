'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, Lock } from 'lucide-react'
import { useAuthStore } from '@/lib/store'
import { BOARDS, TCG_OPTIONS, PERMISSION_LABEL, canUseBoard, textToHtml } from '@/lib/community'
import { RichEditor } from '@/components/community/RichEditor'
import { useCommunityStats } from '@/components/community/CommunityShell'

export interface PostDraft {
  title: string
  content: string   // HTML
  category: string
  tcgType: string
}

const DRAFT_KEY = 'community-draft'

// 에디터 HTML이 비어 있는지 (빈 문단만 있는 경우 포함)
function isEmptyHtml(html: string) {
  return !/<img\s/i.test(html) && !html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
}

function loadDraft(): PostDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    const d = raw ? JSON.parse(raw) as PostDraft : null
    if (!d || (!d.title && !d.content)) return null
    // 이전 버전(텍스트)에서 저장된 임시글 호환
    return d.content && !d.content.trimStart().startsWith('<') ? { ...d, content: textToHtml(d.content) } : d
  } catch { return null }
}

export function PostEditor({ initial, submitLabel, onSubmit, cancelHref, autosave, currentCategory }: {
  initial: PostDraft
  submitLabel: string
  onSubmit: (draft: PostDraft & { format: 'HTML' }) => Promise<void>
  cancelHref: string
  autosave?: boolean
  currentCategory?: string   // 수정 시 원래 게시판 (권한 없어도 유지 가능)
}) {
  const user = useAuthStore(s => s.user)
  const { data: stats } = useCommunityStats()
  const [draft, setDraft] = useState<PostDraft>(initial)
  const [editorKey, setEditorKey] = useState(0)   // 임시글 불러올 때 에디터 재생성
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [savedDraft, setSavedDraft] = useState<PostDraft | null>(() => (autosave ? loadDraft() : null))

  const allowed = (key: string) => key === currentCategory || canUseBoard(
    stats?.boards.find(b => b.category === key)?.writePermission, stats?.me?.grade, user?.role,
  )
  const permOf = (key: string) => stats?.boards.find(b => b.category === key)?.writePermission ?? 'ALL'

  // 선택된 게시판에 권한이 없으면 쓸 수 있는 첫 게시판으로 보정
  const category = allowed(draft.category) ? draft.category : (BOARDS.find(b => allowed(b.key))?.key ?? draft.category)

  // 임시저장 (새 글만, 1초 디바운스)
  useEffect(() => {
    if (!autosave || savedDraft) return
    const t = setTimeout(() => {
      try {
        if (draft.title || !isEmptyHtml(draft.content)) localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
      } catch { /* 저장 불가 환경은 무시 */ }
    }, 1000)
    return () => clearTimeout(t)
  }, [draft, autosave, savedDraft])

  const set = (patch: Partial<PostDraft>) => setDraft(d => ({ ...d, ...patch }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!draft.title.trim()) { setError('제목을 입력해주세요.'); return }
    if (isEmptyHtml(draft.content)) { setError('내용을 입력해주세요.'); return }
    if (!allowed(category)) { setError('이 게시판에 글을 쓸 권한이 없습니다.'); return }
    setSubmitting(true); setError('')
    try {
      await onSubmit({ ...draft, category, format: 'HTML' })
      if (autosave) { try { localStorage.removeItem(DRAFT_KEY) } catch { /* 무시 */ } }
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } }
      setError(e.response?.data?.message ?? '저장에 실패했습니다.')
      setSubmitting(false)
    }
  }

  const fieldCls = 'w-full bg-sunken/70 border border-line hover:border-line-strong focus:border-accent/60 focus:ring-4 focus:ring-accent/15 rounded-2xl px-4 text-sm text-fg placeholder:text-subtle focus:outline-none transition-all'
  const noBoard = !!stats && !BOARDS.some(b => allowed(b.key))

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {savedDraft && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-accent-line bg-accent/10 px-4 py-3 text-sm">
          <span className="text-fg-2 flex-1">임시저장된 글이 있습니다: <b className="text-fg">{savedDraft.title || '(제목 없음)'}</b></span>
          <button type="button" onClick={() => { setDraft(savedDraft); setSavedDraft(null); setEditorKey(k => k + 1) }}
            className="h-8 px-3.5 rounded-full bg-white text-bg text-xs font-semibold">불러오기</button>
          <button type="button" onClick={() => { try { localStorage.removeItem(DRAFT_KEY) } catch { /* 무시 */ } setSavedDraft(null) }}
            className="h-8 px-3.5 rounded-full border border-line-strong text-xs text-fg-3">삭제</button>
        </div>
      )}

      {noBoard && (
        <p className="flex items-center gap-2 rounded-2xl border border-line bg-surface/70 px-4 py-3 text-sm text-muted">
          <Lock size={14} /> 지금 등급으로 글을 쓸 수 있는 게시판이 없습니다. 댓글 활동으로 등급을 올려보세요.
        </p>
      )}

      <div className="rounded-3xl border border-line bg-surface/70 p-5 sm:p-6 space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-muted">게시판</span>
            <select value={category} onChange={e => set({ category: e.target.value })} className={`${fieldCls} h-11 cursor-pointer`}>
              {BOARDS.map(b => (
                <option key={b.key} value={b.key} disabled={!allowed(b.key)}>
                  {b.emoji} {b.label}{!allowed(b.key) ? ` 🔒 ${PERMISSION_LABEL[permOf(b.key)]}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-muted">TCG 말머리 <span className="text-subtle">(선택)</span></span>
            <select value={draft.tcgType} onChange={e => set({ tcgType: e.target.value })} className={`${fieldCls} h-11 cursor-pointer`}>
              <option value="">선택 안 함</option>
              {TCG_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
        </div>

        <div className="relative">
          <input value={draft.title} onChange={e => set({ title: e.target.value })} maxLength={200}
            placeholder="제목을 입력하세요" className={`${fieldCls} h-12 text-base font-semibold pr-16`} />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[11px] text-subtle tabular-nums">{draft.title.length}/200</span>
        </div>

        <RichEditor key={editorKey} initialHtml={draft.content} onChange={html => set({ content: html })} onError={setError} />

        <p className="text-[11px] text-subtle">거래 시 개인 연락처 공유는 사기 위험이 있으니 주의하세요. 등록된 글은 서식이 안전하게 정리되어 저장됩니다.</p>

        {error && <p className="text-sm text-rose-300 bg-rose-500/10 border border-rose-400/20 rounded-2xl px-4 py-3">{error}</p>}
      </div>

      <div className="flex justify-end gap-2">
        <Link href={cancelHref} className="h-12 px-6 inline-flex items-center rounded-full border border-line-strong text-sm font-semibold text-fg-2 hover:bg-surface-2 transition-colors">
          취소
        </Link>
        <button type="submit" disabled={submitting || noBoard}
          className="h-12 px-7 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-accent to-accent-strong text-white text-sm font-semibold shadow-[0_8px_28px_-6px_rgba(139,92,246,0.6)] disabled:opacity-50 transition-opacity">
          {submitting && <Loader2 size={15} className="animate-spin" />}{submitLabel}
        </button>
      </div>
    </form>
  )
}

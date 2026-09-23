'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ChevronRight, ChevronUp, ChevronDown, Eye, MessageSquare, ThumbsUp, Link2, Check,
  Pencil, Trash2, CornerDownRight, UserPlus, UserCheck, MessageCircle, PenSquare, List, Bookmark, Lock,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { TCG_LABELS } from '@/lib/utils'
import { BOARDS, PERMISSION_LABEL, canUseBoard, formatDateTime } from '@/lib/community'
import { PostContent } from '@/components/community/PostContent'
import { CommunityShell, GradeBadge, useCommunityStats } from '@/components/community/CommunityShell'

interface Author { id: string; nickname: string; grade?: string }

interface Comment {
  id: string
  content: string | null
  createdAt: string
  updatedAt: string
  parentId: string | null
  deletedAt: string | null
  likeCount: number
  likedByMe: boolean
  author: Author | null
}

interface PostDetail {
  id: string
  type: 'COMMUNITY' | 'NOTICE' | 'EVENT'
  title: string
  content: string
  contentFormat: 'TEXT' | 'HTML'
  category: string | null
  tcgType: string | null
  imageUrl: string | null
  imageUrls: string[]
  viewCount: number
  createdAt: string
  updatedAt: string
  likeCount: number
  likedByMe: boolean
  scrapCount: number
  scrappedByMe: boolean
  isBest: boolean
  author: Author
  comments: Comment[]
  prev: { id: string; title: string } | null
  next: { id: string; title: string } | null
}

type ApiError = { response?: { data?: { message?: string } } }
const errMsg = (e: unknown, fallback: string) => (e as ApiError).response?.data?.message ?? fallback

export default function CommunityDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const qc = useQueryClient()
  const user = useAuthStore(s => s.user)
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN'

  const [commentOrder, setCommentOrder] = useState<'asc' | 'desc'>('asc')
  const [copied, setCopied] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const { data: post, isLoading, isError } = useQuery<PostDetail>({
    queryKey: ['post', id],
    queryFn: () => api.get(`/posts/${id}`).then(r => r.data),
    enabled: !!id,
  })

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['post', id] })
    qc.invalidateQueries({ queryKey: ['community-stats'] })
  }

  const likePost = useMutation({
    mutationFn: () => api.post(`/posts/${id}/like`).then(r => r.data as { liked: boolean; likeCount: number }),
    onSuccess: d => qc.setQueryData<PostDetail>(['post', id], old => old && { ...old, likedByMe: d.liked, likeCount: d.likeCount }),
  })

  const scrapPost = useMutation({
    mutationFn: () => api.post(`/posts/${id}/scrap`).then(r => r.data as { scrapped: boolean; scrapCount: number }),
    onSuccess: d => {
      qc.setQueryData<PostDetail>(['post', id], old => old && { ...old, scrappedByMe: d.scrapped, scrapCount: d.scrapCount })
      qc.invalidateQueries({ queryKey: ['community-stats'] })
    },
  })
  const { data: stats } = useCommunityStats()

  const deletePost = useMutation({
    mutationFn: () => api.delete(`/posts/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['posts', 'COMMUNITY'] })
      qc.invalidateQueries({ queryKey: ['community-stats'] })
      router.push(post?.category ? `/community?board=${post.category}` : '/community')
    },
  })

  const { data: friendStatus } = useQuery<{ status: string; direction?: string } | null>({
    queryKey: ['friend-status', post?.author.id],
    queryFn: () => api.get(`/friends/status/${post!.author.id}`).then(r => r.data),
    enabled: !!user && !!post && user.id !== post.author.id,
  })
  const sendFriendReq = useMutation({
    mutationFn: (targetId: string) => api.post(`/friends/requests/${targetId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['friend-status', post?.author.id] }),
  })
  const dmWith = useMutation({
    mutationFn: (targetId: string) => api.get<{ id: string }>(`/dm/with/${targetId}`).then(r => r.data),
    onSuccess: room => router.push(`/dm/${room.id}`),
  })

  function copyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    }).catch(() => {})
  }

  if (isLoading) {
    return (
      <CommunityShell active="">
        <div className="rounded-3xl border border-line bg-surface/60 p-8 space-y-4 animate-pulse">
          <div className="h-4 w-24 bg-line rounded" />
          <div className="h-8 w-3/4 bg-line rounded-lg" />
          <div className="h-4 w-1/3 bg-line rounded" />
          <div className="h-px bg-line my-6" />
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className={`h-4 bg-line rounded ${i === 5 ? 'w-2/3' : ''}`} />)}
        </div>
      </CommunityShell>
    )
  }

  if (isError || !post) {
    return (
      <CommunityShell active="">
        <div className="py-24 text-center space-y-4">
          <p className="text-muted">삭제되었거나 존재하지 않는 게시글입니다.</p>
          <Link href="/community" className="inline-flex h-10 px-5 items-center rounded-full border border-line-strong text-sm text-fg-2">목록으로</Link>
        </div>
      </CommunityShell>
    )
  }

  const board = BOARDS.find(b => b.key === post.category)
  const isAuthor = user?.id === post.author.id
  const legacyImage = post.imageUrls.length === 0 ? post.imageUrl : null
  const listHref = board ? `/community?board=${board.key}` : '/community'
  const commentPerm = stats?.boards.find(b => b.category === post.category)?.commentPermission
  const canComment = canUseBoard(commentPerm, stats?.me?.grade, user?.role)

  // 댓글 트리 (답글은 원 댓글 아래 등록순)
  const tops = post.comments.filter(c => !c.parentId)
  const repliesOf = (cid: string) => post.comments.filter(c => c.parentId === cid)
  const orderedTops = commentOrder === 'asc' ? tops : [...tops].reverse()
  const liveCommentCount = post.comments.filter(c => !c.deletedAt).length

  return (
    <CommunityShell active={post.category ?? ''}>
      <article className="rounded-3xl border border-line bg-surface/60 overflow-hidden">
        {/* 헤더 */}
        <header className="px-5 sm:px-8 pt-6 sm:pt-8 pb-5 border-b border-line">
          <div className="flex items-center gap-1.5 text-sm">
            <Link href={listHref} className="text-accent-fg hover:text-accent-soft font-medium transition-colors">
              {board ? `${board.emoji} ${board.label}` : '커뮤니티'}
            </Link>
            <ChevronRight size={14} className="text-subtle" />
            {post.isBest && <span className="h-5 px-1.5 inline-flex items-center rounded-md bg-orange-500/15 text-orange-300 text-[10px] font-bold">인기글</span>}
          </div>

          <h1 className="mt-3 text-2xl sm:text-[28px] font-bold tracking-tight text-fg leading-snug break-words">
            {post.tcgType && <span className="text-accent-fg mr-2 text-xl sm:text-2xl">[{TCG_LABELS[post.tcgType]}]</span>}
            {post.title}
          </h1>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent to-accent-2 flex items-center justify-center text-white font-bold shrink-0">
              {post.author.nickname[0]?.toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Link href={`/users/${post.author.id}`} className="text-sm font-semibold text-fg hover:underline underline-offset-2">{post.author.nickname}</Link>
                <GradeBadge grade={post.author.grade} />
                {user && !isAuthor && (
                  friendStatus?.status === 'ACCEPTED' ? (
                    <button onClick={() => dmWith.mutate(post.author.id)} disabled={dmWith.isPending}
                      className="h-6 px-2 inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 text-accent-soft text-[11px]">
                      <MessageCircle size={11} /> DM
                    </button>
                  ) : friendStatus?.status === 'PENDING' ? (
                    <span className="h-6 px-2 inline-flex items-center gap-1 rounded-full border border-line text-muted text-[11px]">
                      <UserCheck size={11} /> {friendStatus.direction === 'sent' ? '요청됨' : '수락 대기'}
                    </span>
                  ) : (
                    <button onClick={() => sendFriendReq.mutate(post.author.id)} disabled={sendFriendReq.isPending}
                      className="h-6 px-2 inline-flex items-center gap-1 rounded-full border border-line text-muted hover:text-fg hover:border-line-strong text-[11px] transition-colors">
                      <UserPlus size={11} /> 친구
                    </button>
                  )
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted flex items-center gap-2.5 flex-wrap">
                <span className="tabular-nums">{formatDateTime(post.createdAt)}</span>
                <span className="flex items-center gap-1"><Eye size={12} />조회 {post.viewCount.toLocaleString()}</span>
                <span className="flex items-center gap-1"><MessageSquare size={12} />댓글 {liveCommentCount}</span>
              </p>
            </div>

            <div className="ml-auto flex items-center gap-1.5">
              <button onClick={copyLink}
                className="h-9 px-3.5 inline-flex items-center gap-1.5 rounded-full border border-line hover:border-line-strong text-xs text-fg-3 hover:text-fg transition-colors">
                {copied ? <><Check size={13} className="text-emerald-400" /> 복사됨</> : <><Link2 size={13} /> URL 복사</>}
              </button>
              {isAuthor && (
                <Link href={`/community/${id}/edit`}
                  className="h-9 px-3.5 inline-flex items-center gap-1.5 rounded-full border border-line hover:border-line-strong text-xs text-fg-3 hover:text-fg transition-colors">
                  <Pencil size={13} /> 수정
                </Link>
              )}
              {(isAuthor || isAdmin) && (
                confirmDelete ? (
                  <span className="flex items-center gap-1">
                    <button onClick={() => deletePost.mutate()} disabled={deletePost.isPending}
                      className="h-9 px-3.5 rounded-full bg-rose-500 hover:bg-rose-400 text-white text-xs font-semibold disabled:opacity-50">
                      {deletePost.isPending ? '삭제 중…' : '삭제 확인'}
                    </button>
                    <button onClick={() => setConfirmDelete(false)} className="h-9 px-3 rounded-full border border-line text-xs text-muted">취소</button>
                  </span>
                ) : (
                  <button onClick={() => setConfirmDelete(true)}
                    className="h-9 px-3.5 inline-flex items-center gap-1.5 rounded-full border border-line hover:border-rose-400/40 text-xs text-fg-3 hover:text-rose-300 transition-colors">
                    <Trash2 size={13} /> 삭제
                  </button>
                )
              )}
            </div>
          </div>
        </header>

        {/* 본문 */}
        <div className="px-5 sm:px-8 py-8">
          {legacyImage && (
            // eslint-disable-next-line @next/next/no-img-element -- 예전 대표 이미지
            <img src={legacyImage} alt="" className="max-w-full max-h-[720px] rounded-2xl border border-line mx-auto mb-6" />
          )}
          <PostContent content={post.content} format={post.contentFormat} />
          {post.updatedAt !== post.createdAt && new Date(post.updatedAt).getTime() - new Date(post.createdAt).getTime() > 60_000 && (
            <p className="mt-8 text-xs text-subtle">수정됨 · {formatDateTime(post.updatedAt)}</p>
          )}
        </div>

        {/* 추천 */}
        <div className="px-5 sm:px-8 pb-8 flex justify-center gap-2">
          <button onClick={() => user ? likePost.mutate() : router.push('/login')} disabled={likePost.isPending}
            className={`group h-14 px-8 inline-flex items-center gap-2.5 rounded-full border-2 text-sm font-semibold transition-all disabled:opacity-60 ${
              post.likedByMe
                ? 'border-accent bg-accent/15 text-accent-soft shadow-[0_0_24px_-4px_rgba(139,92,246,0.6)]'
                : 'border-line-strong text-fg-3 hover:border-accent/60 hover:text-fg'
            }`}>
            <ThumbsUp size={18} className={`${post.likedByMe ? 'fill-current' : ''} group-active:scale-90 transition-transform`} />
            추천 <span className="font-display tabular-nums text-base">{post.likeCount}</span>
          </button>
          <button onClick={() => user ? scrapPost.mutate() : router.push('/login')} disabled={scrapPost.isPending}
            className={`h-14 px-6 inline-flex items-center gap-2 rounded-full border-2 text-sm font-semibold transition-all disabled:opacity-60 ${
              post.scrappedByMe
                ? 'border-accent-2/70 bg-accent-2/10 text-cyan-200'
                : 'border-line-strong text-fg-3 hover:border-accent-2/50 hover:text-fg'
            }`}>
            <Bookmark size={17} className={post.scrappedByMe ? 'fill-current' : ''} />
            스크랩 {post.scrapCount > 0 && <span className="font-display tabular-nums">{post.scrapCount}</span>}
          </button>
        </div>

        {/* 댓글 */}
        <section className="border-t border-line bg-black/10">
          <div className="px-5 sm:px-8 h-14 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-fg">댓글 <span className="text-accent-2 tabular-nums">{liveCommentCount}</span></h2>
            <div className="flex items-center gap-3 text-xs">
              {(['asc', 'desc'] as const).map(o => (
                <button key={o} onClick={() => setCommentOrder(o)}
                  className={commentOrder === o ? 'text-fg font-semibold' : 'text-muted hover:text-fg'}>
                  {o === 'asc' ? '등록순' : '최신순'}
                </button>
              ))}
            </div>
          </div>

          <ul className="divide-y divide-line border-t border-line">
            {orderedTops.length === 0 && (
              <li className="py-12 text-center text-sm text-muted">첫 댓글을 남겨보세요.</li>
            )}
            {orderedTops.map(c => (
              <li key={c.id}>
                <CommentItem postId={id} comment={c} postAuthorId={post.author.id} onChanged={refresh} canReply={canComment} />
                {repliesOf(c.id).map(r => (
                  <div key={r.id} className="border-t border-line/60 bg-white/[0.015]">
                    <CommentItem postId={id} comment={r} postAuthorId={post.author.id} onChanged={refresh} canReply={canComment} isReply />
                  </div>
                ))}
              </li>
            ))}
          </ul>

          <div className="px-5 sm:px-8 py-5 border-t border-line">
            {user && !canComment ? (
              <p className="text-sm text-muted text-center py-3 flex items-center justify-center gap-1.5">
                <Lock size={13} /> 이 게시판은 {PERMISSION_LABEL[commentPerm ?? 'ALL']} 댓글을 달 수 있습니다.
              </p>
            ) : user ? (
              <CommentForm postId={id} onDone={refresh} />
            ) : (
              <p className="text-sm text-muted text-center py-3">
                댓글을 쓰려면 <Link href="/login" className="text-accent-fg hover:underline">로그인</Link>하세요.
              </p>
            )}
          </div>
        </section>
      </article>

      {/* 이전글 / 다음글 */}
      <nav className="mt-4 rounded-3xl border border-line bg-surface/60 divide-y divide-line overflow-hidden" aria-label="이전글 다음글">
        {[
          { label: '다음글', icon: <ChevronUp size={14} />, item: post.next },
          { label: '이전글', icon: <ChevronDown size={14} />, item: post.prev },
        ].map(({ label, icon, item }) => item ? (
          <Link key={label} href={`/community/${item.id}`} className="flex items-center gap-3 h-12 px-5 text-sm hover:bg-white/[0.03] transition-colors">
            <span className="flex items-center gap-1 text-muted w-16 shrink-0">{icon}{label}</span>
            <span className="text-fg-3 truncate">{item.title}</span>
          </Link>
        ) : (
          <div key={label} className="flex items-center gap-3 h-12 px-5 text-sm">
            <span className="flex items-center gap-1 text-subtle w-16 shrink-0">{icon}{label}</span>
            <span className="text-subtle">{label}이 없습니다.</span>
          </div>
        ))}
      </nav>

      <div className="mt-4 flex justify-between">
        <Link href={listHref} className="h-11 px-5 inline-flex items-center gap-1.5 rounded-full border border-line-strong text-sm text-fg-2 hover:bg-surface-2 transition-colors">
          <List size={15} /> 목록
        </Link>
        <Link href={user ? `/community/write${board ? `?board=${board.key}` : ''}` : '/login'}
          className="h-11 px-5 inline-flex items-center gap-1.5 rounded-full bg-white text-bg text-sm font-semibold hover:bg-fg-2 transition-colors">
          <PenSquare size={15} /> 글쓰기
        </Link>
      </div>
    </CommunityShell>
  )
}

function CommentItem({ postId, comment, postAuthorId, onChanged, canReply, isReply }: {
  postId: string
  comment: Comment
  postAuthorId: string
  onChanged: () => void
  canReply: boolean
  isReply?: boolean
}) {
  const user = useAuthStore(s => s.user)
  const router = useRouter()
  const qc = useQueryClient()
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN'
  const [replying, setReplying] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(comment.content ?? '')
  const [error, setError] = useState('')

  const like = useMutation({
    mutationFn: () => api.post(`/posts/${postId}/comments/${comment.id}/like`).then(r => r.data as { liked: boolean; likeCount: number }),
    onSuccess: d => qc.setQueryData<PostDetail>(['post', postId], old => old && {
      ...old, comments: old.comments.map(c => c.id === comment.id ? { ...c, likedByMe: d.liked, likeCount: d.likeCount } : c),
    }),
  })
  const save = useMutation({
    mutationFn: () => api.patch(`/posts/${postId}/comments/${comment.id}`, { content: editText }),
    onSuccess: () => { setEditing(false); onChanged() },
    onError: e => setError(errMsg(e, '수정에 실패했습니다.')),
  })
  const remove = useMutation({
    mutationFn: () => api.delete(`/posts/${postId}/comments/${comment.id}`),
    onSuccess: onChanged,
  })

  const pad = isReply ? 'pl-12 sm:pl-16' : 'pl-5 sm:pl-8'

  if (comment.deletedAt || !comment.author) {
    return <p className={`${pad} pr-5 sm:pr-8 py-4 text-sm text-subtle`}>삭제된 댓글입니다.</p>
  }

  const mine = user?.id === comment.author.id
  const edited = new Date(comment.updatedAt).getTime() - new Date(comment.createdAt).getTime() > 1000

  return (
    <div className={`${pad} pr-5 sm:pr-8 py-4`}>
      <div className="flex gap-3">
        {isReply && <CornerDownRight size={15} className="text-subtle shrink-0 mt-2 -ml-6" />}
        <div className="w-8 h-8 rounded-full bg-surface-2 border border-line flex items-center justify-center text-xs font-semibold text-fg-3 shrink-0">
          {comment.author.nickname[0]?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-fg">{comment.author.nickname}</span>
            {comment.author.id === postAuthorId && (
              <span className="h-5 px-1.5 inline-flex items-center rounded-md border border-accent/40 text-accent-soft text-[10px] font-semibold">작성자</span>
            )}
            <GradeBadge grade={comment.author.grade} compact />
          </div>

          {editing ? (
            <div className="mt-2 space-y-2">
              <textarea value={editText} onChange={e => setEditText(e.target.value)} rows={3} maxLength={1000}
                className="w-full bg-sunken border border-line focus:border-accent/60 rounded-2xl px-4 py-3 text-sm text-fg focus:outline-none resize-none" />
              {error && <p className="text-xs text-rose-300">{error}</p>}
              <div className="flex justify-end gap-1.5">
                <button onClick={() => { setEditing(false); setEditText(comment.content ?? '') }} className="h-8 px-3.5 rounded-full border border-line text-xs text-muted">취소</button>
                <button onClick={() => save.mutate()} disabled={save.isPending || !editText.trim()}
                  className="h-8 px-3.5 rounded-full bg-white text-bg text-xs font-semibold disabled:opacity-50">저장</button>
              </div>
            </div>
          ) : (
            <p className="mt-1 text-sm text-fg-2 whitespace-pre-wrap break-words leading-relaxed">{comment.content}</p>
          )}

          <div className="mt-2 flex items-center gap-3 text-xs text-muted">
            <span className="tabular-nums">{formatDateTime(comment.createdAt)}{edited && ' (수정됨)'}</span>
            {user && canReply && !editing && (
              <button onClick={() => setReplying(v => !v)} className="hover:text-fg transition-colors">답글쓰기</button>
            )}
            <button onClick={() => user ? like.mutate() : router.push('/login')}
              className={`flex items-center gap-1 transition-colors ${comment.likedByMe ? 'text-accent-soft' : 'hover:text-fg'}`}>
              <ThumbsUp size={12} className={comment.likedByMe ? 'fill-current' : ''} />{comment.likeCount > 0 && comment.likeCount}
            </button>
            {mine && !editing && <button onClick={() => setEditing(true)} className="hover:text-fg transition-colors">수정</button>}
            {(mine || isAdmin) && !editing && (
              <button onClick={() => remove.mutate()} disabled={remove.isPending} className="hover:text-rose-300 transition-colors">삭제</button>
            )}
          </div>

          {replying && (
            <div className="mt-3">
              <CommentForm postId={postId} parentId={comment.id} replyTo={comment.author.nickname}
                onDone={() => { setReplying(false); onChanged() }} onCancel={() => setReplying(false)} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function CommentForm({ postId, parentId, replyTo, onDone, onCancel }: {
  postId: string
  parentId?: string
  replyTo?: string
  onDone: () => void
  onCancel?: () => void
}) {
  const user = useAuthStore(s => s.user)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const submit = useMutation({
    mutationFn: () => api.post(`/posts/${postId}/comments`, { content: text, parentId }),
    onSuccess: () => { setText(''); setError(''); onDone() },
    onError: e => setError(errMsg(e, '댓글 등록에 실패했습니다.')),
  })

  return (
    <form onSubmit={e => { e.preventDefault(); if (text.trim()) submit.mutate() }}
      className="rounded-2xl border border-line bg-sunken/70 focus-within:border-accent/60 focus-within:ring-4 focus-within:ring-accent/15 transition-all">
      <p className="px-4 pt-3 text-xs font-semibold text-fg-3">{user?.nickname}{replyTo && <span className="text-muted font-normal"> → {replyTo}님에게 답글</span>}</p>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={parentId ? 2 : 3} maxLength={1000}
        placeholder={parentId ? '답글을 남겨보세요' : '댓글을 남겨보세요'}
        className="w-full bg-transparent px-4 py-2 text-sm text-fg placeholder:text-subtle focus:outline-none resize-none" />
      <div className="flex items-center justify-between px-4 pb-3">
        <span className="text-[11px] text-subtle tabular-nums">{text.length}/1000</span>
        <div className="flex items-center gap-1.5">
          {error && <span className="text-xs text-rose-300 mr-2">{error}</span>}
          {onCancel && <button type="button" onClick={onCancel} className="h-8 px-3.5 rounded-full text-xs text-muted hover:text-fg">취소</button>}
          <button type="submit" disabled={submit.isPending || !text.trim()}
            className="h-8 px-4 rounded-full bg-white text-bg text-xs font-semibold disabled:opacity-40 transition-opacity">
            {submit.isPending ? '등록 중…' : '등록'}
          </button>
        </div>
      </div>
    </form>
  )
}

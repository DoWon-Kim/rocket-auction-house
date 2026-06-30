'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { useState } from 'react'
import { ArrowLeft, Eye, MessageSquare, Trash2, Calendar, Pin, ThumbsUp } from 'lucide-react'

interface Comment {
  id: string
  content: string
  createdAt: string
  likeCount: number
  likedByMe: boolean
  author: { id: string; nickname: string }
}

interface PostDetail {
  id: string
  type: 'NOTICE' | 'EVENT'
  title: string
  content: string
  pinned: boolean
  viewCount: number
  imageUrl?: string
  eventStartAt?: string
  eventEndAt?: string
  createdAt: string
  likeCount: number
  likedByMe: boolean
  author: { nickname: string }
  comments: Comment[]
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function NoticeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [commentText, setCommentText] = useState('')

  const { data: post, isLoading } = useQuery<PostDetail>({
    queryKey: ['post', id],
    queryFn: () => api.get(`/posts/${id}`).then(r => r.data),
    enabled: !!id,
  })

  const addComment = useMutation({
    mutationFn: (content: string) =>
      api.post(`/posts/${id}/comments`, { content }).then(r => r.data),
    onSuccess: () => {
      setCommentText('')
      queryClient.invalidateQueries({ queryKey: ['post', id] })
    },
  })

  const deleteComment = useMutation({
    mutationFn: (commentId: string) =>
      api.delete(`/posts/${id}/comments/${commentId}`).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post', id] })
    },
  })

  const togglePostLike = useMutation({
    mutationFn: () => api.post(`/posts/${id}/like`).then(r => r.data),
    onSuccess: (data) => {
      queryClient.setQueryData<PostDetail>(['post', id], old =>
        old ? { ...old, likedByMe: data.liked, likeCount: data.likeCount } : old
      )
    },
  })

  const toggleCommentLike = useMutation({
    mutationFn: (commentId: string) =>
      api.post(`/posts/${id}/comments/${commentId}/like`).then(r => ({ ...r.data, commentId })),
    onSuccess: (data) => {
      queryClient.setQueryData<PostDetail>(['post', id], old => {
        if (!old) return old
        return {
          ...old,
          comments: old.comments.map(c =>
            c.id === data.commentId ? { ...c, likedByMe: data.liked, likeCount: data.likeCount } : c
          ),
        }
      })
    },
  })

  function handleSubmitComment(e: React.FormEvent) {
    e.preventDefault()
    if (!commentText.trim()) return
    addComment.mutate(commentText.trim())
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        {/* Back button skeleton */}
        <div className="w-20 h-8 bg-[#1a1410] border border-[#2e2318] rounded-xl animate-pulse" />
        {/* Card skeleton */}
        <div className="bg-[#1a1410] border border-[#2e2318] rounded-2xl p-6 space-y-4 animate-pulse">
          <div className="w-16 h-5 bg-[#2e2318] rounded-lg" />
          <div className="w-3/4 h-7 bg-[#2e2318] rounded-lg" />
          <div className="flex gap-4">
            <div className="w-24 h-4 bg-[#2e2318] rounded" />
            <div className="w-16 h-4 bg-[#2e2318] rounded" />
          </div>
          <div className="h-px bg-[#2e2318]" />
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-4 bg-[#2e2318] rounded" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!post) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <p className="text-[#5a4830] text-sm">게시글을 찾을 수 없습니다.</p>
        <button
          onClick={() => router.push('/notice')}
          className="px-4 py-2 bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] text-[#9e8a6a] rounded-xl text-sm transition-colors"
        >
          목록으로
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Back button */}
      <button
        onClick={() => router.push('/notice')}
        className="flex items-center gap-1.5 text-sm text-[#8a7055] hover:text-[#f5ead8] transition-colors"
      >
        <ArrowLeft size={15} />
        목록으로
      </button>

      {/* Post card */}
      <div className="bg-[#1a1410] border border-[#2e2318] rounded-2xl overflow-hidden">
        {/* Post header */}
        <div className="px-6 pt-6 pb-5 border-b border-[#2e2318] space-y-3">
          {/* Badges */}
          <div className="flex items-center gap-2">
            {post.pinned && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[#2a1f08] text-[#f0a832] border border-[#3d2e0c]">
                <Pin size={9} />
                공지
              </span>
            )}
            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
              post.type === 'NOTICE'
                ? 'bg-[#0d1a2e] text-[#8a7055] border-[#2e2318]'
                : 'bg-[#1a1f08] text-[#c8a832] border-[#2e2a0c]'
            }`}>
              {post.type === 'NOTICE' ? '공지사항' : '이벤트'}
            </span>
          </div>

          {/* Title */}
          <h1 className="text-xl font-bold text-[#f5ead8] leading-snug">{post.title}</h1>

          {/* Meta */}
          <div className="flex flex-wrap items-center gap-4 text-xs text-[#5a4830]">
            <span>{post.author.nickname}</span>
            <span>{formatDateTime(post.createdAt)}</span>
            <span className="flex items-center gap-1">
              <Eye size={11} />
              {post.viewCount.toLocaleString()}
            </span>
            <span className="flex items-center gap-1">
              <MessageSquare size={11} />
              {post.comments?.length ?? 0}
            </span>
          </div>

          {/* Event period */}
          {post.type === 'EVENT' && post.eventStartAt && post.eventEndAt && (
            <div className="flex items-center gap-2 px-3 py-2 bg-[#12180a] border border-[#1e2a0e] rounded-xl w-fit">
              <Calendar size={12} className="text-[#c8a832]" />
              <span className="text-xs text-[#c8a832] font-medium">
                {formatDate(post.eventStartAt)} ~ {formatDate(post.eventEndAt)}
              </span>
            </div>
          )}
        </div>

        {/* Post body */}
        <div className="px-6 py-6">
          {post.imageUrl && (
            <img
              src={post.imageUrl}
              alt={post.title}
              className="w-full rounded-xl object-cover max-h-96 mb-6"
            />
          )}
          <p className="text-sm text-[#e8d5b0] whitespace-pre-wrap leading-relaxed">
            {post.content}
          </p>
        </div>

        {/* 추천 버튼 */}
        <div className="px-6 pb-6 flex justify-center">
          <button
            onClick={() => user ? togglePostLike.mutate() : router.push('/login')}
            disabled={togglePostLike.isPending}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl border font-semibold text-sm transition-colors disabled:opacity-40 ${
              post.likedByMe
                ? 'bg-[#d4a853]/10 border-[#d4a853]/40 text-[#e0b878]'
                : 'bg-[#1a1410] border-[#2e2318] hover:border-[#d4a853]/30 text-[#7a6040] hover:text-[#e0b878]'
            }`}
          >
            <ThumbsUp size={14} className={post.likedByMe ? 'fill-current' : ''} />
            추천 {post.likeCount > 0 && <span className="tabular-nums">{post.likeCount}</span>}
          </button>
        </div>
      </div>

      {/* Comments section */}
      <div className="bg-[#1a1410] border border-[#2e2318] rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#2e2318]">
          <h2 className="text-sm font-semibold text-[#f5ead8] flex items-center gap-2">
            <MessageSquare size={14} className="text-[#d4a853]" />
            댓글
            <span className="text-[#5a4830] font-normal">{post.comments.length}</span>
          </h2>
        </div>

        {/* Comment list */}
        <div className="divide-y divide-[#2e2318]">
          {post.comments.length === 0 ? (
            <div className="flex items-center justify-center py-10">
              <p className="text-sm text-[#5a4830]">첫 댓글을 작성해 보세요.</p>
            </div>
          ) : (
            post.comments.map((comment) => (
              <div key={comment.id} className="px-6 py-4 flex gap-3 group">
                <div className="w-7 h-7 rounded-full bg-[#2e2318] flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-[10px] text-[#7a6040] font-semibold">
                    {comment.author.nickname.slice(0, 1).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-[#9e8a6a]">{comment.author.nickname}</span>
                    {user?.id === comment.author.id && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#2a1c08] text-[#d4a853] border border-[#4a3520] font-semibold">나</span>
                    )}
                    <span className="text-[10px] text-[#5a4830]">{formatDateTime(comment.createdAt)}</span>
                  </div>
                  <p className="text-sm text-[#e8d5b0] whitespace-pre-wrap">{comment.content}</p>
                  <button
                    onClick={() => user ? toggleCommentLike.mutate(comment.id) : router.push('/login')}
                    className={`mt-1.5 flex items-center gap-1 text-[10px] transition-colors ${
                      comment.likedByMe ? 'text-[#e0b878]' : 'text-[#5a4830] hover:text-[#e0b878]'
                    }`}
                  >
                    <ThumbsUp size={10} className={comment.likedByMe ? 'fill-current' : ''} />
                    {comment.likeCount > 0 ? comment.likeCount : '추천'}
                  </button>
                </div>
                {user?.id === comment.author.id && (
                  <button
                    onClick={() => deleteComment.mutate(comment.id)}
                    disabled={deleteComment.isPending}
                    className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg text-[#5a4830] hover:text-red-400 hover:bg-red-400/10"
                    title="댓글 삭제"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {/* Comment input */}
        <div className="px-6 py-4 border-t border-[#2e2318]">
          {user ? (
            <form onSubmit={handleSubmitComment} className="flex gap-3">
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="댓글을 입력하세요..."
                className="flex-1 bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] focus:border-[#d4a853]/40 rounded-xl px-4 py-2.5 text-sm text-[#f5ead8] placeholder:text-[#5a4830] focus:outline-none transition-colors"
              />
              <button
                type="submit"
                disabled={addComment.isPending || !commentText.trim()}
                className="px-4 py-2.5 bg-[#d4a853] hover:bg-[#c49440] text-white rounded-xl font-semibold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {addComment.isPending ? (
                  <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                ) : null}
                등록
              </button>
            </form>
          ) : (
            <div className="flex items-center justify-center py-4">
              <p className="text-sm text-[#5a4830]">
                <button
                  onClick={() => router.push('/login')}
                  className="text-[#d4a853] hover:underline"
                >
                  로그인
                </button>{' '}
                후 댓글을 작성할 수 있습니다.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

'use client'

import { Suspense, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { Plus, Trash2, X, Pin, Pencil } from 'lucide-react'
import { ImageUpload } from '@/components/ImageUpload'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { TCG_LABELS } from '@/lib/utils'

type PostType = 'NOTICE' | 'EVENT' | 'COMMUNITY'

const TCG_OPTIONS = [
  { value: 'POKEMON',  label: TCG_LABELS.POKEMON },
  { value: 'YUGIOH',   label: TCG_LABELS.YUGIOH },
  { value: 'MTG',      label: TCG_LABELS.MTG },
  { value: 'DIGIMON',  label: TCG_LABELS.DIGIMON },
  { value: 'ONEPIECE', label: TCG_LABELS.ONEPIECE },
  { value: 'WEISS',    label: TCG_LABELS.WEISS },
  { value: 'OTHER',    label: TCG_LABELS.OTHER },
]

interface Post {
  id: string
  type: PostType
  title: string
  pinned: boolean
  viewCount: number
  createdAt: string
  author: { nickname: string }
  _count: { comments: number }
}

interface CreatePostPayload {
  type: PostType
  title: string
  content: string
  pinned?: boolean
  imageUrl?: string
  tcgType?: string | null
  eventStartAt?: string
  eventEndAt?: string
}

interface EditPostPayload {
  title: string
  content: string
  pinned?: boolean
  imageUrl?: string
  tcgType?: string | null
  eventStartAt?: string
  eventEndAt?: string
}

const TABS: { label: string; value: PostType }[] = [
  { label: '공지', value: 'NOTICE' },
  { label: '이벤트', value: 'EVENT' },
  { label: '공유', value: 'COMMUNITY' },
]

function PostsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()

  const activeType = (searchParams.get('type') as PostType) ?? 'NOTICE'

  const [showForm, setShowForm] = useState(false)
  const [editingPost, setEditingPost] = useState<Post | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [pinned, setPinned] = useState(false)
  const [imageUrl, setImageUrl] = useState('')
  const [tcgType, setTcgType] = useState('')
  const [eventStartAt, setEventStartAt] = useState('')
  const [eventEndAt, setEventEndAt] = useState('')

  const { data, isLoading } = useQuery<{ posts: Post[] }>({
    queryKey: ['admin', 'posts', activeType],
    queryFn: () => api.get(`/posts?type=${activeType}&limit=50`).then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (payload: CreatePostPayload) => api.post('/admin/posts', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'posts', activeType] })
      resetForm()
    },
  })

  const editMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: EditPostPayload }) =>
      api.patch(`/admin/posts/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'posts', activeType] })
      resetForm()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/posts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'posts', activeType] })
    },
  })

  const pinMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/admin/posts/${id}/pin`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'posts', activeType] })
    },
  })

  function resetForm() {
    setShowForm(false)
    setEditingPost(null)
    setTitle('')
    setContent('')
    setPinned(false)
    setImageUrl('')
    setTcgType('')
    setEventStartAt('')
    setEventEndAt('')
  }

  function startEdit(post: Post) {
    setEditingPost(post)
    setShowForm(false)
    setTitle(post.title)
    setContent('')
    setPinned(post.pinned)
    setImageUrl('')
    setTcgType('')
    setEventStartAt('')
    setEventEndAt('')
    api.get(`/posts/${post.id}`).then(r => {
      setContent(r.data.content ?? '')
      setImageUrl(r.data.imageUrl ?? '')
      setTcgType(r.data.tcgType ?? '')
      setEventStartAt(r.data.eventStartAt ? r.data.eventStartAt.slice(0, 16) : '')
      setEventEndAt(r.data.eventEndAt ? r.data.eventEndAt.slice(0, 16) : '')
    })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !content.trim()) return

    if (editingPost) {
      const payload: EditPostPayload = {
        title: title.trim(),
        content: content.trim(),
        pinned: editingPost.type !== 'COMMUNITY' ? pinned : undefined,
      }
      if (imageUrl.trim()) payload.imageUrl = imageUrl.trim()
      if (editingPost.type === 'COMMUNITY') payload.tcgType = tcgType || null
      if (editingPost.type === 'EVENT') {
        if (eventStartAt) payload.eventStartAt = eventStartAt
        if (eventEndAt) payload.eventEndAt = eventEndAt
      }
      editMutation.mutate({ id: editingPost.id, payload })
      return
    }

    const payload: CreatePostPayload = {
      type: activeType,
      title: title.trim(),
      content: content.trim(),
    }
    if (activeType !== 'COMMUNITY') payload.pinned = pinned
    if (imageUrl.trim()) payload.imageUrl = imageUrl.trim()
    if (activeType === 'COMMUNITY') payload.tcgType = tcgType || null
    if (activeType === 'EVENT') {
      if (eventStartAt) payload.eventStartAt = eventStartAt
      if (eventEndAt) payload.eventEndAt = eventEndAt
    }

    createMutation.mutate(payload)
  }

  function handleTabChange(type: PostType) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('type', type)
    router.push(`?${params.toString()}`)
    setShowForm(false)
  }

  const posts = data?.posts ?? []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#f5ead8]">게시글 관리</h1>
          <p className="text-sm text-[#8a7055] mt-1">공지, 이벤트, 커뮤니티 게시글을 관리합니다.</p>
        </div>
        {!showForm && !editingPost && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#d4a853] hover:bg-[#c49440] text-white rounded-xl font-semibold text-sm transition-colors"
          >
            <Plus size={15} />
            글 작성
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#1a1410] border border-[#2e2318] rounded-xl p-1 w-fit">
        {TABS.map(tab => (
          <button
            key={tab.value}
            onClick={() => handleTabChange(tab.value)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeType === tab.value
                ? 'bg-[#2e2318] text-[#f5ead8]'
                : 'text-[#8a7055] hover:text-[#e8d5b0]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Create / Edit Form */}
      {(showForm || editingPost) && (
        <div className="bg-[#1a1410] border border-[#2e2318] rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-[#f5ead8]">
              {editingPost ? `글 수정 — ${editingPost.title.slice(0, 30)}` : `새 글 작성 (${TABS.find(t => t.value === activeType)?.label})`}
            </h2>
            <button
              onClick={resetForm}
              className="h-7 w-7 flex items-center justify-center text-[#5a4830] hover:text-[#f5ead8] hover:bg-[#2e2318] rounded-lg transition-colors"
            >
              <X size={15} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Title */}
            <div>
              <label className="block text-xs text-[#8a7055] mb-1.5 font-medium">제목 *</label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="제목을 입력하세요"
                required
                className="w-full bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] focus:border-[#d4a853]/40 rounded-xl px-4 py-2.5 text-sm text-[#f5ead8] placeholder:text-[#5a4830] focus:outline-none transition-colors"
              />
            </div>

            {/* Content */}
            <div>
              <label className="block text-xs text-[#8a7055] mb-1.5 font-medium">내용 *</label>
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="내용을 입력하세요"
                rows={8}
                required
                className="w-full bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] focus:border-[#d4a853]/40 rounded-xl px-4 py-2.5 text-sm text-[#f5ead8] placeholder:text-[#5a4830] focus:outline-none transition-colors resize-none"
              />
            </div>

            {/* TCG 카테고리 (COMMUNITY 탭 전용) */}
            {(activeType === 'COMMUNITY' || editingPost?.type === 'COMMUNITY') && (
              <div>
                <label className="block text-xs text-[#8a7055] mb-1.5 font-medium">
                  TCG 카테고리 <span className="text-[#4a3820] font-normal">(선택)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {TCG_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setTcgType(prev => prev === opt.value ? '' : opt.value)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                        tcgType === opt.value
                          ? 'bg-[#d4a853]/20 text-[#e0b878] border-[#d4a853]/40'
                          : 'bg-transparent text-[#7a6040] border-[#2e2318] hover:border-[#4a3520] hover:text-[#9e8a6a]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Image upload */}
            <ImageUpload value={imageUrl} onChange={setImageUrl} />

            {/* Pin + Event dates row */}
            <div className="flex flex-wrap items-start gap-4">
              {/* Pinned checkbox — NOTICE / EVENT only */}
              {activeType !== 'COMMUNITY' && (
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${pinned ? 'bg-[#d4a853] border-[#d4a853]' : 'bg-transparent border-[#4a3520] group-hover:border-[#d4a853]/60'}`}
                    onClick={() => setPinned(v => !v)}>
                    {pinned && <svg viewBox="0 0 10 8" className="w-2.5 h-2.5 fill-white"><path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  </div>
                  <input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} className="sr-only" />
                  <span className="text-sm text-[#8a7055] select-none">핀고정</span>
                </label>
              )}

              {/* Event dates */}
              {activeType === 'EVENT' && (
                <div className="flex flex-wrap gap-3 flex-1">
                  <div className="flex-1 min-w-[160px]">
                    <label className="block text-xs text-[#8a7055] mb-1.5 font-medium">이벤트 시작일</label>
                    <input
                      type="datetime-local"
                      value={eventStartAt}
                      onChange={e => setEventStartAt(e.target.value)}
                      className="w-full bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] focus:border-[#d4a853]/40 rounded-xl px-4 py-2.5 text-sm text-[#f5ead8] focus:outline-none transition-colors"
                    />
                  </div>
                  <div className="flex-1 min-w-[160px]">
                    <label className="block text-xs text-[#8a7055] mb-1.5 font-medium">이벤트 종료일</label>
                    <input
                      type="datetime-local"
                      value={eventEndAt}
                      onChange={e => setEventEndAt(e.target.value)}
                      className="w-full bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] focus:border-[#d4a853]/40 rounded-xl px-4 py-2.5 text-sm text-[#f5ead8] focus:outline-none transition-colors"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] text-[#9e8a6a] rounded-xl text-sm transition-colors"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending || editMutation.isPending}
                className="px-5 py-2 bg-[#d4a853] hover:bg-[#c49440] text-white rounded-xl font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {createMutation.isPending || editMutation.isPending ? '저장 중...' : editingPost ? '수정 완료' : '저장'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Posts table */}
      <div className="bg-[#1a1410] border border-[#2e2318] rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="space-y-0">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="border-b border-[#2e2318] h-14 animate-pulse" />
            ))}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#2e2318]">
                <th className="text-left px-5 py-3 text-xs text-[#5a4830] uppercase tracking-wider font-semibold">제목</th>
                <th className="text-left px-5 py-3 text-xs text-[#5a4830] uppercase tracking-wider font-semibold hidden md:table-cell">작성자</th>
                <th className="text-right px-5 py-3 text-xs text-[#5a4830] uppercase tracking-wider font-semibold hidden sm:table-cell">조회</th>
                <th className="text-right px-5 py-3 text-xs text-[#5a4830] uppercase tracking-wider font-semibold hidden sm:table-cell">댓글</th>
                <th className="text-right px-5 py-3 text-xs text-[#5a4830] uppercase tracking-wider font-semibold hidden md:table-cell">작성일</th>
                <th className="text-right px-5 py-3 text-xs text-[#5a4830] uppercase tracking-wider font-semibold">관리</th>
              </tr>
            </thead>
            <tbody>
              {posts.map(post => (
                <tr key={post.id} className="border-b border-[#2e2318] hover:bg-[#1a1208] transition-colors last:border-b-0">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      {post.pinned && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#2a1f08] text-[#f0a832] shrink-0">
                          <Pin size={9} />
                          고정
                        </span>
                      )}
                      <span className="font-medium text-[#f5ead8] truncate max-w-[200px] sm:max-w-xs">{post.title}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-[#8a7055] hidden md:table-cell">{post.author.nickname}</td>
                  <td className="px-5 py-3 text-right text-[#8a7055] tabular-nums hidden sm:table-cell">{post.viewCount.toLocaleString()}</td>
                  <td className="px-5 py-3 text-right text-[#8a7055] tabular-nums hidden sm:table-cell">{post._count.comments}</td>
                  <td className="px-5 py-3 text-right text-[#5a4830] text-xs hidden md:table-cell">
                    {format(new Date(post.createdAt), 'MM/dd HH:mm', { locale: ko })}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {post.type !== 'COMMUNITY' && (
                        <button
                          onClick={() => pinMutation.mutate(post.id)}
                          disabled={pinMutation.isPending}
                          title={post.pinned ? '고정 해제' : '상단 고정'}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg transition-colors disabled:opacity-40 ${
                            post.pinned
                              ? 'text-[#f0a832] bg-[#2a1f08] hover:bg-[#3d2e0c]'
                              : 'text-[#7a6040] hover:text-[#f0a832] hover:bg-[#2a1f08]'
                          }`}
                        >
                          <Pin size={12} />
                          {post.pinned ? '고정됨' : '고정'}
                        </button>
                      )}
                      <button
                        onClick={() => startEdit(post)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-[#7a6040] hover:text-[#e0b878] hover:bg-[#2a1c08] rounded-lg transition-colors"
                      >
                        <Pencil size={12} />
                        수정
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('이 게시글을 삭제하시겠습니까?')) {
                            deleteMutation.mutate(post.id)
                          }
                        }}
                        disabled={deleteMutation.isPending}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-red-400/60 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors disabled:opacity-40"
                      >
                        <Trash2 size={12} />
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {posts.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-[#5a4830]">게시글이 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export default function AdminPostsPage() {
  return (
    <Suspense fallback={
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-[#f5ead8]">게시글 관리</h1>
        <div className="bg-[#1a1410] border border-[#2e2318] rounded-2xl h-32 animate-pulse" />
      </div>
    }>
      <PostsContent />
    </Suspense>
  )
}

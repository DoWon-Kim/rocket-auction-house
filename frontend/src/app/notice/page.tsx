'use client'

import { useQuery } from '@tanstack/react-query'
import { useSearchParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { Suspense } from 'react'
import { ChevronLeft, ChevronRight, Pin, Megaphone, Calendar, Heart, Eye } from 'lucide-react'

interface Post {
  id: string
  type: 'NOTICE' | 'EVENT'
  title: string
  pinned: boolean
  viewCount: number
  imageUrl?: string
  eventStartAt?: string
  eventEndAt?: string
  createdAt: string
  author: { nickname: string }
  _count: { comments: number; likes: number }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 px-5 py-4 border-b border-line animate-pulse">
      <div className="w-12 h-4 bg-line rounded" />
      <div className="flex-1 h-4 bg-line rounded" />
      <div className="w-16 h-4 bg-line rounded hidden sm:block" />
      <div className="w-10 h-4 bg-line rounded hidden md:block" />
      <div className="w-20 h-4 bg-line rounded" />
    </div>
  )
}

function NoticeContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const tab = (searchParams.get('tab') ?? 'notice') as 'notice' | 'event'
  const page = Number(searchParams.get('page') ?? '1')
  const postType = tab === 'notice' ? 'NOTICE' : 'EVENT'

  function setTab(t: 'notice' | 'event') {
    router.push(`/notice?tab=${t}`)
  }

  function setPage(p: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(p))
    router.push(`/notice?${params.toString()}`)
  }

  const { data, isLoading } = useQuery({
    queryKey: ['posts', postType, page],
    queryFn: () =>
      api.get('/posts', { params: { type: postType, page, limit: 20 } }).then(r => r.data),
  })

  const posts: Post[] = data?.posts ?? []
  const totalPages: number = data?.totalPages ?? 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-[26px] sm:text-3xl font-bold tracking-tight text-fg">공지 · 이벤트</h1>
        <p className="text-xs text-subtle mt-1">로켓 경매장의 최신 소식을 확인하세요</p>
      </div>

      {/* Tab */}
      <div className="flex items-center gap-1 bg-surface border border-line rounded-xl p-1 w-fit">
        <button
          onClick={() => setTab('notice')}
          className={`flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
            tab === 'notice'
              ? 'bg-accent-tint text-accent-soft shadow-[0_0_12px_rgba(139,92,246,0.15)]'
              : 'text-muted-2 hover:text-fg-3'
          }`}
        >
          <Megaphone size={13} />
          공지
        </button>
        <button
          onClick={() => setTab('event')}
          className={`flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
            tab === 'event'
              ? 'bg-accent-tint text-accent-soft shadow-[0_0_12px_rgba(139,92,246,0.15)]'
              : 'text-muted-2 hover:text-fg-3'
          }`}
        >
          <Calendar size={13} />
          이벤트
        </button>
      </div>

      {/* 고정 공지 카드 (공지 탭 + pinned 있을 때만) */}
      {!isLoading && tab === 'notice' && posts.some(p => p.pinned) && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Pin size={12} className="text-accent-2" />
            <span className="text-xs font-semibold text-accent-2 uppercase tracking-wider">고정 공지</span>
          </div>
          {posts.filter(p => p.pinned).map(post => (
            <div
              key={post.id}
              onClick={() => router.push(`/notice/${post.id}`)}
              className="flex items-center gap-3 px-4 py-3 bg-accent-tint/60 border border-accent-line hover:border-accent-2/40 rounded-xl cursor-pointer transition-colors group"
            >
              <Pin size={13} className="text-accent-2 shrink-0" />
              <span className="flex-1 text-sm font-medium text-fg group-hover:text-white transition-colors truncate">
                {post.title}
              </span>
              <span className="text-xs text-[#2b2944] shrink-0 hidden sm:block">{formatDate(post.createdAt)}</span>
            </div>
          ))}
          <div className="border-t border-line pt-1" />
        </div>
      )}

      {/* Table */}
      <div className="bg-surface border border-line rounded-2xl overflow-hidden">
        {/* Table header */}
        <div className="flex items-center gap-4 px-5 py-3 border-b border-line bg-sunken">
          <span className="text-xs text-muted-2 uppercase tracking-wider font-semibold w-12 text-center">구분</span>
          <span className="text-xs text-muted-2 uppercase tracking-wider font-semibold flex-1">제목</span>
          {tab === 'event' && (
            <span className="text-xs text-muted-2 uppercase tracking-wider font-semibold w-36 hidden sm:block text-center">기간</span>
          )}
          <span className="text-xs text-muted-2 uppercase tracking-wider font-semibold w-12 hidden lg:flex items-center justify-center gap-1"><Heart size={10} />추천</span>
          <span className="text-xs text-muted-2 uppercase tracking-wider font-semibold w-10 hidden md:block text-center"><Eye size={10} className="inline mr-0.5" />조회</span>
          <span className="text-xs text-muted-2 uppercase tracking-wider font-semibold w-24 text-center">날짜</span>
        </div>

        {isLoading ? (
          Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Megaphone size={36} className="text-line" />
            <p className="text-subtle text-sm">
              {tab === 'notice' ? '등록된 공지사항이 없습니다.' : '진행 중인 이벤트가 없습니다.'}
            </p>
          </div>
        ) : (
          posts.map((post) => (
            <div
              key={post.id}
              onClick={() => router.push(`/notice/${post.id}`)}
              className={`flex items-center gap-4 px-5 py-4 border-b border-line last:border-b-0 cursor-pointer transition-colors group ${
                post.pinned ? 'bg-[#100d00]/40 hover:bg-accent-tint/60' : 'hover:bg-surface-2'
              }`}
            >
              {/* 뱃지 */}
              <div className="w-12 flex justify-center shrink-0">
                {post.pinned ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-accent-tint text-accent-2 border border-accent-line">
                    <Pin size={9} />
                    공지
                  </span>
                ) : tab === 'notice' ? (
                  <span className="text-xs text-subtle">—</span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-accent-tint text-accent-fg border border-accent-line">
                    EVENT
                  </span>
                )}
              </div>

              {/* 제목 */}
              <div className="flex-1 min-w-0">
                <span className={`text-sm group-hover:text-white transition-colors truncate block ${post.pinned ? 'font-semibold text-[#b092f6]' : 'text-fg'}`}>
                  {post.title}
                </span>
                <span className="text-xs text-subtle mt-0.5 block sm:hidden">
                  {post.author.nickname}
                </span>
              </div>

              {/* 이벤트 기간 */}
              {tab === 'event' && (
                <div className="w-36 hidden sm:block text-center shrink-0">
                  {post.eventStartAt && post.eventEndAt ? (
                    <span className="text-xs text-muted">
                      {formatDate(post.eventStartAt)} ~ {formatDate(post.eventEndAt)}
                    </span>
                  ) : (
                    <span className="text-xs text-subtle">—</span>
                  )}
                </div>
              )}

              {/* 추천수 */}
              <div className="w-12 hidden lg:flex items-center justify-center gap-1 shrink-0">
                {post._count.likes > 0 ? (
                  <span className="inline-flex items-center gap-1 text-xs text-accent-fg font-medium">
                    <Heart size={10} className="fill-accent" />
                    {post._count.likes.toLocaleString()}
                  </span>
                ) : (
                  <span className="text-xs text-subtle">—</span>
                )}
              </div>

              {/* 조회수 */}
              <div className="w-10 hidden md:block text-center shrink-0">
                <span className="text-xs text-subtle">{post.viewCount.toLocaleString()}</span>
              </div>

              {/* 날짜 */}
              <div className="w-24 text-center shrink-0">
                <span className="text-xs text-subtle">{formatDate(post.createdAt)}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-1">
          <button
            onClick={() => setPage(page - 1)}
            disabled={page === 1}
            className="h-9 w-9 flex items-center justify-center rounded-lg bg-surface border border-line text-muted-2 hover:border-line-strong hover:text-fg-2 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft size={15} />
          </button>

          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
            .reduce<(number | '...')[]>((acc, p, idx, arr) => {
              if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('...')
              acc.push(p)
              return acc
            }, [])
            .map((p, i) =>
              p === '...' ? (
                <span key={`e-${i}`} className="h-9 w-9 flex items-center justify-center text-subtle text-sm">…</span>
              ) : (
                <button
                  key={p}
                  onClick={() => setPage(p as number)}
                  className={`h-9 w-9 flex items-center justify-center rounded-lg text-sm font-medium transition-all ${
                    p === page
                      ? 'bg-accent-tint text-accent-soft border border-accent-line shadow-[0_0_10px_rgba(139,92,246,0.12)]'
                      : 'bg-surface border border-line text-muted-2 hover:border-line-strong hover:text-fg-2'
                  }`}
                >
                  {p}
                </button>
              )
            )}

          <button
            onClick={() => setPage(page + 1)}
            disabled={page === totalPages}
            className="h-9 w-9 flex items-center justify-center rounded-lg bg-surface border border-line text-muted-2 hover:border-line-strong hover:text-fg-2 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      )}
    </div>
  )
}

export default function NoticePage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-32">
          <div className="w-5 h-5 rounded-full border-2 border-line border-t-accent animate-spin" />
        </div>
      }
    >
      <NoticeContent />
    </Suspense>
  )
}

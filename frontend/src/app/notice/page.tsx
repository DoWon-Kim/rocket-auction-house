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
    <div className="flex items-center gap-4 px-5 py-4 border-b border-[#2e2318] animate-pulse">
      <div className="w-12 h-4 bg-[#2e2318] rounded" />
      <div className="flex-1 h-4 bg-[#2e2318] rounded" />
      <div className="w-16 h-4 bg-[#2e2318] rounded hidden sm:block" />
      <div className="w-10 h-4 bg-[#2e2318] rounded hidden md:block" />
      <div className="w-20 h-4 bg-[#2e2318] rounded" />
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
        <h1 className="text-2xl font-bold text-[#f5ead8] tracking-tight">공지 · 이벤트</h1>
        <p className="text-xs text-[#5a4830] mt-1">로켓 경매장의 최신 소식을 확인하세요</p>
      </div>

      {/* Tab */}
      <div className="flex items-center gap-1 bg-[#1a1410] border border-[#2e2318] rounded-xl p-1 w-fit">
        <button
          onClick={() => setTab('notice')}
          className={`flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
            tab === 'notice'
              ? 'bg-[#2a1c08] text-[#e0b878] shadow-[0_0_12px_rgba(212,168,83,0.15)]'
              : 'text-[#7a6040] hover:text-[#9e8a6a]'
          }`}
        >
          <Megaphone size={13} />
          공지
        </button>
        <button
          onClick={() => setTab('event')}
          className={`flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
            tab === 'event'
              ? 'bg-[#2a1c08] text-[#e0b878] shadow-[0_0_12px_rgba(212,168,83,0.15)]'
              : 'text-[#7a6040] hover:text-[#9e8a6a]'
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
            <Pin size={12} className="text-[#f0a832]" />
            <span className="text-xs font-semibold text-[#f0a832] uppercase tracking-wider">고정 공지</span>
          </div>
          {posts.filter(p => p.pinned).map(post => (
            <div
              key={post.id}
              onClick={() => router.push(`/notice/${post.id}`)}
              className="flex items-center gap-3 px-4 py-3 bg-[#1a1400]/60 border border-[#3d2e0c] hover:border-[#f0a832]/40 rounded-xl cursor-pointer transition-colors group"
            >
              <Pin size={13} className="text-[#f0a832] shrink-0" />
              <span className="flex-1 text-sm font-medium text-[#f5ead8] group-hover:text-white transition-colors truncate">
                {post.title}
              </span>
              <span className="text-xs text-[#5a4218] shrink-0 hidden sm:block">{formatDate(post.createdAt)}</span>
            </div>
          ))}
          <div className="border-t border-[#2e2318] pt-1" />
        </div>
      )}

      {/* Table */}
      <div className="bg-[#1a1410] border border-[#2e2318] rounded-2xl overflow-hidden">
        {/* Table header */}
        <div className="flex items-center gap-4 px-5 py-3 border-b border-[#2e2318] bg-[#120e0a]">
          <span className="text-xs text-[#7a6040] uppercase tracking-wider font-semibold w-12 text-center">구분</span>
          <span className="text-xs text-[#7a6040] uppercase tracking-wider font-semibold flex-1">제목</span>
          {tab === 'event' && (
            <span className="text-xs text-[#7a6040] uppercase tracking-wider font-semibold w-36 hidden sm:block text-center">기간</span>
          )}
          <span className="text-xs text-[#7a6040] uppercase tracking-wider font-semibold w-12 hidden lg:flex items-center justify-center gap-1"><Heart size={10} />추천</span>
          <span className="text-xs text-[#7a6040] uppercase tracking-wider font-semibold w-10 hidden md:block text-center"><Eye size={10} className="inline mr-0.5" />조회</span>
          <span className="text-xs text-[#7a6040] uppercase tracking-wider font-semibold w-24 text-center">날짜</span>
        </div>

        {isLoading ? (
          Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Megaphone size={36} className="text-[#2e2318]" />
            <p className="text-[#5a4830] text-sm">
              {tab === 'notice' ? '등록된 공지사항이 없습니다.' : '진행 중인 이벤트가 없습니다.'}
            </p>
          </div>
        ) : (
          posts.map((post) => (
            <div
              key={post.id}
              onClick={() => router.push(`/notice/${post.id}`)}
              className={`flex items-center gap-4 px-5 py-4 border-b border-[#2e2318] last:border-b-0 cursor-pointer transition-colors group ${
                post.pinned ? 'bg-[#100d00]/40 hover:bg-[#1a1400]/60' : 'hover:bg-[#1a1208]'
              }`}
            >
              {/* 뱃지 */}
              <div className="w-12 flex justify-center shrink-0">
                {post.pinned ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[#2a1f08] text-[#f0a832] border border-[#3d2e0c]">
                    <Pin size={9} />
                    공지
                  </span>
                ) : tab === 'notice' ? (
                  <span className="text-xs text-[#5a4830]">—</span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[#2a1c08] text-[#d4a853] border border-[#3a2510]">
                    EVENT
                  </span>
                )}
              </div>

              {/* 제목 */}
              <div className="flex-1 min-w-0">
                <span className={`text-sm group-hover:text-white transition-colors truncate block ${post.pinned ? 'font-semibold text-[#e8d5a0]' : 'text-[#f5ead8]'}`}>
                  {post.title}
                </span>
                <span className="text-xs text-[#5a4830] mt-0.5 block sm:hidden">
                  {post.author.nickname}
                </span>
              </div>

              {/* 이벤트 기간 */}
              {tab === 'event' && (
                <div className="w-36 hidden sm:block text-center shrink-0">
                  {post.eventStartAt && post.eventEndAt ? (
                    <span className="text-xs text-[#8a7055]">
                      {formatDate(post.eventStartAt)} ~ {formatDate(post.eventEndAt)}
                    </span>
                  ) : (
                    <span className="text-xs text-[#5a4830]">—</span>
                  )}
                </div>
              )}

              {/* 추천수 */}
              <div className="w-12 hidden lg:flex items-center justify-center gap-1 shrink-0">
                {post._count.likes > 0 ? (
                  <span className="inline-flex items-center gap-1 text-xs text-[#d4a853] font-medium">
                    <Heart size={10} className="fill-[#d4a853]" />
                    {post._count.likes.toLocaleString()}
                  </span>
                ) : (
                  <span className="text-xs text-[#4a3820]">—</span>
                )}
              </div>

              {/* 조회수 */}
              <div className="w-10 hidden md:block text-center shrink-0">
                <span className="text-xs text-[#5a4830]">{post.viewCount.toLocaleString()}</span>
              </div>

              {/* 날짜 */}
              <div className="w-24 text-center shrink-0">
                <span className="text-xs text-[#5a4830]">{formatDate(post.createdAt)}</span>
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
            className="h-9 w-9 flex items-center justify-center rounded-lg bg-[#1a1410] border border-[#2e2318] text-[#7a6040] hover:border-[#4a3520] hover:text-[#e8d5b0] disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
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
                <span key={`e-${i}`} className="h-9 w-9 flex items-center justify-center text-[#4a3520] text-sm">…</span>
              ) : (
                <button
                  key={p}
                  onClick={() => setPage(p as number)}
                  className={`h-9 w-9 flex items-center justify-center rounded-lg text-sm font-medium transition-all ${
                    p === page
                      ? 'bg-[#2a1c08] text-[#e0b878] border border-[#3d2a0c] shadow-[0_0_10px_rgba(212,168,83,0.12)]'
                      : 'bg-[#1a1410] border border-[#2e2318] text-[#7a6040] hover:border-[#4a3520] hover:text-[#e8d5b0]'
                  }`}
                >
                  {p}
                </button>
              )
            )}

          <button
            onClick={() => setPage(page + 1)}
            disabled={page === totalPages}
            className="h-9 w-9 flex items-center justify-center rounded-lg bg-[#1a1410] border border-[#2e2318] text-[#7a6040] hover:border-[#4a3520] hover:text-[#e8d5b0] disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
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
          <div className="w-5 h-5 rounded-full border-2 border-[#2e2318] border-t-[#d4a853] animate-spin" />
        </div>
      }
    >
      <NoticeContent />
    </Suspense>
  )
}

'use client'

import { useQuery } from '@tanstack/react-query'
import { useSearchParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { Suspense } from 'react'
import { ChevronLeft, ChevronRight, MessageSquare, Eye, PenSquare, Users, ThumbsUp, Clock, Flame } from 'lucide-react'
import Image from 'next/image'
import { TCG_LABELS } from '@/lib/utils'

// TCG 필터 탭 정의
const TCG_FILTERS = [
  { value: '', label: '전체' },
  { value: 'POKEMON',  label: TCG_LABELS.POKEMON },
  { value: 'YUGIOH',   label: TCG_LABELS.YUGIOH },
  { value: 'MTG',      label: TCG_LABELS.MTG },
  { value: 'DIGIMON',  label: TCG_LABELS.DIGIMON },
  { value: 'ONEPIECE', label: TCG_LABELS.ONEPIECE },
  { value: 'WEISS',    label: TCG_LABELS.WEISS },
  { value: 'OTHER',    label: TCG_LABELS.OTHER },
]

// TCG 배지 색상
const TCG_COLORS: Record<string, string> = {
  POKEMON:  'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  YUGIOH:   'bg-purple-500/10 text-purple-400 border-purple-500/20',
  MTG:      'bg-red-500/10    text-red-400    border-red-500/20',
  DIGIMON:  'bg-blue-500/10   text-blue-400   border-blue-500/20',
  ONEPIECE: 'bg-blue-500/10   text-blue-300   border-blue-500/20',
  WEISS:    'bg-pink-500/10   text-pink-400   border-pink-500/20',
  OTHER:    'bg-[#2e2318]     text-[#8a7055]  border-[#4a3520]',
}

interface Post {
  id: string
  type: 'COMMUNITY'
  title: string
  pinned: boolean
  viewCount: number
  imageUrl?: string
  tcgType?: string | null
  createdAt: string
  author: { nickname: string }
  _count: { comments: number; likes: number }
}

function formatDate(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffH = diffMs / 1000 / 60 / 60
  if (diffH < 1) return `${Math.floor(diffMs / 1000 / 60)}분 전`
  if (diffH < 24) return `${Math.floor(diffH)}시간 전`
  return d.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })
}

function PostCardSkeleton() {
  return (
    <div className="bg-[#1a1410] border border-[#2e2318] rounded-2xl overflow-hidden animate-pulse">
      <div className="h-40 bg-[#2e2318]" />
      <div className="p-4 space-y-2.5">
        <div className="h-4 bg-[#2e2318] rounded w-3/4" />
        <div className="h-3 bg-[#2e2318] rounded w-1/2" />
        <div className="flex gap-3">
          <div className="h-3 bg-[#2e2318] rounded w-12" />
          <div className="h-3 bg-[#2e2318] rounded w-10" />
        </div>
      </div>
    </div>
  )
}

function CommunityContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { user } = useAuthStore()

  const page    = Number(searchParams.get('page') ?? '1')
  const tcgType = searchParams.get('tcg')  ?? ''
  const sort    = searchParams.get('sort') ?? 'latest'

  function setPage(p: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(p))
    router.push(`/community?${params.toString()}`)
  }

  function setTcg(tcg: string) {
    const params = new URLSearchParams()
    if (tcg)              params.set('tcg', tcg)
    if (sort !== 'latest') params.set('sort', sort)
    params.set('page', '1')
    router.push(`/community?${params.toString()}`)
  }

  function setSort(s: string) {
    const params = new URLSearchParams()
    if (tcgType)   params.set('tcg', tcgType)
    if (s !== 'latest') params.set('sort', s)
    params.set('page', '1')
    router.push(`/community?${params.toString()}`)
  }

  const { data, isLoading } = useQuery({
    queryKey: ['posts', 'COMMUNITY', tcgType, sort, page],
    queryFn: () =>
      api.get('/posts', {
        params: { type: 'COMMUNITY', tcgType: tcgType || undefined, sort, page, limit: 20 },
      }).then(r => r.data),
  })

  const posts: Post[]  = data?.posts ?? []
  const totalPages     = data?.totalPages ?? 0
  const total: number  = data?.total ?? 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start sm:items-center gap-4 flex-col sm:flex-row">
        <div>
          <h1 className="text-2xl font-bold text-[#f5ead8] tracking-tight flex items-center gap-2">
            <Users size={20} className="text-[#d4a853]" />
            커뮤니티
          </h1>
          {!isLoading && (
            <p className="text-xs text-[#5a4830] mt-1">총 {total.toLocaleString()}개의 게시글</p>
          )}
        </div>

        {user && (
          <div className="sm:ml-auto">
            <button
              onClick={() => router.push('/community/write')}
              className="flex items-center gap-2 px-4 py-2 bg-[#d4a853] hover:bg-[#c49440] text-white rounded-xl font-semibold text-sm transition-colors"
            >
              <PenSquare size={14} />
              글쓰기
            </button>
          </div>
        )}
      </div>

      {/* 정렬 탭 */}
      <div className="flex gap-1.5">
        <button
          onClick={() => setSort('latest')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
            sort === 'latest'
              ? 'bg-[#d4a853]/10 text-[#e0b878] border-[#d4a853]/30'
              : 'bg-transparent text-[#7a6040] border-[#2e2318] hover:border-[#4a3520] hover:text-[#9e8a6a]'
          }`}
        >
          <Clock size={11} /> 최신순
        </button>
        <button
          onClick={() => setSort('popular')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
            sort === 'popular'
              ? 'bg-orange-500/10 text-orange-400 border-orange-500/30'
              : 'bg-transparent text-[#7a6040] border-[#2e2318] hover:border-[#4a3520] hover:text-[#9e8a6a]'
          }`}
        >
          <Flame size={11} /> 인기순
        </button>
      </div>

      {/* TCG 필터 탭 */}
      <div className="flex gap-1.5 flex-wrap">
        {TCG_FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setTcg(f.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              tcgType === f.value
                ? f.value
                  ? `${TCG_COLORS[f.value]} border-current`
                  : 'bg-[#d4a853]/10 text-[#e0b878] border-[#d4a853]/30'
                : 'bg-transparent text-[#7a6040] border-[#2e2318] hover:border-[#4a3520] hover:text-[#9e8a6a]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <PostCardSkeleton key={i} />)}
        </div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 gap-4">
          <Users size={40} className="text-[#2e2318]" />
          <p className="text-[#5a4830] text-sm">
            {tcgType ? `${TCG_LABELS[tcgType]} 게시글이 없습니다.` : '아직 게시글이 없습니다.'}
          </p>
          {user && (
            <button
              onClick={() => router.push('/community/write')}
              className="flex items-center gap-2 px-4 py-2 bg-[#d4a853] hover:bg-[#c49440] text-white rounded-xl font-semibold text-sm transition-colors"
            >
              <PenSquare size={14} />
              첫 글 작성하기
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {posts.map((post) => (
              <div
                key={post.id}
                onClick={() => router.push(`/community/${post.id}`)}
                className="bg-[#1a1410] border border-[#2e2318] rounded-2xl overflow-hidden cursor-pointer hover:border-[#4a3520] hover:shadow-[0_0_20px_rgba(212,168,83,0.06)] transition-all duration-200 group flex flex-col"
              >
                {/* Image */}
                {post.imageUrl ? (
                  <div className="relative h-40 bg-[#120e0a] shrink-0">
                    <Image
                      src={post.imageUrl}
                      alt={post.title}
                      fill
                      className="object-cover rounded-t-2xl"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    />
                    {/* TCG 배지 (이미지 위 오버레이) */}
                    {post.tcgType && (
                      <span className={`absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-bold border backdrop-blur-sm ${TCG_COLORS[post.tcgType] ?? TCG_COLORS.OTHER}`}>
                        {TCG_LABELS[post.tcgType] ?? post.tcgType}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="h-2 bg-gradient-to-r from-[#2e2318] to-[#0d1320] shrink-0 relative">
                    {/* TCG 배지 (이미지 없을 때) */}
                  </div>
                )}

                {/* Content */}
                <div className="p-4 flex flex-col flex-1">
                  {/* TCG 배지 (이미지 없을 때 제목 위) */}
                  {post.tcgType && !post.imageUrl && (
                    <span className={`self-start mb-2 px-2 py-0.5 rounded-full text-[10px] font-bold border ${TCG_COLORS[post.tcgType] ?? TCG_COLORS.OTHER}`}>
                      {TCG_LABELS[post.tcgType] ?? post.tcgType}
                    </span>
                  )}

                  <h2 className="text-sm font-semibold text-[#f5ead8] group-hover:text-white transition-colors line-clamp-2 leading-relaxed mb-2 flex-1">
                    {post.title}
                  </h2>

                  <div className="flex items-center gap-1.5 mb-3">
                    <div className="w-5 h-5 rounded-full bg-[#2e2318] flex items-center justify-center">
                      <span className="text-[9px] text-[#7a6040] font-semibold">
                        {post.author.nickname.slice(0, 1).toUpperCase()}
                      </span>
                    </div>
                    <span className="text-xs text-[#8a7055]">{post.author.nickname}</span>
                    <span className="text-[#4a3520]">·</span>
                    <span className="text-xs text-[#5a4830]">{formatDate(post.createdAt)}</span>
                  </div>

                  <div className="flex items-center gap-3 pt-3 border-t border-[#2e2318]">
                    <span className="flex items-center gap-1 text-xs text-[#5a4830]">
                      <ThumbsUp size={11} />
                      {post._count.likes.toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-[#5a4830]">
                      <MessageSquare size={11} />
                      {post._count.comments.toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-[#5a4830]">
                      <Eye size={11} />
                      {post.viewCount.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            ))}
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
        </>
      )}
    </div>
  )
}

export default function CommunityPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-32">
          <div className="w-5 h-5 rounded-full border-2 border-[#2e2318] border-t-[#d4a853] animate-spin" />
        </div>
      }
    >
      <CommunityContent />
    </Suspense>
  )
}

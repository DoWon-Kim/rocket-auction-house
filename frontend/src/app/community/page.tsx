'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams, useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Image as ImageIcon, LayoutList, LayoutGrid, Search, MessageSquare, ThumbsUp, Eye, Flame } from 'lucide-react'
import { api } from '@/lib/api'
import { TCG_LABELS } from '@/lib/utils'
import { BOARDS, BOARD_LABEL, TCG_OPTIONS, formatListDate, isNewPost } from '@/lib/community'
import { CommunityShell, GradeBadge, useCommunityStats } from '@/components/community/CommunityShell'

interface PostRow {
  id: string
  title: string
  category: string | null
  tcgType: string | null
  viewCount: number
  createdAt: string
  thumbnail: string | null
  imageCount: number
  isBest: boolean
  author: { id: string; nickname: string; grade?: string }
  _count: { comments: number; likes: number }
}

const SORTS = [
  { value: 'latest',   label: '최신순' },
  { value: 'popular',  label: '추천순' },
  { value: 'comments', label: '댓글순' },
  { value: 'views',    label: '조회순' },
]
const LIMITS = [15, 30, 50]
const SEARCH_FIELDS = [
  { value: 'all',     label: '제목+내용' },
  { value: 'title',   label: '제목' },
  { value: 'content', label: '내용' },
  { value: 'author',  label: '글작성자' },
]

const selectCls = 'h-9 bg-surface border border-line hover:border-line-strong rounded-full px-3 text-xs text-fg-2 focus:outline-none focus:border-accent/60 transition-colors cursor-pointer'

function CommunityList() {
  const sp = useSearchParams()
  const router = useRouter()

  const board  = sp.get('board') ?? ''
  const best   = sp.get('best') === '1'
  const mine   = sp.get('author') === 'me'
  const scrap  = sp.get('scrap') === 'me'
  const sort   = sp.get('sort') ?? 'latest'
  const tcg    = sp.get('tcg') ?? ''
  const q      = sp.get('q') ?? ''
  const field  = sp.get('field') ?? 'all'
  const page   = Math.max(1, Number(sp.get('page') ?? 1))
  const limit  = LIMITS.includes(Number(sp.get('limit'))) ? Number(sp.get('limit')) : 15
  const boardMeta = BOARDS.find(b => b.key === board)
  const view   = (sp.get('view') ?? (boardMeta && 'album' in boardMeta ? 'album' : 'list')) as 'list' | 'album'

  const [keyword, setKeyword] = useState(q)
  const [searchField, setSearchField] = useState(field)

  function update(patch: Record<string, string | number | null>, resetPage = true) {
    const params = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') params.delete(k)
      else params.set(k, String(v))
    }
    if (resetPage && !('page' in patch)) params.delete('page')
    router.push(`/community?${params.toString()}`)
  }

  const { data: stats } = useCommunityStats()
  const { data, isLoading } = useQuery<{ posts: PostRow[]; total: number; totalPages: number }>({
    queryKey: ['posts', 'COMMUNITY', board, best, mine, scrap, sort, tcg, q, field, page, limit],
    queryFn: () => api.get('/posts', {
      params: {
        type: 'COMMUNITY', category: board || undefined, best: best ? 1 : undefined,
        author: mine ? 'me' : undefined, scrap: scrap ? 'me' : undefined, sort, tcgType: tcg || undefined,
        q: q || undefined, field, page, limit,
      },
    }).then(r => r.data),
  })

  const posts = data?.posts ?? []
  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 0
  const active = scrap ? 'scrap' : mine ? 'mine' : best ? 'best' : board
  const title = scrap ? '내 스크랩' : mine ? '내가 쓴 글' : best ? '인기글' : boardMeta?.label ?? '전체글 보기'
  const desc = scrap ? '스크랩한 게시글' : mine ? '내가 작성한 게시글' : best ? `추천 ${stats?.bestThreshold ?? 10}개 이상 받은 글` : boardMeta?.desc ?? '모든 게시판의 글을 모아 봅니다'
  const showNotices = page === 1 && !q && !mine && !scrap && (stats?.notices.length ?? 0) > 0

  return (
    <CommunityShell active={active}>
      {/* 헤더 */}
      <div className="flex items-end justify-between gap-4 mb-5">
        <div>
          <h1 className="text-[26px] sm:text-3xl font-bold tracking-tight text-fg flex items-center gap-2">
            {best && <Flame size={24} className="text-orange-400" />}
            {boardMeta && <span className="text-2xl">{boardMeta.emoji}</span>}
            {title}
          </h1>
          <p className="text-sm text-muted mt-1">
            {desc} · <span className="text-fg-3 tabular-nums">{total.toLocaleString()}</span>개의 글
            {q && <> · &ldquo;<span className="text-accent-soft">{q}</span>&rdquo; 검색 결과</>}
          </p>
        </div>
      </div>

      {/* 툴바 */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select value={sort} onChange={e => update({ sort: e.target.value === 'latest' ? null : e.target.value })} className={selectCls} aria-label="정렬">
          {SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select value={tcg} onChange={e => update({ tcg: e.target.value })} className={selectCls} aria-label="TCG">
          <option value="">전체 TCG</option>
          {TCG_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <div className="ml-auto flex items-center gap-2">
          <select value={limit} onChange={e => update({ limit: e.target.value === '15' ? null : e.target.value })} className={selectCls} aria-label="페이지당 글 수">
            {LIMITS.map(l => <option key={l} value={l}>{l}개씩</option>)}
          </select>
          <div className="flex items-center p-1 rounded-full bg-surface border border-line">
            {([['list', <LayoutList key="l" size={14} />, '목록형'], ['album', <LayoutGrid key="a" size={14} />, '앨범형']] as const).map(([v, icon, label]) => (
              <button key={v} onClick={() => update({ view: v }, false)} title={label} aria-label={label}
                className={`w-8 h-7 rounded-full flex items-center justify-center transition-colors ${view === v ? 'bg-white text-bg' : 'text-muted hover:text-fg'}`}>
                {icon}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 목록 */}
      <div className="rounded-3xl border border-line bg-surface/60 overflow-hidden">
        {view === 'list' && (
          <div className="hidden md:grid grid-cols-[64px_1fr_140px_72px_60px_56px] items-center h-11 px-4 border-b border-line text-xs text-muted bg-white/[0.02]">
            <span className="text-center">번호</span><span className="pl-2">제목</span><span>작성자</span>
            <span className="text-center">작성일</span><span className="text-center">조회</span><span className="text-center">추천</span>
          </div>
        )}

        {/* 공지 */}
        {showNotices && view === 'list' && stats!.notices.map(n => (
          <Link key={n.id} href={`/notice/${n.id}`}
            className="grid grid-cols-[auto_1fr_auto] md:grid-cols-[64px_1fr_140px_72px_60px_56px] items-center gap-2 md:gap-0 min-h-11 px-4 py-2.5 border-b border-line bg-accent/[0.06] hover:bg-accent/[0.1] transition-colors">
            <span className="md:text-center"><span className="inline-flex h-5 px-2 items-center rounded-md bg-accent text-white text-[10px] font-bold">{n.type === 'EVENT' ? '이벤트' : '공지'}</span></span>
            <span className="md:pl-2 text-sm font-semibold text-fg truncate">{n.title}</span>
            <span className="hidden md:block text-xs text-muted">운영자</span>
            <span className="text-xs text-muted md:text-center tabular-nums">{formatListDate(n.createdAt)}</span>
            <span className="hidden md:block" /><span className="hidden md:block" />
          </Link>
        ))}

        {isLoading ? (
          <div className="divide-y divide-line">
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-14 animate-pulse bg-white/[0.01]" />)}
          </div>
        ) : posts.length === 0 ? (
          <div className="py-24 text-center">
            <p className="text-4xl mb-3">🗒️</p>
            <p className="text-sm text-muted">{q ? '검색 결과가 없습니다.' : '아직 등록된 글이 없습니다.'}</p>
            <Link href="/community/write" className="mt-4 inline-flex h-10 px-5 items-center rounded-full bg-white text-bg text-sm font-semibold hover:bg-fg-2 transition-colors">
              첫 글 쓰기
            </Link>
          </div>
        ) : view === 'album' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 p-3">
            {posts.map(p => (
              <Link key={p.id} href={`/community/${p.id}`} className="group rounded-2xl overflow-hidden border border-line bg-surface hover:border-accent/40 transition-colors">
                <div className="relative aspect-square bg-[radial-gradient(ellipse_at_top,var(--color-surface-2),var(--color-sunken))] overflow-hidden">
                  {p.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element -- 사용자 업로드 이미지(호스트 다양)
                    <img src={p.thumbnail} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-500" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-3xl opacity-40">{BOARDS.find(b => b.key === p.category)?.emoji ?? '📝'}</div>
                  )}
                  {p.imageCount > 1 && (
                    <span className="absolute top-2 right-2 h-6 px-2 inline-flex items-center gap-1 rounded-full bg-black/55 backdrop-blur text-[11px] text-white">
                      <ImageIcon size={11} /> {p.imageCount}
                    </span>
                  )}
                  {p.isBest && <span className="absolute top-2 left-2 h-6 px-2 inline-flex items-center rounded-full bg-orange-500 text-white text-[10px] font-bold">인기</span>}
                </div>
                <div className="p-3">
                  <p className="text-sm font-medium text-fg line-clamp-1">
                    {p.title}{p._count.comments > 0 && <span className="text-accent-2 ml-1">[{p._count.comments}]</span>}
                  </p>
                  <p className="mt-1 text-xs text-muted flex items-center gap-1.5">
                    <span className="truncate">{p.author.nickname}</span><span>·</span><span className="tabular-nums">{formatListDate(p.createdAt)}</span>
                  </p>
                  <p className="mt-1.5 flex items-center gap-2.5 text-[11px] text-subtle">
                    <span className="flex items-center gap-1"><ThumbsUp size={11} />{p._count.likes}</span>
                    <span className="flex items-center gap-1"><Eye size={11} />{p.viewCount.toLocaleString()}</span>
                  </p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {posts.map((p, i) => {
              const no = total - (page - 1) * limit - i
              return (
                <li key={p.id}>
                  <Link href={`/community/${p.id}`}
                    className="group block md:grid md:grid-cols-[64px_1fr_140px_72px_60px_56px] md:items-center min-h-14 px-4 py-3 md:py-2.5 hover:bg-white/[0.025] transition-colors">
                    <span className="hidden md:block text-center text-xs text-subtle tabular-nums">{no}</span>
                    <div className="md:pl-2 min-w-0 flex items-center gap-1.5">
                      {!board && p.category && (
                        <span className="shrink-0 text-[11px] text-muted border border-line rounded-md px-1.5 h-5 inline-flex items-center">{BOARD_LABEL[p.category]}</span>
                      )}
                      {p.tcgType && <span className="shrink-0 text-[11px] text-accent-fg">[{TCG_LABELS[p.tcgType]}]</span>}
                      <span className="text-[15px] text-fg-2 group-hover:text-fg truncate">{p.title}</span>
                      {p._count.comments > 0 && <span className="shrink-0 text-xs font-semibold text-accent-2 tabular-nums">[{p._count.comments}]</span>}
                      {p.imageCount > 0 && <ImageIcon size={13} className="shrink-0 text-emerald-400/80" aria-label="사진 포함" />}
                      {isNewPost(p.createdAt) && <span className="shrink-0 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center" title="새 글">N</span>}
                      {p.isBest && <span className="shrink-0 h-5 px-1.5 inline-flex items-center rounded-md bg-orange-500/15 text-orange-300 text-[10px] font-bold">인기</span>}
                    </div>
                    {/* 모바일 메타 */}
                    <div className="md:hidden mt-1.5 flex items-center gap-2 text-xs text-muted">
                      <span className="truncate max-w-[40%]">{p.author.nickname}</span>
                      <span className="tabular-nums">{formatListDate(p.createdAt)}</span>
                      <span className="flex items-center gap-0.5"><Eye size={11} />{p.viewCount.toLocaleString()}</span>
                      <span className="flex items-center gap-0.5"><ThumbsUp size={11} />{p._count.likes}</span>
                      {p._count.comments > 0 && <span className="flex items-center gap-0.5"><MessageSquare size={11} />{p._count.comments}</span>}
                    </div>
                    <span className="hidden md:flex items-center gap-1.5 min-w-0 text-sm text-fg-3">
                      <span className="truncate">{p.author.nickname}</span><GradeBadge grade={p.author.grade} compact />
                    </span>
                    <span className="hidden md:block text-center text-xs text-muted tabular-nums">{formatListDate(p.createdAt)}</span>
                    <span className="hidden md:block text-center text-xs text-muted tabular-nums">{p.viewCount.toLocaleString()}</span>
                    <span className={`hidden md:block text-center text-xs tabular-nums ${p._count.likes > 0 ? 'text-fg-3 font-semibold' : 'text-subtle'}`}>{p._count.likes}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* 페이지네이션 (10페이지 단위) */}
      {totalPages > 1 && <Pager page={page} totalPages={totalPages} onChange={p => update({ page: p }, false)} />}

      {/* 검색 */}
      <form
        onSubmit={e => { e.preventDefault(); update({ q: keyword.trim(), field: searchField === 'all' ? null : searchField }) }}
        className="mt-6 flex flex-wrap justify-center gap-2">
        <select value={searchField} onChange={e => setSearchField(e.target.value)} className={`${selectCls} h-11`} aria-label="검색 범위">
          {SEARCH_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        <div className="relative w-full sm:w-80">
          <input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="검색어를 입력하세요" maxLength={100}
            className="w-full h-11 bg-surface border border-line hover:border-line-strong focus:border-accent/60 focus:ring-4 focus:ring-accent/15 rounded-full pl-5 pr-12 text-sm text-fg placeholder:text-subtle focus:outline-none transition-all" />
          <button type="submit" aria-label="검색" className="absolute right-1.5 top-1.5 w-8 h-8 rounded-full bg-white text-bg flex items-center justify-center hover:bg-fg-2 transition-colors">
            <Search size={15} />
          </button>
        </div>
        {q && (
          <button type="button" onClick={() => { setKeyword(''); update({ q: null, field: null }) }}
            className="h-11 px-4 rounded-full border border-line text-sm text-muted hover:text-fg transition-colors">
            검색 해제
          </button>
        )}
      </form>
    </CommunityShell>
  )
}

function Pager({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  const start = Math.floor((page - 1) / 10) * 10 + 1
  const end = Math.min(totalPages, start + 9)
  const btn = 'h-9 min-w-9 px-2 rounded-full text-sm tabular-nums flex items-center justify-center transition-colors'
  return (
    <nav className="mt-6 flex justify-center items-center gap-1" aria-label="페이지">
      {start > 1 && (
        <button onClick={() => onChange(start - 1)} className={`${btn} text-muted hover:text-fg`} aria-label="이전 10페이지"><ChevronLeft size={16} /></button>
      )}
      {Array.from({ length: end - start + 1 }, (_, i) => start + i).map(p => (
        <button key={p} onClick={() => onChange(p)} aria-current={p === page ? 'page' : undefined}
          className={`${btn} ${p === page ? 'bg-white text-bg font-semibold' : 'text-fg-3 hover:bg-white/[0.05]'}`}>
          {p}
        </button>
      ))}
      {end < totalPages && (
        <button onClick={() => onChange(end + 1)} className={`${btn} text-muted hover:text-fg`} aria-label="다음 10페이지"><ChevronRight size={16} /></button>
      )}
    </nav>
  )
}

export default function CommunityPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-32"><div className="w-5 h-5 rounded-full border-2 border-line border-t-accent animate-spin" /></div>}>
      <CommunityList />
    </Suspense>
  )
}

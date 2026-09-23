'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { PenSquare, Flame, LayoutList, Megaphone, Lock } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { BOARDS, GRADES, PERMISSION_LABEL, canUseBoard, type BoardPermission } from '@/lib/community'

export interface CommunityStats {
  total: number
  today: number
  byCategory: Record<string, number>
  weeklyTop: { id: string; title: string; _count: { likes: number; comments: number } }[]
  notices: { id: string; type: 'NOTICE' | 'EVENT'; title: string; createdAt: string }[]
  me: { postCount: number; commentCount: number; scrapCount: number; grade: string } | null
  bestThreshold: number
  boards: { category: string; writePermission: BoardPermission; commentPermission: BoardPermission }[]
}

export function useCommunityStats() {
  const token = useAuthStore(s => s.token)
  return useQuery<CommunityStats>({
    queryKey: ['community-stats', !!token],
    queryFn: () => api.get('/posts/community/stats').then(r => r.data),
    staleTime: 30_000,
  })
}

export function GradeBadge({ grade, compact }: { grade?: string; compact?: boolean }) {
  const g = grade ? GRADES[grade] : undefined
  if (!g) return null
  return (
    <span title={`활동 등급: ${g.label}`}
      className={`inline-flex items-center gap-0.5 h-5 px-1.5 rounded-md border text-[10px] font-semibold shrink-0 ${g.cls}`}>
      <span className="text-[9px]">{g.emoji}</span>{!compact && g.label}
    </span>
  )
}

// active: '' 전체 | 'best' 인기글 | 'mine' 내 글 | 'scrap' 내 스크랩 | 게시판 키
export function CommunityShell({ active, children }: { active: string; children: React.ReactNode }) {
  const user = useAuthStore(s => s.user)
  const { data: stats } = useCommunityStats()

  const menu = [
    { key: '',     href: '/community',         label: '전체글 보기', icon: <LayoutList size={15} />, count: stats?.total },
    { key: 'best', href: '/community?best=1',  label: '인기글',     icon: <Flame size={15} className="text-orange-400" />, count: undefined },
  ]

  return (
    <div className="max-w-6xl mx-auto">
      {/* 모바일: 게시판 가로 스크롤 */}
      <div className="lg:hidden -mx-4 px-4 mb-5 flex gap-1.5 overflow-x-auto pb-1">
        {[...menu, ...BOARDS.map(b => ({ key: b.key, href: `/community?board=${b.key}`, label: b.label }))].map(m => (
          <Link key={m.key || 'all'} href={m.href}
            className={`shrink-0 h-9 px-3.5 inline-flex items-center rounded-full text-xs font-medium transition-colors ${
              active === m.key ? 'bg-white text-bg font-semibold' : 'bg-surface border border-line text-muted hover:text-fg'
            }`}>
            {m.label}
          </Link>
        ))}
      </div>

      <div className="flex gap-8 items-start">
        {/* ── 사이드바 ── */}
        <aside className="hidden lg:block w-64 shrink-0 sticky top-24 space-y-4">
          {/* 카페 정보 */}
          <div className="relative overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-accent-tint via-surface to-surface p-5">
            <div className="absolute -top-12 -right-10 w-40 h-40 rounded-full bg-accent/25 blur-3xl pointer-events-none" />
            <p className="relative font-display text-lg font-bold text-fg">Rocket 라운지</p>
            <p className="relative text-xs text-muted mt-0.5">TCG 수집가들의 커뮤니티</p>
            <div className="relative mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-black/20 border border-white/5 px-3 py-2">
                <p className="text-[11px] text-muted">전체글</p>
                <p className="font-display text-lg font-semibold text-fg tabular-nums">{(stats?.total ?? 0).toLocaleString()}</p>
              </div>
              <div className="rounded-2xl bg-black/20 border border-white/5 px-3 py-2">
                <p className="text-[11px] text-muted">오늘 새글</p>
                <p className="font-display text-lg font-semibold text-accent-2 tabular-nums">{(stats?.today ?? 0).toLocaleString()}</p>
              </div>
            </div>
            <Link href={user ? '/community/write' : '/login'}
              className="relative mt-4 h-11 w-full inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-accent to-accent-strong text-white text-sm font-semibold shadow-[0_8px_24px_-8px_rgba(139,92,246,0.7)] hover:shadow-[0_8px_32px_-6px_rgba(139,92,246,0.9)] transition-shadow">
              <PenSquare size={15} /> 카페 글쓰기
            </Link>
          </div>

          {/* 내 활동 */}
          {user && stats?.me && (
            <div className="rounded-3xl border border-line bg-surface/70 p-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-accent to-accent-2 flex items-center justify-center text-white text-sm font-bold">
                  {user.nickname[0]?.toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-fg truncate">{user.nickname}</p>
                  <GradeBadge grade={stats.me.grade} />
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-1 text-center">
                <Link href="/community?author=me" className={`rounded-xl py-2 hover:bg-white/[0.04] transition-colors ${active === 'mine' ? 'bg-white/[0.06]' : ''}`}>
                  <p className="font-display text-base font-semibold text-fg tabular-nums">{stats.me.postCount}</p>
                  <p className="text-[11px] text-muted">내가 쓴 글</p>
                </Link>
                <div className="rounded-xl py-2">
                  <p className="font-display text-base font-semibold text-fg tabular-nums">{stats.me.commentCount}</p>
                  <p className="text-[11px] text-muted">내 댓글</p>
                </div>
                <Link href="/community?scrap=me" className={`rounded-xl py-2 hover:bg-white/[0.04] transition-colors ${active === 'scrap' ? 'bg-white/[0.06]' : ''}`}>
                  <p className="font-display text-base font-semibold text-fg tabular-nums">{stats.me.scrapCount}</p>
                  <p className="text-[11px] text-muted">내 스크랩</p>
                </Link>
              </div>
            </div>
          )}

          {/* 게시판 메뉴 */}
          <nav className="rounded-3xl border border-line bg-surface/70 p-2">
            {menu.map(m => (
              <MenuItem key={m.key || 'all'} href={m.href} active={active === m.key} icon={m.icon} label={m.label} count={m.count} />
            ))}
            <div className="my-2 mx-3 h-px bg-line" />
            {BOARDS.map(b => {
              const perm = stats?.boards.find(x => x.category === b.key)?.writePermission
              const locked = !!user && !canUseBoard(perm, stats?.me?.grade, user.role)
              return (
                <MenuItem key={b.key} href={`/community?board=${b.key}`} active={active === b.key}
                  icon={<span className="text-sm w-[15px] text-center">{b.emoji}</span>} label={b.label} count={stats?.byCategory[b.key] ?? 0}
                  lock={perm && perm !== 'ALL' ? `글쓰기: ${PERMISSION_LABEL[perm]}${locked ? ' (권한 없음)' : ''}` : undefined} />
              )
            })}
            <div className="my-2 mx-3 h-px bg-line" />
            <MenuItem href="/notice" active={false} icon={<Megaphone size={15} className="text-accent-fg" />} label="공지 · 이벤트" />
          </nav>

          {/* 주간 인기글 */}
          {stats && stats.weeklyTop.length > 0 && (
            <div className="rounded-3xl border border-line bg-surface/70 p-4">
              <p className="text-xs font-semibold text-fg-3 mb-3 flex items-center gap-1.5">
                <Flame size={13} className="text-orange-400" /> 주간 인기글
              </p>
              <ol className="space-y-2.5">
                {stats.weeklyTop.map((p, i) => (
                  <li key={p.id}>
                    <Link href={`/community/${p.id}`} className="group flex gap-2.5 text-sm">
                      <span className={`font-display w-4 shrink-0 font-bold ${i < 3 ? 'text-accent-fg' : 'text-subtle'}`}>{i + 1}</span>
                      <span className="text-fg-3 group-hover:text-fg line-clamp-1 transition-colors">{p.title}</span>
                      {p._count.comments > 0 && <span className="text-accent-2 text-xs shrink-0">[{p._count.comments}]</span>}
                    </Link>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </aside>

        <div className="flex-1 min-w-0">{children}</div>
      </div>

      {/* 모바일 글쓰기 버튼 */}
      <Link href={user ? '/community/write' : '/login'} aria-label="글쓰기"
        className="lg:hidden fixed right-5 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-40 w-14 h-14 rounded-full bg-gradient-to-br from-accent to-accent-strong text-white flex items-center justify-center shadow-[0_10px_30px_-6px_rgba(139,92,246,0.8)]">
        <PenSquare size={20} />
      </Link>
    </div>
  )
}

function MenuItem({ href, active, icon, label, count, lock }: { href: string; active: boolean; icon: React.ReactNode; label: string; count?: number; lock?: string }) {
  return (
    <Link href={href}
      className={`relative flex items-center gap-2.5 h-10 px-3 rounded-2xl text-sm transition-colors ${
        active ? 'bg-white/[0.07] text-fg font-semibold' : 'text-fg-3 hover:text-fg hover:bg-white/[0.03]'
      }`}>
      {active && <span className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-full bg-gradient-to-b from-accent to-accent-2" />}
      <span className="text-muted">{icon}</span>
      <span className="flex-1 flex items-center gap-1.5">{label}{lock && <Lock size={11} className="text-subtle" aria-label={lock}><title>{lock}</title></Lock>}</span>
      {count !== undefined && <span className="text-xs text-subtle tabular-nums">{count.toLocaleString()}</span>}
    </Link>
  )
}


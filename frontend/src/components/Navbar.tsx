'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import {
  Rocket, Search, User, LogOut, Wallet, LayoutDashboard,
  Zap, Menu, X, MessageCircle, Users, Bell, Heart, Layers, Settings,
} from 'lucide-react'
import { NotificationBell } from '@/components/NotificationBell'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { connectSocket, reconnectWithToken } from '@/lib/socket'
import { resolveImageSrc } from '@/lib/utils'

interface SiteMenu {
  key: string
  label: string
  path: string
  enabled: boolean
  order: number
}

const FALLBACK_MENUS: SiteMenu[] = [
  { key: 'marketplace', label: '마켓플레이스', path: '/listings', enabled: true, order: 0 },
  { key: 'market',      label: '시장 분석',    path: '/market',   enabled: true, order: 1 },
  { key: 'cards',       label: '카드 도감',    path: '/cards',    enabled: true, order: 2 },
  { key: 'shop',        label: '숍',           path: '/shop',     enabled: true, order: 3 },
  { key: 'notice',      label: '공지/이벤트',  path: '/notice',   enabled: true, order: 4 },
  { key: 'community',   label: '공유 게시판',  path: '/community', enabled: true, order: 5 },
]

export default function Navbar() {
  const pathname = usePathname()
  const router = useRouter()
  const user = useAuthStore(s => s.user)
  const clearAuth = useAuthStore(s => s.clearAuth)
  const [search, setSearch] = useState('')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [searchFocused, setSearchFocused] = useState(false)
  const [debouncedQ, setDebouncedQ] = useState('')
  const searchRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // ⌘K / Ctrl+K → 검색창 포커스
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search.trim()), 200)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchFocused(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const { data: suggestData } = useQuery({
    queryKey: ['card-suggest', debouncedQ],
    queryFn: () => api.get('/cards', { params: { q: debouncedQ, limit: 6 } }).then(r => r.data),
    enabled: debouncedQ.length >= 2,
    staleTime: 30_000,
  })
  const suggestions: { id: string; name: string; nameKo?: string | null; tcgType: string; imageUrl?: string | null; setName: string }[] = suggestData?.cards ?? []
  const showSuggestions = searchFocused && debouncedQ.length >= 2 && suggestions.length > 0

  const { data: menusData } = useQuery({
    queryKey: ['site-menus'],
    queryFn: () => api.get<SiteMenu[]>('/menus').then(r => r.data),
    staleTime: 5 * 60 * 1000,
    placeholderData: FALLBACK_MENUS,
  })
  const menus = menusData ?? FALLBACK_MENUS

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (user) {
      reconnectWithToken(useAuthStore.getState().token)
      connectSocket()
    } else {
      reconnectWithToken(null)
    }
  }, [user])

  const { data: unread } = useQuery({
    queryKey: ['chat-unread'],
    queryFn: () => api.get<{ count: number }>('/chat/unread').then(r => r.data.count),
    enabled: !!user,
    staleTime: 10000,
    refetchInterval: 15000,
  })

  const { data: friendReqCount } = useQuery({
    queryKey: ['friend-req-count'],
    queryFn: () => api.get<{ count: number }>('/friends/requests/count').then(r => r.data.count),
    enabled: !!user,
    staleTime: 20000,
    refetchInterval: 30000,
  })

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    if (search.trim()) {
      router.push(`/cards?q=${encodeURIComponent(search.trim())}`)
      setMobileOpen(false)
      setSearchFocused(false)
    }
  }, [search, router])

  const handleSuggestionClick = useCallback((cardId: string) => {
    router.push(`/cards/${cardId}`)
    setSearch('')
    setSearchFocused(false)
  }, [router])

  function handleLogout() {
    const { refreshToken } = useAuthStore.getState()
    api.post('/auth/logout', { refreshToken }).catch(() => {})
    clearAuth()
    router.push('/')
    setMobileOpen(false)
  }

  return (
    <>
      {/* ── Navbar ────────────────────────────────── */}
      <nav className={`sticky top-0 z-50 transition-all duration-300 border-b ${
        scrolled
          ? 'glass border-white/[0.06] shadow-[0_8px_32px_-12px_rgba(0,0,0,0.7)]'
          : 'bg-transparent border-transparent'
      }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 shrink-0 group mr-2">
            <div className="w-8 h-8 rounded-[10px] bg-gradient-to-br from-accent via-accent-strong to-accent-2 flex items-center justify-center shadow-[0_0_18px_rgba(139,92,246,0.45)] group-hover:rotate-[-8deg] transition-transform duration-300">
              <Rocket size={15} className="text-white" strokeWidth={2.5} />
            </div>
            <div className="hidden sm:block leading-none font-display">
              <span className="font-bold text-[17px] text-white tracking-tight">Rocket</span>
              <span className="font-bold text-[17px] text-accent-fg tracking-tight">.AH</span>
            </div>
          </Link>

          {/* Search */}
          <div ref={searchRef} className="flex-1 max-w-sm relative">
            <form onSubmit={handleSearch}>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle pointer-events-none" />
                <input
                  ref={searchInputRef}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  placeholder="카드명 · 카드번호 검색..."
                  className="w-full h-10 pl-9 pr-12 bg-surface/80 border border-line hover:border-line-strong focus:border-accent/60 focus:ring-4 focus:ring-accent/15 rounded-full text-sm text-fg placeholder:text-subtle focus:outline-none transition-all duration-200"
                />
                <kbd className="hidden lg:flex absolute right-3 top-1/2 -translate-y-1/2 h-5 px-1.5 items-center rounded-md border border-line-strong bg-surface-2 font-display text-[10px] text-muted pointer-events-none">⌘K</kbd>
              </div>
            </form>
            {/* Autocomplete dropdown */}
            {showSuggestions && (
              <div className="absolute top-full mt-2 left-0 w-full glass border border-white/10 rounded-2xl shadow-2xl shadow-black/60 z-50 overflow-hidden p-1">
                {suggestions.map(card => (
                  <button
                    key={card.id}
                    onMouseDown={() => handleSuggestionClick(card.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-white/[0.05] transition-colors text-left"
                  >
                    {card.imageUrl ? (
                      <img
                        src={resolveImageSrc(card.imageUrl) ?? ''}
                        alt={card.name}
                        className="w-7 h-10 object-contain rounded shrink-0"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                    ) : (
                      <div className="w-7 h-10 rounded bg-sunken shrink-0 flex items-center justify-center text-[8px]">🃏</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-fg-2 truncate">
                        {card.nameKo ?? card.name}
                      </p>
                      <p className="text-[10px] text-subtle truncate">{card.setName}</p>
                    </div>
                    <span className="text-[9px] text-subtle shrink-0">{card.tcgType}</span>
                  </button>
                ))}
                <div className="border-t border-line">
                  <button
                    onMouseDown={() => { router.push(`/cards?q=${encodeURIComponent(search.trim())}`); setSearchFocused(false) }}
                    className="w-full px-3 py-2 text-[11px] text-muted-2 hover:text-accent-fg text-left flex items-center gap-1.5 hover:bg-surface-2 transition-colors"
                  >
                    <Search size={11} />
                    &ldquo;{search}&rdquo; 전체 검색
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-0.5 ml-1">
            {menus
              .filter(m => m.enabled)
              .sort((a, b) => a.order - b.order)
              .map(m => {
                const isActive = pathname === m.path.split('?')[0]
                return (
                  <Link key={m.key} href={m.path}
                    className={`relative px-3.5 h-9 inline-flex items-center rounded-full text-sm font-medium transition-colors duration-150 ${
                      isActive
                        ? 'text-white bg-white/[0.08]'
                        : 'text-fg-3 hover:text-white hover:bg-white/[0.04]'
                    }`}>
                    {m.label}
                    {isActive && (
                      <span className="absolute -bottom-[13px] left-1/2 -translate-x-1/2 w-6 h-[2px] bg-gradient-to-r from-accent to-accent-2 rounded-full shadow-[0_0_10px_rgba(139,92,246,0.8)]" />
                    )}
                  </Link>
                )
              })}
          </div>

          {/* Desktop user actions */}
          <div className="ml-auto hidden md:flex items-center gap-1.5 shrink-0">
            {user ? (
              <>
                {/* Balance chip */}
                <Link href="/charge"
                  className="flex items-center gap-1.5 h-9 px-3.5 bg-surface/80 hover:bg-surface-2 border border-line hover:border-accent-2/40 rounded-full text-sm transition-all duration-200 group">
                  <Wallet size={12} className="text-accent-2" />
                  <span className="text-accent-2 font-semibold tabular-nums text-[13px]">{user.balance.toLocaleString()}</span>
                  <span className="text-muted text-[11px]">P</span>
                  <Zap size={10} className="text-accent-2/40 group-hover:text-accent-2/80 transition-colors" />
                </Link>

                {/* Chat (listing) */}
                <Link href="/chat"
                  className="relative h-9 w-9 flex items-center justify-center text-white/60 hover:text-white hover:bg-surface rounded-full transition-colors duration-150"
                  title="채팅">
                  <MessageCircle size={17} />
                  {(unread ?? 0) > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 bg-accent text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center leading-none shadow-[0_0_8px_rgba(139,92,246,0.5)]">
                      {unread! > 9 ? '9+' : unread}
                    </span>
                  )}
                </Link>

                {/* 알림 */}
                <NotificationBell />

                {/* DM + Friends */}
                <Link href="/dm"
                  className="relative h-9 w-9 flex items-center justify-center text-white/60 hover:text-white hover:bg-surface rounded-full transition-colors duration-150"
                  title="DM / 친구">
                  <Users size={17} />
                  {(friendReqCount ?? 0) > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 bg-emerald-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center leading-none">
                      {friendReqCount! > 9 ? '9+' : friendReqCount}
                    </span>
                  )}
                </Link>

                {/* Admin */}
                {(user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') && (
                  <Link href="/admin"
                    className="h-9 w-9 flex items-center justify-center text-white/60 hover:text-accent-fg hover:bg-surface rounded-full transition-colors duration-150"
                    title="관리자">
                    <LayoutDashboard size={17} />
                  </Link>
                )}

                {/* Profile chip */}
                <Link href="/my"
                  className="flex items-center gap-2 h-9 pl-1.5 pr-3.5 bg-surface/80 hover:bg-surface-2 border border-line hover:border-line-strong rounded-full text-sm text-fg-2 hover:text-white transition-all duration-200">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-accent to-accent-2 flex items-center justify-center shrink-0">
                    <User size={12} className="text-white" />
                  </div>
                  <span className="max-w-[72px] truncate text-[13px]">{user.nickname}</span>
                </Link>

                {/* Logout */}
                <button onClick={handleLogout}
                  className="h-9 w-9 flex items-center justify-center text-white/30 hover:text-red-400 hover:bg-surface rounded-full transition-colors duration-150"
                  title="로그아웃">
                  <LogOut size={15} />
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className="h-9 px-4 flex items-center text-sm font-medium text-fg-3 hover:text-white transition-colors">
                  로그인
                </Link>
                <Link href="/register"
                  className="h-9 px-4 flex items-center text-sm bg-white hover:bg-fg-2 text-bg rounded-full font-semibold transition-colors">
                  무료 가입
                </Link>
              </>
            )}
          </div>

          {/* Mobile menu btn */}
          <button
            className="md:hidden ml-auto h-9 w-9 flex items-center justify-center text-white/70 hover:text-white transition-colors rounded-full"
            onClick={() => setMobileOpen(v => !v)}>
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </nav>

      {/* ── Mobile overlay ── */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
      )}

      {/* ── Mobile drawer ── */}
      <div className={`md:hidden fixed top-16 right-0 h-[calc(100dvh-4rem)] w-72 glass border-l border-white/[0.06] z-50 transform transition-transform duration-200 overflow-y-auto ${mobileOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex flex-col p-4 gap-1">
          {menus
            .filter(m => m.enabled)
            .sort((a, b) => a.order - b.order)
            .map(m => (
              <Link key={m.key} href={m.path} onClick={() => setMobileOpen(false)}
                className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  pathname === m.path.split('?')[0]
                    ? 'bg-accent-tint text-white'
                    : 'text-white/70 hover:bg-surface hover:text-white'
                }`}>
                {m.label}
              </Link>
            ))}

          <div className="my-2 h-px bg-line" />

          {user ? (
            <>
              <div className="px-4 py-3 bg-surface rounded-xl border border-line mb-1">
                <p className="text-[11px] text-subtle mb-1 uppercase tracking-wider font-semibold">보유 포인트</p>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold text-accent-2 tabular-nums">{user.balance.toLocaleString()}</span>
                  <span className="text-sm text-muted">P</span>
                </div>
              </div>
              <Link href="/charge" onClick={() => setMobileOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-accent-2/70 hover:bg-surface hover:text-accent-2 rounded-xl transition-colors">
                <Zap size={15} /> 포인트 충전
              </Link>
              <Link href="/chat" onClick={() => setMobileOpen(false)} className="flex items-center justify-between px-4 py-2.5 text-sm text-white/70 hover:bg-surface hover:text-white rounded-xl transition-colors">
                <span className="flex items-center gap-2.5"><MessageCircle size={15} /> 채팅</span>
                {(unread ?? 0) > 0 && (
                  <span className="bg-accent text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{unread}</span>
                )}
              </Link>
              <Link href="/dm" onClick={() => setMobileOpen(false)} className="flex items-center justify-between px-4 py-2.5 text-sm text-white/70 hover:bg-surface hover:text-white rounded-xl transition-colors">
                <span className="flex items-center gap-2.5"><Users size={15} /> DM / 친구</span>
                {(friendReqCount ?? 0) > 0 && (
                  <span className="bg-emerald-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{friendReqCount}</span>
                )}
              </Link>
              <Link href="/notifications" onClick={() => setMobileOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-white/70 hover:bg-surface hover:text-white rounded-xl transition-colors">
                <Bell size={15} /> 알림
              </Link>
              <Link href="/wishlist" onClick={() => setMobileOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-white/70 hover:bg-surface hover:text-white rounded-xl transition-colors">
                <Heart size={15} /> 위시리스트
              </Link>
              <Link href="/collection" onClick={() => setMobileOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-white/70 hover:bg-surface hover:text-white rounded-xl transition-colors">
                <Layers size={15} /> 컬렉션 트래커
              </Link>
              <Link href="/my" onClick={() => setMobileOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-white/70 hover:bg-surface hover:text-white rounded-xl transition-colors">
                <User size={15} /> 마이페이지 ({user.nickname})
              </Link>
              <Link href="/settings" onClick={() => setMobileOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-white/70 hover:bg-surface hover:text-white rounded-xl transition-colors">
                <Settings size={15} /> 설정
              </Link>
              {(user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') && (
                <Link href="/admin" onClick={() => setMobileOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-accent-fg hover:bg-surface rounded-xl transition-colors">
                  <LayoutDashboard size={15} /> 관리자
                </Link>
              )}
              <button onClick={handleLogout} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-400/60 hover:bg-surface hover:text-red-400 rounded-xl transition-colors text-left">
                <LogOut size={15} /> 로그아웃
              </button>
            </>
          ) : (
            <div className="flex flex-col gap-2 mt-1">
              <Link href="/login" onClick={() => setMobileOpen(false)}
                className="flex items-center justify-center py-2.5 text-sm text-white/70 border border-line hover:border-line-strong rounded-xl transition-colors">
                로그인
              </Link>
              <Link href="/register" onClick={() => setMobileOpen(false)}
                className="flex items-center justify-center py-2.5 text-sm bg-accent hover:bg-accent-strong text-white rounded-xl font-medium transition-colors shadow-[0_0_14px_rgba(139,92,246,0.3)]">
                무료 가입
              </Link>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

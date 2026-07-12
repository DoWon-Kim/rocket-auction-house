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
      <nav className={`sticky top-0 z-50 transition-all duration-200 ${
        scrolled
          ? 'bg-[#0f0b08]/96 backdrop-blur-2xl shadow-[0_1px_0_rgba(255,255,255,0.04),0_4px_32px_rgba(0,0,0,0.5)]'
          : 'bg-[#0f0b08]/80 backdrop-blur-xl'
      } border-b border-[#2e2318]`}>
        <div className="max-w-7xl mx-auto px-4 h-[60px] flex items-center gap-3">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 shrink-0 group mr-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#d4a853] to-[#b8860b] flex items-center justify-center shadow-[0_0_14px_rgba(212,168,83,0.35)] group-hover:shadow-[0_0_22px_rgba(212,168,83,0.55)] transition-shadow duration-300">
              <Rocket size={15} className="text-white" strokeWidth={2.5} />
            </div>
            <div className="hidden sm:block leading-none">
              <span className="font-bold text-[15px] text-white tracking-tight">Rocket</span>
              <span className="font-bold text-[15px] text-[#d4a853] tracking-tight"> AH</span>
            </div>
          </Link>

          {/* Search */}
          <div ref={searchRef} className="flex-1 max-w-xs relative">
            <form onSubmit={handleSearch}>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a4830] pointer-events-none" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  placeholder="카드명 · 카드번호 검색..."
                  className="w-full pl-9 pr-4 py-[7px] bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] focus:border-[#d4a853]/40 rounded-lg text-sm text-[#f5ead8] placeholder:text-[#5a4830] focus:outline-none transition-colors duration-200"
                />
              </div>
            </form>
            {/* Autocomplete dropdown */}
            {showSuggestions && (
              <div className="absolute top-full mt-1.5 left-0 w-full bg-[#1a1410] border border-[#2e2318] rounded-xl shadow-2xl shadow-black/60 z-50 overflow-hidden">
                {suggestions.map(card => (
                  <button
                    key={card.id}
                    onMouseDown={() => handleSuggestionClick(card.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[#221810] transition-colors text-left"
                  >
                    {card.imageUrl ? (
                      <img
                        src={resolveImageSrc(card.imageUrl) ?? ''}
                        alt={card.name}
                        className="w-7 h-10 object-contain rounded shrink-0"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                    ) : (
                      <div className="w-7 h-10 rounded bg-[#100c08] shrink-0 flex items-center justify-center text-[8px]">🃏</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-[#e8d5b0] truncate">
                        {card.nameKo ?? card.name}
                      </p>
                      <p className="text-[10px] text-[#5a4830] truncate">{card.setName}</p>
                    </div>
                    <span className="text-[9px] text-[#4a3820] shrink-0">{card.tcgType}</span>
                  </button>
                ))}
                <div className="border-t border-[#2e2318]">
                  <button
                    onMouseDown={() => { router.push(`/cards?q=${encodeURIComponent(search.trim())}`); setSearchFocused(false) }}
                    className="w-full px-3 py-2 text-[11px] text-[#7a6040] hover:text-[#d4a853] text-left flex items-center gap-1.5 hover:bg-[#1e1810] transition-colors"
                  >
                    <Search size={11} />
                    &ldquo;{search}&rdquo; 전체 검색
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-0.5">
            {menus
              .filter(m => m.enabled)
              .sort((a, b) => a.order - b.order)
              .map(m => {
                const isActive = pathname === m.path.split('?')[0]
                return (
                  <Link key={m.key} href={m.path}
                    className={`relative px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-150 ${
                      isActive
                        ? 'text-white bg-[#2a1c0c]'
                        : 'text-white/70 hover:text-white hover:bg-[#1a1410]'
                    }`}>
                    {m.label}
                    {isActive && (
                      <span className="absolute bottom-[3px] left-1/2 -translate-x-1/2 w-5 h-[2px] bg-[#d4a853] rounded-full" />
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
                  className="flex items-center gap-1.5 h-8 px-3 bg-[#221a12] hover:bg-[#201810] border border-[#3a2510] hover:border-[#f0a832]/25 rounded-lg text-sm transition-all duration-200 group">
                  <Wallet size={12} className="text-[#f0a832]" />
                  <span className="text-[#f0a832] font-semibold tabular-nums text-[13px]">{user.balance.toLocaleString()}</span>
                  <span className="text-[#5a4218] text-[11px]">P</span>
                  <Zap size={10} className="text-[#f0a832]/40 group-hover:text-[#f0a832]/80 transition-colors" />
                </Link>

                {/* Chat (listing) */}
                <Link href="/chat"
                  className="relative h-8 w-8 flex items-center justify-center text-white/60 hover:text-white hover:bg-[#1a1410] rounded-lg transition-colors duration-150"
                  title="채팅">
                  <MessageCircle size={17} />
                  {(unread ?? 0) > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 bg-[#d4a853] text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center leading-none shadow-[0_0_8px_rgba(212,168,83,0.5)]">
                      {unread! > 9 ? '9+' : unread}
                    </span>
                  )}
                </Link>

                {/* 알림 */}
                <NotificationBell />

                {/* DM + Friends */}
                <Link href="/dm"
                  className="relative h-8 w-8 flex items-center justify-center text-white/60 hover:text-white hover:bg-[#1a1410] rounded-lg transition-colors duration-150"
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
                    className="h-8 w-8 flex items-center justify-center text-white/60 hover:text-[#d4a853] hover:bg-[#1a1410] rounded-lg transition-colors duration-150"
                    title="관리자">
                    <LayoutDashboard size={17} />
                  </Link>
                )}

                {/* Profile chip */}
                <Link href="/my"
                  className="flex items-center gap-1.5 h-8 px-3 bg-[#221a12] hover:bg-[#201810] border border-[#3a2510] hover:border-[#4a3520] rounded-lg text-sm text-white/75 hover:text-white transition-all duration-200">
                  <div className="w-4 h-4 rounded-full bg-gradient-to-br from-[#d4a853] to-[#b8860b] flex items-center justify-center shrink-0">
                    <User size={9} className="text-white" />
                  </div>
                  <span className="max-w-[72px] truncate text-[13px]">{user.nickname}</span>
                </Link>

                {/* Logout */}
                <button onClick={handleLogout}
                  className="h-8 w-8 flex items-center justify-center text-white/30 hover:text-red-400 hover:bg-[#1a1410] rounded-lg transition-colors duration-150"
                  title="로그아웃">
                  <LogOut size={15} />
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className="h-8 px-4 flex items-center text-sm text-white/70 hover:text-white transition-colors">
                  로그인
                </Link>
                <Link href="/register"
                  className="h-8 px-4 flex items-center text-sm bg-[#d4a853] hover:bg-[#c49440] text-white rounded-lg font-medium transition-all duration-200 shadow-[0_0_14px_rgba(212,168,83,0.28)] hover:shadow-[0_0_20px_rgba(212,168,83,0.45)]">
                  무료 가입
                </Link>
              </>
            )}
          </div>

          {/* Mobile menu btn */}
          <button
            className="md:hidden ml-auto h-8 w-8 flex items-center justify-center text-white/70 hover:text-white transition-colors rounded-lg"
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
      <div className={`md:hidden fixed top-[60px] right-0 h-[calc(100dvh-60px)] w-72 bg-[#150f0c] border-l border-[#2e2318] z-50 transform transition-transform duration-200 overflow-y-auto ${mobileOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex flex-col p-4 gap-1">
          {menus
            .filter(m => m.enabled)
            .sort((a, b) => a.order - b.order)
            .map(m => (
              <Link key={m.key} href={m.path} onClick={() => setMobileOpen(false)}
                className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  pathname === m.path.split('?')[0]
                    ? 'bg-[#2a1c0c] text-white'
                    : 'text-white/70 hover:bg-[#1a1410] hover:text-white'
                }`}>
                {m.label}
              </Link>
            ))}

          <div className="my-2 h-px bg-[#2e2318]" />

          {user ? (
            <>
              <div className="px-4 py-3 bg-[#1a1410] rounded-xl border border-[#2e2318] mb-1">
                <p className="text-[11px] text-[#5a4830] mb-1 uppercase tracking-wider font-semibold">보유 포인트</p>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold text-[#f0a832] tabular-nums">{user.balance.toLocaleString()}</span>
                  <span className="text-sm text-[#5a4218]">P</span>
                </div>
              </div>
              <Link href="/charge" onClick={() => setMobileOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-[#f0a832]/70 hover:bg-[#1a1410] hover:text-[#f0a832] rounded-xl transition-colors">
                <Zap size={15} /> 포인트 충전
              </Link>
              <Link href="/chat" onClick={() => setMobileOpen(false)} className="flex items-center justify-between px-4 py-2.5 text-sm text-white/70 hover:bg-[#1a1410] hover:text-white rounded-xl transition-colors">
                <span className="flex items-center gap-2.5"><MessageCircle size={15} /> 채팅</span>
                {(unread ?? 0) > 0 && (
                  <span className="bg-[#d4a853] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{unread}</span>
                )}
              </Link>
              <Link href="/dm" onClick={() => setMobileOpen(false)} className="flex items-center justify-between px-4 py-2.5 text-sm text-white/70 hover:bg-[#1a1410] hover:text-white rounded-xl transition-colors">
                <span className="flex items-center gap-2.5"><Users size={15} /> DM / 친구</span>
                {(friendReqCount ?? 0) > 0 && (
                  <span className="bg-emerald-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{friendReqCount}</span>
                )}
              </Link>
              <Link href="/notifications" onClick={() => setMobileOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-white/70 hover:bg-[#1a1410] hover:text-white rounded-xl transition-colors">
                <Bell size={15} /> 알림
              </Link>
              <Link href="/wishlist" onClick={() => setMobileOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-white/70 hover:bg-[#1a1410] hover:text-white rounded-xl transition-colors">
                <Heart size={15} /> 위시리스트
              </Link>
              <Link href="/collection" onClick={() => setMobileOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-white/70 hover:bg-[#1a1410] hover:text-white rounded-xl transition-colors">
                <Layers size={15} /> 컬렉션 트래커
              </Link>
              <Link href="/my" onClick={() => setMobileOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-white/70 hover:bg-[#1a1410] hover:text-white rounded-xl transition-colors">
                <User size={15} /> 마이페이지 ({user.nickname})
              </Link>
              <Link href="/settings" onClick={() => setMobileOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-white/70 hover:bg-[#1a1410] hover:text-white rounded-xl transition-colors">
                <Settings size={15} /> 설정
              </Link>
              {(user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') && (
                <Link href="/admin" onClick={() => setMobileOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-[#d4a853] hover:bg-[#1a1410] rounded-xl transition-colors">
                  <LayoutDashboard size={15} /> 관리자
                </Link>
              )}
              <button onClick={handleLogout} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-400/60 hover:bg-[#1a1410] hover:text-red-400 rounded-xl transition-colors text-left">
                <LogOut size={15} /> 로그아웃
              </button>
            </>
          ) : (
            <div className="flex flex-col gap-2 mt-1">
              <Link href="/login" onClick={() => setMobileOpen(false)}
                className="flex items-center justify-center py-2.5 text-sm text-white/70 border border-[#2e2318] hover:border-[#4a3520] rounded-xl transition-colors">
                로그인
              </Link>
              <Link href="/register" onClick={() => setMobileOpen(false)}
                className="flex items-center justify-center py-2.5 text-sm bg-[#d4a853] hover:bg-[#c49440] text-white rounded-xl font-medium transition-colors shadow-[0_0_14px_rgba(212,168,83,0.3)]">
                무료 가입
              </Link>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

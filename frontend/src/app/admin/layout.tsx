'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore, useAuthHydrated } from '@/lib/store'
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { LayoutDashboard, CreditCard, Package, Users, ChevronRight, Truck, Banknote, Store, Bell, MenuIcon, Shield, Settings, ShieldAlert, Link2 } from 'lucide-react'

const ALL_NAV = [
  { href: '/admin',             label: '대시보드',    icon: <LayoutDashboard size={16} />, section: 'dashboard' },
  { href: '/admin/permissions', label: '권한 관리',   icon: <Shield size={16} />,          section: 'permissions', superOnly: true },
  { href: '/admin/settings',    label: '사이트 설정', icon: <Settings size={16} />,        section: 'settings',    superOnly: true },
  { href: '/admin/menus',       label: '메뉴 관리',   icon: <MenuIcon size={16} />,        section: 'menus',       superOnly: true },
  { href: '/admin/reports',     label: '신고 관리',   icon: <ShieldAlert size={16} />,     section: 'reports' },
  { href: '/admin/disputes',    label: '분쟁 관리',   icon: <Shield size={16} />,           section: 'reports' },
  { href: '/admin/posts',       label: '게시글 관리', icon: <Bell size={16} />,            section: 'posts' },
  { href: '/admin/cards',       label: '카드 관리',   icon: <CreditCard size={16} />,      section: 'cards' },
  { href: '/admin/card-sources', label: '카드 매칭 검수', icon: <Link2 size={16} />,        section: 'cards' },
  { href: '/admin/shop',        label: '샵 관리',     icon: <Store size={16} />,           section: 'shop' },
  { href: '/admin/oripas',      label: '오리파 관리', icon: <Package size={16} />,         section: 'oripas' },
  { href: '/admin/users',       label: '유저 관리',   icon: <Users size={16} />,           section: 'users',       superOnly: true },
  { href: '/admin/shipping',    label: '배송 관리',   icon: <Truck size={16} />,           section: 'shipping' },
  { href: '/admin/withdrawal',  label: '환전 관리',   icon: <Banknote size={16} />,        section: 'withdrawal' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore()
  const router = useRouter()
  const pathname = usePathname()

  const isSuperAdmin = user?.role === 'SUPER_ADMIN'
  const isAdmin = user?.role === 'ADMIN' || isSuperAdmin

  const { data: permData } = useQuery({
    queryKey: ['admin', 'my-permissions'],
    queryFn: () => api.get<{ sections: string[] }>('/admin/my-permissions').then(r => r.data),
    enabled: !!user && isAdmin,
    staleTime: 60 * 1000,
  })

  const hydrated = useAuthHydrated()
  useEffect(() => {
    if (!hydrated) return
    if (user === null) { router.replace('/login'); return }
    if (user && !isAdmin) router.replace('/')
  }, [hydrated, user, router, isAdmin])

  if (!user || !isAdmin) return null

  const allowedSections = new Set(permData?.sections ?? ['dashboard'])

  const navItems = ALL_NAV.filter(item => {
    if (item.superOnly) return isSuperAdmin
    if (isSuperAdmin) return true
    return allowedSections.has(item.section)
  })

  return (
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 min-h-[calc(100vh-4rem)]">
      {/* 사이드바 (모바일: 가로 스크롤 탭) */}
      <aside className="lg:w-52 lg:shrink-0">
        <div className="bg-sunken border border-line rounded-2xl overflow-hidden lg:sticky lg:top-20">
          <div className="hidden lg:block px-4 py-3 border-b border-line">
            <p className="text-xs font-semibold uppercase tracking-wider text-subtle">
              {isSuperAdmin ? '최종 관리자' : '관리자'}
            </p>
          </div>
          <nav className="p-2 flex gap-1 overflow-x-auto lg:block lg:space-y-0.5">
            {navItems.map((item) => {
              const active = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex shrink-0 whitespace-nowrap items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                    active
                      ? 'bg-accent-tint text-white border-l-2 border-accent'
                      : 'text-muted hover:bg-surface-2 hover:text-fg'
                  }`}
                >
                  {item.icon}
                  {item.label}
                  {active && <ChevronRight size={14} className="hidden lg:block ml-auto text-accent-fg" />}
                </Link>
              )
            })}
          </nav>
        </div>
      </aside>

      {/* 콘텐츠 */}
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

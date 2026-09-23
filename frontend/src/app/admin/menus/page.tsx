'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { ShoppingBag, Store, Bell, Users } from 'lucide-react'

interface SiteMenu {
  id: string
  key: string
  label: string
  path: string
  enabled: boolean
  order: number
}

const MENU_ICONS: Record<string, React.ReactNode> = {
  marketplace: <ShoppingBag size={16} className="text-accent-fg" />,
  shop: <Store size={16} className="text-accent-fg" />,
  notice: <Bell size={16} className="text-accent-fg" />,
  community: <Users size={16} className="text-accent-fg" />,
}

export default function AdminMenusPage() {
  const queryClient = useQueryClient()

  const { data: menus = [], isLoading } = useQuery<SiteMenu[]>({
    queryKey: ['admin', 'menus'],
    queryFn: () => api.get<SiteMenu[]>('/menus').then(r => r.data),
  })

  const toggleMutation = useMutation({
    mutationFn: (key: string) => api.patch(`/admin/menus/${key}/toggle`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'menus'] })
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-[26px] sm:text-3xl font-bold tracking-tight text-fg">메뉴 관리</h1>
          <p className="text-sm text-muted mt-1">Navbar에 표시될 메뉴를 ON/OFF로 관리합니다.</p>
        </div>
        <div className="bg-surface border border-line rounded-2xl overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="border-b border-line h-14 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  const sorted = [...menus].sort((a, b) => a.order - b.order)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[26px] sm:text-3xl font-bold tracking-tight text-fg">메뉴 관리</h1>
        <p className="text-sm text-muted mt-1">Navbar에 표시될 메뉴를 ON/OFF로 관리합니다.</p>
      </div>

      <div className="bg-surface border border-line rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className="text-left px-5 py-3 text-xs text-subtle uppercase tracking-wider font-semibold">순서</th>
              <th className="text-left px-5 py-3 text-xs text-subtle uppercase tracking-wider font-semibold">메뉴</th>
              <th className="text-left px-5 py-3 text-xs text-subtle uppercase tracking-wider font-semibold">경로</th>
              <th className="text-left px-5 py-3 text-xs text-subtle uppercase tracking-wider font-semibold">키</th>
              <th className="text-right px-5 py-3 text-xs text-subtle uppercase tracking-wider font-semibold">표시</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(menu => (
              <tr key={menu.id} className="border-b border-line hover:bg-surface-2 transition-colors last:border-b-0">
                <td className="px-5 py-4 text-subtle tabular-nums">{menu.order}</td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2.5">
                    {MENU_ICONS[menu.key] ?? <ShoppingBag size={16} className="text-subtle" />}
                    <span className="font-medium text-fg">{menu.label}</span>
                  </div>
                </td>
                <td className="px-5 py-4 text-muted font-mono text-xs">{menu.path}</td>
                <td className="px-5 py-4 text-subtle font-mono text-xs">{menu.key}</td>
                <td className="px-5 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <span className={`text-xs font-medium ${menu.enabled ? 'text-accent-fg' : 'text-subtle'}`}>
                      {menu.enabled ? 'ON' : 'OFF'}
                    </span>
                    <button
                      onClick={() => toggleMutation.mutate(menu.key)}
                      disabled={toggleMutation.isPending}
                      className={`relative w-10 h-5 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${menu.enabled ? 'bg-accent' : 'bg-line'}`}
                      aria-label={`${menu.label} ${menu.enabled ? '비활성화' : '활성화'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${menu.enabled ? 'translate-x-5' : ''}`} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-subtle">등록된 메뉴가 없습니다.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

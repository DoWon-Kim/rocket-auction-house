'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Lock } from 'lucide-react'
import { api } from '@/lib/api'
import { BOARDS, PERMISSION_LABEL, type BoardPermission } from '@/lib/community'
import { useCommunityStats } from '@/components/community/CommunityShell'

const LEVELS = Object.keys(PERMISSION_LABEL) as BoardPermission[]

// 관리자: 커뮤니티 게시판별 글쓰기/댓글 권한 설정
export function BoardPermissionPanel() {
  const qc = useQueryClient()
  const { data: stats, isLoading } = useCommunityStats()
  const save = useMutation({
    mutationFn: ({ category, patch }: { category: string; patch: Partial<Record<'writePermission' | 'commentPermission', BoardPermission>> }) =>
      api.patch(`/admin/community/boards/${category}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['community-stats'] }),
  })

  const selectCls = 'h-9 bg-sunken border border-line hover:border-line-strong rounded-full px-3 text-xs text-fg-2 focus:outline-none focus:border-accent/60 cursor-pointer disabled:opacity-50'

  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-center gap-2 mb-1">
        <Lock size={15} className="text-accent-fg" />
        <h2 className="text-sm font-semibold text-fg">게시판 권한</h2>
        {save.isPending && <span className="text-xs text-muted">저장 중…</span>}
        {save.isError && <span className="text-xs text-rose-300">저장에 실패했습니다.</span>}
      </div>
      <p className="text-xs text-muted mb-4">
        활동 등급(글 3점 · 댓글 1점)으로 게시판별 글쓰기·댓글 권한을 제한합니다. 관리자는 항상 허용됩니다.
      </p>
      {isLoading ? (
        <div className="h-40 rounded-xl bg-sunken animate-pulse" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted text-left">
                <th className="py-2 font-medium">게시판</th>
                <th className="py-2 font-medium">글쓰기</th>
                <th className="py-2 font-medium">댓글</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {BOARDS.map(b => {
                const s = stats?.boards.find(x => x.category === b.key)
                return (
                  <tr key={b.key}>
                    <td className="py-2.5 pr-4 text-fg-2 whitespace-nowrap">{b.emoji} {b.label}</td>
                    {(['writePermission', 'commentPermission'] as const).map(field => (
                      <td key={field} className="py-2.5 pr-4">
                        <select value={s?.[field] ?? 'ALL'} disabled={save.isPending} className={selectCls}
                          aria-label={`${b.label} ${field === 'writePermission' ? '글쓰기' : '댓글'} 권한`}
                          onChange={e => save.mutate({ category: b.key, patch: { [field]: e.target.value as BoardPermission } })}>
                          {LEVELS.map(l => <option key={l} value={l}>{PERMISSION_LABEL[l]}</option>)}
                        </select>
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

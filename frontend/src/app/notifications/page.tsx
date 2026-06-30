'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { useRouter } from 'next/navigation'
import { Bell, CheckCheck, Trash2, Check } from 'lucide-react'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { ko } from 'date-fns/locale'

type NotifType = string

interface Notification {
  id: string
  type: NotifType
  title: string
  body?: string
  link?: string
  isRead: boolean
  createdAt: string
}

const TYPE_ICON: Record<string, string> = {
  BID_OUTBID: '🔔', BID_WON: '🏆', OFFER_RECEIVED: '💌', OFFER_ACCEPTED: '✅',
  OFFER_REJECTED: '❌', TRANSACTION_SHIPPED: '📦', TRANSACTION_COMPLETED: '🎉',
  REVIEW_RECEIVED: '⭐', FRIEND_REQUEST: '👤', FRIEND_ACCEPTED: '🤝', SYSTEM: '📢',
}

export default function NotificationsPage() {
  const { user } = useAuthStore()
  const router = useRouter()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)

  if (!user) { router.replace('/login'); return null }

  const { data, isLoading } = useQuery({
    queryKey: ['notifications-page', page],
    queryFn: () => api.get('/notifications', { params: { page } }).then(r => r.data as {
      notifications: Notification[]; total: number; totalPages: number; unreadCount: number
    }),
  })

  const notifications = data?.notifications ?? []
  const totalPages = data?.totalPages ?? 1

  const markAll = useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['notifications-page'] })
    },
  })

  const markRead = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['notifications-page'] })
    },
  })

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/notifications/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['notifications-page'] })
    },
  })

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell size={20} className="text-[#d4a853]" />
          <h1 className="text-xl font-bold text-[#f5ead8]">알림</h1>
          {(data?.unreadCount ?? 0) > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{data?.unreadCount}</span>
          )}
        </div>
        {(data?.unreadCount ?? 0) > 0 && (
          <button
            onClick={() => markAll.mutate()}
            disabled={markAll.isPending}
            className="flex items-center gap-1.5 text-sm text-[#7a6040] hover:text-[#d4a853] transition-colors px-3 py-1.5 hover:bg-[#1a1410] rounded-xl"
          >
            <CheckCheck size={15} /> 모두 읽음
          </button>
        )}
      </div>

      {/* 목록 */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-20 bg-[#1a1410] rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-[#4a3820]">
          <Bell size={40} className="mb-3 opacity-30" />
          <p className="text-sm">알림이 없습니다</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {notifications.map(notif => (
            <div
              key={notif.id}
              className={`group flex gap-4 items-start px-5 py-4 rounded-2xl border transition-colors ${
                notif.isRead
                  ? 'bg-[#1a1410] border-[#2e2318] hover:border-[#3a2818]'
                  : 'bg-[#d4a853]/5 border-[#d4a853]/20 hover:border-[#d4a853]/30'
              }`}
            >
              {/* 아이콘 */}
              <div className="w-10 h-10 flex items-center justify-center bg-[#120d08] border border-[#2e2318] rounded-full shrink-0 text-xl">
                {TYPE_ICON[notif.type] ?? '🔔'}
              </div>

              {/* 내용 */}
              <div className="flex-1 min-w-0">
                {notif.link ? (
                  <Link href={notif.link} onClick={() => !notif.isRead && markRead.mutate(notif.id)}
                    className="block group/link">
                    <p className={`text-sm font-semibold group-hover/link:text-[#d4a853] transition-colors ${notif.isRead ? 'text-[#9e8a6a]' : 'text-[#f5ead8]'}`}>
                      {notif.title}
                    </p>
                    {notif.body && <p className="text-xs text-[#5a4830] mt-0.5 leading-relaxed">{notif.body}</p>}
                  </Link>
                ) : (
                  <>
                    <p className={`text-sm font-semibold ${notif.isRead ? 'text-[#9e8a6a]' : 'text-[#f5ead8]'}`}>{notif.title}</p>
                    {notif.body && <p className="text-xs text-[#5a4830] mt-0.5 leading-relaxed">{notif.body}</p>}
                  </>
                )}
                <p className="text-[11px] text-[#3a2810] mt-1.5">
                  {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true, locale: ko })}
                </p>
              </div>

              {/* 액션 */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                {!notif.isRead && (
                  <button
                    onClick={() => markRead.mutate(notif.id)}
                    className="p-1.5 text-[#5a4830] hover:text-[#d4a853] hover:bg-[#2a1c0c] rounded-lg transition-colors"
                    title="읽음 처리"
                  >
                    <Check size={14} />
                  </button>
                )}
                <button
                  onClick={() => del.mutate(notif.id)}
                  className="p-1.5 text-[#5a4830] hover:text-red-400 hover:bg-[#2a1c0c] rounded-lg transition-colors"
                  title="삭제"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {/* 미읽음 인디케이터 */}
              {!notif.isRead && (
                <div className="w-2 h-2 rounded-full bg-[#d4a853] shrink-0 mt-1" />
              )}
            </div>
          ))}
        </div>
      )}

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 text-sm bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] text-[#9e8a6a] hover:text-[#f5ead8] rounded-xl disabled:opacity-30 transition-colors"
          >
            이전
          </button>
          <span className="text-sm text-[#5a4830] tabular-nums">{page} / {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-4 py-2 text-sm bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] text-[#9e8a6a] hover:text-[#f5ead8] rounded-xl disabled:opacity-30 transition-colors"
          >
            다음
          </button>
        </div>
      )}
    </div>
  )
}

'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { getSocket } from '@/lib/socket'
import { Bell, BellRing, X, Check, CheckCheck, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { ko } from 'date-fns/locale'

type NotifType =
  | 'BID_OUTBID' | 'BID_WON' | 'OFFER_RECEIVED' | 'OFFER_ACCEPTED' | 'OFFER_REJECTED'
  | 'TRANSACTION_SHIPPED' | 'TRANSACTION_COMPLETED' | 'REVIEW_RECEIVED'
  | 'FRIEND_REQUEST' | 'FRIEND_ACCEPTED' | 'SYSTEM'

interface Notification {
  id: string
  type: NotifType
  title: string
  body?: string
  link?: string
  isRead: boolean
  createdAt: string
}

const TYPE_ICON: Record<NotifType, string> = {
  BID_OUTBID:            '🔔',
  BID_WON:               '🏆',
  OFFER_RECEIVED:        '💌',
  OFFER_ACCEPTED:        '✅',
  OFFER_REJECTED:        '❌',
  TRANSACTION_SHIPPED:   '📦',
  TRANSACTION_COMPLETED: '🎉',
  REVIEW_RECEIVED:       '⭐',
  FRIEND_REQUEST:        '👤',
  FRIEND_ACCEPTED:       '🤝',
  SYSTEM:                '📢',
}

export function NotificationBell() {
  const { user } = useAuthStore()
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const qc = useQueryClient()

  // 실시간 소켓 알림 수신
  useEffect(() => {
    if (!user) return
    const socket = getSocket()
    const handler = (notif: Notification) => {
      qc.setQueryData(['notifications', 1], (old: { notifications: Notification[]; unreadCount: number } | undefined) => {
        if (!old) return old
        return {
          ...old,
          notifications: [notif, ...old.notifications.slice(0, 19)],
          unreadCount: old.unreadCount + 1,
        }
      })
      qc.invalidateQueries({ queryKey: ['notifications', 'unread'] })
    }
    socket.on('notification:new', handler)
    return () => { socket.off('notification:new', handler) }
  }, [user, qc])

  const { data } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => api.get('/notifications/unread-count').then(r => r.data as { count: number }),
    enabled: !!user,
    refetchInterval: 60_000,
  })

  const { data: panel, isLoading } = useQuery({
    queryKey: ['notifications', 1],
    queryFn: () => api.get('/notifications', { params: { page: 1 } }).then(r => r.data as {
      notifications: Notification[]; total: number; unreadCount: number
    }),
    enabled: !!user && open,
  })

  const markRead = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  const markAll = useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/notifications/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  // 바깥 클릭 닫기
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleItemClick = useCallback((notif: Notification) => {
    if (!notif.isRead) markRead.mutate(notif.id)
    setOpen(false)
  }, [markRead])

  if (!user) return null

  const unread = data?.count ?? 0
  const notifications = panel?.notifications ?? []

  return (
    <div className="relative" ref={panelRef}>
      {/* 벨 아이콘 */}
      <button
        onClick={() => setOpen(v => !v)}
        className="relative p-2 rounded-xl hover:bg-[#2a1c0c] transition-colors"
        aria-label="알림"
      >
        {unread > 0
          ? <BellRing size={20} className="text-[#d4a853] animate-[wiggle_0.6s_ease-in-out]" />
          : <Bell size={20} className="text-[#7a6040]" />
        }
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center bg-red-500 text-white text-[9px] font-bold rounded-full px-1 tabular-nums">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {/* 드롭다운 패널 */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-[#120d08] border border-[#2e2318] rounded-2xl shadow-2xl overflow-hidden z-50">
          {/* 헤더 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#2e2318]">
            <div className="flex items-center gap-2">
              <Bell size={14} className="text-[#d4a853]" />
              <span className="text-sm font-semibold text-[#f5ead8]">알림</span>
              {unread > 0 && (
                <span className="bg-red-500 text-white text-[9px] font-bold rounded-full px-1.5 py-0.5 tabular-nums">{unread}</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button
                  onClick={() => markAll.mutate()}
                  className="flex items-center gap-1 text-[10px] text-[#7a6040] hover:text-[#d4a853] px-2 py-1 rounded-lg hover:bg-[#1a1410] transition-colors"
                  title="모두 읽음"
                >
                  <CheckCheck size={12} /> 모두 읽음
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-[#5a4830] hover:text-[#9e8a6a] p-1 rounded-lg hover:bg-[#1a1410] transition-colors">
                <X size={14} />
              </button>
            </div>
          </div>

          {/* 목록 */}
          <div className="max-h-[420px] overflow-y-auto divide-y divide-[#1e1610]">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex gap-3 px-4 py-3 animate-pulse">
                  <div className="w-8 h-8 bg-[#2a1c0c] rounded-full shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 bg-[#2a1c0c] rounded w-3/4" />
                    <div className="h-2.5 bg-[#2a1c0c] rounded w-1/2" />
                  </div>
                </div>
              ))
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-[#4a3820]">
                <Bell size={28} className="mb-2 opacity-40" />
                <p className="text-xs">알림이 없습니다</p>
              </div>
            ) : (
              notifications.map(notif => (
                <div
                  key={notif.id}
                  className={`group flex gap-3 px-4 py-3 transition-colors ${
                    notif.isRead ? 'bg-transparent hover:bg-[#1a1410]/60' : 'bg-[#d4a853]/5 hover:bg-[#d4a853]/10'
                  }`}
                >
                  {/* 아이콘 */}
                  <div className="w-8 h-8 flex items-center justify-center bg-[#1a1410] rounded-full shrink-0 text-base">
                    {TYPE_ICON[notif.type]}
                  </div>

                  {/* 내용 */}
                  <div className="flex-1 min-w-0">
                    {notif.link ? (
                      <Link href={notif.link} onClick={() => handleItemClick(notif)} className="block group/link">
                        <p className={`text-xs font-medium leading-tight group-hover/link:text-[#d4a853] transition-colors ${notif.isRead ? 'text-[#9e8a6a]' : 'text-[#f5ead8]'}`}>
                          {notif.title}
                        </p>
                        {notif.body && (
                          <p className="text-[11px] text-[#5a4830] mt-0.5 leading-relaxed line-clamp-2">{notif.body}</p>
                        )}
                      </Link>
                    ) : (
                      <div>
                        <p className={`text-xs font-medium leading-tight ${notif.isRead ? 'text-[#9e8a6a]' : 'text-[#f5ead8]'}`}>{notif.title}</p>
                        {notif.body && (
                          <p className="text-[11px] text-[#5a4830] mt-0.5 leading-relaxed line-clamp-2">{notif.body}</p>
                        )}
                      </div>
                    )}
                    <p className="text-[10px] text-[#3a2810] mt-1">
                      {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true, locale: ko })}
                    </p>
                  </div>

                  {/* 액션 */}
                  <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    {!notif.isRead && (
                      <button
                        onClick={() => markRead.mutate(notif.id)}
                        className="p-1 text-[#5a4830] hover:text-[#d4a853] hover:bg-[#2a1c0c] rounded-lg transition-colors"
                        title="읽음"
                      >
                        <Check size={11} />
                      </button>
                    )}
                    <button
                      onClick={() => del.mutate(notif.id)}
                      className="p-1 text-[#5a4830] hover:text-red-400 hover:bg-[#2a1c0c] rounded-lg transition-colors"
                      title="삭제"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>

                  {/* 미읽음 점 */}
                  {!notif.isRead && (
                    <div className="w-1.5 h-1.5 rounded-full bg-[#d4a853] shrink-0 mt-1.5 self-start" />
                  )}
                </div>
              ))
            )}
          </div>

          {/* 푸터 */}
          {notifications.length > 0 && (
            <div className="border-t border-[#2e2318] px-4 py-2.5 text-center">
              <Link href="/notifications" onClick={() => setOpen(false)}
                className="text-xs text-[#7a6040] hover:text-[#d4a853] transition-colors">
                전체 알림 보기
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

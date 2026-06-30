'use client'

'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import Image from 'next/image'
import { UserPlus, UserCheck, UserMinus, MessageCircle, Clock, Check, X, Users, Send, Search } from 'lucide-react'
import Link from 'next/link'

interface FriendUser { id: string; nickname: string; avatarUrl: string | null }
interface SearchUser extends FriendUser {
  friendStatus: 'ACCEPTED' | 'PENDING_SENT' | 'PENDING_RECEIVED' | null
  requestId: string | null
}
interface FriendRequest {
  id: string
  senderId: string
  receiverId: string
  status: string
  createdAt: string
  sender?: FriendUser
  receiver?: FriendUser
}

function Avatar({ user, size = 9 }: { user: FriendUser; size?: number }) {
  const cls = `w-${size} h-${size} rounded-full bg-[#1a1208] border border-[#2e2318] flex items-center justify-center text-sm font-semibold overflow-hidden shrink-0 text-[#8a7055]`
  return (
    <div className={cls}>
      {user.avatarUrl
        ? <Image src={user.avatarUrl} alt={user.nickname} width={36} height={36} className="object-cover w-full h-full" />
        : <span>{user.nickname[0]?.toUpperCase()}</span>}
    </div>
  )
}

const TABS = [
  { id: 'friends',  label: '친구 목록',  icon: <Users size={14} /> },
  { id: 'received', label: '받은 요청',  icon: <UserPlus size={14} /> },
  { id: 'sent',     label: '보낸 요청',  icon: <Send size={14} /> },
] as const
type TabId = typeof TABS[number]['id']

export default function FriendsPage() {
  const { user } = useAuthStore()
  const router = useRouter()
  const qc = useQueryClient()
  const [tab, setTab] = useState<TabId>('friends')
  const [searchInput, setSearchInput] = useState('')
  const [searchQ, setSearchQ] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setSearchQ(searchInput.trim()), 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [searchInput])

  const friendsQ   = useQuery({ queryKey: ['friends'],          queryFn: () => api.get<FriendUser[]>('/friends').then(r => r.data),               enabled: !!user })
  const receivedQ  = useQuery({ queryKey: ['friend-requests'],  queryFn: () => api.get<FriendRequest[]>('/friends/requests').then(r => r.data),    enabled: !!user })
  const sentQ      = useQuery({ queryKey: ['friend-sent'],      queryFn: () => api.get<FriendRequest[]>('/friends/requests/sent').then(r => r.data), enabled: !!user })

  const searchQ_result = useQuery({
    queryKey: ['users-search', searchQ],
    queryFn: () => api.get<SearchUser[]>('/users/search', { params: { q: searchQ } }).then(r => r.data),
    enabled: !!user && searchQ.length >= 1,
    staleTime: 10_000,
  })

  const respondMut = useMutation({
    mutationFn: ({ requestId, action }: { requestId: string; action: 'accept' | 'reject' }) =>
      api.patch(`/friends/requests/${requestId}`, { action }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['friends'] })
      qc.invalidateQueries({ queryKey: ['friend-requests'] })
      qc.invalidateQueries({ queryKey: ['users-search'] })
    },
  })

  const sendRequestMut = useMutation({
    mutationFn: (userId: string) => api.post(`/friends/requests/${userId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users-search'] }),
  })

  const removeMut = useMutation({
    mutationFn: (userId: string) => api.delete(`/friends/${userId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['friends'] }),
  })

  const dmMut = useMutation({
    mutationFn: (userId: string) => api.get<{ id: string }>(`/dm/with/${userId}`).then(r => r.data),
    onSuccess: (room) => router.push(`/dm/${room.id}`),
  })

  if (!user) return null

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <h1 className="text-xl font-bold text-[#f5ead8] mb-6">친구</h1>

      {/* 유저 검색 */}
      <div className="mb-6">
        <div className="relative">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#5a4830] pointer-events-none" />
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="닉네임으로 친구 검색..."
            className="w-full pl-10 pr-4 py-2.5 bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] focus:border-[#d4a853]/40 rounded-xl text-sm text-[#f5ead8] placeholder:text-[#5a4830] focus:outline-none transition-colors"
          />
          {searchInput && (
            <button onClick={() => setSearchInput('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5a4830] hover:text-[#9e8a6a]">
              <X size={14} />
            </button>
          )}
        </div>

        {/* 검색 결과 */}
        {searchQ.length >= 1 && (
          <div className="mt-2 bg-[#150f0c] border border-[#2e2318] rounded-xl overflow-hidden">
            {searchQ_result.isLoading && (
              <p className="text-center text-[#5a4830] py-6 text-sm">검색 중...</p>
            )}
            {!searchQ_result.isLoading && searchQ_result.data?.length === 0 && (
              <p className="text-center text-[#5a4830] py-6 text-sm">"{searchQ}"에 해당하는 유저가 없습니다.</p>
            )}
            {searchQ_result.data?.map(u => (
              <div key={u.id} className="flex items-center gap-3 px-4 py-3 border-b border-[#2e2318] last:border-b-0 hover:bg-[#1a1410] transition-colors">
                <Avatar user={u} size={8} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#f5ead8] truncate">{u.nickname}</p>
                </div>
                <div className="shrink-0">
                  {u.friendStatus === 'ACCEPTED' ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-emerald-400 bg-emerald-900/20 border border-emerald-700/30 rounded-lg">
                      <UserCheck size={12} /> 친구
                    </span>
                  ) : u.friendStatus === 'PENDING_SENT' ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#7a6040] bg-[#2e2318] border border-[#4a3520] rounded-lg">
                      <Clock size={12} /> 요청됨
                    </span>
                  ) : u.friendStatus === 'PENDING_RECEIVED' ? (
                    <button
                      onClick={() => u.requestId && respondMut.mutate({ requestId: u.requestId, action: 'accept' })}
                      disabled={respondMut.isPending}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-emerald-400 bg-emerald-900/20 border border-emerald-700/30 rounded-lg hover:bg-emerald-900/40 transition-colors disabled:opacity-50"
                    >
                      <Check size={12} /> 수락하기
                    </button>
                  ) : (
                    <button
                      onClick={() => sendRequestMut.mutate(u.id)}
                      disabled={sendRequestMut.isPending}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#d4a853] bg-[#d4a853]/10 border border-[#d4a853]/30 rounded-lg hover:bg-[#d4a853]/20 transition-colors disabled:opacity-50"
                    >
                      <UserPlus size={12} /> 친구 신청
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 탭 */}
      <div className="flex gap-1 mb-6 bg-[#150f0c] border border-[#2e2318] rounded-xl p-1">
        {TABS.map(t => {
          const count = t.id === 'received' ? (receivedQ.data?.length ?? 0) : t.id === 'sent' ? (sentQ.data?.length ?? 0) : (friendsQ.data?.length ?? 0)
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? 'bg-[#2a1c0c] text-white' : 'text-[#8a7055] hover:text-[#e8d5b0]'}`}>
              {t.icon}{t.label}
              {count > 0 && <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${tab === t.id ? 'bg-[#d4a853]/20 text-[#d4a853]' : 'bg-[#2e2318] text-[#7a6040]'}`}>{count}</span>}
            </button>
          )
        })}
      </div>

      {/* 친구 목록 */}
      {tab === 'friends' && (
        <div className="space-y-2">
          {friendsQ.isLoading && <p className="text-center text-[#5a4830] py-12 text-sm">로딩 중...</p>}
          {!friendsQ.isLoading && !friendsQ.data?.length && (
            <div className="text-center py-16">
              <Users size={36} className="mx-auto mb-3 text-[#4a3520]" />
              <p className="text-sm text-[#8a7055]">아직 친구가 없습니다.</p>
              <p className="text-xs text-[#5a4830] mt-1">커뮤니티에서 게시글 작성자에게 친구 신청을 해보세요.</p>
            </div>
          )}
          {friendsQ.data?.map(friend => (
            <div key={friend.id} className="flex items-center gap-3 bg-[#150f0c] border border-[#2e2318] rounded-xl px-4 py-3 hover:border-[#4a3520] transition-colors">
              <Avatar user={friend} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#f5ead8]">{friend.nickname}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => dmMut.mutate(friend.id)} disabled={dmMut.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#d4a853]/10 hover:bg-[#d4a853]/20 border border-[#d4a853]/30 text-[#d4a853] rounded-lg text-xs font-medium transition-colors disabled:opacity-50">
                  <MessageCircle size={12} /> DM
                </button>
                <button onClick={() => removeMut.mutate(friend.id)} disabled={removeMut.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-950/20 hover:bg-red-950/40 border border-red-800/30 text-red-400 rounded-lg text-xs font-medium transition-colors disabled:opacity-50">
                  <UserMinus size={12} /> 삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 받은 요청 */}
      {tab === 'received' && (
        <div className="space-y-2">
          {receivedQ.isLoading && <p className="text-center text-[#5a4830] py-12 text-sm">로딩 중...</p>}
          {!receivedQ.isLoading && !receivedQ.data?.length && (
            <div className="text-center py-16">
              <UserPlus size={36} className="mx-auto mb-3 text-[#4a3520]" />
              <p className="text-sm text-[#8a7055]">받은 친구 요청이 없습니다.</p>
            </div>
          )}
          {receivedQ.data?.map(req => (
            <div key={req.id} className="flex items-center gap-3 bg-[#150f0c] border border-[#2e2318] rounded-xl px-4 py-3">
              {req.sender && <Avatar user={req.sender} />}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#f5ead8]">{req.sender?.nickname}</p>
                <p className="text-xs text-[#5a4830] flex items-center gap-1 mt-0.5">
                  <Clock size={10} />{new Date(req.createdAt).toLocaleDateString('ko-KR')}
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => respondMut.mutate({ requestId: req.id, action: 'accept' })} disabled={respondMut.isPending}
                  className="flex items-center gap-1 px-3 py-1.5 bg-emerald-900/20 hover:bg-emerald-900/40 border border-emerald-700/30 text-emerald-400 rounded-lg text-xs font-medium transition-colors">
                  <Check size={12} /> 수락
                </button>
                <button onClick={() => respondMut.mutate({ requestId: req.id, action: 'reject' })} disabled={respondMut.isPending}
                  className="flex items-center gap-1 px-3 py-1.5 bg-red-950/20 hover:bg-red-950/30 border border-red-800/30 text-red-400 rounded-lg text-xs font-medium transition-colors">
                  <X size={12} /> 거절
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 보낸 요청 */}
      {tab === 'sent' && (
        <div className="space-y-2">
          {sentQ.isLoading && <p className="text-center text-[#5a4830] py-12 text-sm">로딩 중...</p>}
          {!sentQ.isLoading && !sentQ.data?.length && (
            <div className="text-center py-16">
              <Send size={36} className="mx-auto mb-3 text-[#4a3520]" />
              <p className="text-sm text-[#8a7055]">보낸 친구 요청이 없습니다.</p>
            </div>
          )}
          {sentQ.data?.map(req => (
            <div key={req.id} className="flex items-center gap-3 bg-[#150f0c] border border-[#2e2318] rounded-xl px-4 py-3">
              {req.receiver && <Avatar user={req.receiver} />}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#f5ead8]">{req.receiver?.nickname}</p>
                <p className="text-xs text-[#5a4830] flex items-center gap-1 mt-0.5">
                  <Clock size={10} />{new Date(req.createdAt).toLocaleDateString('ko-KR')} 요청
                </p>
              </div>
              <span className="flex items-center gap-1 text-xs text-[#7a6040] bg-[#2e2318] px-2.5 py-1 rounded-full">
                <Clock size={10} /> 대기 중
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

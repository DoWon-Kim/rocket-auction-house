'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Shield, Plus, UserMinus, Search, X, Check } from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'

// 부여 가능한 섹션 정의
const SECTIONS = [
  { key: 'posts',      label: '게시글 관리' },
  { key: 'cards',      label: '카드 관리' },
  { key: 'shop',       label: '샵 관리' },
  { key: 'oripas',     label: '오리파 관리' },
  { key: 'shipping',   label: '배송 관리' },
  { key: 'withdrawal', label: '환전 관리' },
]

interface SubAdmin {
  id: string
  nickname: string
  email: string
  createdAt: string
  adminPermissions: { section: string }[]
}

interface SearchUser {
  id: string
  nickname: string
  email: string
  role: string
}

export default function PermissionsPage() {
  const qc = useQueryClient()
  const [showSearch, setShowSearch] = useState(false)
  const [searchQ, setSearchQ] = useState('')
  const [pendingPerms, setPendingPerms] = useState<Record<string, string[]>>({})

  const { data, isLoading } = useQuery<{ users: SubAdmin[] }>({
    queryKey: ['admin', 'sub-admins'],
    queryFn: () => api.get('/admin/sub-admins').then(r => r.data),
  })

  const { data: searchData, isFetching: searching } = useQuery<{ users: SearchUser[] }>({
    queryKey: ['admin', 'user-search', searchQ],
    queryFn: () => api.get(`/admin/users?q=${encodeURIComponent(searchQ)}&role=USER&limit=10`).then(r => r.data),
    enabled: searchQ.length >= 2,
  })

  const promoteMut = useMutation({
    mutationFn: (userId: string) => api.patch(`/admin/users/${userId}/role`, { role: 'ADMIN' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'sub-admins'] })
      setShowSearch(false)
      setSearchQ('')
    },
  })

  const demoteMut = useMutation({
    mutationFn: (userId: string) => api.patch(`/admin/users/${userId}/role`, { role: 'USER' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'sub-admins'] }),
  })

  const permMut = useMutation({
    mutationFn: ({ userId, sections }: { userId: string; sections: string[] }) =>
      api.put(`/admin/users/${userId}/permissions`, { sections }),
    onSuccess: (_, { userId }) => {
      qc.invalidateQueries({ queryKey: ['admin', 'sub-admins'] })
      setPendingPerms(prev => { const n = { ...prev }; delete n[userId]; return n })
    },
  })

  const getSections = (user: SubAdmin) =>
    pendingPerms[user.id] ?? user.adminPermissions.map(p => p.section)

  const toggleSection = (userId: string, section: string, current: string[]) => {
    const next = current.includes(section)
      ? current.filter(s => s !== section)
      : [...current, section]
    setPendingPerms(prev => ({ ...prev, [userId]: next }))
  }

  const isDirty = (user: SubAdmin) => {
    const orig = new Set(user.adminPermissions.map(p => p.section))
    const curr = getSections(user)
    if (curr.length !== orig.size) return true
    return curr.some(s => !orig.has(s))
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#f5ead8] flex items-center gap-2">
            <Shield size={22} className="text-[#d4a853]" /> 권한 관리
          </h1>
          <p className="text-sm text-[#8a7055] mt-1">중간 관리자를 지정하고 섹션별 접근 권한을 설정합니다.</p>
        </div>
        <button
          onClick={() => setShowSearch(v => !v)}
          className="flex items-center gap-2 px-4 py-2 bg-[#d4a853] hover:bg-[#c49440] text-white rounded-xl font-semibold text-sm transition-colors"
        >
          <Plus size={15} /> 관리자 추가
        </button>
      </div>

      {/* 유저 검색 패널 */}
      {showSearch && (
        <div className="bg-[#1a1410] border border-[#d4a853]/30 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-[#f5ead8]">중간 관리자 지정</h2>
            <button onClick={() => { setShowSearch(false); setSearchQ('') }}
              className="h-7 w-7 flex items-center justify-center text-[#5a4830] hover:text-[#f5ead8] hover:bg-[#2e2318] rounded-lg transition-colors">
              <X size={15} />
            </button>
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a4830]" />
            <input
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              placeholder="닉네임 또는 이메일로 검색..."
              className="w-full bg-[#2a1c0c] border border-[#2e2318] hover:border-[#4a3520] focus:border-[#d4a853]/40 rounded-xl pl-9 pr-4 py-2.5 text-sm text-[#f5ead8] placeholder:text-[#5a4830] focus:outline-none transition-colors"
            />
          </div>
          {searchQ.length >= 2 && (
            <div className="space-y-1">
              {searching ? (
                <p className="text-xs text-[#7a6040] px-2">검색 중...</p>
              ) : (searchData?.users ?? []).length === 0 ? (
                <p className="text-xs text-[#7a6040] px-2">검색 결과가 없습니다.</p>
              ) : (
                (searchData?.users ?? []).map(u => (
                  <div key={u.id} className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-[#2a1c0c] transition-colors">
                    <div>
                      <p className="text-sm font-medium text-[#f5ead8]">{u.nickname}</p>
                      <p className="text-xs text-[#7a6040]">{u.email}</p>
                    </div>
                    <button
                      onClick={() => { if (confirm(`${u.nickname}님을 중간 관리자로 지정할까요?`)) promoteMut.mutate(u.id) }}
                      disabled={promoteMut.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-[#d4a853]/10 hover:bg-[#d4a853]/20 text-[#d4a853] rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                    >
                      <Shield size={12} /> 관리자 지정
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* 중간 관리자 목록 */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map(i => <div key={i} className="h-40 bg-[#1a1410] border border-[#2e2318] rounded-2xl animate-pulse" />)}
        </div>
      ) : (data?.users ?? []).length === 0 ? (
        <div className="bg-[#1a1410] border border-[#2e2318] rounded-2xl p-12 text-center">
          <Shield size={32} className="mx-auto mb-3 text-[#4a3520]" />
          <p className="text-sm text-[#7a6040]">지정된 중간 관리자가 없습니다.</p>
          <p className="text-xs text-[#4a3820] mt-1">위 버튼으로 유저를 중간 관리자로 지정하세요.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {(data?.users ?? []).map(user => {
            const sections = getSections(user)
            const dirty = isDirty(user)
            return (
              <div key={user.id} className="bg-[#1a1410] border border-[#2e2318] rounded-2xl p-5 space-y-4">
                {/* 유저 정보 헤더 */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-[#f5ead8]">{user.nickname}</p>
                    <p className="text-xs text-[#7a6040]">{user.email} · {format(new Date(user.createdAt), 'yy/MM/dd', { locale: ko })} 가입</p>
                  </div>
                  <button
                    onClick={() => { if (confirm(`${user.nickname}님의 관리자 권한을 해제할까요?`)) demoteMut.mutate(user.id) }}
                    disabled={demoteMut.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-400/70 hover:text-red-400 hover:bg-red-950/40 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <UserMinus size={12} /> 권한 해제
                  </button>
                </div>

                {/* 섹션 권한 토글 */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {SECTIONS.map(sec => {
                    const active = sections.includes(sec.key)
                    return (
                      <button
                        key={sec.key}
                        onClick={() => toggleSection(user.id, sec.key, sections)}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                          active
                            ? 'bg-[#d4a853]/10 border-[#d4a853]/40 text-[#e0b878]'
                            : 'bg-transparent border-[#2e2318] text-[#7a6040] hover:border-[#4a3520] hover:text-[#9e8a6a]'
                        }`}
                      >
                        <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                          active ? 'bg-[#d4a853] border-[#d4a853]' : 'border-[#4a3520]'
                        }`}>
                          {active && <Check size={10} className="text-white" />}
                        </span>
                        {sec.label}
                      </button>
                    )
                  })}
                </div>

                {/* 저장 버튼 */}
                {dirty && (
                  <div className="flex justify-end gap-2 pt-1 border-t border-[#2e2318]">
                    <button
                      onClick={() => setPendingPerms(prev => { const n = { ...prev }; delete n[user.id]; return n })}
                      className="px-3 py-1.5 text-xs text-[#8a7055] hover:text-[#e8d5b0] transition-colors"
                    >
                      취소
                    </button>
                    <button
                      onClick={() => permMut.mutate({ userId: user.id, sections })}
                      disabled={permMut.isPending}
                      className="flex items-center gap-1.5 px-4 py-1.5 bg-[#d4a853] hover:bg-[#c49440] disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors"
                    >
                      {permMut.isPending ? '저장 중...' : '권한 저장'}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

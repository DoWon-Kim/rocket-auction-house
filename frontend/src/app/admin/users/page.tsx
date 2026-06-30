'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Search, Plus, X, ShieldCheck, Shield, KeyRound, Copy, Check } from 'lucide-react'
import Badge from '@/components/ui/Badge'

interface User {
  id: string
  email: string
  nickname: string
  balance: number
  role: string
  createdAt: string
  _count: { listings: number; transactions: number }
}

export default function AdminUsersPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [grantTarget, setGrantTarget] = useState<User | null>(null)
  const [grantAmount, setGrantAmount] = useState('')
  const [resetTarget, setResetTarget] = useState<User | null>(null)
  const [tempPassword, setTempPassword] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users', search],
    queryFn: () => api.get('/admin/users', { params: { q: search || undefined } }).then((r) => r.data),
  })

  const grantMut = useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: number }) => api.post(`/admin/users/${id}/grant`, { amount }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
      setGrantTarget(null); setGrantAmount('')
      setMsg({ type: 'ok', text: `${res.data.nickname}에게 포인트를 지급했습니다. (잔액: ${res.data.balance.toLocaleString()}P)` })
    },
    onError: (e: unknown) => { const err = e as { response?: { data?: { message?: string } } }; setMsg({ type: 'err', text: err.response?.data?.message ?? '오류가 발생했습니다.' }) },
  })

  const roleMut = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => api.patch(`/admin/users/${id}/role`, { role }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
      setMsg({ type: 'ok', text: `${res.data.nickname}의 역할이 ${res.data.role}로 변경되었습니다.` })
    },
    onError: (e: unknown) => { const err = e as { response?: { data?: { message?: string } } }; setMsg({ type: 'err', text: err.response?.data?.message ?? '오류가 발생했습니다.' }) },
  })

  const resetMut = useMutation({
    mutationFn: (id: string) => api.post(`/admin/users/${id}/reset-password`),
    onSuccess: (res) => {
      setTempPassword(res.data.tempPassword)
      setCopied(false)
    },
    onError: (e: unknown) => { const err = e as { response?: { data?: { message?: string } } }; setMsg({ type: 'err', text: err.response?.data?.message ?? '오류가 발생했습니다.' }) },
  })

  function copyPassword() {
    if (!tempPassword) return
    navigator.clipboard.writeText(tempPassword)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-[#f5ead8]">유저 관리</h1>

      {msg && (
        <div className={`px-4 py-2 rounded-xl text-sm flex items-center justify-between ${
          msg.type === 'ok'
            ? 'bg-emerald-950/60 border border-emerald-800/40 text-emerald-400'
            : 'bg-red-950/60 border border-red-800/40 text-red-400'
        }`}>
          {msg.text}
          <button onClick={() => setMsg(null)} className="text-[#5a4830] hover:text-[#8a7055] transition-colors"><X size={14} /></button>
        </div>
      )}

      {/* 포인트 지급 패널 */}
      {grantTarget && (
        <div className="bg-[#1a1410] border border-[#f0a832]/30 rounded-2xl p-5 space-y-3">
          <h2 className="font-semibold text-[#f5ead8]">포인트 지급 — {grantTarget.nickname}</h2>
          <p className="text-sm text-[#8a7055]">현재 잔액: <span className="text-[#f0a832] font-bold tabular-nums">{grantTarget.balance.toLocaleString()}P</span></p>
          <div className="flex gap-2">
            <input type="number" value={grantAmount} onChange={(e) => setGrantAmount(e.target.value)}
              placeholder="지급 금액 (P)"
              className="bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] focus:border-[#d4a853]/40 rounded-xl px-4 py-2.5 text-sm text-[#f5ead8] placeholder:text-[#5a4830] focus:outline-none transition-colors w-48" />
            <button onClick={() => grantMut.mutate({ id: grantTarget.id, amount: Number(grantAmount) })}
              disabled={grantMut.isPending || !grantAmount || Number(grantAmount) === 0}
              className="bg-[#f0a832] hover:bg-[#d4941e] disabled:opacity-50 text-[#0f0b08] px-4 py-2 rounded-xl text-sm font-semibold transition-colors flex items-center gap-1">
              {grantMut.isPending
                ? <div className="w-5 h-5 rounded-full border-2 border-[#d4941e] border-t-[#0f0b08] animate-spin" />
                : <Plus size={14} />}
              {grantMut.isPending ? '처리 중...' : '지급'}
            </button>
            <button onClick={() => { setGrantTarget(null); setGrantAmount('') }}
              className="bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] text-[#9e8a6a] hover:text-[#e8d5b0] px-4 py-2 rounded-xl text-sm transition-colors flex items-center gap-1">
              <X size={14} /> 취소
            </button>
          </div>
        </div>
      )}

      {/* 비밀번호 초기화 패널 */}
      {resetTarget && (
        <div className="bg-[#1a1410] border border-red-800/40 rounded-2xl p-5 space-y-3">
          <h2 className="font-semibold flex items-center gap-2 text-[#f5ead8]">
            <KeyRound size={16} className="text-red-400" />
            비밀번호 초기화 — {resetTarget.nickname}
          </h2>

          {tempPassword ? (
            <div className="space-y-3">
              <p className="text-sm text-[#8a7055]">임시 비밀번호가 생성되었습니다. 유저에게 전달 후 변경을 안내해주세요.</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-[#150f0c] border border-[#2e2318] rounded-xl px-4 py-2.5 font-mono text-sm tracking-widest select-all text-[#f5ead8]">
                  {tempPassword}
                </div>
                <button
                  onClick={copyPassword}
                  className="flex items-center gap-1.5 bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] text-[#9e8a6a] hover:text-[#e8d5b0] px-3 py-2.5 rounded-xl text-sm transition-colors"
                >
                  {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  {copied ? '복사됨' : '복사'}
                </button>
              </div>
              <button onClick={() => { setResetTarget(null); setTempPassword(null) }}
                className="bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] text-[#9e8a6a] hover:text-[#e8d5b0] px-4 py-2 rounded-xl text-sm transition-colors flex items-center gap-1">
                <X size={14} /> 닫기
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-amber-400">⚠️ 기존 비밀번호가 즉시 무효화됩니다.</p>
              <div className="flex gap-2">
                <button
                  onClick={() => resetMut.mutate(resetTarget.id)}
                  disabled={resetMut.isPending}
                  className="bg-red-950/60 border border-red-800/40 text-red-400 hover:bg-red-900/60 disabled:opacity-50 px-4 py-2 rounded-xl text-sm font-semibold transition-colors flex items-center gap-1"
                >
                  {resetMut.isPending
                    ? <div className="w-4 h-4 rounded-full border-2 border-red-800 border-t-red-400 animate-spin" />
                    : <KeyRound size={14} />}
                  {resetMut.isPending ? '초기화 중...' : '초기화 실행'}
                </button>
                <button onClick={() => setResetTarget(null)}
                  className="bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] text-[#9e8a6a] hover:text-[#e8d5b0] px-4 py-2 rounded-xl text-sm transition-colors flex items-center gap-1">
                  <X size={14} /> 취소
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 검색 */}
      <div className="relative w-64">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a4830]" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="닉네임 또는 이메일"
          className="w-full bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] focus:border-[#d4a853]/40 rounded-xl pl-9 pr-3 py-2.5 text-sm text-[#f5ead8] placeholder:text-[#5a4830] focus:outline-none transition-colors" />
      </div>

      {/* 테이블 */}
      <div className="bg-[#1a1410] border border-[#2e2318] rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#2e2318]">
              <th className="text-left px-4 py-3 text-xs text-[#5a4830] uppercase tracking-wider font-semibold">닉네임</th>
              <th className="text-left px-4 py-3 text-xs text-[#5a4830] uppercase tracking-wider font-semibold">이메일</th>
              <th className="text-right px-4 py-3 text-xs text-[#5a4830] uppercase tracking-wider font-semibold">잔액</th>
              <th className="text-right px-4 py-3 text-xs text-[#5a4830] uppercase tracking-wider font-semibold">리스팅</th>
              <th className="text-right px-4 py-3 text-xs text-[#5a4830] uppercase tracking-wider font-semibold">거래</th>
              <th className="text-left px-4 py-3 text-xs text-[#5a4830] uppercase tracking-wider font-semibold">역할</th>
              <th className="text-left px-4 py-3 text-xs text-[#5a4830] uppercase tracking-wider font-semibold">가입일</th>
              <th className="text-right px-4 py-3 text-xs text-[#5a4830] uppercase tracking-wider font-semibold">관리</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-[#2e2318]">
                  <td colSpan={8} className="px-4 py-3"><div className="h-4 bg-[#1a1208] rounded animate-pulse" /></td>
                </tr>
              ))
            ) : data?.users?.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-[#5a4830]">유저가 없습니다.</td></tr>
            ) : data?.users?.map((u: User) => (
              <tr key={u.id} className="border-b border-[#2e2318] hover:bg-[#1a1208] transition-colors">
                <td className="px-4 py-3 font-medium text-[#f5ead8]">{u.nickname}</td>
                <td className="px-4 py-3 text-[#8a7055] text-xs">{u.email}</td>
                <td className="px-4 py-3 text-right text-[#f0a832] font-bold tabular-nums">{u.balance.toLocaleString()}P</td>
                <td className="px-4 py-3 text-right text-[#8a7055]">{u._count.listings}</td>
                <td className="px-4 py-3 text-right text-[#8a7055]">{u._count.transactions}</td>
                <td className="px-4 py-3">
                  <Badge variant={u.role === 'ADMIN' ? 'indigo' : 'default'}>{u.role}</Badge>
                </td>
                <td className="px-4 py-3 text-[#5a4830] text-xs">
                  {format(new Date(u.createdAt), 'yy/MM/dd', { locale: ko })}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => { setGrantTarget(u); setGrantAmount(''); setResetTarget(null); setTempPassword(null) }}
                      title="포인트 지급"
                      className="p-1.5 text-[#8a7055] hover:text-[#f0a832] hover:bg-[#f0a832]/10 rounded transition-colors">
                      <Plus size={14} />
                    </button>
                    <button
                      onClick={() => { setResetTarget(u); setTempPassword(null); setGrantTarget(null) }}
                      title="비밀번호 초기화"
                      className="p-1.5 text-[#8a7055] hover:text-red-400 hover:bg-red-400/10 rounded transition-colors">
                      <KeyRound size={14} />
                    </button>
                    <button
                      onClick={() => {
                        const newRole = u.role === 'ADMIN' ? 'USER' : 'ADMIN'
                        if (confirm(`${u.nickname}의 역할을 ${newRole}로 변경할까요?`)) roleMut.mutate({ id: u.id, role: newRole })
                      }}
                      title={u.role === 'ADMIN' ? '일반 유저로 변경' : '관리자로 변경'}
                      className={`p-1.5 rounded transition-colors ${u.role === 'ADMIN' ? 'text-[#d4a853] hover:bg-[#d4a853]/10' : 'text-[#8a7055] hover:text-[#d4a853] hover:bg-[#d4a853]/10'}`}>
                      {u.role === 'ADMIN' ? <ShieldCheck size={14} /> : <Shield size={14} />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data?.total > 0 && (
          <div className="px-4 py-2 border-t border-[#2e2318] text-xs text-[#5a4830]">총 {data.total}명</div>
        )}
      </div>
    </div>
  )
}

'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Users, ShoppingBag, ArrowLeftRight, Package, TrendingUp, AlertTriangle, Truck, Banknote, UserCheck } from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import Link from 'next/link'

interface DayStat { date: string; count: number; revenue: number }
interface Stats {
  users: number; activeListings: number; transactions: number; activeOripas: number
  newUsersToday: number; newUsersWeek: number
  txToday: number; txWeek: number; txMonth: number
  pendingReports: number; pendingWithdrawals: number; pendingShipments: number
  dailyStats: DayStat[]
  recentTransactions: Array<{
    id: string; finalPrice: number; completedAt: string
    buyer: { nickname: string }; seller: { nickname: string }
    listing: { card: { name: string; nameKo: string | null } }
  }>
}

function MiniBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-end gap-0.5 h-8">
      <div className="relative w-full bg-[#2e2318] rounded-sm overflow-hidden h-full">
        <div
          className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[#d4a853] to-[#f0a832] rounded-sm transition-all"
          style={{ height: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export default function AdminDashboard() {
  const { data: stats, isLoading } = useQuery<Stats>({
    queryKey: ['admin', 'stats'],
    queryFn: () => api.get('/admin/stats').then((r) => r.data),
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold text-[#f5ead8]">대시보드</h1>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-[#1a1410] border border-[#2e2318] rounded-2xl h-24 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (!stats) return null

  const maxRevenue = Math.max(...(stats.dailyStats?.map(d => d.revenue) ?? [1]), 1)

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-[#f5ead8]">대시보드</h1>

      {/* 핵심 지표 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: '전체 유저',   value: stats.users.toLocaleString(),            sub: `+${stats.newUsersToday} 오늘`,      icon: <Users size={18} />,            iconCls: 'text-[#d4a853] bg-[#d4a853]/10' },
          { label: '활성 리스팅', value: stats.activeListings.toLocaleString(),   sub: '현재 거래 중',                       icon: <ShoppingBag size={18} />,       iconCls: 'text-[#f0a832] bg-[#f0a832]/10' },
          { label: '총 거래',     value: stats.transactions.toLocaleString(),      sub: `이번 달 ${stats.txMonth}건`,         icon: <ArrowLeftRight size={18} />,    iconCls: 'text-emerald-400 bg-emerald-400/10' },
          { label: '활성 오리파', value: stats.activeOripas.toLocaleString(),      sub: '현재 운영 중',                       icon: <Package size={18} />,           iconCls: 'text-pink-400 bg-pink-400/10' },
        ].map(card => (
          <div key={card.label} className="bg-[#1a1410] border border-[#2e2318] rounded-2xl p-4 flex items-center gap-3">
            <div className={`p-2.5 rounded-xl shrink-0 ${card.iconCls}`}>{card.icon}</div>
            <div className="min-w-0">
              <p className="text-xs text-[#5a4830]">{card.label}</p>
              <p className="text-xl font-bold text-[#f5ead8] tabular-nums leading-tight">{card.value}</p>
              <p className="text-[10px] text-[#4a3820] mt-0.5">{card.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 처리 대기 알람 */}
      {(stats.pendingReports > 0 || stats.pendingWithdrawals > 0 || stats.pendingShipments > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {stats.pendingReports > 0 && (
            <Link href="/admin/reports" className="flex items-center gap-3 bg-red-950/30 border border-red-800/30 hover:border-red-600/50 rounded-2xl px-4 py-3 transition-colors">
              <AlertTriangle size={16} className="text-red-400 shrink-0" />
              <div>
                <p className="text-xs text-red-300 font-semibold">미처리 신고</p>
                <p className="text-sm text-red-200 font-bold">{stats.pendingReports}건 대기 중</p>
              </div>
            </Link>
          )}
          {stats.pendingWithdrawals > 0 && (
            <Link href="/admin/withdrawal" className="flex items-center gap-3 bg-yellow-950/30 border border-yellow-800/30 hover:border-yellow-600/50 rounded-2xl px-4 py-3 transition-colors">
              <Banknote size={16} className="text-yellow-400 shrink-0" />
              <div>
                <p className="text-xs text-yellow-300 font-semibold">환전 신청 대기</p>
                <p className="text-sm text-yellow-200 font-bold">{stats.pendingWithdrawals}건 대기 중</p>
              </div>
            </Link>
          )}
          {stats.pendingShipments > 0 && (
            <Link href="/admin/shipping" className="flex items-center gap-3 bg-blue-950/30 border border-blue-800/30 hover:border-blue-600/50 rounded-2xl px-4 py-3 transition-colors">
              <Truck size={16} className="text-blue-400 shrink-0" />
              <div>
                <p className="text-xs text-blue-300 font-semibold">발송 대기</p>
                <p className="text-sm text-blue-200 font-bold">{stats.pendingShipments}건 대기 중</p>
              </div>
            </Link>
          )}
        </div>
      )}

      {/* 2열 그리드: 7일 거래 추이 + 신규 유저 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 7일 거래 차트 */}
        <div className="lg:col-span-2 bg-[#1a1410] border border-[#2e2318] rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={15} className="text-[#d4a853]" />
            <p className="text-sm font-semibold text-[#f5ead8]">최근 7일 거래 추이</p>
          </div>
          {stats.dailyStats && stats.dailyStats.length > 0 ? (
            <div className="flex items-end gap-1.5 h-28">
              {stats.dailyStats.map(d => (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full relative" style={{ height: '80px' }}>
                    <div
                      className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[#d4a853]/80 to-[#f0a832]/60 rounded-t-sm"
                      style={{ height: `${Math.max(4, Math.round((d.revenue / maxRevenue) * 80))}px` }}
                    />
                  </div>
                  <p className="text-[9px] text-[#4a3820]">{d.date.slice(5)}</p>
                  <p className="text-[9px] text-[#6a5030] font-medium tabular-nums">{d.count}건</p>
                </div>
              ))}
              {stats.dailyStats.length === 0 && (
                <p className="text-sm text-[#5a4830] text-center w-full">데이터 없음</p>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-28 text-[#4a3820] text-sm">거래 데이터가 없습니다.</div>
          )}
        </div>

        {/* 이번 주 요약 */}
        <div className="bg-[#1a1410] border border-[#2e2318] rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <UserCheck size={15} className="text-[#d4a853]" />
            <p className="text-sm font-semibold text-[#f5ead8]">이번 주 요약</p>
          </div>
          {[
            { label: '신규 가입', value: `+${stats.newUsersWeek}명`, sub: `오늘 +${stats.newUsersToday}명` },
            { label: '완료 거래', value: `${stats.txWeek}건`,        sub: `오늘 ${stats.txToday}건` },
            { label: '이번 달', value: `${stats.txMonth}건`,          sub: '월간 완료 거래' },
          ].map(row => (
            <div key={row.label} className="flex items-center justify-between">
              <div>
                <p className="text-xs text-[#5a4830]">{row.label}</p>
                <p className="text-[10px] text-[#3a2810]">{row.sub}</p>
              </div>
              <p className="text-base font-bold text-[#f0a832] tabular-nums">{row.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 최근 거래 */}
      <div className="bg-[#1a1410] border border-[#2e2318] rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#2e2318] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#f5ead8]">최근 완료 거래</h2>
          <span className="text-[10px] text-[#5a4830]">최근 10건</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#2e2318]">
                <th className="text-left px-5 py-3 text-xs text-[#5a4830] font-semibold">카드</th>
                <th className="text-left px-5 py-3 text-xs text-[#5a4830] font-semibold">구매자</th>
                <th className="text-left px-5 py-3 text-xs text-[#5a4830] font-semibold">판매자</th>
                <th className="text-right px-5 py-3 text-xs text-[#5a4830] font-semibold">금액</th>
                <th className="text-right px-5 py-3 text-xs text-[#5a4830] font-semibold">일시</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentTransactions.map((tx) => (
                <tr key={tx.id} className="border-b border-[#1e1810] hover:bg-[#1a1208] transition-colors">
                  <td className="px-5 py-3 font-medium text-[#e8d5b0] max-w-[180px] truncate">
                    {tx.listing.card.nameKo ?? tx.listing.card.name}
                  </td>
                  <td className="px-5 py-3 text-[#8a7055]">{tx.buyer.nickname}</td>
                  <td className="px-5 py-3 text-[#8a7055]">{tx.seller.nickname}</td>
                  <td className="px-5 py-3 text-right text-[#f0a832] font-bold tabular-nums">{tx.finalPrice.toLocaleString()}P</td>
                  <td className="px-5 py-3 text-right text-[#5a4830] text-xs whitespace-nowrap">
                    {format(new Date(tx.completedAt), 'MM/dd HH:mm', { locale: ko })}
                  </td>
                </tr>
              ))}
              {stats.recentTransactions.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-[#5a4830]">거래 내역이 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

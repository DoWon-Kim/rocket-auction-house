'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Users, ShoppingBag, ArrowLeftRight, Package } from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'

interface Stats {
  users: number
  activeListings: number
  transactions: number
  activeOripas: number
  recentTransactions: Array<{
    id: string
    finalPrice: number
    completedAt: string
    buyer: { nickname: string }
    seller: { nickname: string }
    listing: { card: { name: string } }
  }>
}

const statCards = (s: Stats) => [
  { label: '전체 유저', value: s.users.toLocaleString(), icon: <Users size={20} className="text-[#d4a853]" />, bg: 'bg-[#d4a853]/10' },
  { label: '활성 리스팅', value: s.activeListings.toLocaleString(), icon: <ShoppingBag size={20} className="text-[#f0a832]" />, bg: 'bg-[#f0a832]/10' },
  { label: '총 거래 수', value: s.transactions.toLocaleString(), icon: <ArrowLeftRight size={20} className="text-emerald-400" />, bg: 'bg-emerald-400/10' },
  { label: '활성 오리파', value: s.activeOripas.toLocaleString(), icon: <Package size={20} className="text-pink-400" />, bg: 'bg-pink-400/10' },
]

export default function AdminDashboard() {
  const { data: stats, isLoading } = useQuery<Stats>({
    queryKey: ['admin', 'stats'],
    queryFn: () => api.get('/admin/stats').then((r) => r.data),
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-[#f5ead8]">대시보드</h1>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-[#1a1410] border border-[#2e2318] rounded-2xl h-24 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (!stats) return null

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[#f5ead8]">대시보드</h1>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards(stats).map((card) => (
          <div key={card.label} className="bg-[#1a1410] border border-[#2e2318] rounded-2xl p-5 flex items-center gap-4">
            <div className={`p-2.5 rounded-lg ${card.bg}`}>{card.icon}</div>
            <div>
              <p className="text-xs text-[#8a7055]">{card.label}</p>
              <p className="text-2xl font-bold text-[#f5ead8]">{card.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 최근 거래 */}
      <div className="bg-[#1a1410] border border-[#2e2318] rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#2e2318]">
          <h2 className="font-semibold text-[#f5ead8]">최근 거래</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#2e2318]">
              <th className="text-left px-5 py-3 text-xs text-[#5a4830] uppercase tracking-wider font-semibold">카드</th>
              <th className="text-left px-5 py-3 text-xs text-[#5a4830] uppercase tracking-wider font-semibold">구매자</th>
              <th className="text-left px-5 py-3 text-xs text-[#5a4830] uppercase tracking-wider font-semibold">판매자</th>
              <th className="text-right px-5 py-3 text-xs text-[#5a4830] uppercase tracking-wider font-semibold">금액</th>
              <th className="text-right px-5 py-3 text-xs text-[#5a4830] uppercase tracking-wider font-semibold">일시</th>
            </tr>
          </thead>
          <tbody>
            {stats.recentTransactions.map((tx) => (
              <tr key={tx.id} className="border-b border-[#2e2318] hover:bg-[#1a1208] transition-colors">
                <td className="px-5 py-3 font-medium text-[#f5ead8]">{tx.listing.card.name}</td>
                <td className="px-5 py-3 text-[#8a7055]">{tx.buyer.nickname}</td>
                <td className="px-5 py-3 text-[#8a7055]">{tx.seller.nickname}</td>
                <td className="px-5 py-3 text-right text-[#f0a832] font-bold tabular-nums">{tx.finalPrice.toLocaleString()}P</td>
                <td className="px-5 py-3 text-right text-[#5a4830]">
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
  )
}

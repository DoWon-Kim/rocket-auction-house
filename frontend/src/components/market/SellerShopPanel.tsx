'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Star, Store, ChevronRight, UserPlus, UserCheck } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { type MarketListing, listingTitle, listingThumb, listingPrice } from '@/lib/market'

export interface ShopSeller {
  id: string
  nickname: string
  avatarUrl?: string | null
  avgRating?: number | null
  reviewCount?: number
  shopIntro?: string | null
  _count?: { followers?: number; listings?: number }
}

export function ShopAvatar({ user, size = 48 }: { user: { nickname: string; avatarUrl?: string | null }; size?: number }) {
  return (
    <span className="relative shrink-0 rounded-full overflow-hidden bg-accent-tint border border-accent-line flex items-center justify-center font-bold text-accent-soft" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {user.avatarUrl ? <Image src={user.avatarUrl} alt="" fill sizes={`${size}px`} className="object-cover" /> : user.nickname[0]?.toUpperCase()}
    </span>
  )
}

export function FollowButton({ shopId, initial, onChange, className }: { shopId: string; initial: boolean; onChange?: (followers: number) => void; className?: string }) {
  const user = useAuthStore(s => s.user)
  const router = useRouter()
  const [following, setFollowing] = useState(initial)
  const [busy, setBusy] = useState(false)
  if (user?.id === shopId) return null
  return (
    <button type="button" disabled={busy}
      onClick={async () => {
        if (!user) { router.push('/login'); return }
        setBusy(true)
        try {
          const r = await api.post<{ isFollowing: boolean; followers: number }>(`/users/${shopId}/follow`)
          setFollowing(r.data.isFollowing); onChange?.(r.data.followers)
        } finally { setBusy(false) }
      }}
      className={className ?? `h-9 px-3.5 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 border transition-colors disabled:opacity-50 ${following ? 'border-line bg-surface text-muted' : 'border-accent-line bg-accent-tint text-accent-soft hover:bg-accent/20'}`}>
      {following ? <><UserCheck size={13} />팔로잉</> : <><UserPlus size={13} />팔로우</>}
    </button>
  )
}

// 상품 상세 하단: 판매자 상점 요약 + 이 상점의 다른 상품
export function SellerShopPanel({ seller, currentListingId, stats }: {
  seller: ShopSeller; currentListingId: string
  stats?: { totalSales: number; completedSales: number; completionRate: number | null }
}) {
  const [followers, setFollowers] = useState(seller._count?.followers ?? 0)
  const { data: shop } = useQuery<{ isFollowing: boolean }>({
    queryKey: ['shop', seller.id], queryFn: () => api.get(`/users/${seller.id}/shop`).then(r => r.data),
  })
  const { data: others } = useQuery<{ listings: MarketListing[]; total: number }>({
    queryKey: ['shop-listings', seller.id, 'preview'],
    queryFn: () => api.get('/listings', { params: { sellerId: seller.id, limit: 7 } }).then(r => r.data),
  })
  const items = (others?.listings ?? []).filter(l => l.id !== currentListingId).slice(0, 6)

  return (
    <section className="rounded-3xl border border-line bg-surface/70 p-5 space-y-4">
      <div className="flex items-center gap-3">
        <Link href={`/users/${seller.id}`}><ShopAvatar user={seller} /></Link>
        <div className="flex-1 min-w-0">
          <Link href={`/users/${seller.id}`} className="font-semibold text-fg hover:text-accent-fg truncate block">{seller.nickname}</Link>
          <p className="text-xs text-muted flex items-center gap-2 mt-0.5">
            <span className="flex items-center gap-0.5"><Star size={11} className="fill-amber-400 text-amber-400" />{seller.avgRating ? seller.avgRating.toFixed(1) : '-'} ({seller.reviewCount ?? 0})</span>
            <span>상품 {seller._count?.listings ?? 0}</span>
            <span>팔로워 {followers}</span>
          </p>
        </div>
        {shop && <FollowButton shopId={seller.id} initial={shop.isFollowing} onChange={setFollowers} />}
      </div>

      {seller.shopIntro && <p className="text-sm text-fg-3 whitespace-pre-wrap line-clamp-3">{seller.shopIntro}</p>}

      {stats && (
        <div className="grid grid-cols-3 gap-2 text-center rounded-2xl bg-sunken py-3">
          <div><p className="text-lg font-bold text-fg tabular-nums">{stats.totalSales}</p><p className="text-[10px] text-subtle">판매</p></div>
          <div><p className="text-lg font-bold text-emerald-400 tabular-nums">{stats.completedSales}</p><p className="text-[10px] text-subtle">거래 완료</p></div>
          <div><p className="text-lg font-bold text-fg tabular-nums">{stats.completionRate == null ? '—' : `${stats.completionRate}%`}</p><p className="text-[10px] text-subtle">완료율</p></div>
        </div>
      )}

      {items.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted flex items-center gap-1"><Store size={12} />이 상점의 다른 상품</p>
            <Link href={`/users/${seller.id}`} className="text-xs text-muted hover:text-fg flex items-center">더보기<ChevronRight size={13} /></Link>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {items.map(l => {
              const t = listingThumb(l); const p = listingPrice(l)
              return (
                <Link key={l.id} href={`/listings/${l.id}`} className="group min-w-0">
                  <span className="relative block aspect-square rounded-xl overflow-hidden bg-sunken border border-line">
                    {t && <Image src={t} alt="" fill sizes="120px" className="object-cover group-hover:scale-105 transition-transform" />}
                    {l.status === 'RESERVED' && <span className="absolute inset-0 bg-black/55 flex items-center justify-center text-[11px] font-bold text-emerald-300">예약중</span>}
                  </span>
                  <span className="block text-[11px] text-fg-3 truncate mt-1">{listingTitle(l)}</span>
                  {p != null && <span className="block text-xs font-semibold text-fg tabular-nums">{p.toLocaleString()}P</span>}
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}

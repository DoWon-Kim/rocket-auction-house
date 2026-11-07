'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import Link from 'next/link'
import { ChevronLeft, Star, MessageCircle, UserPlus, UserCheck, Reply, Pencil, Store, ShieldCheck, CalendarDays } from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { MarketItemCard } from '@/components/market/MarketItemCard'
import { ShopAvatar, FollowButton } from '@/components/market/SellerShopPanel'
import { type MarketListing, daysSince } from '@/lib/market'

interface Shop {
  id: string
  nickname: string
  avatarUrl: string | null
  shopIntro: string | null
  avgRating: number | null
  reviewCount: number
  createdAt: string
  isFollowing: boolean
  stats: { selling: number; reserved: number; sold: number; completed: number; followers: number; following: number }
}

interface Review {
  id: string
  rating: number
  comment?: string | null
  sellerReply?: string | null
  createdAt: string
  reviewer: { id: string; nickname: string; avatarUrl?: string | null }
  transaction?: { listing?: { card?: { name: string; nameKo?: string | null } } | null } | null
}

interface ShopUser { id: string; nickname: string; avatarUrl: string | null; avgRating: number | null; reviewCount: number; _count: { listings: number; followers: number } }

type Tab = 'items' | 'reviews' | 'followers' | 'following'
type ItemStatus = 'active' | 'reserved' | 'sold'

export default function ShopPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user: me } = useAuthStore()
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('items')
  const [itemStatus, setItemStatus] = useState<ItemStatus>('active')
  const [reviewPage, setReviewPage] = useState(1)
  const [editingIntro, setEditingIntro] = useState(false)
  const [intro, setIntro] = useState('')
  const [followers, setFollowers] = useState<number | null>(null)

  const { data: shop, isLoading } = useQuery<Shop>({ queryKey: ['shop', id], queryFn: () => api.get(`/users/${id}/shop`).then(r => r.data), enabled: !!id })
  const { data: items } = useQuery<{ listings: MarketListing[]; total: number; likedIds: string[] }>({
    queryKey: ['shop-listings', id, itemStatus],
    queryFn: () => api.get('/listings', { params: { sellerId: id, status: itemStatus, limit: 60 } }).then(r => r.data),
    enabled: !!id && tab === 'items',
  })
  const { data: reviewData } = useQuery<{ reviews: Review[]; total: number; totalPages: number }>({
    queryKey: ['user-reviews', id, reviewPage],
    queryFn: () => api.get(`/users/${id}/reviews`, { params: { page: reviewPage } }).then(r => r.data),
    enabled: !!id && tab === 'reviews',
  })
  const { data: people } = useQuery<ShopUser[]>({
    queryKey: ['shop-follows', id, tab],
    queryFn: () => api.get(`/users/${id}/${tab}`).then(r => r.data),
    enabled: !!id && (tab === 'followers' || tab === 'following'),
  })
  const { data: friendStatus } = useQuery<{ status: string }>({
    queryKey: ['friend-status', id], queryFn: () => api.get(`/friends/status/${id}`).then(r => r.data), enabled: !!id && !!me && me.id !== id,
  })
  const friendMut = useMutation({ mutationFn: () => api.post(`/friends/requests/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['friend-status', id] }) })
  const introMut = useMutation({
    mutationFn: () => api.patch('/my/shop', { shopIntro: intro }),
    onSuccess: () => { setEditingIntro(false); qc.invalidateQueries({ queryKey: ['shop', id] }) },
  })

  if (isLoading) return <div className="max-w-5xl mx-auto space-y-4"><div className="h-44 bg-surface border border-line rounded-3xl animate-pulse" /><div className="h-64 bg-surface border border-line rounded-3xl animate-pulse" /></div>
  if (!shop) return <div className="text-center py-24 text-subtle">상점을 찾을 수 없습니다.</div>

  const isSelf = me?.id === id
  const isFriend = friendStatus?.status === 'FRIEND'
  const friendPending = friendStatus?.status === 'PENDING_SENT'
  const s = shop.stats
  const followerCount = followers ?? s.followers
  const days = daysSince(shop.createdAt)

  const tabs: Array<[Tab, string, number]> = [
    ['items', '상품', s.selling + s.reserved + s.sold],
    ['reviews', '후기', shop.reviewCount],
    ['followers', '팔로워', followerCount],
    ['following', '팔로잉', s.following],
  ]

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <button onClick={() => router.back()} className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ChevronLeft size={16} />뒤로</button>

      {/* 상점 헤더 */}
      <section className="rounded-3xl border border-line bg-surface overflow-hidden grid md:grid-cols-[280px_1fr]">
        <div className="relative flex flex-col items-center justify-center gap-3 p-6 bg-gradient-to-br from-accent/25 via-accent/10 to-transparent">
          <ShopAvatar user={shop} size={84} />
          <div className="text-center">
            <h1 className="text-lg font-bold text-fg">{shop.nickname}</h1>
            <p className="text-sm text-amber-300 flex items-center justify-center gap-1 mt-0.5">
              {[1, 2, 3, 4, 5].map(n => <Star key={n} size={13} className={n <= Math.round(shop.avgRating ?? 0) ? 'fill-amber-400 text-amber-400' : 'text-line-strong'} />)}
              <span className="text-xs text-muted ml-1">{shop.avgRating ? shop.avgRating.toFixed(1) : '-'}</span>
            </p>
          </div>
          {!isSelf && (
            <div className="flex gap-1.5">
              <FollowButton shopId={shop.id} initial={shop.isFollowing} onChange={setFollowers} />
              {me && (
                <button onClick={() => { if (!isFriend && !friendPending) friendMut.mutate() }} disabled={isFriend || friendPending || friendMut.isPending}
                  className="h-9 px-3 rounded-full text-xs font-semibold inline-flex items-center gap-1 border border-line bg-surface text-fg-2 disabled:opacity-60">
                  {isFriend ? <UserCheck size={13} /> : <UserPlus size={13} />}{isFriend ? '친구' : friendPending ? '요청중' : '친구 추가'}
                </button>
              )}
              {me && <Link href={`/dm/with/${id}`} className="h-9 w-9 rounded-full border border-line bg-surface text-fg-2 inline-flex items-center justify-center" aria-label="메시지"><MessageCircle size={14} /></Link>}
            </div>
          )}
        </div>

        <div className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Store size={16} className="text-accent-fg" />
            <p className="font-semibold text-fg">{shop.nickname}님의 상점</p>
            <span className="ml-auto text-xs text-subtle flex items-center gap-1"><CalendarDays size={12} />상점 오픈 {days}일째</span>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              ['판매중', s.selling + s.reserved],
              ['거래완료', s.completed],
              ['팔로워', followerCount],
              ['후기', shop.reviewCount],
            ].map(([label, n]) => (
              <div key={label} className="rounded-2xl bg-sunken py-2.5">
                <p className="text-lg font-bold text-fg tabular-nums">{n}</p>
                <p className="text-[11px] text-subtle">{label}</p>
              </div>
            ))}
          </div>

          {editingIntro ? (
            <div className="space-y-2">
              <textarea value={intro} onChange={e => setIntro(e.target.value)} maxLength={300} rows={3} autoFocus
                placeholder="상점을 소개해주세요. (주력 카드, 발송 요일, 포장 방식 등)"
                className="w-full bg-sunken border border-line focus:border-accent/60 rounded-xl px-3 py-2 text-sm text-fg focus:outline-none resize-none" />
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-subtle">{intro.length}/300</span>
                <button onClick={() => setEditingIntro(false)} className="ml-auto h-8 px-3 rounded-lg border border-line text-xs text-muted">취소</button>
                <button onClick={() => introMut.mutate()} disabled={introMut.isPending} className="h-8 px-3 rounded-lg bg-accent text-xs font-semibold text-white disabled:opacity-50">저장</button>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <p className={`flex-1 text-sm whitespace-pre-wrap leading-relaxed ${shop.shopIntro ? 'text-fg-3' : 'text-subtle'}`}>
                {shop.shopIntro ?? (isSelf ? '상점 소개를 적어 신뢰를 높여보세요.' : '상점 소개가 없어요.')}
              </p>
              {isSelf && <button onClick={() => { setIntro(shop.shopIntro ?? ''); setEditingIntro(true) }} className="shrink-0 h-8 px-3 rounded-lg border border-line text-xs text-fg-2 inline-flex items-center gap-1 hover:text-fg"><Pencil size={12} />소개 편집</button>}
            </div>
          )}
          <p className="text-[11px] text-subtle flex items-center gap-1"><ShieldCheck size={12} className="text-emerald-400" />모든 거래는 안전결제로 진행돼요 · {format(new Date(shop.createdAt), 'yyyy년 M월 가입', { locale: ko })}</p>
        </div>
      </section>

      {/* 탭 */}
      <div className="flex border-b border-line">
        {tabs.map(([key, label, n]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 sm:flex-none sm:px-6 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === key ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg-2'}`}>
            {label} <span className="text-xs tabular-nums text-subtle">{n}</span>
          </button>
        ))}
      </div>

      {tab === 'items' && (
        <div className="space-y-4">
          <div className="flex gap-1.5">
            {([['active', '판매중', s.selling], ['reserved', '예약중', s.reserved], ['sold', '판매완료', s.sold]] as const).map(([v, label, n]) => (
              <button key={v} onClick={() => setItemStatus(v)}
                className={`h-8 px-3 rounded-full text-xs font-semibold border ${itemStatus === v ? 'bg-accent-tint border-accent-line text-accent-soft' : 'border-line text-muted hover:text-fg'}`}>
                {label} {n}
              </button>
            ))}
          </div>
          {!items ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="aspect-square rounded-2xl bg-surface animate-pulse" />)}</div>
          ) : items.listings.length === 0 ? (
            <div className="text-center py-16 text-subtle text-sm">
              {itemStatus === 'active' ? (isSelf ? '판매중인 상품이 없어요.' : '지금 판매중인 상품이 없어요.') : itemStatus === 'reserved' ? '예약중인 상품이 없어요.' : '판매완료된 상품이 없어요.'}
              {isSelf && itemStatus === 'active' && <div><Link href="/sell" className="inline-block mt-3 text-accent-fg hover:underline">상품 등록하기</Link></div>}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-6">
              {items.listings.map(l => <MarketItemCard key={l.id} listing={l} liked={items.likedIds?.includes(l.id)} showLike={!isSelf} />)}
            </div>
          )}
        </div>
      )}

      {tab === 'reviews' && <ReviewList shopId={id} isSelf={isSelf} data={reviewData} page={reviewPage} setPage={setReviewPage} />}

      {(tab === 'followers' || tab === 'following') && (
        !people ? <div className="h-40 rounded-2xl bg-surface animate-pulse" />
          : people.length === 0 ? <p className="text-center py-16 text-subtle text-sm">{tab === 'followers' ? '아직 팔로워가 없어요.' : '팔로우한 상점이 없어요.'}</p>
          : (
            <div className="grid sm:grid-cols-2 gap-2">
              {people.map(p => (
                <Link key={p.id} href={`/users/${p.id}`} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 hover:border-line-strong">
                  <ShopAvatar user={p} size={44} />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-fg truncate">{p.nickname}</span>
                    <span className="block text-xs text-muted">상품 {p._count.listings} · 팔로워 {p._count.followers} · ★ {p.avgRating ? p.avgRating.toFixed(1) : '-'}</span>
                  </span>
                </Link>
              ))}
            </div>
          )
      )}
    </div>
  )
}

function ReviewList({ shopId, isSelf, data, page, setPage }: {
  shopId: string; isSelf: boolean; page: number; setPage: (fn: (p: number) => number) => void
  data?: { reviews: Review[]; total: number; totalPages: number }
}) {
  const qc = useQueryClient()
  const [replyId, setReplyId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [replyErr, setReplyErr] = useState('')
  const replyMut = useMutation({
    mutationFn: (reviewId: string) => api.post(`/reviews/${reviewId}/reply`, { reply: replyText }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['user-reviews', shopId] }); setReplyId(null); setReplyText(''); setReplyErr('') },
    onError: (e: { response?: { data?: { message?: string } } }) => setReplyErr(e.response?.data?.message ?? '답글 등록 실패'),
  })
  if (!data) return <div className="h-40 rounded-2xl bg-surface animate-pulse" />
  if (data.reviews.length === 0) return <p className="text-center py-16 text-subtle text-sm">아직 거래 후기가 없어요.</p>

  return (
    <div className="rounded-2xl border border-line bg-surface overflow-hidden">
      <div className="divide-y divide-line">
        {data.reviews.map(rv => (
          <div key={rv.id} className="p-4 space-y-2">
            <div className="flex items-start gap-3">
              <ShopAvatar user={rv.reviewer} size={34} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link href={`/users/${rv.reviewer.id}`} className="text-sm font-medium text-fg-2 hover:text-fg">{rv.reviewer.nickname}</Link>
                  <span className="text-xs text-amber-300">{'★'.repeat(rv.rating)}<span className="text-line-strong">{'★'.repeat(5 - rv.rating)}</span></span>
                  <span className="text-[11px] text-subtle ml-auto">{format(new Date(rv.createdAt), 'yy.MM.dd')}</span>
                </div>
                {rv.transaction?.listing?.card && <p className="text-[11px] text-subtle mt-0.5">{rv.transaction.listing.card.nameKo ?? rv.transaction.listing.card.name} 거래</p>}
                {rv.comment && <p className="text-sm text-fg-3 mt-1.5 leading-relaxed">{rv.comment}</p>}
              </div>
            </div>
            {rv.sellerReply && (
              <div className="ml-12 bg-sunken border border-line rounded-xl px-3 py-2">
                <p className="text-[11px] text-accent-fg font-semibold flex items-center gap-1 mb-0.5"><Reply size={10} />판매자 답글</p>
                <p className="text-xs text-fg-3 leading-relaxed">{rv.sellerReply}</p>
              </div>
            )}
            {isSelf && !rv.sellerReply && (replyId === rv.id ? (
              <div className="ml-12 space-y-2">
                <textarea value={replyText} onChange={e => setReplyText(e.target.value)} maxLength={500} rows={2} placeholder="후기에 답글을 남겨보세요"
                  className="w-full bg-sunken border border-line focus:border-accent/60 rounded-xl px-3 py-2 text-xs text-fg outline-none resize-none" />
                {replyErr && <p className="text-[11px] text-rose-300">{replyErr}</p>}
                <div className="flex gap-2">
                  <button onClick={() => replyMut.mutate(rv.id)} disabled={!replyText.trim() || replyMut.isPending} className="px-3 py-1.5 bg-accent disabled:opacity-40 text-white rounded-lg text-[11px] font-medium">등록</button>
                  <button onClick={() => { setReplyId(null); setReplyText('') }} className="px-3 py-1.5 border border-line text-muted rounded-lg text-[11px]">취소</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setReplyId(rv.id)} className="ml-12 flex items-center gap-1 text-[11px] text-subtle hover:text-accent-fg"><Reply size={10} />답글 달기</button>
            ))}
          </div>
        ))}
      </div>
      {data.totalPages > 1 && (
        <div className="flex justify-center gap-2 px-4 py-3 border-t border-line">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 text-xs rounded-lg border border-line text-muted disabled:opacity-40">이전</button>
          <span className="px-3 py-1 text-xs text-subtle">{page} / {data.totalPages}</span>
          <button disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1 text-xs rounded-lg border border-line text-muted disabled:opacity-40">다음</button>
        </div>
      )}
    </div>
  )
}

'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import Image from 'next/image'
import Link from 'next/link'
import ListingCard from '@/components/ListingCard'
import { RatingBadge } from '@/components/StarRating'
import {
  ChevronLeft, Star, ShoppingBag, MessageCircle, UserPlus, UserCheck, Reply,
} from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'

interface SellerUser {
  id: string
  nickname: string
  avatarUrl?: string | null
  avgRating?: number | null
  reviewCount?: number
  createdAt: string
}

interface Review {
  id: string
  rating: number
  comment?: string | null
  sellerReply?: string | null
  sellerRepliedAt?: string | null
  createdAt: string
  reviewer: { id: string; nickname: string; avatarUrl?: string | null }
  transaction?: { listing?: { card?: { name: string; nameKo?: string | null } } | null } | null
}

export default function UserProfilePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user: me } = useAuthStore()
  const qc = useQueryClient()
  const [reviewPage, setReviewPage] = useState(1)
  const [activeTab, setActiveTab] = useState<'reviews' | 'listings'>('reviews')
  const [replyId, setReplyId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [replyErr, setReplyErr] = useState('')

  const { data: userData } = useQuery<{ user: SellerUser }>({
    queryKey: ['user-profile', id],
    queryFn: () => api.get(`/users/${id}/profile`).then(r => r.data),
    enabled: !!id,
  })

  const { data: reviewData } = useQuery<{ reviews: Review[]; total: number; totalPages: number; avgRating: number | null }>({
    queryKey: ['user-reviews', id, reviewPage],
    queryFn: () => api.get(`/users/${id}/reviews`, { params: { page: reviewPage } }).then(r => r.data),
    enabled: !!id,
  })

  const { data: listingsData } = useQuery({
    queryKey: ['user-listings', id],
    queryFn: () => api.get('/listings', { params: { sellerId: id, limit: 12 } }).then(r => r.data),
    enabled: !!id && activeTab === 'listings',
  })

  const { data: friendStatus } = useQuery<{ status: string }>({
    queryKey: ['friend-status', id],
    queryFn: () => api.get(`/friends/status/${id}`).then(r => r.data),
    enabled: !!id && !!me && me.id !== id,
  })

  const friendMut = useMutation({
    mutationFn: () => api.post(`/friends/requests/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['friend-status', id] }),
  })

  const replyMut = useMutation({
    mutationFn: (reviewId: string) => api.post(`/reviews/${reviewId}/reply`, { reply: replyText }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user-reviews', id] })
      setReplyId(null); setReplyText(''); setReplyErr('')
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      setReplyErr(e.response?.data?.message ?? '답글 등록 실패'),
  })

  const user = userData?.user
  const reviews = reviewData?.reviews ?? []
  const listings = listingsData?.listings ?? []
  const isSelf = me?.id === id
  const isFriend = friendStatus?.status === 'FRIEND'
  const isPending = friendStatus?.status === 'PENDING_SENT'

  if (!user && !userData) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="h-32 bg-[#1a1410] border border-[#2e2318] rounded-2xl animate-pulse" />
        <div className="h-64 bg-[#1a1410] border border-[#2e2318] rounded-2xl animate-pulse" />
      </div>
    )
  }

  if (!user) return <div className="text-center py-24 text-[#5a4830]">유저를 찾을 수 없습니다.</div>

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <button onClick={() => router.back()} className="inline-flex items-center gap-1 text-sm text-[#8a7055] hover:text-[#f5ead8] transition-colors">
        <ChevronLeft size={16} /> 뒤로
      </button>

      {/* 프로필 헤더 */}
      <div className="bg-[#1a1410] border border-[#2e2318] rounded-2xl p-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full overflow-hidden bg-[#2a1c0c] border-2 border-[#3a2510] shrink-0 flex items-center justify-center text-2xl font-bold text-[#f0a832]">
            {user.avatarUrl
              ? <Image src={user.avatarUrl} alt={user.nickname} width={64} height={64} className="object-cover" />
              : user.nickname[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-[#f5ead8]">{user.nickname}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <RatingBadge avgRating={user.avgRating ?? null} reviewCount={user.reviewCount ?? 0} />
            </div>
            <p className="text-xs text-[#4a3820] mt-1">
              {format(new Date(user.createdAt), 'yyyy년 MM월 가입', { locale: ko })}
            </p>
          </div>
          {me && !isSelf && (
            <div className="flex flex-col gap-2 shrink-0">
              <button
                onClick={() => { if (!isFriend && !isPending) friendMut.mutate() }}
                disabled={isFriend || isPending || friendMut.isPending}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                  isFriend
                    ? 'bg-emerald-900/30 border border-emerald-700/40 text-emerald-400'
                    : isPending
                    ? 'bg-[#2a1c08] border border-[#3a2510] text-[#8a7055]'
                    : 'bg-[#d4a853] hover:bg-[#c49440] text-white'
                }`}
              >
                {isFriend ? <UserCheck size={12} /> : <UserPlus size={12} />}
                {isFriend ? '친구' : isPending ? '요청 중' : '친구 추가'}
              </button>
              <Link
                href={`/dm/with/${id}`}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-[#1a1208] border border-[#2e2318] hover:border-[#4a3520] text-[#9e8a6a] hover:text-[#e8d5b0] transition-colors"
              >
                <MessageCircle size={12} /> 메시지
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 bg-[#150f0c] border border-[#2e2318] rounded-xl p-1 w-fit">
        {([
          ['reviews', <Star key="s" size={14} />, `리뷰 (${reviewData?.total ?? 0})`],
          ['listings', <ShoppingBag key="sb" size={14} />, '판매 중'],
        ] as const).map(([key, icon, label]) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === key ? 'bg-[#2a1c08] text-[#e0b878]' : 'text-[#7a6040] hover:text-[#9e8a6a]'}`}>
            {icon}{label}
          </button>
        ))}
      </div>

      {/* 리뷰 탭 */}
      {activeTab === 'reviews' && (
        <div className="bg-[#1a1410] border border-[#2e2318] rounded-2xl overflow-hidden">
          {reviews.length === 0 ? (
            <p className="p-10 text-center text-[#5a4830] text-sm">아직 리뷰가 없습니다.</p>
          ) : (
            <div className="divide-y divide-[#1e1810]">
              {reviews.map(rv => (
                <div key={rv.id} className="p-4 space-y-2">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#2a1c0c] border border-[#3a2510] shrink-0 flex items-center justify-center text-xs font-bold text-[#f0a832] overflow-hidden">
                      {rv.reviewer.avatarUrl
                        ? <img src={rv.reviewer.avatarUrl} alt="" className="w-full h-full object-cover" />
                        : rv.reviewer.nickname[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium text-[#c8b48a]">{rv.reviewer.nickname}</span>
                        <span className="text-xs text-[#f0a832]">{'★'.repeat(rv.rating)}{'☆'.repeat(5 - rv.rating)}</span>
                        {rv.transaction?.listing?.card && (
                          <span className="text-[10px] text-[#4a3820]">
                            {rv.transaction.listing.card.nameKo ?? rv.transaction.listing.card.name}
                          </span>
                        )}
                        <span className="text-[10px] text-[#4a3820] ml-auto">{format(new Date(rv.createdAt), 'yy.MM.dd')}</span>
                      </div>
                      {rv.comment && <p className="text-xs text-[#9e8a6a] mt-1 leading-relaxed">{rv.comment}</p>}
                    </div>
                  </div>

                  {rv.sellerReply && (
                    <div className="ml-11 bg-[#1a1208] border border-[#2e2318] rounded-xl px-3 py-2">
                      <p className="text-[10px] text-[#d4a853] font-semibold flex items-center gap-1 mb-0.5">
                        <Reply size={9} /> 판매자 답글
                      </p>
                      <p className="text-xs text-[#9e8a6a] leading-relaxed">{rv.sellerReply}</p>
                    </div>
                  )}

                  {isSelf && !rv.sellerReply && (
                    replyId === rv.id ? (
                      <div className="ml-11 space-y-2">
                        <textarea
                          value={replyText}
                          onChange={e => setReplyText(e.target.value)}
                          maxLength={500}
                          rows={2}
                          placeholder="구매자 리뷰에 답글을 남겨보세요..."
                          className="w-full bg-[#1a1208] border border-[#2e2318] focus:border-[#d4a853]/60 rounded-xl px-3 py-2 text-xs text-[#f5ead8] placeholder:text-[#4a3820] outline-none resize-none"
                        />
                        {replyErr && <p className="text-[10px] text-red-400">{replyErr}</p>}
                        <div className="flex gap-2">
                          <button
                            onClick={() => replyMut.mutate(rv.id)}
                            disabled={replyText.trim().length < 1 || replyMut.isPending}
                            className="px-3 py-1.5 bg-[#d4a853] hover:bg-[#c49440] disabled:opacity-40 text-white rounded-lg text-[11px] font-medium"
                          >등록</button>
                          <button
                            onClick={() => { setReplyId(null); setReplyText('') }}
                            className="px-3 py-1.5 bg-[#1a1208] border border-[#2e2318] text-[#7a6040] rounded-lg text-[11px]"
                          >취소</button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setReplyId(rv.id)}
                        className="ml-11 flex items-center gap-1 text-[10px] text-[#5a4830] hover:text-[#d4a853] transition-colors"
                      >
                        <Reply size={10} /> 답글 달기
                      </button>
                    )
                  )}
                </div>
              ))}
            </div>
          )}
          {(reviewData?.totalPages ?? 0) > 1 && (
            <div className="flex justify-center gap-2 px-4 py-3 border-t border-[#2e2318]">
              <button disabled={reviewPage <= 1} onClick={() => setReviewPage(p => p - 1)}
                className="px-3 py-1 text-xs rounded-lg bg-[#1a1208] border border-[#2e2318] text-[#8a7055] disabled:opacity-40">이전</button>
              <span className="px-3 py-1 text-xs text-[#5a4830]">{reviewPage} / {reviewData?.totalPages}</span>
              <button disabled={reviewPage >= (reviewData?.totalPages ?? 1)} onClick={() => setReviewPage(p => p + 1)}
                className="px-3 py-1 text-xs rounded-lg bg-[#1a1208] border border-[#2e2318] text-[#8a7055] disabled:opacity-40">다음</button>
            </div>
          )}
        </div>
      )}

      {/* 판매 중 탭 */}
      {activeTab === 'listings' && (
        listings.length === 0
          ? <div className="text-center py-16 text-[#5a4830] text-sm">현재 판매 중인 상품이 없습니다.</div>
          : <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {listings.map((listing: Parameters<typeof ListingCard>[0]['listing']) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
      )}
    </div>
  )
}

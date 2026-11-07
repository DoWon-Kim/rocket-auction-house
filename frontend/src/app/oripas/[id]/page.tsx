'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Ticket, ShieldCheck, Crown, Loader2, AlertCircle, Sparkles, History, Info, Radio } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { connectSocket } from '@/lib/socket'
import { timeAgo } from '@/lib/market'
import { type OripaDetail, type DrawResult, gradeOf, LAST_ONE } from '@/lib/oripa'
import { PrizeBoard } from '@/components/oripa/PrizeBoard'
import { FairnessPanel } from '@/components/oripa/FairnessPanel'
import { DrawStage } from '@/components/oripa/DrawStage'

interface FeedRow { id: string; draws: number; createdAt: string; nickname: string; results: DrawResult[] }
type Tab = 'prizes' | 'feed' | 'fair' | 'guide'

export default function OripaDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const qc = useQueryClient()
  const user = useAuthStore(s => s.user)
  const [tab, setTab] = useState<Tab>('prizes')
  const [stage, setStage] = useState<{ key: number; results: DrawResult[]; n: number } | null>(null)
  const [error, setError] = useState('')
  const [flash, setFlash] = useState<Set<string>>(new Set())
  const [liveNote, setLiveNote] = useState<string | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: o, isLoading } = useQuery<OripaDetail>({ queryKey: ['oripa', id], queryFn: () => api.get(`/oripas/${id}`).then(r => r.data), refetchInterval: user ? false : 20_000 })
  const { data: feed } = useQuery<FeedRow[]>({ queryKey: ['oripa-feed', id], queryFn: () => api.get(`/oripas/${id}/history`, { params: { limit: 40 } }).then(r => r.data), refetchInterval: user ? false : 20_000 })

  // 실시간: 다른 사람이 뽑으면 남은 수가 바로 줄어듦
  useEffect(() => {
    if (!user) return
    const s = connectSocket()
    const join = () => s.emit('oripa:join', id)
    const onUpdate = (e: { oripaId: string; remainSlots: number; status: OripaDetail['status']; items: Array<{ id: string; remaining: number }>; drawn: number; nickname: string; hits: Array<{ name: string; grade: number; isLastOne: boolean }> }) => {
      if (e.oripaId !== id) return
      const rem = new Map(e.items.map(i => [i.id, i.remaining]))
      const cur = qc.getQueryData<OripaDetail>(['oripa', id])
      if (cur) {
        // 방금 줄어든 상품을 잠깐 반짝이게
        setFlash(new Set(cur.items.filter(i => rem.has(i.id) && rem.get(i.id) !== i.remaining).map(i => i.id)))
        if (flashTimer.current) clearTimeout(flashTimer.current)
        flashTimer.current = setTimeout(() => setFlash(new Set()), 1500)
        qc.setQueryData<OripaDetail>(['oripa', id], { ...cur, remainSlots: e.remainSlots, status: e.status, items: cur.items.map(i => ({ ...i, remaining: rem.get(i.id) ?? i.remaining })) })
      }
      setLiveNote(e.hits.length ? `🎉 ${e.nickname}님이 ${e.hits[0].name} 당첨!` : `${e.nickname}님이 ${e.drawn}장 뽑았어요`)
      qc.invalidateQueries({ queryKey: ['oripa-feed', id] })
      if (e.status === 'SOLD_OUT') qc.invalidateQueries({ queryKey: ['oripa', id] }) // 공개된 시드 받기
    }
    s.on('connect', join); s.on('oripa:update', onUpdate)
    if (s.connected) join()
    return () => { s.emit('oripa:leave', id); s.off('connect', join); s.off('oripa:update', onUpdate); if (flashTimer.current) clearTimeout(flashTimer.current) }
  }, [id, user, qc])

  useEffect(() => { if (!liveNote) return; const t = setTimeout(() => setLiveNote(null), 4000); return () => clearTimeout(t) }, [liveNote])

  const draw = useMutation({
    mutationFn: (n: number) => api.post<{ results: DrawResult[]; draws: number; balance: number }>(`/oripas/${id}/draw`, { draws: n }).then(r => r.data),
    onSuccess: (d, n) => {
      setError('')
      useAuthStore.setState(s => (s.user ? { user: { ...s.user, balance: d.balance } } : s))
      setStage({ key: Date.now(), results: d.results, n })
      qc.invalidateQueries({ queryKey: ['oripa', id] }); qc.invalidateQueries({ queryKey: ['oripa-feed', id] }); qc.invalidateQueries({ queryKey: ['oripa-hits'] })
    },
    onError: (e: unknown) => setError((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? '뽑기에 실패했어요.'),
  })
  const doDraw = useCallback((n: number) => { if (!user) { router.push('/login'); return } setStage(null); draw.mutate(n) }, [user, router, draw])

  if (isLoading) return <div className="max-w-6xl mx-auto h-[70vh] rounded-3xl bg-surface animate-pulse" />
  if (!o) return <div className="text-center py-24 text-muted">오리파를 찾을 수 없어요. <Link href="/oripas" className="text-accent-fg underline">목록으로</Link></div>

  const sold = o.totalSlots - o.remainSlots
  const pct = o.totalSlots ? (sold / o.totalSlots) * 100 : 0
  const live = o.status === 'LIVE'
  const top = [...o.items].filter(i => !i.isLastOne).sort((a, b) => b.grade - a.grade)[0]
  const cover = o.imageUrl ?? top?.card?.imageUrl ?? null
  const lastOne = o.items.find(i => i.isLastOne)
  const options = [...new Set([1, 5, 10, o.maxPerDraw].filter(n => n <= o.maxPerDraw))].sort((a, b) => a - b)
  const topLeft = o.items.filter(i => !i.isLastOne && i.grade >= 4).reduce((s, i) => s + i.remaining, 0)
  const balance = user?.balance ?? 0

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <Link href="/oripas" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ChevronLeft size={15} />오리파 목록</Link>

      {/* 히어로 */}
      <section className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#0b0914] grid lg:grid-cols-[380px_1fr]">
        <div className="absolute -top-32 -left-24 w-[30rem] h-[30rem] rounded-full bg-amber-500/15 blur-3xl" />
        <div className="absolute -bottom-40 right-10 w-[30rem] h-[30rem] rounded-full bg-fuchsia-600/20 blur-3xl" />
        <div className="relative aspect-square lg:aspect-auto min-h-[300px] flex items-center justify-center">
          <div className="absolute w-72 h-72 rounded-full bg-amber-400/20 blur-3xl animate-oripa-glow" />
          {cover && <div className="relative w-56 h-72 animate-oripa-float"><Image src={cover} alt="" fill sizes="224px" className="object-contain drop-shadow-[0_30px_50px_rgba(0,0,0,0.7)]" priority /></div>}
        </div>
        <div className="relative p-6 sm:p-8 space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            {o.status === 'SOLD_OUT' ? <span className="px-2.5 py-1 rounded-full bg-white/10 text-xs font-bold text-white">완판</span>
              : o.status === 'PAUSED' ? <span className="px-2.5 py-1 rounded-full bg-amber-500/20 text-xs font-bold text-amber-200">일시중지</span>
              : <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-300 inline-flex items-center gap-1"><Radio size={11} className="animate-pulse" />LIVE</span>}
            {o.seedHash && <button onClick={() => setTab('fair')} className="px-2.5 py-1 rounded-full bg-white/5 text-[11px] text-white/70 inline-flex items-center gap-1 hover:text-white"><ShieldCheck size={12} />순서 봉인됨</button>}
            {lastOne && <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold inline-flex items-center gap-1 ${LAST_ONE.chip}`}><Crown size={11} />라스트원상</span>}
          </div>
          <div>
            <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight">{o.title}</h1>
            {o.description && <p className="mt-2 text-sm text-white/60 whitespace-pre-wrap">{o.description}</p>}
          </div>

          <div>
            <div className="flex items-end justify-between mb-1.5">
              <span className="text-sm text-white/60">남은 티켓</span>
              <span className="tabular-nums"><b className="text-3xl font-black text-white">{o.remainSlots.toLocaleString()}</b><span className="text-white/50"> / {o.totalSlots.toLocaleString()}</span></span>
            </div>
            <div className="h-3 rounded-full bg-white/10 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-amber-400 via-rose-500 to-fuchsia-500 transition-all duration-700" style={{ width: `${pct}%` }} /></div>
            {live && topLeft > 0 && o.remainSlots > 0 && <p className="mt-2 text-xs text-amber-200">{gradeOf(4).label} {topLeft}장 남음 · 지금 1장 뽑으면 {((topLeft / o.remainSlots) * 100).toFixed(2)}%</p>}
          </div>

          <div className="space-y-2.5">
            <p className="text-sm text-white/60">1회 <b className="text-xl text-white tabular-nums">{o.pricePerDraw.toLocaleString()}P</b>{user && <span className="ml-2 text-xs">보유 {balance.toLocaleString()}P</span>}</p>
            {live ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {options.map((n, k) => {
                  const cnt = Math.min(n, o.remainSlots)
                  const cost = cnt * o.pricePerDraw
                  const main = k === options.length - 1
                  return (
                    <button key={n} onClick={() => doDraw(cnt)} disabled={draw.isPending || cnt < 1}
                      className={`h-14 rounded-2xl font-black text-white disabled:opacity-40 flex flex-col items-center justify-center transition-transform hover:scale-[1.03] active:scale-95 ${main ? 'bg-gradient-to-r from-amber-400 via-rose-500 to-fuchsia-500 shadow-[0_10px_30px_-8px_rgba(244,63,94,0.7)]' : 'bg-white/10 hover:bg-white/15'}`}>
                      {draw.isPending && draw.variables === cnt ? <Loader2 size={18} className="animate-spin" /> : <><span className="text-base">{cnt}회 뽑기</span><span className="text-[11px] font-semibold opacity-80 tabular-nums">{cost.toLocaleString()}P</span></>}
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className="rounded-xl bg-white/5 px-4 py-3 text-sm text-white/70">{o.status === 'SOLD_OUT' ? '완판되었어요. 공정성 검증 탭에서 추첨 순서를 확인할 수 있어요.' : '잠시 판매가 멈춰 있어요. 곧 다시 열려요.'}</p>
            )}
            {error && <p className="text-sm text-rose-300 flex items-center gap-1.5"><AlertCircle size={14} />{error}{error.includes('포인트') && <Link href="/charge" className="underline ml-1">충전하기</Link>}</p>}
            {!user && live && <p className="text-xs text-white/50"><Link href="/login" className="underline">로그인</Link>하고 뽑기에 참여하세요.</p>}
          </div>
        </div>
      </section>

      {liveNote && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-black/80 border border-white/10 text-sm text-white shadow-xl animate-oripa-deal">{liveNote}</div>}

      {/* 탭 */}
      <div className="flex gap-1 border-b border-white/10 overflow-x-auto">
        {([['prizes', '상품 구성', Sparkles], ['feed', '당첨 현황', History], ['fair', '공정성 검증', ShieldCheck], ['guide', '이용 안내', Info]] as const).map(([v, label, Icon]) => (
          <button key={v} onClick={() => setTab(v)} className={`shrink-0 h-11 px-4 text-sm font-semibold inline-flex items-center gap-1.5 border-b-2 -mb-px ${tab === v ? 'border-amber-300 text-white' : 'border-transparent text-white/50 hover:text-white'}`}><Icon size={14} />{label}</button>
        ))}
      </div>

      {tab === 'prizes' && <PrizeBoard items={o.items} remainSlots={o.remainSlots} flashIds={flash} />}

      {tab === 'feed' && (
        <div className="rounded-3xl border border-white/10 bg-white/[0.02] divide-y divide-white/5">
          {!feed?.length ? <p className="py-14 text-center text-sm text-white/50">아직 뽑은 사람이 없어요. 첫 번째 주인공이 되어보세요!</p> : feed.map(f => {
            const best = [...f.results].sort((a, b) => (b.isLastOne ? 5 : b.grade) - (a.isLastOne ? 5 : a.grade))[0]
            return (
              <div key={f.id} className="flex items-center gap-3 px-4 py-3">
                <Ticket size={16} className="text-white/40 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white"><b>{f.nickname}</b>님 {f.draws}장</p>
                  <p className="text-[11px] text-white/40 truncate">{f.results.map(r => r.ticketNo ? `#${r.ticketNo}` : '라스트원').join(' ')}</p>
                </div>
                {best && (best.grade >= 3 || best.isLastOne) && (
                  <span className={`shrink-0 px-2 py-0.5 rounded-md text-[11px] font-extrabold ${best.isLastOne ? LAST_ONE.chip : gradeOf(best.grade).chip}`}>{best.isLastOne ? '라스트원' : gradeOf(best.grade).label} · {best.name}</span>
                )}
                <span className="shrink-0 text-[11px] text-white/40">{timeAgo(f.createdAt)}</span>
              </div>
            )
          })}
        </div>
      )}

      {tab === 'fair' && <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5"><FairnessPanel o={o} /></div>}

      {tab === 'guide' && (
        <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5 text-sm text-white/70 space-y-2 leading-relaxed">
          <p>• 전체 {o.totalSlots.toLocaleString()}장의 티켓이 있고, 뽑을 때마다 봉인된 순서대로 1장씩 꺼내요. 같은 상품이 정해진 수보다 많이 나오지 않아요.</p>
          <p>• 한 번에 최대 {o.maxPerDraw}장까지 뽑을 수 있어요.</p>
          <p>• 카드 상품은 보관함에 저장되고, 실물 배송을 신청하거나 표시된 교환 포인트로 바꿀 수 있어요. 포인트 상품은 즉시 지급돼요.</p>
          {lastOne && <p>• 마지막 티켓을 뽑은 분에게는 라스트원상이 추가로 지급돼요.</p>}
          <p>• 뽑기는 결제 즉시 결과가 정해지므로 취소·환불되지 않아요.</p>
        </div>
      )}

      {stage && (
        <DrawStage key={stage.key} results={stage.results} cover={cover} onClose={() => setStage(null)}
          onAgain={() => doDraw(Math.min(stage.n, o.remainSlots))} canAgain={live && o.remainSlots > 0}
          againLabel={`한 번 더 ${Math.min(stage.n, o.remainSlots)}회`} />
      )}
    </div>
  )
}

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import {
  Activity, RefreshCw, ShieldCheck, Wallet, Banknote, UserPlus, Tag, CreditCard, PackageCheck, ShoppingBag,
  Zap, MessageCircle, ChevronRight, Truck, Flag, Scale, CircleDollarSign, CheckCircle2, Users, Store, ArrowLeftRight, Handshake,
} from 'lucide-react'
import { api } from '@/lib/api'
import { connectSocket } from '@/lib/socket'
import { timeAgo } from '@/lib/market'

interface QueueItem { key: string; label: string; hint: string; count: number; level: 'danger' | 'warn' | 'info'; link: string }
interface FeedItem { type: string; at: string; title: string; sub?: string; link?: string }
interface TrendDay { date: string; trades: number; tradeAmount: number; shopOrders: number; shopAmount: number; signups: number; charges: number }
interface Overview {
  queue: QueueItem[]
  money: { escrowHeld: number; escrowCount: number; totalBalance: number; pendingWithdrawAmount: number }
  today: { signups: number; newListings: number; paidCount: number; paidAmount: number; doneCount: number; shopCount: number; shopAmount: number; chargeCount: number; chargeAmount: number; chats: number; flaggedChats?: number }
  totals: { users: number; selling: number; reserved: number; trades: number; completed: number; shopItems: number }
  trend: TrendDay[]
  feed: FeedItem[]
}

const P = (n: number) => `${n.toLocaleString()}P`
const short = (n: number) => (n >= 1e8 ? `${(n / 1e8).toFixed(1)}억` : n >= 1e4 ? `${Math.round(n / 1e4).toLocaleString()}만` : n.toLocaleString())
const LEVEL = {
  danger: { ring: 'border-rose-500/40 bg-rose-500/10', num: 'text-rose-300', dot: 'bg-rose-400' },
  warn: { ring: 'border-amber-500/40 bg-amber-500/10', num: 'text-amber-300', dot: 'bg-amber-400' },
  info: { ring: 'border-sky-500/30 bg-sky-500/5', num: 'text-sky-300', dot: 'bg-sky-400' },
}
const FEED_META: Record<string, { icon: React.ElementType; cls: string; group: string }> = {
  signup: { icon: UserPlus, cls: 'text-sky-300 bg-sky-500/10', group: 'user' },
  listing: { icon: Tag, cls: 'text-accent-soft bg-accent-tint', group: 'market' },
  offer: { icon: Handshake, cls: 'text-emerald-300 bg-emerald-500/10', group: 'market' },
  paid: { icon: CreditCard, cls: 'text-emerald-300 bg-emerald-500/10', group: 'market' },
  shipped: { icon: Truck, cls: 'text-amber-300 bg-amber-500/10', group: 'market' },
  confirmed: { icon: CheckCircle2, cls: 'text-emerald-300 bg-emerald-500/10', group: 'market' },
  auto_confirmed: { icon: CheckCircle2, cls: 'text-emerald-300/70 bg-emerald-500/5', group: 'market' },
  shop_order: { icon: ShoppingBag, cls: 'text-pink-300 bg-pink-500/10', group: 'shop' },
  report: { icon: Flag, cls: 'text-rose-300 bg-rose-500/10', group: 'issue' },
  dispute: { icon: Scale, cls: 'text-rose-300 bg-rose-500/10', group: 'issue' },
  withdrawal: { icon: Banknote, cls: 'text-amber-300 bg-amber-500/10', group: 'money' },
  charge: { icon: CircleDollarSign, cls: 'text-cyan-300 bg-cyan-500/10', group: 'money' },
}
const FEED_FILTERS = [['all', '전체'], ['market', '중고거래'], ['shop', '샵'], ['money', '충전·환전'], ['issue', '신고·분쟁'], ['user', '가입']] as const
const PULSE_LABEL: Record<string, string> = {
  signup: '가입', listing: '상품', trade: '안전결제', shop: '샵 주문', report: '신고', withdrawal: '환전', charge: '충전',
  dispute: '분쟁', chat: '채팅', offer: '가격 제안', shipping: '배송 요청',
}
const METRICS = [
  { key: 'amount', label: '거래액', color: 'from-accent/80 to-accent-2/60', value: (d: TrendDay) => d.tradeAmount + d.shopAmount, fmt: (n: number) => P(n) },
  { key: 'count', label: '거래 건수', color: 'from-emerald-500/80 to-emerald-300/60', value: (d: TrendDay) => d.trades + d.shopOrders, fmt: (n: number) => `${n}건` },
  { key: 'signups', label: '가입', color: 'from-sky-500/80 to-sky-300/60', value: (d: TrendDay) => d.signups, fmt: (n: number) => `${n}명` },
  { key: 'charges', label: '충전', color: 'from-cyan-500/80 to-cyan-300/60', value: (d: TrendDay) => d.charges, fmt: (n: number) => P(n) },
] as const

const feedKey = (f: FeedItem) => `${f.type}|${f.at}|${f.title}`

// 서버가 보내는 실시간 신호를 받아 대시보드를 즉시 갱신 (연결이 끊기면 1분 주기 폴링으로 대체)
function useAdminLive(refetch: () => void) {
  const [live, setLive] = useState(false)
  const [ticker, setTicker] = useState<{ text: string; at: number } | null>(null)
  const last = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const socket = connectSocket()
    const onConnect = () => setLive(true)
    const onDisconnect = () => setLive(false)
    const onPulse = ({ kinds }: { kinds: Record<string, number> }) => {
      const at = Date.now()
      setTicker({ text: Object.entries(kinds).map(([k, n]) => `${PULSE_LABEL[k] ?? k} ${n}`).join(' · '), at })
      setTimeout(() => setTicker(cur => (cur?.at === at ? null : cur)), 8000)
      // 몰려서 들어와도 1.5초에 한 번만 다시 불러오기
      const wait = Math.max(0, 1500 - (Date.now() - last.current))
      if (timer.current) return
      timer.current = setTimeout(() => { timer.current = null; last.current = Date.now(); refetch() }, wait)
    }
    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('admin:pulse', onPulse)
    if (socket.connected) onConnect()
    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('admin:pulse', onPulse)
      if (timer.current) clearTimeout(timer.current)
    }
  }, [refetch])
  return { live, ticker }
}

export default function AdminDashboard() {
  const [feedFilter, setFeedFilter] = useState<(typeof FEED_FILTERS)[number][0]>('all')
  const [metric, setMetric] = useState<(typeof METRICS)[number]['key']>('amount')
  const { data, isFetching, refetch, dataUpdatedAt } = useQuery<Overview>({
    queryKey: ['admin', 'ops'],
    queryFn: () => api.get('/admin/ops/overview').then(r => r.data),
    refetchInterval: 60_000,
  })
  // 실시간 갱신 직전의 활동 목록을 기억해 두고, 그 뒤에 새로 들어온 항목을 NEW 로 강조
  const dataRef = useRef<Overview | undefined>(undefined)
  useEffect(() => { dataRef.current = data }, [data])
  const [baseline, setBaseline] = useState<Set<string> | null>(null)
  const liveRefetch = useCallback(() => {
    if (dataRef.current) setBaseline(new Set(dataRef.current.feed.map(feedKey)))
    refetch()
  }, [refetch])
  const { live, ticker } = useAdminLive(liveRefetch)
  const fresh = new Set(baseline && data ? data.feed.map(feedKey).filter(k => !baseline.has(k)) : [])

  if (!data) return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-fg">대시보드</h1>
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-24 rounded-2xl bg-surface border border-line animate-pulse" />)}</div>
      <div className="h-64 rounded-2xl bg-surface border border-line animate-pulse" />
    </div>
  )

  const urgent = data.queue.filter(q => q.count > 0)
  const quiet = data.queue.filter(q => q.count === 0)
  const feed = data.feed.filter(f => feedFilter === 'all' || FEED_META[f.type]?.group === feedFilter)
  const t = data.today
  const m = METRICS.find(x => x.key === metric)!
  const series = data.trend.map(d => ({ date: d.date, v: m.value(d) }))
  const max = Math.max(1, ...series.map(s => s.v))
  const sum = series.reduce((a, s) => a + s.v, 0)

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-fg">대시보드</h1>
        <span className={`inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[11px] font-bold ${live ? 'bg-emerald-500/15 text-emerald-300' : 'bg-surface-2 text-muted'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${live ? 'bg-emerald-400 animate-pulse' : 'bg-subtle'}`} />{live ? 'LIVE' : '연결 중'}
        </span>
        <span className="text-xs text-muted">{new Date(dataUpdatedAt).toLocaleTimeString('ko-KR')} 기준</span>
        {ticker && <span key={ticker.at} className="text-xs text-accent-fg animate-pulse">방금 반영: {ticker.text}</span>}
        <button onClick={() => refetch()} className="ml-auto h-8 px-3 rounded-lg border border-line text-xs text-fg-2 hover:bg-surface-2 inline-flex items-center gap-1.5">
          <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />새로고침
        </button>
      </div>

      {/* 핵심 지표 */}
      <section className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2.5">
        {[
          { icon: Users, label: '전체 회원', value: data.totals.users.toLocaleString(), sub: `오늘 +${t.signups}명`, cls: 'text-sky-300 bg-sky-500/10' },
          { icon: Tag, label: '판매중 상품', value: data.totals.selling.toLocaleString(), sub: `예약중 ${data.totals.reserved} · 오늘 +${t.newListings}`, cls: 'text-accent-soft bg-accent-tint' },
          { icon: ShieldCheck, label: '안전결제 보관', value: P(data.money.escrowHeld), sub: `${data.money.escrowCount}건 정산 대기`, cls: 'text-emerald-300 bg-emerald-500/10' },
          { icon: ArrowLeftRight, label: '오늘 거래액', value: P(t.paidAmount + t.shopAmount), sub: `안전결제 ${t.paidCount} · 샵 ${t.shopCount}건`, cls: 'text-accent-2 bg-accent-2/10' },
          { icon: Zap, label: '오늘 충전', value: P(t.chargeAmount), sub: `${t.chargeCount}건`, cls: 'text-cyan-300 bg-cyan-500/10' },
          { icon: PackageCheck, label: '누적 거래완료', value: data.totals.completed.toLocaleString(), sub: `전체 ${data.totals.trades}건 중`, cls: 'text-pink-300 bg-pink-500/10' },
        ].map(k => (
          <div key={k.label} className="rounded-2xl border border-line bg-surface p-3.5 flex items-center gap-3 min-w-0">
            <span className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center ${k.cls}`}><k.icon size={18} /></span>
            <div className="min-w-0">
              <p className="text-[11px] text-muted">{k.label}</p>
              <p className="text-lg font-bold text-fg tabular-nums leading-tight truncate">{k.value}</p>
              <p className="text-[10px] text-subtle truncate">{k.sub}</p>
            </div>
          </div>
        ))}
      </section>

      {/* 처리할 일 */}
      <section className="space-y-2.5">
        <h2 className="text-sm font-semibold text-fg">지금 처리할 일 {urgent.length > 0 ? <span className="text-rose-300">{urgent.reduce((n, q) => n + q.count, 0)}건</span> : <span className="text-emerald-400">없음 ✓</span>}</h2>
        {urgent.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2.5">
            {urgent.map(q => (
              <Link key={q.key} href={q.link} className={`group rounded-2xl border px-4 py-3 transition-colors hover:brightness-125 ${LEVEL[q.level].ring}`}>
                <div className="flex items-center gap-1.5 text-xs text-fg-2"><span className={`w-1.5 h-1.5 rounded-full ${LEVEL[q.level].dot}`} />{q.label}<ChevronRight size={13} className="ml-auto opacity-50 group-hover:opacity-100" /></div>
                <p className={`text-2xl font-extrabold tabular-nums mt-1 ${LEVEL[q.level].num}`}>{q.count}<span className="text-xs font-medium ml-0.5">건</span></p>
                <p className="text-[11px] text-muted truncate">{q.hint}</p>
              </Link>
            ))}
          </div>
        )}
        {quiet.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {quiet.map(q => (
              <Link key={q.key} href={q.link} className="h-7 px-2.5 rounded-full border border-line text-[11px] text-subtle hover:text-fg inline-flex items-center gap-1"><CheckCircle2 size={11} className="text-emerald-500/70" />{q.label} 0</Link>
            ))}
          </div>
        )}
      </section>

      <div className="grid xl:grid-cols-[1fr_400px] gap-4 items-start">
        <div className="space-y-4 min-w-0">
          {/* 추이 */}
          <section className="rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <Activity size={15} className="text-accent-fg" />
              <h2 className="text-sm font-semibold text-fg">최근 14일 추이</h2>
              <span className="text-xs text-muted">합계 {m.fmt(sum)}</span>
              <div className="ml-auto flex gap-1">
                {METRICS.map(x => (
                  <button key={x.key} onClick={() => setMetric(x.key)} className={`h-7 px-2.5 rounded-full text-[11px] font-medium ${metric === x.key ? 'bg-accent-tint text-accent-soft' : 'text-muted hover:text-fg'}`}>{x.label}</button>
                ))}
              </div>
            </div>
            <div className="flex items-end gap-1 h-40">
              {series.map((s, i) => (
                <div key={s.date} className="group relative flex-1 h-full flex flex-col justify-end items-center">
                  <span className="absolute -top-1 -translate-y-full hidden group-hover:block whitespace-nowrap rounded-md bg-bg border border-line px-2 py-1 text-[10px] text-fg z-10">{s.date.slice(5)} · {m.fmt(s.v)}</span>
                  {s.v > 0 && <span className="text-[9px] text-muted tabular-nums mb-0.5">{metric === 'amount' || metric === 'charges' ? short(s.v) : s.v}</span>}
                  <div className={`w-full rounded-t-sm bg-gradient-to-t ${m.color} ${i === series.length - 1 ? 'ring-1 ring-accent-fg/60' : ''}`} style={{ height: `${Math.max(s.v > 0 ? 4 : 1, (s.v / max) * 100)}%`, opacity: s.v > 0 ? 1 : 0.25 }} />
                </div>
              ))}
            </div>
            <div className="flex gap-1 mt-1">
              {series.map((s, i) => <span key={s.date} className={`flex-1 text-center text-[9px] ${i === series.length - 1 ? 'text-accent-fg font-semibold' : 'text-subtle'}`}>{i === series.length - 1 ? '오늘' : s.date.slice(8)}</span>)}
            </div>
          </section>

          {/* 오늘 · 돈 흐름 */}
          <section className="grid md:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-line bg-surface p-4 space-y-2.5">
              <h2 className="text-sm font-semibold text-fg">오늘 현황</h2>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { icon: CreditCard, label: '안전결제', value: `${t.paidCount}건`, sub: P(t.paidAmount) },
                  { icon: PackageCheck, label: '구매확정', value: `${t.doneCount}건` },
                  { icon: ShoppingBag, label: '샵 주문', value: `${t.shopCount}건`, sub: P(t.shopAmount) },
                  { icon: MessageCircle, label: '채팅 메시지', value: `${t.chats}개`, sub: t.flaggedChats ? `주의 메시지 ${t.flaggedChats}` : undefined },
                  { icon: UserPlus, label: '신규 가입', value: `${t.signups}명` },
                  { icon: Tag, label: '새 상품', value: `${t.newListings}개` },
                ].map(s => (
                  <div key={s.label} className="rounded-xl bg-sunken px-3 py-2">
                    <p className="text-[11px] text-muted flex items-center gap-1"><s.icon size={12} />{s.label}</p>
                    <p className="text-base font-bold text-fg tabular-nums">{s.value}{s.sub && <span className="text-[10px] font-normal text-subtle ml-1.5">{s.sub}</span>}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-line bg-surface p-4 space-y-2.5">
              <h2 className="text-sm font-semibold text-fg">돈 흐름</h2>
              {[
                { icon: ShieldCheck, label: '안전결제 보관 중', value: P(data.money.escrowHeld), sub: '구매확정 시 판매자에게 정산', cls: 'text-emerald-300' },
                { icon: Wallet, label: '회원 보유 포인트 합계', value: P(data.money.totalBalance), sub: '환전 가능한 잔액 총합', cls: 'text-accent-soft' },
                { icon: Banknote, label: '환전 대기', value: P(data.money.pendingWithdrawAmount), sub: '승인·송금 대기', cls: 'text-amber-300' },
              ].map(x => (
                <div key={x.label} className="flex items-center gap-3 rounded-xl bg-sunken px-3 py-2.5">
                  <x.icon size={17} className={x.cls} />
                  <div className="min-w-0 flex-1"><p className="text-[11px] text-muted">{x.label}</p><p className="text-[10px] text-subtle">{x.sub}</p></div>
                  <p className={`font-bold tabular-nums ${x.cls}`}>{x.value}</p>
                </div>
              ))}
              <div className="grid grid-cols-3 gap-1.5 pt-1">
                {[
                  { href: '/admin/trades', label: '거래 관제', icon: ArrowLeftRight },
                  { href: '/admin/shop', label: '샵 관리', icon: Store },
                  { href: '/admin/withdrawal', label: '환전 관리', icon: Banknote },
                ].map(l => (
                  <Link key={l.href} href={l.href} className="h-9 rounded-lg border border-line text-[11px] text-fg-2 hover:text-fg hover:bg-surface-2 inline-flex items-center justify-center gap-1"><l.icon size={12} />{l.label}</Link>
                ))}
              </div>
            </div>
          </section>
        </div>

        {/* 실시간 활동 */}
        <section className="rounded-2xl border border-line bg-surface overflow-hidden xl:sticky xl:top-20">
          <div className="px-4 pt-3.5 pb-2.5 border-b border-line space-y-2">
            <h2 className="text-sm font-semibold text-fg flex items-center gap-2">실시간 활동 {live && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}</h2>
            <div className="flex flex-wrap gap-1">
              {FEED_FILTERS.map(([v, label]) => (
                <button key={v} onClick={() => setFeedFilter(v)} className={`h-7 px-2.5 rounded-full text-[11px] font-medium ${feedFilter === v ? 'bg-accent-tint text-accent-soft' : 'text-muted hover:text-fg'}`}>{label}</button>
              ))}
            </div>
          </div>
          <ul className="divide-y divide-line max-h-[640px] overflow-y-auto">
            {feed.length === 0 && <li className="px-4 py-10 text-center text-xs text-subtle">활동이 없어요.</li>}
            {feed.map(f => {
              const meta = FEED_META[f.type] ?? FEED_META.listing
              const isNew = fresh.has(feedKey(f))
              const body = (
                <>
                  <span className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center ${meta.cls}`}><meta.icon size={15} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-fg-2 truncate">{isNew && <span className="mr-1.5 px-1 rounded bg-accent text-white text-[9px] font-bold align-middle">NEW</span>}{f.title}</span>
                    {f.sub && <span className="block text-[11px] text-muted truncate">{f.sub}</span>}
                  </span>
                  <span className="text-[11px] text-subtle shrink-0">{timeAgo(f.at)}</span>
                </>
              )
              const cls = `flex items-center gap-3 px-4 py-2.5 transition-colors ${isNew ? 'bg-accent-tint/40' : ''}`
              return <li key={feedKey(f)}>{f.link ? <Link href={f.link} className={`${cls} hover:bg-surface-2`}>{body}</Link> : <div className={cls}>{body}</div>}</li>
            })}
          </ul>
        </section>
      </div>
    </div>
  )
}

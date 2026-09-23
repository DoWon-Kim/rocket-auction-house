'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { TrendingUp, TrendingDown, Minus, AlertCircle, ArrowUpRight } from 'lucide-react'

interface DayData {
  date: string   // YYYY-MM-DD (KST)
  avg: number
  min: number
  max: number
  count: number
  types: Record<string, number>
}

interface Summary {
  totalTrades: number
  avgPrice: number
  minPrice: number
  maxPrice: number
  days: number
}

interface MarketPoint { date: string; price: number; listings: string | null }

interface ChartData {
  history: DayData[]
  summary: Summary | null
  days: number
  market?: { source: string; label: string; url: string | null; history: MarketPoint[] }
}

const PERIODS = [
  { label: '7일',  value: 7 },
  { label: '30일', value: 30 },
  { label: '90일', value: 90 },
  { label: '1년',  value: 365 },
]

const MARKET_COLOR = '#38bdf8'

// KST 기준 오늘부터 과거 days일의 날짜 배열
function dayAxis(days: number): string[] {
  const today = new Date(Date.now() + 9 * 3600_000)
  const base = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  return Array.from({ length: days }, (_, i) => new Date(base - (days - 1 - i) * 86400_000).toISOString().slice(0, 10))
}

const md = (iso: string) => { const [, m, d] = iso.split('-'); return `${Number(m)}/${Number(d)}` }
const won = (v: number) => (v >= 10000 ? `${(v / 10000).toFixed(v >= 100000 ? 0 : 1)}만` : v.toLocaleString())

// ── SVG 차트 ──────────────────────────────────────────────────────────────────

const PAD = { top: 16, right: 12, bottom: 28, left: 48 }

function SvgChart({ axis, trades, market, showTrades, showMarket }: {
  axis: string[]; trades: DayData[]; market: MarketPoint[]; showTrades: boolean; showMarket: boolean
}) {
  const [hover, setHover] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  // 실제 픽셀 폭으로 그려 모바일에서도 글자 크기 유지
  const [W, setW] = useState(600)
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const H = W < 480 ? 180 : 210
  const INNER_W = W - PAD.left - PAD.right
  const INNER_H = H - PAD.top - PAD.bottom

  const idx = useMemo(() => new Map(axis.map((d, i) => [d, i])), [axis])
  const tradeByDay = useMemo(() => new Map(trades.map(t => [t.date, t])), [trades])
  const marketByDay = useMemo(() => new Map(market.map(m => [m.date, m])), [market])
  const tPts = trades.filter(t => idx.has(t.date))
  const mPts = market.filter(m => idx.has(m.date))

  const values = [
    ...(showTrades ? tPts.flatMap(t => [t.min, t.max]) : []),
    ...(showMarket ? mPts.map(m => m.price) : []),
  ]
  const lo = values.length ? Math.min(...values) : 0
  const hi = values.length ? Math.max(...values) : 1
  const padY = (hi - lo) * 0.08 || hi * 0.1 || 1
  const yMin = Math.max(0, lo - padY), yMax = hi + padY

  const x = (date: string) => PAD.left + ((idx.get(date) ?? 0) / Math.max(axis.length - 1, 1)) * INNER_W
  const y = (v: number) => PAD.top + INNER_H - ((v - yMin) / (yMax - yMin)) * INNER_H
  const line = (pts: Array<[string, number]>) => pts.map(([d, v], i) => `${i ? 'L' : 'M'}${x(d).toFixed(1)},${y(v).toFixed(1)}`).join(' ')

  const bandPath = tPts.length > 1
    ? `${line(tPts.map(t => [t.date, t.max]))} ${[...tPts].reverse().map(t => `L${x(t.date).toFixed(1)},${y(t.min).toFixed(1)}`).join(' ')} Z`
    : ''
  const yTicks = [yMin, (yMin + yMax) / 2, yMax]
  const xStep = Math.max(1, Math.ceil(axis.length / (W < 480 ? 4 : 6)))
  const xTicks = axis.filter((_, i) => i % xStep === 0 || i === axis.length - 1)
  const dense = axis.length > (W < 480 ? 20 : 45)

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const rel = ((e.clientX - rect.left) / rect.width) * W - PAD.left
    setHover(Math.max(0, Math.min(axis.length - 1, Math.round((rel / INNER_W) * (axis.length - 1)))))
  }

  const hDate = hover != null ? axis[hover] : null
  const hTrade = hDate ? tradeByDay.get(hDate) : undefined
  const hMarket = hDate ? marketByDay.get(hDate) : undefined
  const hx = hDate ? x(hDate) : 0

  return (
    <div ref={wrapRef} className="relative">
      <svg ref={svgRef} width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block w-full touch-none" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="phc-band" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0.04" />
          </linearGradient>
        </defs>

        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={PAD.left} y1={y(v)} x2={W - PAD.right} y2={y(v)} stroke="var(--color-line)" strokeDasharray={i ? '3 3' : undefined} />
            <text x={PAD.left - 6} y={y(v) + 3} textAnchor="end" fontSize={10} fill="var(--color-subtle)" className="tabular-nums">{won(Math.round(v))}</text>
          </g>
        ))}
        {xTicks.map(d => (
          <text key={d} x={x(d)} y={H - 8} textAnchor="middle" fontSize={10} fill="var(--color-subtle)">{md(d)}</text>
        ))}

        {showTrades && bandPath && <path d={bandPath} fill="url(#phc-band)" />}
        {showTrades && tPts.length > 1 && (
          <path d={line(tPts.map(t => [t.date, t.avg]))} fill="none" stroke="var(--color-accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        )}
        {showTrades && (tPts.length === 1 || !dense) && tPts.map(t => (
          <circle key={t.date} cx={x(t.date)} cy={y(t.avg)} r={3} fill="var(--color-accent)" stroke="var(--color-bg)" strokeWidth={1.5} />
        ))}

        {showMarket && mPts.length > 1 && (
          <path d={line(mPts.map(m => [m.date, m.price]))} fill="none" stroke={MARKET_COLOR} strokeWidth={1.75} strokeDasharray="5 3" strokeLinejoin="round" />
        )}
        {showMarket && (mPts.length === 1 || !dense) && mPts.map(m => (
          <circle key={m.date} cx={x(m.date)} cy={y(m.price)} r={2.5} fill={MARKET_COLOR} stroke="var(--color-bg)" strokeWidth={1.5} />
        ))}

        {hDate && (
          <>
            <line x1={hx} y1={PAD.top} x2={hx} y2={H - PAD.bottom} stroke="var(--color-line-strong)" strokeDasharray="3 3" />
            {showTrades && hTrade && <circle cx={hx} cy={y(hTrade.avg)} r={4} fill="var(--color-accent)" stroke="var(--color-bg)" strokeWidth={2} />}
            {showMarket && hMarket && <circle cx={hx} cy={y(hMarket.price)} r={4} fill={MARKET_COLOR} stroke="var(--color-bg)" strokeWidth={2} />}
          </>
        )}
      </svg>

      {hDate && (
        <div className="pointer-events-none absolute top-2 z-10 min-w-[150px] bg-bg/95 border border-line-strong rounded-xl px-3 py-2 shadow-2xl text-[11px] space-y-1"
          style={{ left: `${(hx / W) * 100}%`, transform: hx > W * 0.55 ? 'translateX(calc(-100% - 10px))' : 'translateX(10px)' }}>
          <p className="font-semibold text-fg">{hDate}</p>
          {showTrades && (hTrade ? (
            <div>
              <p className="text-accent-fg">체결 평균 <b className="tabular-nums">{hTrade.avg.toLocaleString()}P</b></p>
              <p className="text-subtle tabular-nums">{hTrade.min.toLocaleString()} ~ {hTrade.max.toLocaleString()}P · {hTrade.count}건</p>
            </div>
          ) : <p className="text-subtle">체결 없음</p>)}
          {showMarket && (hMarket ? (
            <p style={{ color: MARKET_COLOR }}>스니덩 최저 <b className="tabular-nums">₩{hMarket.price.toLocaleString()}</b>
              {hMarket.listings && hMarket.listings !== '0' && <span className="text-subtle"> · {hMarket.listings}건</span>}</p>
          ) : <p className="text-subtle">스니덩 기록 없음</p>)}
        </div>
      )}
    </div>
  )
}

// ── 메인 컴포넌트 ──────────────────────────────────────────────────────────────

function Trend({ from, to, days, unit }: { from: number; to: number; days: number; unit: string }) {
  const diff = to - from
  const pct = from > 0 ? ((diff / from) * 100).toFixed(1) : null
  const cls = diff > 0 ? 'text-red-400 bg-red-400/8 border-red-400/20' : diff < 0 ? 'text-emerald-400 bg-emerald-400/8 border-emerald-400/20' : 'text-subtle bg-surface-2 border-line'
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border ${cls}`}>
      {diff > 0 ? <TrendingUp size={12} /> : diff < 0 ? <TrendingDown size={12} /> : <Minus size={12} />}
      {days}일 {diff > 0 ? '+' : ''}{unit === '₩' ? `₩${diff.toLocaleString()}` : `${diff.toLocaleString()}P`}{pct !== null && ` (${diff >= 0 ? '+' : ''}${pct}%)`}
    </span>
  )
}

export function PriceHistoryChart({ cardId }: { cardId: string }) {
  const [days, setDays] = useState(30)
  const [showTrades, setShowTrades] = useState(true)
  const [showMarket, setShowMarket] = useState(true)

  const { data, isLoading } = useQuery<ChartData>({
    queryKey: ['price-history', cardId, days],
    queryFn: () => api.get(`/cards/${cardId}/price-history`, { params: { days } }).then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })

  const axis = useMemo(() => dayAxis(days), [days])
  const trades = data?.history ?? []
  const market = data?.market?.history ?? []
  const summary = data?.summary
  const hasTrades = trades.length > 0
  const hasMarket = market.length > 0
  const mFirst = market[0], mLast = market[market.length - 1]

  return (
    <div className="bg-surface border border-line rounded-xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-fg flex items-center gap-2">
          <TrendingUp size={15} className="text-accent-fg" />
          시세 히스토리
        </h2>
        <div className="flex gap-1">
          {PERIODS.map(p => (
            <button key={p.value} onClick={() => setDays(p.value)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all ${
                days === p.value ? 'bg-accent-tint text-accent-fg border-accent-line' : 'text-subtle border-line hover:border-accent-line hover:text-muted-2'
              }`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="h-[200px] bg-sunken rounded-lg animate-pulse" />
      ) : !hasTrades && !hasMarket ? (
        <div className="h-[200px] flex flex-col items-center justify-center gap-2 text-subtle">
          <AlertCircle size={24} className="opacity-40" />
          <p className="text-xs">최근 {days}일간 체결 내역과 참고 시세가 없습니다.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 text-[11px]">
            <button onClick={() => setShowTrades(v => !v)} disabled={!hasTrades} aria-pressed={showTrades}
              className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border transition-opacity ${showTrades && hasTrades ? 'border-accent-line text-fg-2' : 'border-line text-subtle opacity-60'}`}>
              <span className="w-3 h-0.5 rounded bg-accent" />체결가 (P){!hasTrades && ' · 없음'}
            </button>
            <button onClick={() => setShowMarket(v => !v)} disabled={!hasMarket} aria-pressed={showMarket}
              className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border transition-opacity ${showMarket && hasMarket ? 'border-sky-400/30 text-fg-2' : 'border-line text-subtle opacity-60'}`}>
              <span className="w-3 h-0 border-t-2 border-dashed" style={{ borderColor: MARKET_COLOR }} />스니덩 최저 호가 (₩){!hasMarket && ' · 없음'}
            </button>
          </div>

          <div className="bg-sunken rounded-xl p-2 overflow-hidden">
            <SvgChart axis={axis} trades={trades} market={market} showTrades={showTrades && hasTrades} showMarket={showMarket && hasMarket} />
          </div>

          {summary && (
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: '거래 수', value: summary.totalTrades.toLocaleString(), cls: 'text-fg' },
                { label: '평균가', value: `${summary.avgPrice.toLocaleString()}P`, cls: 'text-accent-fg' },
                { label: '최저', value: `${summary.minPrice.toLocaleString()}P`, cls: 'text-emerald-400' },
                { label: '최고', value: `${summary.maxPrice.toLocaleString()}P`, cls: 'text-red-400' },
              ].map(s => (
                <div key={s.label} className="text-center">
                  <p className="text-[10px] text-subtle uppercase tracking-wider mb-1">{s.label}</p>
                  <p className={`text-sm font-bold tabular-nums ${s.cls}`}>{s.value}</p>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {trades.length >= 2 && <Trend from={trades[0].avg} to={trades[trades.length - 1].avg} days={days} unit="P" />}
            {market.length >= 2 && mFirst && mLast && (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                스니덩 <Trend from={mFirst.price} to={mLast.price} days={days} unit="₩" />
              </span>
            )}
          </div>

          {hasMarket && (
            <p className="text-[11px] text-subtle leading-relaxed">
              스니덩 시세는 매일 수집한 최저 판매 호가로, 실제 체결가와 다를 수 있는 참고 정보입니다.
              {data?.market?.url && (
                <a href={data.market.url} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-0.5 text-sky-300 hover:underline">
                  스니덩에서 보기<ArrowUpRight size={11} />
                </a>
              )}
            </p>
          )}
        </>
      )}
    </div>
  )
}

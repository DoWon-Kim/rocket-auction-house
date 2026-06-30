'use client'

import { useState, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { TrendingUp, TrendingDown, Minus, AlertCircle } from 'lucide-react'

interface DayData {
  date: string
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

interface ChartData { history: DayData[]; summary: Summary | null; days: number }

const PERIODS = [
  { label: '7일',  value: 7 },
  { label: '30일', value: 30 },
  { label: '90일', value: 90 },
]

function formatDate(iso: string) {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

// ── SVG Line Chart ─────────────────────────────────────────────────────────────

const W = 600
const H = 180
const PAD = { top: 16, right: 16, bottom: 28, left: 60 }
const INNER_W = W - PAD.left - PAD.right
const INNER_H = H - PAD.top - PAD.bottom

function SvgChart({ history }: { history: DayData[] }) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; d: DayData } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const prices = history.flatMap(d => [d.min, d.max])
  const yMin   = Math.min(...prices)
  const yMax   = Math.max(...prices)
  const yRange = yMax - yMin || 1

  // X坐标: 均匀分布
  const xScale = (i: number) => PAD.left + (i / Math.max(history.length - 1, 1)) * INNER_W
  const yScale = (v: number) => PAD.top + INNER_H - ((v - yMin) / yRange) * INNER_H

  // avg 라인
  const avgPath = history.map((d, i) => `${i === 0 ? 'M' : 'L'}${xScale(i).toFixed(1)},${yScale(d.avg).toFixed(1)}`).join(' ')

  // min~max 영역 (shaded)
  const areaTop    = history.map((d, i) => `${i === 0 ? 'M' : 'L'}${xScale(i).toFixed(1)},${yScale(d.max).toFixed(1)}`).join(' ')
  const areaBottom = [...history].reverse().map((d, i) => `L${xScale(history.length - 1 - i).toFixed(1)},${yScale(d.min).toFixed(1)}`).join(' ')
  const areaPath   = `${areaTop} ${areaBottom} Z`

  // Y 눈금 (3개)
  const yTicks = [yMin, (yMin + yMax) / 2, yMax]

  // X 눈금 (최대 6개)
  const xStep = Math.max(1, Math.floor(history.length / 6))
  const xTicks = history.filter((_, i) => i % xStep === 0 || i === history.length - 1)

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg || history.length === 0) return
    const rect = svg.getBoundingClientRect()
    const svgX  = ((e.clientX - rect.left) / rect.width) * W
    const relX  = svgX - PAD.left
    const idx   = Math.round((relX / INNER_W) * (history.length - 1))
    const clamped = Math.max(0, Math.min(history.length - 1, idx))
    const d = history[clamped]
    setTooltip({
      x: xScale(clamped),
      y: yScale(d.avg),
      d,
    })
  }, [history])  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
      >
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#d4a853" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#d4a853" stopOpacity="0.03" />
          </linearGradient>
          <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="#d4a853" />
            <stop offset="100%" stopColor="#f0c060" />
          </linearGradient>
        </defs>

        {/* Y 그리드 + 레이블 */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line
              x1={PAD.left} y1={yScale(v)} x2={W - PAD.right} y2={yScale(v)}
              stroke="#2e2318" strokeWidth={1}
              strokeDasharray={i === 0 ? '0' : '3 3'}
            />
            <text
              x={PAD.left - 6} y={yScale(v) + 4}
              textAnchor="end" fontSize={9} fill="#5a4830"
              className="font-mono"
            >
              {v >= 10000 ? `${(v / 10000).toFixed(1)}만` : v.toLocaleString()}P
            </text>
          </g>
        ))}

        {/* X 눈금 */}
        {xTicks.map((d, i) => (
          <text
            key={i}
            x={xScale(history.indexOf(d))} y={H - 6}
            textAnchor="middle" fontSize={9} fill="#4a3820"
          >
            {formatDate(d.date)}
          </text>
        ))}

        {/* Min~Max 음영 영역 */}
        <path d={areaPath} fill="url(#areaGrad)" />

        {/* 평균 라인 */}
        <path d={avgPath} fill="none" stroke="url(#lineGrad)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {/* 데이터 포인트 (5개 이하일 때만) */}
        {history.length <= 14 && history.map((d, i) => (
          <circle key={i} cx={xScale(i)} cy={yScale(d.avg)} r={3}
            fill="#d4a853" stroke="#0f0b08" strokeWidth={1.5} />
        ))}

        {/* 툴팁 라인 */}
        {tooltip && (
          <>
            <line
              x1={tooltip.x} y1={PAD.top} x2={tooltip.x} y2={H - PAD.bottom}
              stroke="#d4a853" strokeWidth={1} strokeDasharray="3 3" opacity={0.6}
            />
            <circle cx={tooltip.x} cy={tooltip.y} r={4}
              fill="#d4a853" stroke="#0f0b08" strokeWidth={2} />
          </>
        )}
      </svg>

      {/* 툴팁 박스 */}
      {tooltip && (
        <div
          className="pointer-events-none absolute z-10 min-w-[140px] bg-[#0f0b08] border border-[#3a2810] rounded-xl px-3 py-2 shadow-2xl text-xs"
          style={{
            left: `${(tooltip.x / W) * 100}%`,
            top:  `${(tooltip.y / H) * 100}%`,
            transform: tooltip.x > W * 0.6 ? 'translate(-110%, -50%)' : 'translate(12px, -50%)',
          }}
        >
          <p className="font-semibold text-[#d4a853] mb-1">{tooltip.d.date}</p>
          <div className="space-y-0.5 text-[11px]">
            <p className="text-[#f5ead8]">평균 <span className="font-bold tabular-nums">{tooltip.d.avg.toLocaleString()}P</span></p>
            <p className="text-[#7a6040]">
              범위 <span className="tabular-nums">{tooltip.d.min.toLocaleString()}P ~ {tooltip.d.max.toLocaleString()}P</span>
            </p>
            <p className="text-[#5a4830]">거래 {tooltip.d.count}건</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 메인 컴포넌트 ──────────────────────────────────────────────────────────────

export function PriceHistoryChart({ cardId }: { cardId: string }) {
  const [days, setDays] = useState(30)

  const { data, isLoading } = useQuery<ChartData>({
    queryKey: ['price-history', cardId, days],
    queryFn: () => api.get(`/cards/${cardId}/price-history`, { params: { days } }).then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })

  const history = data?.history ?? []
  const summary = data?.summary

  // 가격 추이 계산 (첫날 → 마지막날)
  const trend = history.length >= 2
    ? history[history.length - 1].avg - history[0].avg
    : null

  const trendPct = trend !== null && history[0].avg > 0
    ? ((trend / history[0].avg) * 100).toFixed(1)
    : null

  return (
    <div className="bg-[#1a1410] border border-[#2e2318] rounded-xl p-5 space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[#f5ead8] flex items-center gap-2">
          <TrendingUp size={15} className="text-[#d4a853]" />
          체결 가격 히스토리
        </h2>
        {/* 기간 선택 */}
        <div className="flex gap-1">
          {PERIODS.map(p => (
            <button
              key={p.value}
              onClick={() => setDays(p.value)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all ${
                days === p.value
                  ? 'bg-[#2a1c08] text-[#d4a853] border-[#3a2810]'
                  : 'text-[#5a4830] border-[#2e2318] hover:border-[#3a2810] hover:text-[#7a6040]'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* 로딩 */}
      {isLoading ? (
        <div className="h-[180px] bg-[#150f0c] rounded-lg animate-pulse" />
      ) : history.length === 0 ? (
        <div className="h-[180px] flex flex-col items-center justify-center gap-2 text-[#4a3820]">
          <AlertCircle size={24} className="opacity-40" />
          <p className="text-xs">최근 {days}일간 체결 내역이 없습니다.</p>
        </div>
      ) : (
        <>
          {/* 차트 */}
          <div className="bg-[#110d08] rounded-xl p-2 overflow-hidden">
            <SvgChart history={history} />
          </div>

          {/* 요약 통계 */}
          {summary && (
            <div className="grid grid-cols-4 gap-2">
              <div className="text-center">
                <p className="text-[10px] text-[#5a4830] uppercase tracking-wider mb-1">거래 수</p>
                <p className="text-sm font-bold text-[#f5ead8] tabular-nums">{summary.totalTrades.toLocaleString()}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-[#5a4830] uppercase tracking-wider mb-1">평균가</p>
                <p className="text-sm font-bold text-[#d4a853] tabular-nums">{summary.avgPrice.toLocaleString()}P</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-[#5a4830] uppercase tracking-wider mb-1">최저</p>
                <p className="text-sm font-bold text-emerald-400 tabular-nums">{summary.minPrice.toLocaleString()}P</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-[#5a4830] uppercase tracking-wider mb-1">최고</p>
                <p className="text-sm font-bold text-red-400 tabular-nums">{summary.maxPrice.toLocaleString()}P</p>
              </div>
            </div>
          )}

          {/* 추이 배지 */}
          {trend !== null && trendPct !== null && (
            <div className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border w-fit ${
              trend > 0
                ? 'text-red-400 bg-red-400/8 border-red-400/20'
                : trend < 0
                ? 'text-emerald-400 bg-emerald-400/8 border-emerald-400/20'
                : 'text-[#5a4830] bg-[#1a1208] border-[#2e2318]'
            }`}>
              {trend > 0 ? <TrendingUp size={12} /> : trend < 0 ? <TrendingDown size={12} /> : <Minus size={12} />}
              {days}일간{' '}
              {trend > 0 ? '+' : ''}{trend.toLocaleString()}P ({trend >= 0 ? '+' : ''}{trendPct}%)
            </div>
          )}
        </>
      )}
    </div>
  )
}

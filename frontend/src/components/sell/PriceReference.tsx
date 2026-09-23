'use client'

import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ArrowUpRight, Sparkles, TrendingUp } from 'lucide-react'
import { api } from '@/lib/api'

// 판매 등록용 참고 시세 (GET /cards/:id/price-reference, 그레이딩 제외 기준)

export interface PriceReference {
  trades: { count: number; median: number; avg: number; min: number; max: number; last: { price: number; date: string }; days: number } | null
  active: { count: number; minBuyNow: number } | null
  market: { source: 'SNKRDUNK'; price: number; listings: string | null; updatedAt: string; url: string | null; stale: boolean } | null
  suggested: { price: number; basis: 'TRADES' | 'MARKET' | 'FEW_TRADES' } | null
}

export const BASIS_LABEL: Record<NonNullable<PriceReference['suggested']>['basis'], string> = {
  TRADES: '최근 체결 중앙값',
  MARKET: '스니덩 최저 호가',
  FEW_TRADES: '최근 체결 (표본 적음)',
}

export function usePriceReference(cardId: string | null | undefined) {
  return useQuery<PriceReference>({
    queryKey: ['price-reference', cardId],
    queryFn: () => api.get(`/cards/${cardId}/price-reference`).then(r => r.data),
    enabled: !!cardId,
    staleTime: 5 * 60 * 1000,
  })
}

// 입력가가 추천가에서 얼마나 벗어났는지 (오타·실수 방지 경고용)
export function priceDeviation(value: number, reference: number | null | undefined) {
  if (!reference || !value || value <= 0) return null
  const ratio = value / reference
  return {
    pct: Math.round((ratio - 1) * 100),
    level: ratio < 0.5 ? 'low' as const : ratio > 2 ? 'high' as const : null,
  }
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })

type Mode = 'BUY_NOW' | 'AUCTION' | 'OFFER'

const APPLY_LABEL: Record<Mode, string> = { BUY_NOW: '판매가로', AUCTION: '시작가로', OFFER: '최소 제안가로' }

// 가격 입력 옆 참고 시세 패널
export function PriceReferencePanel({ cardId, mode, value, onApply, graded }: {
  cardId: string
  mode: Mode
  value: number
  onApply: (price: number) => void
  graded: boolean
}) {
  const { data, isLoading } = usePriceReference(cardId)

  if (isLoading) return <div className="h-24 rounded-xl bg-sunken animate-pulse" />
  if (!data || (!data.trades && !data.market && !data.active)) {
    return (
      <p className="text-xs text-subtle rounded-xl border border-line bg-surface/60 px-4 py-3">
        아직 이 카드의 거래 기록이나 참고 시세가 없어요. 비슷한 카드의 판매가를 참고해 주세요.
      </p>
    )
  }

  const dev = priceDeviation(value, data.suggested?.price)
  // 경매 시작가·최소 제안가는 낮게 잡는 게 일반적이라 '높음'만 경고
  const warn = dev?.level === 'high' || (dev?.level === 'low' && mode === 'BUY_NOW') ? dev.level : null

  const rows: Array<{ key: string; label: string; price: number; sub: string; href?: string | null; unit: 'P' | '₩' }> = []
  if (data.trades) rows.push({
    key: 'trades', label: '최근 체결가', price: data.trades.median, unit: 'P',
    sub: `${data.trades.days}일간 ${data.trades.count}건 · 최근 ${data.trades.last.price.toLocaleString()}P (${fmtDate(data.trades.last.date)})`,
  })
  if (data.active) rows.push({
    key: 'active', label: '현재 최저 판매가', price: data.active.minBuyNow, unit: 'P',
    sub: `즉시구매 매물 ${data.active.count}건`,
  })
  if (data.market) rows.push({
    key: 'market', label: '스니덩 최저 호가', price: data.market.price, unit: '₩', href: data.market.url,
    sub: `${fmtDate(data.market.updatedAt)} 기준${data.market.listings && data.market.listings !== '0' ? ` · 매물 ${data.market.listings}건` : ''}${data.market.stale ? ' · 오래된 정보' : ''}`,
  })

  return (
    <div className="rounded-xl border border-line bg-surface/60 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-line text-xs font-semibold text-fg-2">
        <TrendingUp size={13} className="text-accent-fg" />참고 시세
        {graded && <span className="font-normal text-subtle">· 그레이딩 없는 카드 기준이라 등급 카드는 다를 수 있어요</span>}
      </div>

      {data.suggested && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-accent/5 border-b border-line">
          <Sparkles size={15} className="text-accent-fg shrink-0" />
          <div className="min-w-0">
            <p className="text-sm text-fg">추천가 <b className="tabular-nums">{data.suggested.price.toLocaleString()}P</b></p>
            <p className="text-[11px] text-subtle">{BASIS_LABEL[data.suggested.basis]} 기준</p>
          </div>
          <button type="button" onClick={() => onApply(data.suggested!.price)}
            className="ml-auto h-8 px-3 rounded-lg bg-accent/15 text-accent-fg text-xs font-semibold hover:bg-accent/25">
            {APPLY_LABEL[mode]} 적용
          </button>
        </div>
      )}

      <ul className="divide-y divide-line">
        {rows.map(r => (
          <li key={r.key} className="flex items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted">{r.label}</p>
              <p className="text-[11px] text-subtle truncate">{r.sub}</p>
            </div>
            <span className="text-sm font-semibold text-fg tabular-nums">{r.unit === '₩' ? `₩${r.price.toLocaleString()}` : `${r.price.toLocaleString()}P`}</span>
            {r.href && (
              <a href={r.href} target="_blank" rel="noreferrer" aria-label="스니덩에서 보기" className="text-subtle hover:text-sky-300"><ArrowUpRight size={14} /></a>
            )}
            <button type="button" onClick={() => onApply(r.price)}
              className="h-7 px-2 rounded-md border border-line text-[11px] text-fg-3 hover:text-fg hover:bg-surface-2">적용</button>
          </li>
        ))}
      </ul>

      {dev && (
        <div className={`flex items-start gap-2 px-4 py-2.5 border-t border-line text-xs ${warn ? 'bg-amber-500/10 text-amber-200' : 'text-muted'}`}>
          {warn && <AlertTriangle size={14} className="shrink-0 mt-px" />}
          <span>
            입력한 금액은 추천가보다 <b className="tabular-nums">{dev.pct > 0 ? '+' : ''}{dev.pct}%</b>
            {warn === 'low' && ' — 시세의 절반도 안 돼요. 0이 빠지지 않았는지 확인해 주세요.'}
            {warn === 'high' && ' — 시세의 2배가 넘어요. 거래가 잘 안 될 수 있어요.'}
          </span>
        </div>
      )}
      <p className="px-4 py-2 border-t border-line text-[10px] text-subtle">1P = 1원 · 스니덩 시세는 외부 참고 정보로 실제 체결가와 다를 수 있어요.</p>
    </div>
  )
}

// 카드 선택 직후 한 줄 요약
export function PriceReferenceSummary({ cardId }: { cardId: string }) {
  const { data } = usePriceReference(cardId)
  if (!data?.suggested) return null
  return (
    <p className="text-xs text-muted mt-1.5">
      참고 시세 <b className="text-fg tabular-nums">{data.suggested.price.toLocaleString()}P</b>
      <span className="text-subtle"> · {BASIS_LABEL[data.suggested.basis]}</span>
    </p>
  )
}

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { ArrowUpRight, Check, Link2, Plus, RefreshCw, Search, Unlink, EyeOff, RotateCcw, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { TCG_LABELS } from '@/lib/utils'
import { useAuthStore } from '@/lib/store'

type Status = 'PENDING' | 'LINKED' | 'IGNORED'

interface CardBrief {
  id: string
  name: string
  nameJa: string | null
  nameKo: string | null
  setName: string
  setCode: string | null
  cardNumber: string | null
  rarity: string
  imageUrl: string | null
  tcgType: string
}

interface Candidate { card: CardBrief; score: number; setMatch: boolean; numberMatch: boolean; langMatch: boolean }

interface SourceItem {
  id: string
  externalId: string
  tcgType: string
  lang: string | null
  productCode: string | null
  rawName: string
  name: string
  setName: string | null
  setCode: string | null
  cardNumber: string | null
  imageUrl: string | null
  price: number | null
  listings: string | null
  status: Status
  matchMethod: 'AUTO' | 'MANUAL' | 'CREATED' | 'LEGACY' | null
  card: CardBrief | null
  productUrl: string
  candidates: Candidate[]
  updatedAt: string
}

interface ListResponse { items: SourceItem[]; total: number; counts: Record<Status, number> }

const TABS: { value: Status; label: string }[] = [
  { value: 'PENDING', label: '검수 대기' },
  { value: 'LINKED',  label: '연결됨' },
  { value: 'IGNORED', label: '무시됨' },
]

const METHOD_LABEL: Record<string, string> = { AUTO: '자동', MANUAL: '수동', CREATED: '신규 등록', LEGACY: '이전 임포트' }
const LANG_LABEL: Record<string, string> = { ja: '일판', en: '영문판', ko: '한판' }
const LIMIT = 20

const priceText = (p: number | null, listings: string | null) =>
  p == null ? '시세 없음' : p > 0 ? `₩${p.toLocaleString()}${listings && listings !== '0' ? ` · ${listings}건` : ''}` : '매물 없음'

function Thumb({ src, className = 'w-14 h-[78px]' }: { src: string | null; className?: string }) {
  return src
    // eslint-disable-next-line @next/next/no-img-element -- 외부 소스 이미지 호스트가 다양해 next/image 대신 사용
    ? <img src={src} alt="" loading="lazy" className={`${className} shrink-0 object-contain rounded-md bg-sunken border border-line`} />
    : <div className={`${className} shrink-0 rounded-md bg-sunken border border-line`} />
}

function Chip({ ok, children }: { ok?: boolean; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 h-5 px-1.5 rounded-md text-[10px] font-semibold ${ok ? 'bg-emerald-500/15 text-emerald-300' : 'bg-surface-2 text-muted'}`}>
      {ok && <Check size={10} />}{children}
    </span>
  )
}

function CardLine({ card }: { card: CardBrief }) {
  return (
    <div className="min-w-0">
      <p className="text-sm font-medium text-fg truncate">{card.name}</p>
      {(card.nameKo || card.nameJa) && card.name !== (card.nameKo ?? card.nameJa) && (
        <p className="text-xs text-muted truncate">{card.nameKo ?? card.nameJa}</p>
      )}
      <p className="text-[11px] text-subtle truncate">{card.setName} · {card.setCode ?? '-'} #{card.cardNumber ?? '-'} · {card.rarity}</p>
    </div>
  )
}

// 수동 검색 후 연결
function CardSearch({ tcgType, onPick, busy }: { tcgType: string; onPick: (cardId: string) => void; busy: boolean }) {
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const { data, isFetching } = useQuery<{ cards: CardBrief[] }>({
    queryKey: ['admin', 'card-search', tcgType, term],
    queryFn: () => api.get('/admin/cards', { params: { q: term, tcgType, limit: 8 } }).then(r => r.data),
    enabled: term.length > 0,
  })
  return (
    <div className="rounded-xl border border-line bg-sunken/60 p-3 space-y-2">
      <form onSubmit={e => { e.preventDefault(); setTerm(q.trim()) }} className="flex gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="카드명·세트코드·번호로 검색" autoFocus
          className="flex-1 h-9 bg-surface border border-line focus:border-accent/60 rounded-lg px-3 text-sm text-fg placeholder:text-subtle focus:outline-none" />
        <button className="h-9 px-3 rounded-lg bg-surface-2 border border-line text-sm text-fg-2 inline-flex items-center gap-1.5">
          {isFetching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}검색
        </button>
      </form>
      {data && (data.cards.length === 0
        ? <p className="text-xs text-muted px-1">검색 결과가 없습니다.</p>
        : <ul className="divide-y divide-line">
            {data.cards.map(c => (
              <li key={c.id} className="flex items-center gap-3 py-2">
                <Thumb src={c.imageUrl} className="w-9 h-[50px]" />
                <CardLine card={c} />
                <button disabled={busy} onClick={() => onPick(c.id)}
                  className="ml-auto shrink-0 h-8 px-3 rounded-lg bg-accent/15 text-accent-fg text-xs font-semibold hover:bg-accent/25 disabled:opacity-50">연결</button>
              </li>
            ))}
          </ul>)}
    </div>
  )
}

function ItemRow({ item, selected, onSelect, onDone }: {
  item: SourceItem; selected: boolean; onSelect: (v: boolean) => void; onDone: () => void
}) {
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const act = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: onDone,
    onError: (e: { response?: { data?: { message?: string } } }) => setError(e.response?.data?.message ?? '처리에 실패했습니다.'),
  })
  const link = (cardId: string) => act.mutate(() => api.post(`/admin/card-sources/${item.id}/link`, { cardId }))
  const bulk = (action: 'ignore' | 'reopen') => act.mutate(() => api.post('/admin/card-sources/bulk', { ids: [item.id], action }))

  return (
    <li className="p-4 sm:p-5 space-y-3">
      <div className="flex gap-3">
        <input type="checkbox" checked={selected} onChange={e => onSelect(e.target.checked)} aria-label="선택"
          className="mt-1 h-4 w-4 accent-[var(--color-accent)] shrink-0" />
        <Thumb src={item.imageUrl} />
        <div className="min-w-0 flex-1 space-y-1.5">
          <a href={item.productUrl} target="_blank" rel="noreferrer"
            className="group inline-flex items-start gap-1 text-sm font-medium text-fg hover:text-accent-fg">
            <span className="break-words">{item.rawName}</span>
            <ArrowUpRight size={13} className="mt-0.5 shrink-0 opacity-60 group-hover:opacity-100" />
          </a>
          <div className="flex flex-wrap gap-1.5">
            <Chip>{TCG_LABELS[item.tcgType as keyof typeof TCG_LABELS] ?? item.tcgType}</Chip>
            {item.lang && <Chip>{LANG_LABEL[item.lang] ?? item.lang}</Chip>}
            <Chip>세트 {item.setCode ?? '인식 실패'}</Chip>
            <Chip>번호 {item.cardNumber ?? '인식 실패'}</Chip>
            <span className="text-xs font-semibold text-sky-300 tabular-nums self-center">{priceText(item.price, item.listings)}</span>
          </div>
        </div>
      </div>

      {item.status === 'LINKED' && item.card && (
        <div className="flex items-center gap-3 rounded-xl border border-line bg-sunken/50 p-3 sm:ml-7">
          <Link2 size={14} className="text-emerald-300 shrink-0" />
          <Thumb src={item.card.imageUrl} className="w-9 h-[50px]" />
          <CardLine card={item.card} />
          {item.matchMethod && <span className="shrink-0 text-[10px] font-semibold px-1.5 h-5 inline-flex items-center rounded-md bg-surface-2 text-fg-3">{METHOD_LABEL[item.matchMethod]}</span>}
          <Link href={`/cards/${item.card.id}`} target="_blank" className="shrink-0 text-xs text-muted hover:text-fg">카드 보기</Link>
          <button disabled={act.isPending} onClick={() => bulk('reopen')}
            className="ml-auto shrink-0 h-8 px-3 rounded-lg border border-line text-xs text-fg-3 hover:text-fg inline-flex items-center gap-1.5 disabled:opacity-50">
            <Unlink size={13} />연결 해제
          </button>
        </div>
      )}

      {item.status === 'PENDING' && (
        <div className="sm:ml-7 space-y-2">
          {item.candidates.length > 0 ? (
            <div className="grid gap-2 lg:grid-cols-3">
              {item.candidates.map(c => (
                <div key={c.card.id} className="flex gap-2.5 rounded-xl border border-line bg-sunken/50 p-2.5">
                  <Thumb src={c.card.imageUrl} className="w-10 h-14" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <CardLine card={c.card} />
                    <div className="flex flex-wrap gap-1">
                      <Chip ok={c.setMatch}>세트</Chip><Chip ok={c.numberMatch}>번호</Chip>
                      {c.langMatch && <Chip ok>같은 언어판</Chip>}
                    </div>
                  </div>
                  <button disabled={act.isPending} onClick={() => link(c.card.id)}
                    className="self-center shrink-0 h-8 px-3 rounded-lg bg-accent/15 text-accent-fg text-xs font-semibold hover:bg-accent/25 disabled:opacity-50">연결</button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted">추천 후보가 없습니다. 아직 카드 DB에 없는 세트일 수 있어요. 세트를 임포트한 뒤 &lsquo;다시 매칭&rsquo;을 누르거나 신규 카드로 등록하세요.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setSearching(s => !s)}
              className="h-8 px-3 rounded-lg border border-line text-xs text-fg-2 hover:bg-surface-2 inline-flex items-center gap-1.5">
              <Search size={13} />직접 검색해서 연결
            </button>
            <button disabled={act.isPending} onClick={() => act.mutate(() => api.post(`/admin/card-sources/${item.id}/create`))}
              className="h-8 px-3 rounded-lg border border-line text-xs text-fg-2 hover:bg-surface-2 inline-flex items-center gap-1.5 disabled:opacity-50">
              <Plus size={13} />신규 카드로 등록
            </button>
            <button disabled={act.isPending} onClick={() => bulk('ignore')}
              className="h-8 px-3 rounded-lg border border-line text-xs text-muted hover:text-fg inline-flex items-center gap-1.5 disabled:opacity-50">
              <EyeOff size={13} />무시
            </button>
          </div>
          {searching && <CardSearch tcgType={item.tcgType} busy={act.isPending} onPick={link} />}
        </div>
      )}

      {item.status === 'IGNORED' && (
        <div className="sm:ml-7">
          <button disabled={act.isPending} onClick={() => bulk('reopen')}
            className="h-8 px-3 rounded-lg border border-line text-xs text-fg-2 hover:bg-surface-2 inline-flex items-center gap-1.5 disabled:opacity-50">
            <RotateCcw size={13} />다시 검수
          </button>
        </div>
      )}

      {error && <p className="sm:ml-7 text-xs text-rose-300">{error}</p>}
    </li>
  )
}

// ── 동기화 상태 ───────────────────────────────────────────────────────────────

interface SyncRun {
  id: string
  trigger: 'SCHEDULE' | 'MANUAL'
  status: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED'
  startedAt: string
  finishedAt: string | null
  stats: (Partial<Record<'fetched' | 'updated' | 'linked' | 'queued' | 'ignored' | 'errors' | 'durationSec', number>> & { progress?: Record<string, unknown> }) | null
  warnings: string[]
  error: string | null
}

interface SyncStatus {
  schedule: { enabled: boolean; hourKst: number; nextRunAt: string | null }
  runs: SyncRun[]
  running: SyncRun | null
  snapshotDays: number
  snapshotCards: number
}

const RUN_STATUS: Record<SyncRun['status'], { label: string; cls: string }> = {
  RUNNING:   { label: '실행 중', cls: 'bg-sky-500/15 text-sky-300' },
  SUCCESS:   { label: '성공',   cls: 'bg-emerald-500/15 text-emerald-300' },
  FAILED:    { label: '실패',   cls: 'bg-rose-500/15 text-rose-300' },
  CANCELLED: { label: '취소',   cls: 'bg-surface-2 text-muted' },
}

const fmtTime = (iso: string) => new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
const fmtDur = (s?: number) => (s == null ? '-' : s >= 60 ? `${Math.floor(s / 60)}분 ${s % 60}초` : `${s}초`)

function SyncPanel({ onFinished }: { onFinished: () => void }) {
  const qc = useQueryClient()
  const isSuper = useAuthStore(s => s.user?.role === 'SUPER_ADMIN')
  const [error, setError] = useState('')
  const [wasRunning, setWasRunning] = useState(false)
  const { data } = useQuery<SyncStatus>({
    queryKey: ['admin', 'card-sources-sync'],
    queryFn: () => api.get('/admin/card-sources/sync').then(r => r.data),
    refetchInterval: q => (q.state.data?.running ? 4000 : 60_000),
  })

  // 실행이 끝나면 목록 갱신 (렌더 중 이전 값과 비교해 상태 조정)
  const running = data?.running ?? null
  if (!!running !== wasRunning) {
    setWasRunning(!!running)
    if (!running && wasRunning) onFinished()
  }

  const start = useMutation({
    mutationFn: () => api.post('/admin/card-sources/sync'),
    onSuccess: () => { setError(''); qc.invalidateQueries({ queryKey: ['admin', 'card-sources-sync'] }) },
    onError: (e: { response?: { data?: { message?: string } } }) => setError(e.response?.data?.message ?? '동기화를 시작하지 못했습니다.'),
  })
  const cancel = useMutation({
    mutationFn: (id: string) => api.post(`/admin/card-sources/sync/${id}/cancel`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'card-sources-sync'] }),
  })

  if (!data) return <div className="h-28 rounded-2xl border border-line bg-surface animate-pulse" />
  const { schedule } = data
  const progress = running?.stats?.progress

  return (
    <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="text-sm font-semibold text-fg">스니덩 시세 동기화</h2>
        <span className={`text-[11px] font-semibold px-2 h-6 inline-flex items-center rounded-md ${schedule.enabled ? 'bg-emerald-500/15 text-emerald-300' : 'bg-surface-2 text-muted'}`}>
          {schedule.enabled ? `자동 · 매일 ${schedule.hourKst}시 (KST)` : '자동 동기화 꺼짐'}
        </span>
        {schedule.enabled && schedule.nextRunAt && <span className="text-xs text-muted">다음 실행 {fmtTime(schedule.nextRunAt)}</span>}
        <span className="text-xs text-subtle">시세 기록 {data.snapshotDays.toLocaleString()}일 · 시세 있는 카드 {data.snapshotCards.toLocaleString()}장</span>
        {isSuper && (
          <div className="sm:ml-auto flex gap-2">
            {running ? (
              <button disabled={cancel.isPending} onClick={() => cancel.mutate(running.id)}
                className="h-9 px-3.5 rounded-xl border border-line text-sm text-fg-2 hover:bg-surface-2 disabled:opacity-50">취소</button>
            ) : (
              <button disabled={start.isPending} onClick={() => start.mutate()}
                className="h-9 px-3.5 rounded-xl bg-accent/15 text-accent-fg text-sm font-semibold hover:bg-accent/25 inline-flex items-center gap-1.5 disabled:opacity-50">
                <RefreshCw size={14} />지금 동기화
              </button>
            )}
          </div>
        )}
      </div>
      {!schedule.enabled && (
        <p className="text-xs text-subtle">서버 환경변수 <code className="text-fg-3">SNKRDUNK_SYNC_ENABLED=true</code>로 켤 수 있습니다 (운영 환경은 기본 켜짐).</p>
      )}
      {error && <p className="text-xs text-rose-300">{error}</p>}

      {running && (
        <div className="flex items-center gap-3 rounded-xl border border-sky-400/20 bg-sky-500/5 px-4 py-3 text-sm">
          <Loader2 size={16} className="animate-spin text-sky-300 shrink-0" />
          <span className="text-fg-2">
            {fmtTime(running.startedAt)} 시작 ·{' '}
            {progress
              ? `${String(progress.brand ?? '')} ${progress.page ? `${String(progress.page)}페이지` : ''} · 갱신 ${Number(progress.updated ?? 0).toLocaleString()} · 연결 ${Number(progress.linked ?? 0).toLocaleString()} · 대기 ${Number(progress.queued ?? 0).toLocaleString()}`
              : '준비 중…'}
          </span>
        </div>
      )}

      {data.runs.length > 0 && (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-xs min-w-[640px]">
            <thead>
              <tr className="text-left text-subtle">
                {['시작', '방식', '상태', '소요', '조회', '가격 갱신', '새 연결', '대기', '비고'].map(h => <th key={h} className="px-1 py-1.5 font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.runs.map(r => (
                <tr key={r.id} className="text-fg-3 align-top">
                  <td className="px-1 py-2 whitespace-nowrap">{fmtTime(r.startedAt)}</td>
                  <td className="px-1 py-2">{r.trigger === 'SCHEDULE' ? '자동' : '수동'}</td>
                  <td className="px-1 py-2"><span className={`px-1.5 py-0.5 rounded-md font-semibold ${RUN_STATUS[r.status].cls}`}>{RUN_STATUS[r.status].label}</span></td>
                  <td className="px-1 py-2 tabular-nums">{r.status === 'RUNNING' ? '-' : fmtDur(r.stats?.durationSec)}</td>
                  {(['fetched', 'updated', 'linked', 'queued'] as const).map(k => (
                    <td key={k} className="px-1 py-2 tabular-nums">{r.stats?.[k]?.toLocaleString() ?? '-'}</td>
                  ))}
                  <td className="px-1 py-2 max-w-[280px]">
                    {r.error && <p className="text-rose-300">{r.error}</p>}
                    {r.warnings.map((w, i) => <p key={i} className="text-amber-300">⚠ {w}</p>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export default function AdminCardSourcesPage() {
  const qc = useQueryClient()
  const [status, setStatus] = useState<Status>('PENDING')
  const [tcgType, setTcgType] = useState('')
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [notice, setNotice] = useState('')

  const queryKey = ['admin', 'card-sources', status, tcgType, term, page]
  const { data, isLoading, isFetching } = useQuery<ListResponse>({
    queryKey,
    queryFn: () => api.get('/admin/card-sources', { params: { status, tcgType: tcgType || undefined, q: term || undefined, page, limit: LIMIT } }).then(r => r.data),
    placeholderData: keepPreviousData,
  })

  const refresh = () => { setSelected(new Set()); qc.invalidateQueries({ queryKey: ['admin', 'card-sources'] }) }

  const bulk = useMutation({
    mutationFn: (action: 'ignore' | 'reopen') => api.post('/admin/card-sources/bulk', { ids: [...selected], action }),
    onSuccess: refresh,
  })
  const rematch = useMutation({
    mutationFn: (ids?: string[]) => api.post<{ checked: number; linked: number }>('/admin/card-sources/rematch', { ids }).then(r => r.data),
    onSuccess: r => { setNotice(`${r.checked.toLocaleString()}건 확인 · ${r.linked.toLocaleString()}건 자동 연결`); refresh() },
  })

  const items = data?.items ?? []
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / LIMIT))
  const allSelected = items.length > 0 && items.every(i => selected.has(i.id))
  const switchTab = (s: Status) => { setStatus(s); setPage(1); setSelected(new Set()); setNotice('') }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] sm:text-3xl font-bold tracking-tight text-fg">카드 매칭 검수</h1>
          <p className="text-sm text-muted mt-1 max-w-2xl">
            외부 시세 소스(스니덩) 상품을 카드 DB와 연결합니다. 세트 코드와 카드 번호가 정확히 일치하는 상품만 자동 연결되고,
            나머지는 여기서 연결·신규 등록·무시를 결정합니다. 동기화는 <Link href="/admin/cards" className="text-accent-fg hover:underline">카드 관리</Link>에서 실행합니다.
          </p>
        </div>
        <button disabled={rematch.isPending} onClick={() => rematch.mutate(undefined)}
          className="h-10 px-4 rounded-xl bg-surface border border-line hover:border-line-strong text-sm text-fg-2 inline-flex items-center gap-2 disabled:opacity-50">
          <RefreshCw size={15} className={rematch.isPending ? 'animate-spin' : ''} />대기 항목 다시 매칭
        </button>
      </div>

      <SyncPanel onFinished={refresh} />

      {notice && <p className="text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-400/20 rounded-xl px-4 py-2.5">{notice}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-xl bg-surface border border-line p-1">
          {TABS.map(t => (
            <button key={t.value} onClick={() => switchTab(t.value)}
              className={`h-8 px-3 rounded-lg text-sm transition-colors ${status === t.value ? 'bg-surface-2 text-fg font-semibold' : 'text-muted hover:text-fg'}`}>
              {t.label} <span className="tabular-nums text-xs text-subtle">{data?.counts[t.value]?.toLocaleString() ?? '-'}</span>
            </button>
          ))}
        </div>
        <select value={tcgType} onChange={e => { setTcgType(e.target.value); setPage(1) }} aria-label="TCG 종류"
          className="h-10 bg-surface border border-line rounded-xl px-3 text-sm text-fg-2 focus:outline-none cursor-pointer">
          <option value="">전체 TCG</option>
          <option value="POKEMON">{TCG_LABELS.POKEMON}</option>
          <option value="YUGIOH">{TCG_LABELS.YUGIOH}</option>
        </select>
        <form onSubmit={e => { e.preventDefault(); setTerm(q.trim()); setPage(1) }} className="flex-1 min-w-[200px] relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="상품명·세트코드·번호 검색"
            className="w-full h-10 bg-surface border border-line focus:border-accent/60 rounded-xl pl-9 pr-3 text-sm text-fg placeholder:text-subtle focus:outline-none" />
        </form>
      </div>

      <section className="rounded-2xl border border-line bg-surface overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-4 sm:px-5 py-3 border-b border-line bg-surface-2/40">
          <label className="inline-flex items-center gap-2 text-xs text-muted cursor-pointer">
            <input type="checkbox" checked={allSelected} className="h-4 w-4 accent-[var(--color-accent)]"
              onChange={e => setSelected(e.target.checked ? new Set(items.map(i => i.id)) : new Set())} />
            {selected.size > 0 ? `${selected.size}개 선택` : '전체 선택'}
          </label>
          {selected.size > 0 && (
            <div className="flex flex-wrap gap-2">
              {status === 'PENDING' && <>
                <button disabled={rematch.isPending} onClick={() => rematch.mutate([...selected])}
                  className="h-8 px-3 rounded-lg border border-line text-xs text-fg-2 hover:bg-surface-2 inline-flex items-center gap-1.5 disabled:opacity-50"><RefreshCw size={13} />선택 다시 매칭</button>
                <button disabled={bulk.isPending} onClick={() => bulk.mutate('ignore')}
                  className="h-8 px-3 rounded-lg border border-line text-xs text-muted hover:text-fg inline-flex items-center gap-1.5 disabled:opacity-50"><EyeOff size={13} />선택 무시</button>
              </>}
              {status !== 'PENDING' && (
                <button disabled={bulk.isPending} onClick={() => bulk.mutate('reopen')}
                  className="h-8 px-3 rounded-lg border border-line text-xs text-fg-2 hover:bg-surface-2 inline-flex items-center gap-1.5 disabled:opacity-50">
                  <RotateCcw size={13} />{status === 'LINKED' ? '선택 연결 해제' : '선택 다시 검수'}
                </button>
              )}
            </div>
          )}
          {isFetching && !isLoading && <Loader2 size={14} className="ml-auto animate-spin text-subtle" />}
        </div>

        {isLoading ? (
          <div className="p-5 space-y-3">{[0, 1, 2].map(i => <div key={i} className="h-24 rounded-xl bg-sunken animate-pulse" />)}</div>
        ) : items.length === 0 ? (
          <p className="px-5 py-16 text-center text-sm text-muted">
            {status === 'PENDING' ? '검수할 항목이 없습니다.' : status === 'LINKED' ? '연결된 항목이 없습니다.' : '무시한 항목이 없습니다.'}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {items.map(item => (
              <ItemRow key={item.id} item={item} selected={selected.has(item.id)} onDone={refresh}
                onSelect={v => setSelected(s => { const n = new Set(s); if (v) n.add(item.id); else n.delete(item.id); return n })} />
            ))}
          </ul>
        )}
      </section>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm text-muted">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} aria-label="이전 페이지"
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-line disabled:opacity-40"><ChevronLeft size={16} /></button>
          <span className="tabular-nums">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} aria-label="다음 페이지"
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-line disabled:opacity-40"><ChevronRight size={16} /></button>
        </div>
      )}
    </div>
  )
}

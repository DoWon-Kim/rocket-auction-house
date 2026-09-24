'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { api } from '@/lib/api'
import { TCG_LABELS } from '@/lib/utils'
import { Plus, Pencil, Trash2, X, Check, Download, ChevronDown, ChevronUp, Search, Loader2, Zap, AlertCircle, AlertTriangle } from 'lucide-react'
import { useAuthStore } from '@/lib/store'
import Badge from '@/components/ui/Badge'
import { CardDetailSyncPanel } from '@/components/admin/CardDetailSyncPanel'
import { KoreanDexPanel } from '@/components/admin/KoreanDexPanel'

const TCG_TYPES = ['POKEMON', 'YUGIOH', 'MTG', 'DIGIMON', 'ONEPIECE', 'WEISS', 'OTHER'] as const
type TcgType = typeof TCG_TYPES[number]

interface Card {
  id: string
  name: string
  nameKo?: string
  nameJa?: string
  tcgType: TcgType
  setName: string
  setCode?: string
  cardNumber?: string
  rarity: string
  imageUrl?: string
  description?: string
}

const emptyForm = { name: '', tcgType: 'POKEMON' as TcgType, setName: '', setCode: '', cardNumber: '', rarity: '', imageUrl: '', description: '' }
type FormState = typeof emptyForm

const inputCls = 'w-full bg-surface border border-line hover:border-line-strong focus:border-accent/40 rounded-xl px-4 py-2.5 text-sm text-fg placeholder:text-subtle focus:outline-none transition-colors'
const labelCls = 'block text-xs text-muted-2 uppercase tracking-wider font-semibold mb-1'

// ── 외부 API 임포트 패널 ───────────────────────────────────────────────────────

type ImportTcg = 'POKEMON' | 'YUGIOH' | 'MTG' | 'DIGIMON' | 'ONEPIECE'
type PokemonLang = 'tcgdex_en' | 'ko' | 'ja' | 'hq_en'
type MtgLang = 'en' | 'ko' | 'ja'

interface SetOption { id: string; name: string; total?: number; releaseDate?: string }
interface ImportResult { imported: number; merged?: number; enriched?: number; total: number; skipped: number; message?: string }
interface EnrichResult { updated: number; failed: number; total: number; message?: string }
interface MergeResult { merged: number; skipped: number; notFound: number; movedListings: number; movedItems: number; message: string }

const POKEMON_LANGS: { id: PokemonLang; label: string }[] = [
  { id: 'ko',        label: '한국어' },
  { id: 'ja',        label: '日本語' },
  { id: 'tcgdex_en', label: 'EN (TCGdex)' },
  { id: 'hq_en',     label: 'EN 고화질' },
]
const MTG_LANGS: { id: MtgLang; label: string }[] = [
  { id: 'en', label: 'EN' },
  { id: 'ko', label: '한국어' },
  { id: 'ja', label: '日本語' },
]

function getSetEndpoint(tcg: ImportTcg, pLang: PokemonLang, mLang: MtgLang): string | null {
  if (tcg === 'POKEMON') {
    if (pLang === 'hq_en') return '/admin/import/pokemon/sets'
    const l = pLang === 'tcgdex_en' ? 'en' : pLang
    return `/admin/import/tcgdex/sets?lang=${l}`
  }
  if (tcg === 'YUGIOH')   return '/admin/import/yugioh/sets'
  if (tcg === 'MTG')      return '/admin/import/mtg/sets'
  if (tcg === 'ONEPIECE') return '/admin/import/onepiece/sets'
  return null // DIGIMON: no sets
}

// ── 전체 가져오기 (SSE 스트리밍) ──────────────────────────────────────────────

type BulkTcg = 'POKEMON' | 'YUGIOH' | 'MTG' | 'DIGIMON' | 'ONEPIECE'
type PokemonSrc = 'hq' | 'ko' | 'ja' | 'both' | 'all'

interface BulkEvent {
  type: string
  tcg?: string
  setId?: string
  setName?: string
  message?: string
  imported?: number
  merged?: number
  total?: number
  offset?: number
  error?: string
  totals?: Record<string, { imported: number; merged: number; skipped: number; errors: number }>
}

const TCG_LABEL: Record<string, string> = {
  POKEMON: '포켓몬', 'POKEMON-KO': '포켓몬 KO', 'POKEMON-JA': '포켓몬 JA',
  YUGIOH: '유희왕', MTG: 'MTG', DIGIMON: '디지몬', ONEPIECE: '원피스',
}
const TCG_COLOR: Record<string, string> = {
  POKEMON: 'text-yellow-400', 'POKEMON-KO': 'text-teal-400', 'POKEMON-JA': 'text-red-400',
  YUGIOH: 'text-purple-400', MTG: 'text-accent-fg', DIGIMON: 'text-orange-400', ONEPIECE: 'text-blue-400',
}

// ── 스니덩 임포트 패널 ────────────────────────────────────────────────────────

function SnkrdunkImportPanel({ onImported }: { onImported: () => void }) {
  const { token } = useAuthStore()
  const [open, setOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [log, setLog] = useState<Array<Record<string, unknown>>>([])
  const [done, setDone] = useState<Record<string, unknown> | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  async function start() {
    if (running) return
    setRunning(true)
    setLog([])
    setDone(null)
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api'
      const res = await fetch(`${apiBase}/admin/import/snkrdunk`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok || !res.body) { setLog([{ type: 'error', reason: `HTTP ${res.status}` }]); return }
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      while (true) {
        const { done: d, value } = await reader.read()
        if (d) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const ev = JSON.parse(line.slice(6)) as Record<string, unknown>
            if (ev.type === 'done') { setDone(ev); onImported() }
            else { setLog(p => [...p.slice(-60), ev]); if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      setLog(p => [...p, { type: 'error', reason: String(err) }])
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="bg-surface border border-[#3a6ea8]/40 rounded-2xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-medium hover:bg-surface-2 transition-colors">
        <div className="flex items-center gap-2 text-[#5ba3f5]">
          <Download size={15} />
          스니덩 (snkrdunk.com) — 시세 동기화
        </div>
        {open ? <ChevronUp size={15} className="text-subtle" /> : <ChevronDown size={15} className="text-subtle" />}
      </button>

      {open && (
        <div className="border-t border-line p-5 space-y-4">
          <p className="text-xs text-muted">
            포켓몬(JP+EN)·유희왕(JP OCG) 싱글카드 시세(최저 호가·매물 수)를 스니덩에서 가져옵니다.
            세트 코드와 카드 번호가 정확히 일치하는 카드에만 자동 연결하고, 나머지는 카드를 새로 만들지 않고
            <Link href="/admin/card-sources" className="text-accent-fg hover:underline mx-1">카드 매칭 검수</Link>로 보냅니다.
          </p>
          <div className="flex items-center gap-3">
            <button onClick={start} disabled={running}
              className="flex items-center gap-2 bg-[#3a6ea8] hover:bg-[#2d5a8a] disabled:opacity-40 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors">
              {running ? <div className="w-4 h-4 rounded-full border-2 border-[#2d5a8a] border-t-white animate-spin" /> : <Download size={14} />}
              {running ? '동기화 중...' : '스니덩 동기화 시작'}
            </button>
            <p className="text-xs text-subtle">* 포켓몬·유희왕 수만 장 처리 — 수 분 소요</p>
          </div>

          {log.length > 0 && (
            <div ref={logRef} className="bg-black/40 border border-line rounded-xl p-3 max-h-48 overflow-y-auto font-mono text-xs space-y-0.5">
              {log.map((ev, i) => (
                <p key={i} className={
                  ev.type === 'error' ? 'text-red-400' :
                  ev.type === 'brand-done' ? 'text-[#5ba3f5] font-semibold' :
                  ev.type === 'brand-start' ? 'text-muted' :
                  ev.type === 'page-done' ? 'text-subtle' : 'text-muted'
                }>
                  {ev.type === 'brand-done'
                    ? `✓ ${ev.brand as string}: 싱글 ${ev.fetched as number}장 · 가격 갱신 ${ev.updated as number} · 자동 연결 ${ev.linked as number} · 검수 대기 ${ev.queued as number}`
                    : ev.type === 'page-done'
                    ? `  p${ev.page as number} — ${ev.singles as number}장 (누적 연결 ${ev.linked as number} · 대기 ${ev.queued as number})`
                    : ev.type === 'brand-start'
                    ? `▶ ${ev.brand as string} (${ev.tcgType as string}) 시작...`
                    : ev.type === 'error' || ev.type === 'item-error'
                    ? `✗ ${ev.brand as string ?? ''} ${ev.page ? `p${ev.page as number}` : ''}: ${ev.reason as string}`
                    : String(ev.message ?? ev.type ?? '')}
                </p>
              ))}
              {running && <p className="text-[#3a6ea8] animate-pulse">⋯</p>}
            </div>
          )}

          {done && !running && (
            <div className="bg-blue-950/30 border border-blue-800/40 rounded-xl px-4 py-3 text-sm space-y-1">
              <p className="text-blue-400 font-semibold">✓ 스니덩 동기화 완료</p>
              <div className="text-xs text-muted grid grid-cols-2 gap-x-4 gap-y-0.5">
                <span>조회된 싱글카드</span><span className="text-fg">{(done.fetched as number)?.toLocaleString()}장</span>
                <span>연결된 카드 가격 갱신</span><span className="text-emerald-400">{(done.updated as number)?.toLocaleString()}건</span>
                <span>새로 자동 연결</span><span className="text-emerald-400">{(done.linked as number)?.toLocaleString()}건</span>
                <span>검수 대기</span><span className="text-accent-fg">{(done.queued as number)?.toLocaleString()}건</span>
                <span>무시 항목</span><span className="text-subtle">{(done.ignored as number)?.toLocaleString()}건</span>
              </div>
              {(done.queued as number) > 0 && (
                <Link href="/admin/card-sources" className="inline-flex text-xs text-accent-fg hover:underline pt-1">검수 대기 항목 확인하기 →</Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function BulkImportPanel({ onImported }: { onImported: () => void }) {
  const { token } = useAuthStore()
  const [open, setOpen] = useState(false)
  const [types, setTypes] = useState<BulkTcg[]>(['POKEMON', 'YUGIOH', 'MTG', 'DIGIMON', 'ONEPIECE'])
  const [pokemonSrc, setPokemonSrc] = useState<PokemonSrc>('both')
  const [recentMonths, setRecentMonths] = useState(36)
  const [mtgMaxSets, setMtgMaxSets] = useState(50)
  const [running, setRunning] = useState(false)
  const [events, setEvents] = useState<BulkEvent[]>([])
  const [tcgStatus, setTcgStatus] = useState<Record<string, BulkEvent>>({})
  const [done, setDone] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  const toggleType = (t: BulkTcg) =>
    setTypes(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t])

  const addEvent = (ev: BulkEvent) => {
    setEvents(p => [...p.slice(-50), ev])
    if (ev.tcg && (ev.type === 'tcg-done' || ev.type === 'tcg-start' || ev.type === 'progress')) {
      setTcgStatus(p => ({ ...p, [ev.tcg!]: ev }))
    }
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }

  async function startImport() {
    if (running) return
    setRunning(true)
    setDone(false)
    setEvents([])
    setTcgStatus({})

    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api'
      const response = await fetch(`${apiBase}/admin/import/all`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ types, pokemonSrc, recentMonths, mtgMaxSets }),
      })

      if (!response.ok || !response.body) {
        addEvent({ type: 'error', message: `서버 오류: HTTP ${response.status}` })
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done: streamDone, value } = await reader.read()
        if (streamDone) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const ev = JSON.parse(line.slice(6)) as BulkEvent
              addEvent(ev)
              if (ev.type === 'done' || ev.type === 'fatal') {
                setDone(true)
                onImported()
              }
            } catch { /* 파싱 실패 무시 */ }
          }
        }
      }
    } catch (err) {
      addEvent({ type: 'error', message: `연결 오류: ${String(err)}` })
    } finally {
      setRunning(false)
    }
  }

  const doneEv = events.find(e => e.type === 'done')
  const totalImported = doneEv?.totals
    ? Object.values(doneEv.totals).reduce((s, t) => s + t.imported, 0)
    : 0

  return (
    <div className="bg-surface border border-accent-2/30 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-medium hover:bg-surface-2 transition-colors"
      >
        <div className="flex items-center gap-2 text-accent-2">
          <Zap size={15} />
          전체 일괄 가져오기 (SSE)
        </div>
        {open ? <ChevronUp size={15} className="text-subtle" /> : <ChevronDown size={15} className="text-subtle" />}
      </button>

      {open && (
        <div className="border-t border-line p-5 space-y-4">
          {/* 옵션 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-2 uppercase tracking-wider">가져올 TCG</p>
              <div className="flex flex-wrap gap-1.5">
                {(['POKEMON', 'YUGIOH', 'MTG', 'DIGIMON', 'ONEPIECE'] as const).map(t => (
                  <button key={t} onClick={() => toggleType(t)} disabled={running}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${types.includes(t) ? 'bg-accent text-on-accent' : 'bg-surface-2 border border-line text-muted hover:text-fg'}`}>
                    {TCG_LABEL[t]}
                  </button>
                ))}
              </div>
            </div>

            {types.includes('POKEMON') && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-2 uppercase tracking-wider">포켓몬 소스</p>
                <div className="flex flex-wrap gap-1.5">
                  {([['hq', 'HQ EN만'], ['ko', 'KO 병합만'], ['ja', 'JA 병합만'], ['both', 'HQ EN + KO'], ['all', 'HQ + KO + JA']] as const).map(([v, l]) => (
                    <button key={v} onClick={() => setPokemonSrc(v)} disabled={running}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${pokemonSrc === v ? 'bg-teal-600 text-white' : 'bg-surface-2 border border-line text-muted hover:text-fg'}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs text-muted">포켓몬/MTG 최근 개월 (0=전체)</label>
              <input type="number" min={0} max={120} value={recentMonths}
                onChange={e => setRecentMonths(Number(e.target.value))} disabled={running}
                className="w-24 bg-surface border border-line hover:border-line-strong focus:border-accent/40 rounded-xl px-3 py-1.5 text-sm text-fg focus:outline-none transition-colors" />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted">MTG 최대 세트 수</label>
              <input type="number" min={1} max={300} value={mtgMaxSets}
                onChange={e => setMtgMaxSets(Number(e.target.value))} disabled={running}
                className="w-24 bg-surface border border-line hover:border-line-strong focus:border-accent/40 rounded-xl px-3 py-1.5 text-sm text-fg focus:outline-none transition-colors" />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={startImport} disabled={running || types.length === 0}
              className="flex items-center gap-2 bg-accent hover:bg-accent-strong disabled:opacity-40 text-on-accent px-4 py-2 rounded-xl text-sm font-semibold transition-colors">
              {running ? <div className="w-4 h-4 rounded-full border-2 border-accent-strong border-t-bg animate-spin" /> : <Zap size={14} />}
              {running ? '가져오는 중...' : '전체 가져오기 시작'}
            </button>
            <p className="text-xs text-subtle">* 완료까지 수 분~수십 분 소요될 수 있습니다</p>
          </div>

          {/* TCG 상태 요약 */}
          {Object.keys(tcgStatus).length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(tcgStatus).map(([tcg, ev]) => (
                <div key={tcg} className="bg-sunken border border-line rounded-xl px-3 py-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-semibold ${TCG_COLOR[tcg] ?? 'text-muted'}`}>{TCG_LABEL[tcg] ?? tcg}</span>
                    <span className="text-xs text-subtle">
                      {ev.type === 'tcg-done' ? '✓ 완료' : ev.type === 'progress' ? '처리 중' : '시작'}
                    </span>
                  </div>
                  {ev.type === 'tcg-done' && (
                    <p className="text-xs text-fg">
                      신규 {ev.imported ?? 0}개 {(ev.merged ?? 0) > 0 && `· 병합 ${ev.merged}개`}
                      {(ev as { errors?: number }).errors ? <span className="text-red-400"> · 오류 {(ev as { errors?: number }).errors}건</span> : ''}
                    </p>
                  )}
                  {ev.type === 'progress' && ev.total && (
                    <div className="mt-1">
                      <div className="w-full bg-line rounded-full h-1">
                        <div className="bg-accent h-1 rounded-full transition-all"
                          style={{ width: `${Math.min(100, ((ev.offset ?? 0) / ev.total) * 100)}%` }} />
                      </div>
                      <p className="text-xs text-subtle mt-0.5">{ev.offset}/{ev.total}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 이벤트 로그 */}
          {events.length > 0 && (
            <div ref={logRef} className="bg-black/40 border border-line rounded-xl p-3 max-h-48 overflow-y-auto font-mono text-xs space-y-0.5">
              {events.slice(-30).map((ev, i) => {
                if (ev.type === 'done') return (
                  <p key={i} className="text-emerald-400">✓ 전체 가져오기 완료 · 신규 {totalImported.toLocaleString()}개</p>
                )
                if (ev.type === 'fatal' || ev.type === 'error') return (
                  <p key={i} className="text-red-400">✗ {ev.message ?? ev.error}</p>
                )
                if (ev.type === 'tcg-start') return (
                  <p key={i} className={TCG_COLOR[ev.tcg ?? ''] ?? 'text-muted'}>▶ {TCG_LABEL[ev.tcg ?? ''] ?? ev.tcg} 시작 {ev.message}</p>
                )
                if (ev.type === 'tcg-done') return (
                  <p key={i} className="text-fg">
                    ✓ {TCG_LABEL[ev.tcg ?? ''] ?? ev.tcg} 완료: {ev.imported}개 신규, {ev.merged ?? 0}개 병합
                  </p>
                )
                if (ev.type === 'set-done') return (
                  <p key={i} className="text-muted">
                    &nbsp; {ev.setName ?? ev.setId} → {ev.imported ?? ev.merged ?? 0}개
                  </p>
                )
                if (ev.type === 'set-error') return (
                  <p key={i} className="text-red-500">&nbsp; ✗ {ev.setName ?? ev.setId} 오류</p>
                )
                if (ev.type === 'info') return (
                  <p key={i} className="text-muted">&nbsp; {ev.message}</p>
                )
                if (ev.type === 'progress') return (
                  <p key={i} className="text-subtle">
                    &nbsp; {TCG_LABEL[ev.tcg ?? ''] ?? ev.tcg} {ev.offset}/{ev.total} ({ev.imported}개)
                  </p>
                )
                return null
              })}
              {running && <p className="text-accent-2 animate-pulse">⋯</p>}
            </div>
          )}

          {done && doneEv?.totals && (
            <div className="bg-emerald-950/30 border border-emerald-800/40 rounded-xl px-4 py-3 text-sm">
              <p className="text-emerald-400 font-semibold mb-1">✓ 전체 가져오기 완료</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs">
                {Object.entries(doneEv.totals).map(([tcg, t]) => (
                  <div key={tcg} className="flex justify-between text-muted">
                    <span className={TCG_COLOR[tcg] ?? ''}>{TCG_LABEL[tcg] ?? tcg}</span>
                    <span>신규 {t.imported.toLocaleString()} / 병합 {t.merged.toLocaleString()} / 스킵 {t.skipped.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── 세계 1등 임포트 파이프라인 ────────────────────────────────────────────────

const WORLD_CLASS_STEPS: { key: string; label: string; desc: string }[] = [
  { key: 'bulk',        label: '전체 카드 일괄',   desc: 'POST /admin/import/all (HQ+KO+JA, 전세트)' },
  { key: 'pokemon-ja',  label: '포켓몬 일판 전체', desc: 'GET /admin/import/pokemon/ja-all' },
  { key: 'op-names',    label: '원피스 카드명 보강', desc: 'GET /admin/import/onepiece/fix-names' },
  { key: 'op-rarity',   label: '원피스 레어도 보강', desc: 'GET /admin/import/onepiece/enrich-rarity' },
  { key: 'op-details',  label: '원피스 스탯 보강',  desc: 'GET /admin/import/onepiece/enrich-details' },
  { key: 'op-parallels',label: '원피스 패러렐 임포트', desc: 'GET /admin/import/onepiece/parallels' },
]

type StepStatus = 'idle' | 'running' | 'done' | 'error'

async function runSse(
  url: string,
  method: 'GET' | 'POST',
  body: Record<string, unknown> | null,
  token: string,
  onEvent: (ev: Record<string, unknown>) => void,
): Promise<void> {
  const opts: RequestInit = {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }
  const res = await fetch(url, opts)
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      try { onEvent(JSON.parse(line.slice(6)) as Record<string, unknown>) } catch { /* ignore */ }
    }
  }
}

function WorldClassImportPanel({ onImported }: { onImported: () => void }) {
  const { token } = useAuthStore()
  const [open, setOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [stepStatus, setStepStatus] = useState<Record<string, StepStatus>>({})
  const [stepLog, setStepLog] = useState<Record<string, string>>({})
  const [done, setDone] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)
  const currentStepRef = useRef<string>('')

  function setStep(key: string, status: StepStatus, log?: string) {
    if (status === 'running') currentStepRef.current = key
    setStepStatus(p => ({ ...p, [key]: status }))
    if (log !== undefined) setStepLog(p => ({ ...p, [key]: log }))
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }

  async function start() {
    if (running) return
    setRunning(true)
    setDone(false)
    setStepStatus({})
    setStepLog({})
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api'

    try {
      // 1. 전체 일괄
      setStep('bulk', 'running')
      let bulkSummary = ''
      await runSse(
        `${apiBase}/admin/import/all`, 'POST',
        { types: ['POKEMON', 'YUGIOH', 'MTG', 'DIGIMON', 'ONEPIECE'], pokemonSrc: 'all', recentMonths: 0, mtgMaxSets: 300 },
        token!,
        (ev) => {
          if (ev.type === 'done' && ev.totals) {
            const t = ev.totals as Record<string, { imported: number; merged: number }>
            const total = Object.values(t).reduce((s, x) => s + x.imported, 0)
            bulkSummary = `신규 ${total.toLocaleString()}장`
          }
        },
      )
      setStep('bulk', 'done', bulkSummary || '완료')

      // 2. 포켓몬 일판
      setStep('pokemon-ja', 'running')
      let jaSummary = ''
      await runSse(`${apiBase}/admin/import/pokemon/ja-all`, 'GET', null, token!, (ev) => {
        if (ev.type === 'done') jaSummary = `+${ev.totalCreated as number ?? 0}신규 / ${ev.totalMerged as number ?? 0}병합`
      })
      setStep('pokemon-ja', 'done', jaSummary || '완료')

      // 3. 원피스 카드명 보강
      setStep('op-names', 'running')
      let namesSummary = ''
      await runSse(`${apiBase}/admin/import/onepiece/fix-names`, 'GET', null, token!, (ev) => {
        if (ev.type === 'done') namesSummary = `${ev.totalFixed as number ?? 0}장 이름 업데이트`
      })
      setStep('op-names', 'done', namesSummary || '완료')

      // 4. 원피스 레어도 보강
      setStep('op-rarity', 'running')
      let raritySummary = ''
      await runSse(`${apiBase}/admin/import/onepiece/enrich-rarity`, 'GET', null, token!, (ev) => {
        if (ev.type === 'done') raritySummary = `${ev.totalUpdated as number ?? 0}장 업데이트`
      })
      setStep('op-rarity', 'done', raritySummary || '완료')

      // 5. 원피스 스탯 보강
      setStep('op-details', 'running')
      let detailsSummary = ''
      await runSse(`${apiBase}/admin/import/onepiece/enrich-details`, 'GET', null, token!, (ev) => {
        if (ev.type === 'done') detailsSummary = `${ev.totalUpdated as number ?? 0}장 업데이트`
      })
      setStep('op-details', 'done', detailsSummary || '완료')

      // 6. 원피스 패러렐 임포트
      setStep('op-parallels', 'running')
      let parallelsSummary = ''
      await runSse(`${apiBase}/admin/import/onepiece/parallels`, 'GET', null, token!, (ev) => {
        if (ev.type === 'done') parallelsSummary = `+${ev.totalCreated as number ?? 0}장 패러렐 추가`
      })
      setStep('op-parallels', 'done', parallelsSummary || '완료')

      setDone(true)
      onImported()
    } catch (err) {
      const key = currentStepRef.current
      if (key) setStep(key, 'error', String(err))
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="bg-surface border border-accent/50 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-medium hover:bg-surface-2 transition-colors"
      >
        <div className="flex items-center gap-2 text-accent-fg">
          <Zap size={15} />
          세계 1등 임포트 — 전체 TCG 완전 자동 파이프라인
        </div>
        {open ? <ChevronUp size={15} className="text-subtle" /> : <ChevronDown size={15} className="text-subtle" />}
      </button>

      {open && (
        <div className="border-t border-line p-5 space-y-4">
          <p className="text-xs text-muted">
            포켓몬(HQ EN + KO + JA 전체) · 유희왕 · MTG(전세트) · 디지몬 · 원피스를 순서대로 자동 임포트합니다.
            원피스는 카드명·레어도·스탯 보강 및 패러렐 임포트까지 포함됩니다. 완료까지 30분~1시간 소요될 수 있습니다.
          </p>

          <div className="grid grid-cols-1 gap-1.5" ref={logRef}>
            {WORLD_CLASS_STEPS.map((s, i) => {
              const status = stepStatus[s.key] ?? 'idle'
              const log = stepLog[s.key]
              return (
                <div key={s.key} className={`flex items-center gap-3 px-3 py-2 rounded-xl border transition-colors ${
                  status === 'running' ? 'border-accent/50 bg-accent/5' :
                  status === 'done'    ? 'border-emerald-800/40 bg-emerald-950/20' :
                  status === 'error'   ? 'border-red-800/40 bg-red-950/20' :
                  'border-line bg-transparent'
                }`}>
                  <span className="text-xs font-mono text-subtle w-4 shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold ${
                        status === 'running' ? 'text-accent-fg' :
                        status === 'done'    ? 'text-emerald-400' :
                        status === 'error'   ? 'text-red-400' :
                        'text-muted'
                      }`}>{s.label}</span>
                      {log && <span className="text-xs text-subtle truncate">{log}</span>}
                    </div>
                  </div>
                  <div className="shrink-0">
                    {status === 'running' && <div className="w-3.5 h-3.5 rounded-full border-2 border-line border-t-accent animate-spin" />}
                    {status === 'done'    && <span className="text-emerald-400 text-xs">✓</span>}
                    {status === 'error'   && <span className="text-red-400 text-xs">✗</span>}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex items-center gap-3">
            <button onClick={start} disabled={running}
              className="flex items-center gap-2 bg-accent hover:bg-accent-strong disabled:opacity-40 text-on-accent px-5 py-2.5 rounded-xl text-sm font-bold transition-colors">
              {running ? <div className="w-4 h-4 rounded-full border-2 border-accent-strong border-t-bg animate-spin" /> : <Zap size={14} />}
              {running ? '파이프라인 실행 중...' : '세계 1등 임포트 시작'}
            </button>
            {done && <span className="text-emerald-400 text-sm font-semibold">✓ 전체 파이프라인 완료!</span>}
          </div>
        </div>
      )}
    </div>
  )
}

// ── 외부 API 임포트 패널 ───────────────────────────────────────────────────────

interface EnrichProgress {
  running: boolean
  lang: 'ko' | 'ja' | null
  sets: number
  totalSets: number
  updated: number
  notInTcgdex: number
  currentSet: string
}

const ENRICH_IDLE: EnrichProgress = { running: false, lang: null, sets: 0, totalSets: 0, updated: 0, notInTcgdex: 0, currentSet: '' }

function ImportPanel({ onImported }: { onImported: () => void }) {
  const { token } = useAuthStore()
  const [open, setOpen]           = useState(false)
  const [tcg, setTcg]             = useState<ImportTcg>('POKEMON')
  const [pLang, setPLang]         = useState<PokemonLang>('ko')
  const [mLang, setMLang]         = useState<MtgLang>('en')
  const [sets, setSets]           = useState<SetOption[]>([])
  const [setsLoading, setSetsLoading] = useState(false)
  const [setSearch, setSetSearch] = useState('')
  const [selectedSet, setSelectedSet] = useState<SetOption | null>(null)
  const [loading, setLoading]     = useState(false)
  const [result, setResult]       = useState<ImportResult | null>(null)
  const [error, setError]         = useState<string | null>(null)
  const [enrichProgress, setEnrichProgress] = useState<EnrichProgress>(ENRICH_IDLE)
  const [enrichResult, setEnrichResult] = useState<EnrichResult | null>(null)
  const [mergeLoading, setMergeLoading] = useState(false)
  const [mergeResult, setMergeResult] = useState<MergeResult | null>(null)
  const [opRunning, setOpRunning] = useState(false)
  const [opType, setOpType] = useState<string | null>(null)
  const [opLog, setOpLog] = useState<Array<Record<string, unknown>>>([])
  const [opDone, setOpDone] = useState<Record<string, unknown> | null>(null)
  const [opPipelineSteps, setOpPipelineSteps] = useState<string[]>([])
  const [jaRunning, setJaRunning] = useState(false)
  const [jaLog, setJaLog] = useState<Array<Record<string, unknown>>>([])
  const [jaDone, setJaDone] = useState<Record<string, unknown> | null>(null)
  const prevKey = useRef<string>('')

  const cacheKey = `${tcg}_${pLang}_${mLang}`
  const needsSets = tcg !== 'DIGIMON'

  useEffect(() => {
    if (!open || !needsSets) return
    if (prevKey.current === cacheKey) return
    prevKey.current = cacheKey

    setSets([])
    setSelectedSet(null)
    setSetSearch('')
    setResult(null)
    setError(null)

    const endpoint = getSetEndpoint(tcg, pLang, mLang)
    if (!endpoint) return

    setSetsLoading(true)
    api.get(endpoint)
      .then(r => setSets(r.data))
      .catch(() => setError('세트 목록을 불러오지 못했습니다.'))
      .finally(() => setSetsLoading(false))
  }, [cacheKey, open, needsSets, tcg, pLang, mLang])

  function switchTcg(t: ImportTcg) {
    if (t === tcg) return
    prevKey.current = ''
    setTcg(t)
    setSelectedSet(null)
    setSetSearch('')
    setResult(null)
    setError(null)
    setEnrichResult(null)
  }
  function switchPLang(l: PokemonLang) {
    if (l === pLang) return
    prevKey.current = ''
    setPLang(l)
    setSelectedSet(null)
    setSetSearch('')
    setResult(null)
    setError(null)
  }
  function switchMLang(l: MtgLang) {
    if (l === mLang) return
    prevKey.current = ''
    setMLang(l)
    setSelectedSet(null)
    setSetSearch('')
    setResult(null)
    setError(null)
  }

  async function handleImport() {
    setLoading(true)
    setResult(null)
    setError(null)
    try {
      let res
      if (tcg === 'POKEMON') {
        if (pLang === 'hq_en') {
          res = await api.post('/admin/import/pokemon', { setId: selectedSet!.id })
        } else {
          const l = pLang === 'tcgdex_en' ? 'en' : pLang
          res = await api.post('/admin/import/tcgdex', { setId: selectedSet!.id, lang: l })
        }
      } else if (tcg === 'YUGIOH') {
        res = await api.post('/admin/import/yugioh', { setName: selectedSet!.id })
      } else if (tcg === 'MTG') {
        res = await api.post('/admin/import/mtg', { setCode: selectedSet!.id, lang: mLang })
      } else if (tcg === 'ONEPIECE') {
        res = await api.post('/admin/import/onepiece', { setId: selectedSet!.id })
      } else {
        res = await api.post('/admin/import/digimon', { all: true })
      }
      setResult(res.data)
      onImported()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } }
      setError(err.response?.data?.message ?? '가져오기에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  async function handleMerge() {
    if (!confirm('언어별 중복 카드(KO/JA)를 EN 기본 카드에 병합합니다.\n이 작업은 되돌릴 수 없습니다. 계속할까요?')) return
    setMergeLoading(true)
    setMergeResult(null)
    try {
      const r = await api.post('/admin/import/merge-duplicates')
      setMergeResult(r.data)
      onImported()
    } catch {
      setError('병합 중 오류가 발생했습니다.')
    } finally {
      setMergeLoading(false)
    }
  }

  async function handleEnrich(lang: 'ko' | 'ja') {
    if (enrichProgress.running) return
    setEnrichProgress({ ...ENRICH_IDLE, running: true, lang })
    setEnrichResult(null)
    setError(null)

    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api'
      const response = await fetch(`${apiBase}/admin/import/pokemon/enrich-${lang}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      })

      if (!response.ok || !response.body) {
        setError(`보강 요청 실패 (HTTP ${response.status})`)
        return
      }

      const reader  = response.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const ev = JSON.parse(line.slice(6)) as Record<string, unknown>
            if (ev.type === 'start') {
              setEnrichProgress(p => ({ ...p, totalSets: ev.sets as number }))
            } else if (ev.type === 'set-done' || ev.type === 'set-skip') {
              setEnrichProgress(p => ({
                ...p,
                sets:        p.sets + 1,
                updated:     p.updated + ((ev.updated as number) ?? 0),
                notInTcgdex: p.notInTcgdex + ((ev.type === 'set-skip' ? ev.count : 0) as number),
                currentSet:  ev.setCode as string,
              }))
            } else if (ev.type === 'done') {
              setEnrichResult({
                updated: ev.updated as number,
                failed:  ev.failed  as number,
                total:   ev.total   as number,
                message: ev.message as string | undefined,
              })
              onImported()
            } else if (ev.type === 'error') {
              setError(`보강 오류: ${ev.message}`)
            }
          } catch { /* 파싱 실패 무시 */ }
        }
      }
    } catch (err) {
      setError(`연결 오류: ${String(err)}`)
    } finally {
      setEnrichProgress(p => ({ ...p, running: false }))
    }
  }

  async function handleOpSse(type: 'rarity' | 'names' | 'parallels' | 'parallels-bandai' | 'details' | 'import-all') {
    if (opRunning) return
    setOpRunning(true)
    setOpType(type)
    setOpLog([])
    setOpDone(null)

    const endpoints: Record<string, string> = {
      rarity:             '/admin/import/onepiece/enrich-rarity',
      names:              '/admin/import/onepiece/fix-names',
      parallels:          '/admin/import/onepiece/parallels',
      'parallels-bandai': '/admin/import/onepiece/parallels-bandai',
      'import-all':       '/admin/import/onepiece/import-all',
      details:            '/admin/import/onepiece/enrich-details',
    }

    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api'
      const response = await fetch(`${apiBase}${endpoints[type]}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok || !response.body) {
        setOpLog([{ type: 'error', reason: `HTTP ${response.status}` }])
        return
      }
      const reader  = response.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const ev = JSON.parse(line.slice(6)) as Record<string, unknown>
            if (ev.type === 'done') {
              setOpDone(ev)
              onImported()
            } else {
              setOpLog(p => [...p.slice(-40), ev])
            }
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      setOpLog(p => [...p, { type: 'error', reason: String(err) }])
    } finally {
      setOpRunning(false)
    }
  }

  async function handleOpPipeline() {
    if (opRunning) return
    const steps: Array<'import-all' | 'names' | 'rarity' | 'details' | 'parallels'> = ['import-all', 'names', 'rarity', 'details', 'parallels']
    const endpoints: Record<string, string> = {
      rarity:       '/admin/import/onepiece/enrich-rarity',
      names:        '/admin/import/onepiece/fix-names',
      parallels:    '/admin/import/onepiece/parallels',
      'import-all': '/admin/import/onepiece/import-all',
      details:      '/admin/import/onepiece/enrich-details',
    }
    setOpRunning(true)
    setOpLog([])
    setOpDone(null)
    setOpPipelineSteps([...steps])
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api'
      for (const step of steps) {
        setOpType(step)
        setOpLog(p => [...p, { type: 'info', message: `▶ ${step} 시작...` }])
        const response = await fetch(`${apiBase}${endpoints[step]}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!response.ok || !response.body) {
          setOpLog(p => [...p, { type: 'error', reason: `HTTP ${response.status}` }])
          break
        }
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buf = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
              const ev = JSON.parse(line.slice(6)) as Record<string, unknown>
              if (ev.type === 'done') {
                setOpDone(ev)
                onImported()
              } else {
                setOpLog(p => [...p.slice(-40), ev])
              }
            } catch { /* ignore */ }
          }
        }
      }
    } catch (err) {
      setOpLog(p => [...p, { type: 'error', reason: String(err) }])
    } finally {
      setOpRunning(false)
      setOpPipelineSteps([])
    }
  }

  async function handleJaImport() {
    if (jaRunning) return
    setJaRunning(true)
    setJaLog([])
    setJaDone(null)
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api'
      const response = await fetch(`${apiBase}/admin/import/pokemon/ja-all`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok || !response.body) { setJaLog([{ type: 'error', reason: `HTTP ${response.status}` }]); return }
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const ev = JSON.parse(line.slice(6)) as Record<string, unknown>
            if (ev.type === 'done') { setJaDone(ev); onImported() }
            else setJaLog(p => [...p.slice(-50), ev])
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      setJaLog(p => [...p, { type: 'error', reason: String(err) }])
    } finally {
      setJaRunning(false)
    }
  }

  const filteredSets = sets.filter(s => s.name.toLowerCase().includes(setSearch.toLowerCase()))
  const canImport = tcg === 'DIGIMON' ? true : !!selectedSet

  return (
    <div className="bg-surface border border-line rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-medium hover:bg-surface-2 transition-colors"
      >
        <div className="flex items-center gap-2 text-accent-fg">
          <Download size={15} />
          외부 API에서 카드 데이터 가져오기
        </div>
        {open ? <ChevronUp size={15} className="text-subtle" /> : <ChevronDown size={15} className="text-subtle" />}
      </button>

      {open && (
        <div className="border-t border-line p-5 space-y-4">

          {/* 1단: TCG 종류 */}
          <div className="flex flex-wrap gap-1.5">
            {(['POKEMON', 'YUGIOH', 'MTG', 'DIGIMON', 'ONEPIECE'] as const).map(t => (
              <button key={t} onClick={() => switchTcg(t)}
                className={`px-3.5 py-1.5 rounded-xl text-sm font-semibold transition-colors ${
                  tcg === t ? 'bg-accent text-white' : 'bg-surface border border-line text-muted hover:border-line-strong hover:text-fg'
                }`}>
                {t === 'POKEMON' ? '포켓몬' : t === 'YUGIOH' ? '유희왕' : t === 'DIGIMON' ? '디지몬' : t === 'ONEPIECE' ? '원피스' : 'MTG'}
              </button>
            ))}
          </div>

          {/* 2단: 언어 선택 (포켓몬 / MTG) */}
          {tcg === 'POKEMON' && (
            <div className="flex gap-1.5 flex-wrap">
              {POKEMON_LANGS.map(l => (
                <button key={l.id} onClick={() => switchPLang(l.id)}
                  className={`px-3 py-1 rounded-xl text-xs font-semibold transition-colors ${
                    pLang === l.id ? 'bg-teal-600 text-white' : 'bg-surface border border-line text-muted hover:border-line-strong hover:text-fg'
                  }`}>
                  {l.label}
                </button>
              ))}
            </div>
          )}
          {tcg === 'MTG' && (
            <div className="flex gap-1.5">
              {MTG_LANGS.map(l => (
                <button key={l.id} onClick={() => switchMLang(l.id)}
                  className={`px-3 py-1 rounded-xl text-xs font-semibold transition-colors ${
                    mLang === l.id ? 'bg-teal-600 text-white' : 'bg-surface border border-line text-muted hover:border-line-strong hover:text-fg'
                  }`}>
                  {l.label}
                </button>
              ))}
              {mLang !== 'en' && (
                <span className="text-xs text-subtle self-center ml-1">
                  * 해당 언어로 발매된 세트만 결과가 있습니다
                </span>
              )}
            </div>
          )}
          {tcg === 'YUGIOH' && (
            <div className="space-y-1">
              <p className="text-xs text-muted">YGOProDeck API · 영어 세트 데이터 (총 14,000+장)</p>
              <p className="text-xs text-subtle">세트별 가져오기: 아래에서 세트 선택 후 가져오기 | 전체: 위 &ldquo;전체 일괄 가져오기&rdquo; 패널 사용 권장</p>
            </div>
          )}
          {tcg === 'DIGIMON' && (
            <p className="text-xs text-muted">digimoncard.io API · 전체 디지몬 카드 5,000+장을 한 번에 가져옵니다.</p>
          )}
          {tcg === 'ONEPIECE' && (
            <div className="space-y-1">
              <p className="text-xs text-muted">원피스 카드 게임 (Bandai) · 공식 사이트에서 카드 정보를 가져옵니다.</p>
              <p className="text-xs text-subtle">OP-01~10, ST-01~20, EB-01~02 총 32개 세트 지원 · 파싱 실패 시 카드 번호 기반 기본 레코드 생성</p>
            </div>
          )}

          {/* 원피스 데이터 보강 / 패러렐 임포트 */}
          {tcg === 'ONEPIECE' && (
            <div className="border-t border-line pt-4 space-y-3">
              <p className="text-xs font-semibold text-muted-2 uppercase tracking-wider">데이터 보강 / 패러렐 임포트</p>
              <div className="flex flex-wrap gap-2">
                <button onClick={handleOpPipeline} disabled={opRunning}
                  className="flex items-center gap-1.5 bg-accent hover:bg-accent-strong text-on-accent disabled:opacity-40 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors">
                  {opRunning && opPipelineSteps.length > 0
                    ? <div className="w-3 h-3 rounded-full border-2 border-accent-strong border-t-bg animate-spin" />
                    : <Zap size={12} />}
                  원피스 전체 파이프라인 (임포트→이름→레어도→스탯→패러렐)
                </button>
                <button onClick={() => handleOpSse('import-all')} disabled={opRunning}
                  className="flex items-center gap-1.5 bg-surface border border-accent/40 hover:border-accent text-accent-fg hover:text-[#8a5ef2] disabled:opacity-40 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors">
                  {opRunning && opType === 'import-all'
                    ? <div className="w-3 h-3 rounded-full border-2 border-line border-t-accent animate-spin" />
                    : <Download size={12} />}
                  전체 세트 임포트 (Bandai)
                </button>
                <button onClick={() => handleOpSse('rarity')} disabled={opRunning}
                  className="flex items-center gap-1.5 bg-surface border border-line hover:border-line-strong text-fg-3 hover:text-fg-2 disabled:opacity-40 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors">
                  {opRunning && opType === 'rarity'
                    ? <div className="w-3 h-3 rounded-full border-2 border-line border-t-accent animate-spin" />
                    : <Download size={12} />}
                  레어도 보강
                </button>
                <button onClick={() => handleOpSse('names')} disabled={opRunning}
                  className="flex items-center gap-1.5 bg-surface border border-line hover:border-line-strong text-fg-3 hover:text-fg-2 disabled:opacity-40 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors">
                  {opRunning && opType === 'names'
                    ? <div className="w-3 h-3 rounded-full border-2 border-line border-t-accent animate-spin" />
                    : <Download size={12} />}
                  카드명 보강
                </button>
                <button onClick={() => handleOpSse('parallels')} disabled={opRunning}
                  className="flex items-center gap-1.5 bg-surface border border-line hover:border-line-strong text-fg-3 hover:text-fg-2 disabled:opacity-40 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors">
                  {opRunning && opType === 'parallels'
                    ? <div className="w-3 h-3 rounded-full border-2 border-line border-t-accent animate-spin" />
                    : <Zap size={12} />}
                  패러렐(망가) 카드 임포트
                </button>
                <button onClick={() => handleOpSse('parallels-bandai')} disabled={opRunning}
                  className="flex items-center gap-1.5 bg-surface border border-line hover:border-line-strong text-fg-3 hover:text-fg-2 disabled:opacity-40 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors">
                  {opRunning && opType === 'parallels-bandai'
                    ? <div className="w-3 h-3 rounded-full border-2 border-line border-t-accent animate-spin" />
                    : <Zap size={12} />}
                  Bandai 패러렐 검색 임포트
                </button>
                <button onClick={() => handleOpSse('details')} disabled={opRunning}
                  className="flex items-center gap-1.5 bg-surface border border-line hover:border-line-strong text-fg-3 hover:text-fg-2 disabled:opacity-40 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors">
                  {opRunning && opType === 'details'
                    ? <div className="w-3 h-3 rounded-full border-2 border-line border-t-accent animate-spin" />
                    : <Download size={12} />}
                  카드 스탯 보강 (cost/power/효과)
                </button>
              </div>

              {opLog.length > 0 && (
                <div className="bg-black/40 border border-line rounded-xl p-3 max-h-32 overflow-y-auto font-mono text-xs space-y-0.5">
                  {opLog.map((ev, i) => (
                    <p key={i} className={
                      ev.status === 'error' || ev.type === 'error'
                        ? 'text-red-400'
                        : ev.status === 'ok'
                        ? 'text-emerald-400'
                        : 'text-muted'
                    }>
                      {ev.setId ? `${ev.setId as string}: ` : ''}
                      {(ev.status === 'ok' || ev.type === 'set-done')
                        ? `+${(ev.imported ?? ev.created ?? ev.found ?? ev.updated ?? ev.fixed ?? 0) as number}건${ev.probed !== undefined ? ` / ${ev.probed as number}장 탐색` : ''}`
                        : ev.type === 'set-start' || ev.type === 'tcg-start' || ev.type === 'info'
                        ? String(ev.setName ?? ev.message ?? ev.tcg ?? '')
                        : String(ev.reason ?? ev.status ?? '...')}
                    </p>
                  ))}
                  {opRunning && <p className="text-accent-2 animate-pulse">⋯</p>}
                </div>
              )}

              {opDone && !opRunning && (
                <div className="bg-emerald-950/30 border border-emerald-800/40 rounded-xl px-4 py-2.5 text-sm">
                  <span className="text-emerald-400 font-semibold">
                    ✓ 완료
                    {opDone.totalCreated !== undefined && ` — +${opDone.totalCreated as number}장 패러렐 카드 추가`}
                    {opDone.totalUpdated !== undefined && ` — ${opDone.totalUpdated as number}장 업데이트`}
                    {opDone.totalFixed   !== undefined && ` — ${opDone.totalFixed   as number}장 이름 업데이트`}
                    {opDone.totalImported !== undefined && ` — +${opDone.totalImported as number}장 임포트 / ${opDone.totalSkipped as number}장 스킵`}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* 세트 선택 */}
          {needsSets && (
            <div className="space-y-2">
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
                <input
                  value={setSearch}
                  onChange={e => setSetSearch(e.target.value)}
                  placeholder="세트명 검색..."
                  className="w-full pl-8 pr-3 py-2.5 bg-surface border border-line hover:border-line-strong focus:border-accent/40 rounded-xl text-sm text-fg placeholder:text-subtle focus:outline-none transition-colors"
                />
              </div>
              {setsLoading ? (
                <div className="flex items-center gap-2 text-muted text-sm py-2">
                  <div className="w-4 h-4 rounded-full border-2 border-line border-t-accent animate-spin" /> 세트 목록 로딩 중...
                </div>
              ) : (
                <div className="max-h-52 overflow-y-auto rounded-xl border border-line divide-y divide-line">
                  {filteredSets.length === 0 ? (
                    <p className="text-subtle text-sm p-3">세트가 없습니다.</p>
                  ) : filteredSets.slice(0, 200).map(s => (
                    <button key={s.id} onClick={() => setSelectedSet(s)}
                      className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left transition-colors ${
                        selectedSet?.id === s.id
                          ? 'bg-accent/15 text-accent-fg'
                          : 'hover:bg-surface-2 text-fg'
                      }`}>
                      <span>{s.name}</span>
                      <span className="text-xs text-subtle shrink-0 ml-2">
                        {s.total && `${s.total}장`}{s.releaseDate && ` · ${s.releaseDate?.slice(0, 7)}`}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 가져오기 버튼 */}
          <div className="flex items-center gap-3">
            {selectedSet && (
              <div className="flex-1 flex items-center gap-2 bg-accent/10 border border-accent/25 rounded-xl px-3 py-2 text-sm">
                <Check size={13} className="text-accent-fg shrink-0" />
                <span className="text-accent-fg truncate">{selectedSet.name}</span>
                {selectedSet.total && <span className="text-subtle shrink-0">{selectedSet.total}장</span>}
              </div>
            )}
            <button onClick={handleImport} disabled={loading || !canImport}
              className="flex items-center gap-2 bg-accent hover:bg-accent-strong disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap">
              {loading ? <div className="w-4 h-4 rounded-full border-2 border-accent-strong border-t-white animate-spin" /> : <Download size={14} />}
              {loading ? '가져오는 중...' : '가져오기'}
            </button>
          </div>

          {/* 포켓몬 일판 전체 임포트 */}
          {tcg === 'POKEMON' && (
            <div className="border-t border-line pt-4 space-y-3">
              <p className="text-xs font-semibold text-muted-2 uppercase tracking-wider">일판 전체 임포트</p>
              <div className="flex flex-wrap gap-2">
                <button onClick={handleJaImport} disabled={jaRunning}
                  className="flex items-center gap-1.5 bg-surface border border-accent/40 hover:border-accent text-accent-fg hover:text-[#8a5ef2] disabled:opacity-40 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors">
                  {jaRunning
                    ? <div className="w-3 h-3 rounded-full border-2 border-line border-t-accent animate-spin" />
                    : <Download size={12} />}
                  일판 전체 임포트 (TCGdex JA)
                </button>
              </div>
              <p className="text-xs text-subtle">TCGdex 일본어 전 세트 순회 — 영어판 대응 카드엔 일본어명 병합, 일본 독점 카드는 신규 생성</p>

              {jaLog.length > 0 && (
                <div className="bg-black/40 border border-line rounded-xl p-3 max-h-32 overflow-y-auto font-mono text-xs space-y-0.5">
                  {jaLog.map((ev, i) => (
                    <p key={i} className={ev.type === 'error' || ev.type === 'set-error' ? 'text-red-400' : ev.type === 'set-done' ? 'text-emerald-400' : 'text-muted'}>
                      {ev.setId ? `${ev.setId as string}: ` : ''}
                      {ev.type === 'set-done'
                        ? `+${(ev.created as number) ?? 0}신규 / ${(ev.merged as number) ?? 0}병합`
                        : String(ev.message ?? ev.reason ?? ev.setName ?? '...')}
                    </p>
                  ))}
                  {jaRunning && <p className="text-accent-2 animate-pulse">⋯</p>}
                </div>
              )}

              {jaDone && !jaRunning && (
                <div className="bg-emerald-950/30 border border-emerald-800/40 rounded-xl px-4 py-2.5 text-sm">
                  <span className="text-emerald-400 font-semibold">
                    ✓ 완료 — +{jaDone.totalCreated as number}장 신규 생성 / {jaDone.totalMerged as number}장 일본어명 병합
                  </span>
                </div>
              )}
            </div>
          )}

          {/* 포켓몬 다국어 이름 보강 */}
          {tcg === 'POKEMON' && (
            <div className="border-t border-line pt-4 space-y-3">
              <div>
                <p className="text-xs font-semibold text-muted-2 uppercase tracking-wider mb-0.5">한국어·일본어 이름 채우기</p>
                <p className="text-xs text-subtle">
                  이름이 없는 포켓몬 카드를 세트별로 TCGdex API → DB 기존 레코드 순으로 조회해 자동 보강합니다.
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleEnrich('ko')} disabled={enrichProgress.running}
                  className="flex items-center gap-1.5 bg-surface border border-line hover:border-line-strong text-fg-3 hover:text-fg-2 disabled:opacity-40 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors">
                  {enrichProgress.running && enrichProgress.lang === 'ko'
                    ? <div className="w-3 h-3 rounded-full border-2 border-line border-t-accent animate-spin" />
                    : <Download size={12} />}
                  한국어 이름 채우기
                </button>
                <button onClick={() => handleEnrich('ja')} disabled={enrichProgress.running}
                  className="flex items-center gap-1.5 bg-surface border border-line hover:border-line-strong text-fg-3 hover:text-fg-2 disabled:opacity-40 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors">
                  {enrichProgress.running && enrichProgress.lang === 'ja'
                    ? <div className="w-3 h-3 rounded-full border-2 border-line border-t-accent animate-spin" />
                    : <Download size={12} />}
                  일본어 이름 채우기
                </button>
              </div>

              {/* 실시간 진행 상황 */}
              {enrichProgress.running && enrichProgress.totalSets > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>세트 {enrichProgress.sets} / {enrichProgress.totalSets}</span>
                    <span className="text-emerald-400">+{enrichProgress.updated}개</span>
                  </div>
                  <div className="w-full bg-line rounded-full h-1">
                    <div
                      className="bg-teal-500 h-1 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, (enrichProgress.sets / enrichProgress.totalSets) * 100)}%` }}
                    />
                  </div>
                  {enrichProgress.currentSet && (
                    <p className="text-xs text-subtle font-mono truncate">{enrichProgress.currentSet}</p>
                  )}
                </div>
              )}

              {/* 완료 결과 */}
              {enrichResult && !enrichProgress.running && (
                <div className="bg-emerald-950/30 border border-emerald-800/40 rounded-xl px-4 py-2.5 text-sm space-y-0.5">
                  {enrichResult.message
                    ? <span className="text-muted">{enrichResult.message}</span>
                    : <>
                        <div>
                          <span className="text-emerald-400 font-semibold">✓ {enrichResult.updated.toLocaleString()}개 이름 추가됨</span>
                          <span className="text-subtle ml-2">/ 총 {enrichResult.total.toLocaleString()}장</span>
                        </div>
                        {enrichResult.failed > 0 && (
                          <div className="text-subtle text-xs">미매칭 {enrichResult.failed.toLocaleString()}건 · TCGdex 미지원 세트 {enrichProgress.notInTcgdex.toLocaleString()}장</div>
                        )}
                      </>
                  }
                </div>
              )}
            </div>
          )}

          {result && (
            <div className="bg-emerald-950/30 border border-emerald-800/40 rounded-xl px-4 py-3 text-sm">
              {result.message
                ? <span className="text-muted">{result.message}</span>
                : <>
                    <span className="text-emerald-400 font-semibold">✓ {result.imported.toLocaleString()}개 가져옴</span>
                    {(result.merged ?? 0) > 0 && <span className="text-teal-400 ml-2">· {result.merged}개 병합</span>}
                    {(result.enriched ?? 0) > 0 && <span className="text-accent-fg ml-2">· 한국어 {result.enriched}개 자동 보강</span>}
                    {result.skipped > 0 && <span className="text-subtle ml-2">({result.skipped}개 스킵)</span>}
                  </>
              }
            </div>
          )}
          {error && (
            <div className="bg-red-950/30 border border-red-800/40 rounded-xl px-4 py-3 text-sm text-red-400 flex items-center gap-2">
              <AlertCircle size={14} className="shrink-0" /> {error}
            </div>
          )}

          {/* 언어 중복 병합 */}
          <div className="border-t border-line pt-4 space-y-3">
            <p className="text-xs font-semibold text-muted-2 uppercase tracking-wider">언어별 중복 카드 일괄 병합</p>
            <p className="text-xs text-subtle">
              별도 레코드로 저장된 KO/JA 카드(tcgdex_ko_*, mtg_ko_* 등)를 같은 세트코드+카드번호의 EN 기본 카드에 병합합니다.
              리스팅과 오리파 아이템도 자동으로 이전됩니다.
            </p>
            <button
              onClick={handleMerge}
              disabled={mergeLoading}
              className="flex items-center gap-1.5 bg-accent-2/10 border border-accent-2/25 text-accent-2 hover:bg-accent-2/20 disabled:opacity-40 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors"
            >
              {mergeLoading ? <div className="w-3 h-3 rounded-full border-2 border-accent-2/30 border-t-accent-2 animate-spin" /> : <Download size={12} />}
              {mergeLoading ? '병합 중...' : '중복 카드 병합 실행'}
            </button>
            {mergeResult && (
              <div className="bg-teal-950/30 border border-teal-800/40 rounded-xl px-4 py-2.5 text-sm">
                <span className="text-teal-400 font-semibold">✓ {mergeResult.merged}개 카드 병합 완료</span>
                {mergeResult.movedListings > 0 && <span className="text-muted ml-2">· 리스팅 {mergeResult.movedListings}건 이전</span>}
                {mergeResult.movedItems > 0 && <span className="text-muted ml-2">· 오리파 아이템 {mergeResult.movedItems}건 이전</span>}
                {mergeResult.notFound > 0 && <span className="text-subtle ml-2">· 매칭 불가 {mergeResult.notFound}건</span>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function CardForm({ form, setForm, onSubmit, onCancel, loading }: {
  form: FormState
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  onSubmit: () => void
  onCancel: () => void
  loading: boolean
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2">
        <label className={labelCls}>카드명 *</label>
        <input className={inputCls} value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="ex) 피카츄" />
      </div>
      <div>
        <label className={labelCls}>TCG 종류 *</label>
        <select className={inputCls} value={form.tcgType} onChange={(e) => setForm((p) => ({ ...p, tcgType: e.target.value as TcgType }))}>
          {TCG_TYPES.map((t) => <option key={t} value={t}>{TCG_LABELS[t]}</option>)}
        </select>
      </div>
      <div>
        <label className={labelCls}>레어리티 *</label>
        <input className={inputCls} value={form.rarity} onChange={(e) => setForm((p) => ({ ...p, rarity: e.target.value }))} placeholder="ex) SR, RR, UR" />
      </div>
      <div>
        <label className={labelCls}>세트명 *</label>
        <input className={inputCls} value={form.setName} onChange={(e) => setForm((p) => ({ ...p, setName: e.target.value }))} placeholder="ex) 스칼렛&바이올렛" />
      </div>
      <div>
        <label className={labelCls}>세트 코드</label>
        <input className={inputCls} value={form.setCode} onChange={(e) => setForm((p) => ({ ...p, setCode: e.target.value }))} placeholder="ex) SV1" />
      </div>
      <div>
        <label className={labelCls}>카드 번호</label>
        <input className={inputCls} value={form.cardNumber} onChange={(e) => setForm((p) => ({ ...p, cardNumber: e.target.value }))} placeholder="ex) 025/198" />
      </div>
      <div>
        <label className={labelCls}>이미지 URL</label>
        <input className={inputCls} value={form.imageUrl} onChange={(e) => setForm((p) => ({ ...p, imageUrl: e.target.value }))} placeholder="https://..." />
      </div>
      <div className="col-span-2">
        <label className={labelCls}>설명</label>
        <textarea className={inputCls} rows={2} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
      </div>
      <div className="col-span-2 flex gap-2">
        <button onClick={onSubmit} disabled={loading || !form.name || !form.setName || !form.rarity}
          className="bg-accent hover:bg-accent-strong disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors flex items-center gap-1">
          {loading
            ? <div className="w-4 h-4 rounded-full border-2 border-accent-strong border-t-white animate-spin" />
            : <Check size={14} />}
          {loading ? '저장 중...' : '저장'}
        </button>
        <button onClick={onCancel} className="bg-surface border border-line hover:border-line-strong text-fg-3 hover:text-fg-2 px-4 py-2 rounded-xl text-sm transition-colors flex items-center gap-1">
          <X size={14} /> 취소
        </button>
      </div>
    </div>
  )
}

export default function AdminCardsPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [tcgFilter, setTcgFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editCard, setEditCard] = useState<Card | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'cards', search, tcgFilter],
    queryFn: () => api.get('/admin/cards', { params: { q: search || undefined, tcgType: tcgFilter || undefined } }).then((r) => r.data),
  })

  const createMut = useMutation({
    mutationFn: (body: typeof form) => api.post('/admin/cards', { ...body, imageUrl: body.imageUrl || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'cards'] }); setShowForm(false); setForm(emptyForm); setMsg({ type: 'ok', text: '카드가 등록되었습니다.' }) },
    onError: (e: unknown) => { const err = e as { response?: { data?: { message?: string } } }; setMsg({ type: 'err', text: err.response?.data?.message ?? '오류가 발생했습니다.' }) },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<typeof form> }) => api.patch(`/admin/cards/${id}`, { ...body, imageUrl: body.imageUrl || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'cards'] }); setEditCard(null); setMsg({ type: 'ok', text: '수정되었습니다.' }) },
    onError: (e: unknown) => { const err = e as { response?: { data?: { message?: string } } }; setMsg({ type: 'err', text: err.response?.data?.message ?? '오류가 발생했습니다.' }) },
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/cards/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'cards'] }); setMsg({ type: 'ok', text: '삭제되었습니다.' }) },
    onError: (e: unknown) => { const err = e as { response?: { data?: { message?: string } } }; setMsg({ type: 'err', text: err.response?.data?.message ?? '오류가 발생했습니다.' }) },
  })

  const [deleteAllModal, setDeleteAllModal] = useState(false)
  const [deleteAllConfirm, setDeleteAllConfirm] = useState('')
  const deleteAllMut = useMutation({
    mutationFn: () => api.delete('/admin/cards'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'cards'] })
      setDeleteAllModal(false)
      setDeleteAllConfirm('')
      setMsg({ type: 'ok', text: '카드 및 연관 데이터(리스팅·거래·입찰·인벤토리 등)가 모두 삭제되었습니다.' })
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } }
      setMsg({ type: 'err', text: err.response?.data?.message ?? '삭제 중 오류가 발생했습니다.' })
    },
  })

  function openEdit(card: Card) {
    setEditCard(card)
    setForm({ name: card.name, tcgType: card.tcgType, setName: card.setName, setCode: card.setCode ?? '', cardNumber: card.cardNumber ?? '', rarity: card.rarity, imageUrl: card.imageUrl ?? '', description: card.description ?? '' })
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-[26px] sm:text-3xl font-bold tracking-tight text-fg">카드 관리</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => { setDeleteAllModal(true); setDeleteAllConfirm('') }}
            className="flex items-center gap-1.5 bg-red-950/60 hover:bg-red-900/60 border border-red-800/40 hover:border-red-700/60 text-red-400 hover:text-red-300 px-4 py-2 rounded-xl text-sm font-semibold transition-colors">
            <Trash2 size={15} /> 전체 삭제
          </button>
          <button onClick={() => { setShowForm(true); setEditCard(null); setForm(emptyForm) }}
            className="flex items-center gap-1.5 bg-accent hover:bg-accent-strong text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors">
            <Plus size={16} /> 카드 등록
          </button>
        </div>
      </div>

      {/* 전체 삭제 확인 모달 */}
      {deleteAllModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#0d0c12] border border-red-800/40 rounded-2xl p-6 w-full max-w-md mx-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-950/60 border border-red-800/40 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} className="text-red-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">카드 전체 삭제</h2>
                <p className="text-xs text-red-400/80 mt-0.5">되돌릴 수 없는 작업입니다</p>
              </div>
            </div>
            <div className="bg-red-950/30 border border-red-800/30 rounded-xl p-3 text-xs text-red-300/90 space-y-1">
              <p className="font-semibold">다음 데이터가 모두 삭제됩니다:</p>
              <p className="text-red-400/70">카드 · 리스팅 · 입찰 · 거래 · 분쟁 · 리뷰 · 채팅 · 인벤토리 · 오리파 아이템 · 위시리스트</p>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs text-muted-2">확인하려면 아래에 <span className="text-red-400 font-mono font-bold">전체삭제</span> 를 입력하세요</p>
              <input
                value={deleteAllConfirm}
                onChange={e => setDeleteAllConfirm(e.target.value)}
                placeholder="전체삭제"
                className="w-full bg-surface border border-red-800/30 focus:border-red-600/50 rounded-xl px-4 py-2.5 text-sm text-fg placeholder:text-subtle focus:outline-none transition-colors"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { setDeleteAllModal(false); setDeleteAllConfirm('') }}
                className="flex-1 h-10 rounded-xl border border-line text-muted hover:text-fg hover:border-line-strong text-sm transition-colors">
                취소
              </button>
              <button
                onClick={() => deleteAllMut.mutate()}
                disabled={deleteAllConfirm !== '전체삭제' || deleteAllMut.isPending}
                className="flex-1 h-10 rounded-xl bg-red-800 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors">
                {deleteAllMut.isPending ? <><Loader2 size={14} className="animate-spin" /> 삭제 중...</> : '전체 삭제'}
              </button>
            </div>
          </div>
        </div>
      )}

      <WorldClassImportPanel onImported={() => qc.invalidateQueries({ queryKey: ['admin', 'cards'] })} />
      <KoreanDexPanel />
      <CardDetailSyncPanel onDone={() => qc.invalidateQueries({ queryKey: ['admin', 'cards'] })} />
      <SnkrdunkImportPanel onImported={() => qc.invalidateQueries({ queryKey: ['admin', 'cards'] })} />
      <BulkImportPanel onImported={() => qc.invalidateQueries({ queryKey: ['admin', 'cards'] })} />
      <ImportPanel onImported={() => qc.invalidateQueries({ queryKey: ['admin', 'cards'] })} />

      {msg && (
        <div className={`px-4 py-2 rounded-xl text-sm flex items-center justify-between ${
          msg.type === 'ok'
            ? 'bg-emerald-950/60 border border-emerald-800/40 text-emerald-400'
            : 'bg-red-950/60 border border-red-800/40 text-red-400'
        }`}>
          {msg.text}
          <button onClick={() => setMsg(null)} className="text-subtle hover:text-muted transition-colors"><X size={14} /></button>
        </div>
      )}

      {/* 등록/수정 폼 */}
      {(showForm || editCard) && (
        <div className="bg-surface border border-accent/25 rounded-2xl p-5">
          <h2 className="font-semibold mb-4 text-fg">{editCard ? '카드 수정' : '새 카드 등록'}</h2>
          <CardForm
            form={form}
            setForm={setForm}
            onSubmit={() => editCard ? updateMut.mutate({ id: editCard.id, body: form }) : createMut.mutate(form)}
            onCancel={() => { setShowForm(false); setEditCard(null) }}
            loading={createMut.isPending || updateMut.isPending}
          />
        </div>
      )}

      {/* 필터 */}
      <div className="flex gap-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="카드명 · 카드번호 검색..."
          className="bg-surface border border-line hover:border-line-strong focus:border-accent/40 rounded-xl px-4 py-2.5 text-sm text-fg placeholder:text-subtle focus:outline-none transition-colors w-56" />
        <select value={tcgFilter} onChange={(e) => setTcgFilter(e.target.value)}
          className="bg-surface border border-line hover:border-line-strong focus:border-accent/40 rounded-xl px-4 py-2.5 text-sm text-fg focus:outline-none transition-colors">
          <option value="">모든 TCG</option>
          {TCG_TYPES.map((t) => <option key={t} value={t}>{TCG_LABELS[t]}</option>)}
        </select>
      </div>

      {/* 테이블 */}
      <div className="bg-surface border border-line rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className="text-left px-4 py-3 text-xs text-subtle uppercase tracking-wider font-semibold">카드명</th>
              <th className="text-left px-4 py-3 text-xs text-subtle uppercase tracking-wider font-semibold">한국어명</th>
              <th className="text-left px-4 py-3 text-xs text-subtle uppercase tracking-wider font-semibold">TCG</th>
              <th className="text-left px-4 py-3 text-xs text-subtle uppercase tracking-wider font-semibold">세트</th>
              <th className="text-left px-4 py-3 text-xs text-subtle uppercase tracking-wider font-semibold hidden md:table-cell">카드번호</th>
              <th className="text-left px-4 py-3 text-xs text-subtle uppercase tracking-wider font-semibold">레어리티</th>
              <th className="text-right px-4 py-3 text-xs text-subtle uppercase tracking-wider font-semibold">관리</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-line">
                  <td colSpan={7} className="px-4 py-3"><div className="h-4 bg-surface-2 rounded animate-pulse" /></td>
                </tr>
              ))
            ) : data?.cards?.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-subtle">등록된 카드가 없습니다.</td></tr>
            ) : data?.cards?.map((card: Card) => (
              <tr key={card.id} className="border-b border-line hover:bg-surface-2 transition-colors">
                <td className="px-4 py-3 font-medium text-fg">{card.name}</td>
                <td className="px-4 py-3 text-fg">{card.nameKo ?? <span className="text-subtle">-</span>}</td>
                <td className="px-4 py-3"><Badge>{TCG_LABELS[card.tcgType]}</Badge></td>
                <td className="px-4 py-3 text-muted text-xs">{card.setName}{card.setCode && <span className="ml-1 text-subtle">({card.setCode})</span>}</td>
                <td className="px-4 py-3 hidden md:table-cell">
                  {card.cardNumber
                    ? <span className="font-mono text-xs text-accent-soft bg-accent-tint/60 border border-accent-line/50 px-1.5 py-0.5 rounded">[{card.cardNumber}]</span>
                    : <span className="text-subtle">-</span>}
                </td>
                <td className="px-4 py-3 text-muted">{card.rarity}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => openEdit(card)} className="p-1.5 text-muted hover:text-accent-fg hover:bg-accent/10 rounded transition-colors">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => { if (confirm(`"${card.name}" 카드를 삭제할까요?`)) deleteMut.mutate(card.id) }}
                      className="p-1.5 text-muted hover:text-red-400 hover:bg-red-400/10 rounded transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data?.total > 0 && (
          <div className="px-4 py-2 border-t border-line text-xs text-subtle">총 {data.total}개</div>
        )}
      </div>
    </div>
  )
}

'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { TCG_LABELS } from '@/lib/utils'
import { Plus, Pencil, Trash2, X, Check, Download, ChevronDown, ChevronUp, Search, Loader2, Zap, AlertCircle } from 'lucide-react'
import { useAuthStore } from '@/lib/store'
import Badge from '@/components/ui/Badge'

const TCG_TYPES = ['POKEMON', 'YUGIOH', 'MTG', 'DIGIMON', 'WEISS', 'OTHER'] as const
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

const inputCls = 'w-full bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] focus:border-[#d4a853]/40 rounded-xl px-4 py-2.5 text-sm text-[#f5ead8] placeholder:text-[#5a4830] focus:outline-none transition-colors'
const labelCls = 'block text-xs text-[#7a6040] uppercase tracking-wider font-semibold mb-1'

// ── 외부 API 임포트 패널 ───────────────────────────────────────────────────────

type ImportTcg = 'POKEMON' | 'YUGIOH' | 'MTG' | 'DIGIMON'
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
  if (tcg === 'YUGIOH') return '/admin/import/yugioh/sets'
  if (tcg === 'MTG')    return '/admin/import/mtg/sets'
  return null // DIGIMON: no sets
}

// ── 전체 가져오기 (SSE 스트리밍) ──────────────────────────────────────────────

type BulkTcg = 'POKEMON' | 'YUGIOH' | 'MTG' | 'DIGIMON'
type PokemonSrc = 'hq' | 'ko' | 'both'

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
  POKEMON: '포켓몬', 'POKEMON-KO': '포켓몬 KO', YUGIOH: '유희왕', MTG: 'MTG', DIGIMON: '디지몬',
}
const TCG_COLOR: Record<string, string> = {
  POKEMON: 'text-yellow-400', 'POKEMON-KO': 'text-teal-400', YUGIOH: 'text-purple-400', MTG: 'text-[#d4a853]', DIGIMON: 'text-orange-400',
}

function BulkImportPanel({ onImported }: { onImported: () => void }) {
  const { token } = useAuthStore()
  const [open, setOpen] = useState(false)
  const [types, setTypes] = useState<BulkTcg[]>(['POKEMON', 'YUGIOH', 'MTG', 'DIGIMON'])
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
    <div className="bg-[#1a1410] border border-[#f0a832]/30 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-medium hover:bg-[#1a1208] transition-colors"
      >
        <div className="flex items-center gap-2 text-[#f0a832]">
          <Zap size={15} />
          전체 일괄 가져오기 (SSE)
        </div>
        {open ? <ChevronUp size={15} className="text-[#5a4830]" /> : <ChevronDown size={15} className="text-[#5a4830]" />}
      </button>

      {open && (
        <div className="border-t border-[#2e2318] p-5 space-y-4">
          {/* 옵션 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-[#7a6040] uppercase tracking-wider">가져올 TCG</p>
              <div className="flex flex-wrap gap-1.5">
                {(['POKEMON', 'YUGIOH', 'MTG', 'DIGIMON'] as const).map(t => (
                  <button key={t} onClick={() => toggleType(t)} disabled={running}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${types.includes(t) ? 'bg-[#f0a832] text-[#0f0b08]' : 'bg-[#1a1208] border border-[#2e2318] text-[#8a7055] hover:text-[#f5ead8]'}`}>
                    {TCG_LABEL[t]}
                  </button>
                ))}
              </div>
            </div>

            {types.includes('POKEMON') && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-[#7a6040] uppercase tracking-wider">포켓몬 소스</p>
                <div className="flex flex-wrap gap-1.5">
                  {([['hq', 'HQ EN만'], ['ko', 'KO 병합만'], ['both', 'HQ EN + KO']] as const).map(([v, l]) => (
                    <button key={v} onClick={() => setPokemonSrc(v)} disabled={running}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${pokemonSrc === v ? 'bg-teal-600 text-white' : 'bg-[#1a1208] border border-[#2e2318] text-[#8a7055] hover:text-[#f5ead8]'}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs text-[#8a7055]">포켓몬/MTG 최근 개월 (0=전체)</label>
              <input type="number" min={0} max={120} value={recentMonths}
                onChange={e => setRecentMonths(Number(e.target.value))} disabled={running}
                className="w-24 bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] focus:border-[#d4a853]/40 rounded-xl px-3 py-1.5 text-sm text-[#f5ead8] focus:outline-none transition-colors" />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-[#8a7055]">MTG 최대 세트 수</label>
              <input type="number" min={1} max={300} value={mtgMaxSets}
                onChange={e => setMtgMaxSets(Number(e.target.value))} disabled={running}
                className="w-24 bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] focus:border-[#d4a853]/40 rounded-xl px-3 py-1.5 text-sm text-[#f5ead8] focus:outline-none transition-colors" />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={startImport} disabled={running || types.length === 0}
              className="flex items-center gap-2 bg-[#f0a832] hover:bg-[#d4941e] disabled:opacity-40 text-[#0f0b08] px-4 py-2 rounded-xl text-sm font-semibold transition-colors">
              {running ? <div className="w-4 h-4 rounded-full border-2 border-[#d4941e] border-t-[#0f0b08] animate-spin" /> : <Zap size={14} />}
              {running ? '가져오는 중...' : '전체 가져오기 시작'}
            </button>
            <p className="text-xs text-[#5a4830]">* 완료까지 수 분~수십 분 소요될 수 있습니다</p>
          </div>

          {/* TCG 상태 요약 */}
          {Object.keys(tcgStatus).length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(tcgStatus).map(([tcg, ev]) => (
                <div key={tcg} className="bg-[#150f0c] border border-[#2e2318] rounded-xl px-3 py-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-semibold ${TCG_COLOR[tcg] ?? 'text-[#8a7055]'}`}>{TCG_LABEL[tcg] ?? tcg}</span>
                    <span className="text-xs text-[#5a4830]">
                      {ev.type === 'tcg-done' ? '✓ 완료' : ev.type === 'progress' ? '처리 중' : '시작'}
                    </span>
                  </div>
                  {ev.type === 'tcg-done' && (
                    <p className="text-xs text-[#f5ead8]">
                      신규 {ev.imported ?? 0}개 {(ev.merged ?? 0) > 0 && `· 병합 ${ev.merged}개`}
                      {(ev as { errors?: number }).errors ? <span className="text-red-400"> · 오류 {(ev as { errors?: number }).errors}건</span> : ''}
                    </p>
                  )}
                  {ev.type === 'progress' && ev.total && (
                    <div className="mt-1">
                      <div className="w-full bg-[#2e2318] rounded-full h-1">
                        <div className="bg-[#f0a832] h-1 rounded-full transition-all"
                          style={{ width: `${Math.min(100, ((ev.offset ?? 0) / ev.total) * 100)}%` }} />
                      </div>
                      <p className="text-xs text-[#5a4830] mt-0.5">{ev.offset}/{ev.total}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 이벤트 로그 */}
          {events.length > 0 && (
            <div ref={logRef} className="bg-black/40 border border-[#2e2318] rounded-xl p-3 max-h-48 overflow-y-auto font-mono text-xs space-y-0.5">
              {events.slice(-30).map((ev, i) => {
                if (ev.type === 'done') return (
                  <p key={i} className="text-emerald-400">✓ 전체 가져오기 완료 · 신규 {totalImported.toLocaleString()}개</p>
                )
                if (ev.type === 'fatal' || ev.type === 'error') return (
                  <p key={i} className="text-red-400">✗ {ev.message ?? ev.error}</p>
                )
                if (ev.type === 'tcg-start') return (
                  <p key={i} className={TCG_COLOR[ev.tcg ?? ''] ?? 'text-[#8a7055]'}>▶ {TCG_LABEL[ev.tcg ?? ''] ?? ev.tcg} 시작 {ev.message}</p>
                )
                if (ev.type === 'tcg-done') return (
                  <p key={i} className="text-[#f5ead8]">
                    ✓ {TCG_LABEL[ev.tcg ?? ''] ?? ev.tcg} 완료: {ev.imported}개 신규, {ev.merged ?? 0}개 병합
                  </p>
                )
                if (ev.type === 'set-done') return (
                  <p key={i} className="text-[#8a7055]">
                    &nbsp; {ev.setName ?? ev.setId} → {ev.imported ?? ev.merged ?? 0}개
                  </p>
                )
                if (ev.type === 'set-error') return (
                  <p key={i} className="text-red-500">&nbsp; ✗ {ev.setName ?? ev.setId} 오류</p>
                )
                if (ev.type === 'info') return (
                  <p key={i} className="text-[#8a7055]">&nbsp; {ev.message}</p>
                )
                if (ev.type === 'progress') return (
                  <p key={i} className="text-[#5a4830]">
                    &nbsp; {TCG_LABEL[ev.tcg ?? ''] ?? ev.tcg} {ev.offset}/{ev.total} ({ev.imported}개)
                  </p>
                )
                return null
              })}
              {running && <p className="text-[#f0a832] animate-pulse">⋯</p>}
            </div>
          )}

          {done && doneEv?.totals && (
            <div className="bg-emerald-950/30 border border-emerald-800/40 rounded-xl px-4 py-3 text-sm">
              <p className="text-emerald-400 font-semibold mb-1">✓ 전체 가져오기 완료</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs">
                {Object.entries(doneEv.totals).map(([tcg, t]) => (
                  <div key={tcg} className="flex justify-between text-[#8a7055]">
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

// ── 외부 API 임포트 패널 ───────────────────────────────────────────────────────

function ImportPanel({ onImported }: { onImported: () => void }) {
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
  const [enrichKoLoading, setEnrichKoLoading] = useState(false)
  const [enrichJaLoading, setEnrichJaLoading] = useState(false)
  const [enrichResult, setEnrichResult] = useState<EnrichResult | null>(null)
  const [mergeLoading, setMergeLoading] = useState(false)
  const [mergeResult, setMergeResult] = useState<MergeResult | null>(null)
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
    const setLoadingFn = lang === 'ko' ? setEnrichKoLoading : setEnrichJaLoading
    setLoadingFn(true)
    setEnrichResult(null)
    try {
      const r = await api.post(`/admin/import/pokemon/enrich-${lang}`)
      setEnrichResult(r.data)
      onImported()
    } catch {
      setError(`${lang === 'ko' ? '한국어' : '일본어'} 이름 보강에 실패했습니다.`)
    } finally {
      setLoadingFn(false)
    }
  }

  const filteredSets = sets.filter(s => s.name.toLowerCase().includes(setSearch.toLowerCase()))
  const canImport = tcg === 'DIGIMON' ? true : !!selectedSet

  return (
    <div className="bg-[#1a1410] border border-[#2e2318] rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-medium hover:bg-[#1a1208] transition-colors"
      >
        <div className="flex items-center gap-2 text-[#d4a853]">
          <Download size={15} />
          외부 API에서 카드 데이터 가져오기
        </div>
        {open ? <ChevronUp size={15} className="text-[#5a4830]" /> : <ChevronDown size={15} className="text-[#5a4830]" />}
      </button>

      {open && (
        <div className="border-t border-[#2e2318] p-5 space-y-4">

          {/* 1단: TCG 종류 */}
          <div className="flex gap-1.5">
            {(['POKEMON', 'YUGIOH', 'MTG', 'DIGIMON'] as const).map(t => (
              <button key={t} onClick={() => switchTcg(t)}
                className={`px-3.5 py-1.5 rounded-xl text-sm font-semibold transition-colors ${
                  tcg === t ? 'bg-[#d4a853] text-white' : 'bg-[#1a1410] border border-[#2e2318] text-[#8a7055] hover:border-[#4a3520] hover:text-[#f5ead8]'
                }`}>
                {t === 'POKEMON' ? '포켓몬' : t === 'YUGIOH' ? '유희왕' : t === 'DIGIMON' ? '디지몬' : 'MTG'}
              </button>
            ))}
          </div>

          {/* 2단: 언어 선택 (포켓몬 / MTG) */}
          {tcg === 'POKEMON' && (
            <div className="flex gap-1.5 flex-wrap">
              {POKEMON_LANGS.map(l => (
                <button key={l.id} onClick={() => switchPLang(l.id)}
                  className={`px-3 py-1 rounded-xl text-xs font-semibold transition-colors ${
                    pLang === l.id ? 'bg-teal-600 text-white' : 'bg-[#1a1410] border border-[#2e2318] text-[#8a7055] hover:border-[#4a3520] hover:text-[#f5ead8]'
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
                    mLang === l.id ? 'bg-teal-600 text-white' : 'bg-[#1a1410] border border-[#2e2318] text-[#8a7055] hover:border-[#4a3520] hover:text-[#f5ead8]'
                  }`}>
                  {l.label}
                </button>
              ))}
              {mLang !== 'en' && (
                <span className="text-xs text-[#5a4830] self-center ml-1">
                  * 해당 언어로 발매된 세트만 결과가 있습니다
                </span>
              )}
            </div>
          )}
          {tcg === 'YUGIOH' && (
            <div className="space-y-1">
              <p className="text-xs text-[#8a7055]">YGOProDeck API · 영어 세트 데이터 (총 14,000+장)</p>
              <p className="text-xs text-[#5a4830]">세트별 가져오기: 아래에서 세트 선택 후 가져오기 | 전체: 위 &ldquo;전체 일괄 가져오기&rdquo; 패널 사용 권장</p>
            </div>
          )}
          {tcg === 'DIGIMON' && (
            <p className="text-xs text-[#8a7055]">digimoncard.io API · 전체 디지몬 카드 5,000+장을 한 번에 가져옵니다.</p>
          )}

          {/* 세트 선택 */}
          {needsSets && (
            <div className="space-y-2">
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a4830]" />
                <input
                  value={setSearch}
                  onChange={e => setSetSearch(e.target.value)}
                  placeholder="세트명 검색..."
                  className="w-full pl-8 pr-3 py-2.5 bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] focus:border-[#d4a853]/40 rounded-xl text-sm text-[#f5ead8] placeholder:text-[#5a4830] focus:outline-none transition-colors"
                />
              </div>
              {setsLoading ? (
                <div className="flex items-center gap-2 text-[#8a7055] text-sm py-2">
                  <div className="w-4 h-4 rounded-full border-2 border-[#2e2318] border-t-[#d4a853] animate-spin" /> 세트 목록 로딩 중...
                </div>
              ) : (
                <div className="max-h-52 overflow-y-auto rounded-xl border border-[#2e2318] divide-y divide-[#2e2318]">
                  {filteredSets.length === 0 ? (
                    <p className="text-[#5a4830] text-sm p-3">세트가 없습니다.</p>
                  ) : filteredSets.slice(0, 200).map(s => (
                    <button key={s.id} onClick={() => setSelectedSet(s)}
                      className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left transition-colors ${
                        selectedSet?.id === s.id
                          ? 'bg-[#d4a853]/15 text-[#d4a853]'
                          : 'hover:bg-[#1a1208] text-[#f5ead8]'
                      }`}>
                      <span>{s.name}</span>
                      <span className="text-xs text-[#5a4830] shrink-0 ml-2">
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
              <div className="flex-1 flex items-center gap-2 bg-[#d4a853]/10 border border-[#d4a853]/25 rounded-xl px-3 py-2 text-sm">
                <Check size={13} className="text-[#d4a853] shrink-0" />
                <span className="text-[#d4a853] truncate">{selectedSet.name}</span>
                {selectedSet.total && <span className="text-[#5a4830] shrink-0">{selectedSet.total}장</span>}
              </div>
            )}
            <button onClick={handleImport} disabled={loading || !canImport}
              className="flex items-center gap-2 bg-[#d4a853] hover:bg-[#c49440] disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap">
              {loading ? <div className="w-4 h-4 rounded-full border-2 border-[#c49440] border-t-white animate-spin" /> : <Download size={14} />}
              {loading ? '가져오는 중...' : '가져오기'}
            </button>
          </div>

          {/* 포켓몬 다국어 이름 보강 (항상 표시) */}
          {tcg === 'POKEMON' && (
            <div className="border-t border-[#2e2318] pt-4 space-y-3">
              <div>
                <p className="text-xs font-semibold text-[#7a6040] uppercase tracking-wider mb-0.5">한국어·일본어 이름 채우기</p>
                <p className="text-xs text-[#5a4830]">한국어 이름이 없는 포켓몬 카드를 TCGdex KO/JA API로 일괄 보강합니다. (최대 5,000장 처리)</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleEnrich('ko')} disabled={enrichKoLoading}
                  className="flex items-center gap-1.5 bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] text-[#9e8a6a] hover:text-[#e8d5b0] disabled:opacity-40 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors">
                  {enrichKoLoading ? <div className="w-3 h-3 rounded-full border-2 border-[#2e2318] border-t-[#d4a853] animate-spin" /> : <Download size={12} />}
                  한국어 이름 채우기
                </button>
                <button onClick={() => handleEnrich('ja')} disabled={enrichJaLoading}
                  className="flex items-center gap-1.5 bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] text-[#9e8a6a] hover:text-[#e8d5b0] disabled:opacity-40 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors">
                  {enrichJaLoading ? <div className="w-3 h-3 rounded-full border-2 border-[#2e2318] border-t-[#d4a853] animate-spin" /> : <Download size={12} />}
                  일본어 이름 채우기
                </button>
              </div>
              {enrichResult && (
                <div className="bg-emerald-950/30 border border-emerald-800/40 rounded-xl px-4 py-2.5 text-sm">
                  {enrichResult.message
                    ? <span className="text-[#8a7055]">{enrichResult.message}</span>
                    : <><span className="text-emerald-400 font-semibold">✓ {enrichResult.updated}개 이름 추가됨</span>
                       {enrichResult.failed > 0 && <span className="text-[#5a4830] ml-2">({enrichResult.failed}개 TCGdex 미지원)</span>}</>
                  }
                </div>
              )}
            </div>
          )}

          {result && (
            <div className="bg-emerald-950/30 border border-emerald-800/40 rounded-xl px-4 py-3 text-sm">
              {result.message
                ? <span className="text-[#8a7055]">{result.message}</span>
                : <>
                    <span className="text-emerald-400 font-semibold">✓ {result.imported.toLocaleString()}개 가져옴</span>
                    {(result.merged ?? 0) > 0 && <span className="text-teal-400 ml-2">· {result.merged}개 병합</span>}
                    {(result.enriched ?? 0) > 0 && <span className="text-[#d4a853] ml-2">· 한국어 {result.enriched}개 자동 보강</span>}
                    {result.skipped > 0 && <span className="text-[#5a4830] ml-2">({result.skipped}개 스킵)</span>}
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
          <div className="border-t border-[#2e2318] pt-4 space-y-3">
            <p className="text-xs font-semibold text-[#7a6040] uppercase tracking-wider">언어별 중복 카드 일괄 병합</p>
            <p className="text-xs text-[#5a4830]">
              별도 레코드로 저장된 KO/JA 카드(tcgdex_ko_*, mtg_ko_* 등)를 같은 세트코드+카드번호의 EN 기본 카드에 병합합니다.
              리스팅과 오리파 아이템도 자동으로 이전됩니다.
            </p>
            <button
              onClick={handleMerge}
              disabled={mergeLoading}
              className="flex items-center gap-1.5 bg-[#f0a832]/10 border border-[#f0a832]/25 text-[#f0a832] hover:bg-[#f0a832]/20 disabled:opacity-40 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors"
            >
              {mergeLoading ? <div className="w-3 h-3 rounded-full border-2 border-[#f0a832]/30 border-t-[#f0a832] animate-spin" /> : <Download size={12} />}
              {mergeLoading ? '병합 중...' : '중복 카드 병합 실행'}
            </button>
            {mergeResult && (
              <div className="bg-teal-950/30 border border-teal-800/40 rounded-xl px-4 py-2.5 text-sm">
                <span className="text-teal-400 font-semibold">✓ {mergeResult.merged}개 카드 병합 완료</span>
                {mergeResult.movedListings > 0 && <span className="text-[#8a7055] ml-2">· 리스팅 {mergeResult.movedListings}건 이전</span>}
                {mergeResult.movedItems > 0 && <span className="text-[#8a7055] ml-2">· 오리파 아이템 {mergeResult.movedItems}건 이전</span>}
                {mergeResult.notFound > 0 && <span className="text-[#5a4830] ml-2">· 매칭 불가 {mergeResult.notFound}건</span>}
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
          className="bg-[#d4a853] hover:bg-[#c49440] disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors flex items-center gap-1">
          {loading
            ? <div className="w-4 h-4 rounded-full border-2 border-[#c49440] border-t-white animate-spin" />
            : <Check size={14} />}
          {loading ? '저장 중...' : '저장'}
        </button>
        <button onClick={onCancel} className="bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] text-[#9e8a6a] hover:text-[#e8d5b0] px-4 py-2 rounded-xl text-sm transition-colors flex items-center gap-1">
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

  function openEdit(card: Card) {
    setEditCard(card)
    setForm({ name: card.name, tcgType: card.tcgType, setName: card.setName, setCode: card.setCode ?? '', cardNumber: card.cardNumber ?? '', rarity: card.rarity, imageUrl: card.imageUrl ?? '', description: card.description ?? '' })
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#f5ead8]">카드 관리</h1>
        <button onClick={() => { setShowForm(true); setEditCard(null); setForm(emptyForm) }}
          className="flex items-center gap-1.5 bg-[#d4a853] hover:bg-[#c49440] text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors">
          <Plus size={16} /> 카드 등록
        </button>
      </div>

      <BulkImportPanel onImported={() => qc.invalidateQueries({ queryKey: ['admin', 'cards'] })} />
      <ImportPanel onImported={() => qc.invalidateQueries({ queryKey: ['admin', 'cards'] })} />

      {msg && (
        <div className={`px-4 py-2 rounded-xl text-sm flex items-center justify-between ${
          msg.type === 'ok'
            ? 'bg-emerald-950/60 border border-emerald-800/40 text-emerald-400'
            : 'bg-red-950/60 border border-red-800/40 text-red-400'
        }`}>
          {msg.text}
          <button onClick={() => setMsg(null)} className="text-[#5a4830] hover:text-[#8a7055] transition-colors"><X size={14} /></button>
        </div>
      )}

      {/* 등록/수정 폼 */}
      {(showForm || editCard) && (
        <div className="bg-[#1a1410] border border-[#d4a853]/25 rounded-2xl p-5">
          <h2 className="font-semibold mb-4 text-[#f5ead8]">{editCard ? '카드 수정' : '새 카드 등록'}</h2>
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
          className="bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] focus:border-[#d4a853]/40 rounded-xl px-4 py-2.5 text-sm text-[#f5ead8] placeholder:text-[#5a4830] focus:outline-none transition-colors w-56" />
        <select value={tcgFilter} onChange={(e) => setTcgFilter(e.target.value)}
          className="bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] focus:border-[#d4a853]/40 rounded-xl px-4 py-2.5 text-sm text-[#f5ead8] focus:outline-none transition-colors">
          <option value="">모든 TCG</option>
          {TCG_TYPES.map((t) => <option key={t} value={t}>{TCG_LABELS[t]}</option>)}
        </select>
      </div>

      {/* 테이블 */}
      <div className="bg-[#1a1410] border border-[#2e2318] rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#2e2318]">
              <th className="text-left px-4 py-3 text-xs text-[#5a4830] uppercase tracking-wider font-semibold">카드명</th>
              <th className="text-left px-4 py-3 text-xs text-[#5a4830] uppercase tracking-wider font-semibold">한국어명</th>
              <th className="text-left px-4 py-3 text-xs text-[#5a4830] uppercase tracking-wider font-semibold">TCG</th>
              <th className="text-left px-4 py-3 text-xs text-[#5a4830] uppercase tracking-wider font-semibold">세트</th>
              <th className="text-left px-4 py-3 text-xs text-[#5a4830] uppercase tracking-wider font-semibold hidden md:table-cell">카드번호</th>
              <th className="text-left px-4 py-3 text-xs text-[#5a4830] uppercase tracking-wider font-semibold">레어리티</th>
              <th className="text-right px-4 py-3 text-xs text-[#5a4830] uppercase tracking-wider font-semibold">관리</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-[#2e2318]">
                  <td colSpan={7} className="px-4 py-3"><div className="h-4 bg-[#1a1208] rounded animate-pulse" /></td>
                </tr>
              ))
            ) : data?.cards?.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-[#5a4830]">등록된 카드가 없습니다.</td></tr>
            ) : data?.cards?.map((card: Card) => (
              <tr key={card.id} className="border-b border-[#2e2318] hover:bg-[#1a1208] transition-colors">
                <td className="px-4 py-3 font-medium text-[#f5ead8]">{card.name}</td>
                <td className="px-4 py-3 text-[#f5ead8]">{card.nameKo ?? <span className="text-[#5a4830]">-</span>}</td>
                <td className="px-4 py-3"><Badge>{TCG_LABELS[card.tcgType]}</Badge></td>
                <td className="px-4 py-3 text-[#8a7055] text-xs">{card.setName}{card.setCode && <span className="ml-1 text-[#5a4830]">({card.setCode})</span>}</td>
                <td className="px-4 py-3 hidden md:table-cell">
                  {card.cardNumber
                    ? <span className="font-mono text-xs text-[#e0b878] bg-[#2a1c08]/60 border border-[#3d2a0c]/50 px-1.5 py-0.5 rounded">{card.cardNumber}</span>
                    : <span className="text-[#5a4830]">-</span>}
                </td>
                <td className="px-4 py-3 text-[#8a7055]">{card.rarity}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => openEdit(card)} className="p-1.5 text-[#8a7055] hover:text-[#d4a853] hover:bg-[#d4a853]/10 rounded transition-colors">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => { if (confirm(`"${card.name}" 카드를 삭제할까요?`)) deleteMut.mutate(card.id) }}
                      className="p-1.5 text-[#8a7055] hover:text-red-400 hover:bg-red-400/10 rounded transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data?.total > 0 && (
          <div className="px-4 py-2 border-t border-[#2e2318] text-xs text-[#5a4830]">총 {data.total}개</div>
        )}
      </div>
    </div>
  )
}

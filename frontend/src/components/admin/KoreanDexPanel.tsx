'use client'

import { useState } from 'react'
import { BookOpen, Loader2 } from 'lucide-react'
import { useAuthStore } from '@/lib/store'

// 관리자: 한국어 도감 데이터 구축 (포켓몬 전체 + 다른 TCG)
const OPTIONS = [
  { key: 'pokemon', label: '포켓몬 도감·한국어', desc: 'PokeAPI 한국어 도감, 공식 한판 문장 사전, 일판·영문판 카드 한국어 적용' },
  { key: 'importCards', label: '포켓몬 일판·한판 전 세트 카드 임포트', desc: '없는 카드를 새로 추가 (카드 수가 많아 시간이 걸림)' },
  { key: 'yugioh', label: '유희왕 상세·공식 한국어', desc: 'ATK/DEF·레벨·속성 + 한국어 이름·효과, 없는 카드 추가' },
  { key: 'digimon', label: '디지몬 상세', desc: '레벨·DP·코스트·효과, 없는 카드 추가' },
  { key: 'mtg', label: 'MTG 상세·공식 한국어', desc: '마나·타입·P/T·오라클 텍스트, 한국어판 텍스트 공유' },
] as const

export function KoreanDexPanel() {
  const token = useAuthStore(s => s.token)
  const [opts, setOpts] = useState<Record<string, boolean>>(Object.fromEntries(OPTIONS.map(o => [o.key, true])))
  const [running, setRunning] = useState(false)
  const [step, setStep] = useState('')
  const [log, setLog] = useState<string[]>([])
  const [error, setError] = useState('')

  async function start() {
    if (running) return
    setRunning(true); setStep(''); setLog([]); setError('')
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api'
      const qs = new URLSearchParams(Object.entries(opts).map(([k, v]) => [k, v ? '1' : '0'])).toString()
      const res = await fetch(`${apiBase}/admin/import/korean-dex?${qs}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok || !res.body) { setError(`HTTP ${res.status}`); return }
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const ev = JSON.parse(line.slice(6)) as Record<string, unknown>
            if (ev.type === 'step') { setStep(String(ev.step)); setLog(l => [...l.slice(-30), `▶ ${ev.step}`]) }
            else if (ev.type === 'error') setError(String(ev.reason))
            else if (ev.type === 'done') setLog(l => [...l, '✓ 완료'])
            else if (/done|fetched|korean$/.test(String(ev.type))) setLog(l => [...l.slice(-30), `  ${JSON.stringify(ev)}`])
          } catch { /* 무시 */ }
        }
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setRunning(false); setStep('')
    }
  }

  return (
    <div className="bg-surface border border-line rounded-2xl p-5 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <BookOpen size={15} className="text-accent-fg" />
        <div className="flex-1 min-w-[200px]">
          <p className="text-sm font-medium text-fg">한국어 도감 데이터 구축</p>
          <p className="text-xs text-muted">카드 정보를 넓게 가져오고 한국어로 볼 수 있게 만듭니다. 처음 한 번은 수십 분 걸릴 수 있어요. 이미 처리된 카드는 건너뜁니다.</p>
        </div>
        <button onClick={start} disabled={running || !Object.values(opts).some(Boolean)}
          className="h-9 px-4 rounded-xl bg-accent/15 text-accent-fg text-sm font-semibold hover:bg-accent/25 inline-flex items-center gap-1.5 disabled:opacity-50">
          {running && <Loader2 size={14} className="animate-spin" />}{running ? step || '실행 중…' : '구축 시작'}
        </button>
      </div>
      <div className="grid sm:grid-cols-2 gap-1.5">
        {OPTIONS.map(o => (
          <label key={o.key} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs cursor-pointer ${opts[o.key] ? 'border-accent-line bg-accent-tint/40' : 'border-line'}`}>
            <input type="checkbox" checked={opts[o.key]} disabled={running} onChange={e => setOpts(p => ({ ...p, [o.key]: e.target.checked }))} className="mt-0.5" />
            <span><span className="block font-medium text-fg-2">{o.label}</span><span className="text-subtle">{o.desc}</span></span>
          </label>
        ))}
      </div>
      {log.length > 0 && (
        <div className="bg-black/40 border border-line rounded-xl p-3 max-h-40 overflow-y-auto font-mono text-[11px] text-muted space-y-0.5">
          {log.map((l, i) => <p key={i} className="break-all">{l}</p>)}
        </div>
      )}
      {error && <p className="text-xs text-rose-300">{error}</p>}
    </div>
  )
}

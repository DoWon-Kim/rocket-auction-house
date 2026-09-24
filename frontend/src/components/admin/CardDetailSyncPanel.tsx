'use client'

import { useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { useAuthStore } from '@/lib/store'

// 관리자: 카드 상세(레어도·HP·기술·진화·도감번호·레귤레이션·일러스트레이터)와 세트 정보(발매일·로고) 보강
export function CardDetailSyncPanel({ onDone }: { onDone?: () => void }) {
  const token = useAuthStore(s => s.token)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<Record<string, number> | null>(null)
  const [result, setResult] = useState<Record<string, number> | null>(null)
  const [error, setError] = useState('')

  async function start() {
    if (running) return
    setRunning(true); setProgress(null); setResult(null); setError('')
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api'
      const res = await fetch(`${apiBase}/admin/import/card-details`, { headers: { Authorization: `Bearer ${token}` } })
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
            if (ev.type === 'progress') setProgress(ev as Record<string, number>)
            else if (ev.type === 'done') { setResult(ev as Record<string, number>); onDone?.() }
            else if (ev.type === 'error') setError(String(ev.reason ?? '오류'))
          } catch { /* 무시 */ }
        }
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setRunning(false)
    }
  }

  const n = (v: number | undefined) => (v ?? 0).toLocaleString()

  return (
    <div className="bg-surface border border-line rounded-2xl p-5 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Sparkles size={15} className="text-accent-fg" />
        <div className="flex-1 min-w-[200px]">
          <p className="text-sm font-medium text-fg">카드 상세·세트 정보 보강</p>
          <p className="text-xs text-muted">
            TCGdex·pokemontcg.io에서 레어도·HP·기술·진화·도감번호·레귤레이션·일러스트레이터와 세트 발매일·로고를 채웁니다.
            이미 보강된 카드는 건너뛰고, 운영 환경에서는 매일 새벽 5시에 새 카드만 자동 보강합니다.
          </p>
        </div>
        <button onClick={start} disabled={running}
          className="h-9 px-4 rounded-xl bg-accent/15 text-accent-fg text-sm font-semibold hover:bg-accent/25 inline-flex items-center gap-1.5 disabled:opacity-50">
          {running && <Loader2 size={14} className="animate-spin" />}{running ? '보강 중…' : '보강 시작'}
        </button>
      </div>
      {(progress || result) && (
        <p className="text-xs text-fg-3 tabular-nums">
          {result ? '✓ 완료 — ' : '진행 중 — '}
          TCGdex {n((result ?? progress)?.tcgdex)} · pokemontcg {n((result ?? progress)?.ptcg)} · 상세 없음 {n((result ?? progress)?.notFound)} · 오류 {n((result ?? progress)?.errors)}
          {result && ` · 세트 ${n(result.sets)}개`}
        </p>
      )}
      {error && <p className="text-xs text-rose-300">{error}</p>}
    </div>
  )
}

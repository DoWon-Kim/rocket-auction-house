'use client'

import { useState } from 'react'
import { ShieldCheck, ShieldAlert, Loader2, Lock, Unlock, Copy } from 'lucide-react'
import { type OripaDetail, verifyOripa } from '@/lib/oripa'

// 공정성: 판매 전 공개한 해시 → 완판 후 시드 공개 → 브라우저에서 직접 검증
export function FairnessPanel({ o }: { o: OripaDetail }) {
  const [state, setState] = useState<{ running: boolean; done?: number; result?: { hashOk: boolean; orderOk: boolean } }>({ running: false })
  const total = o.ticketOrder?.filter(Boolean).length ?? 0
  const copy = (t: string) => navigator.clipboard?.writeText(t)

  async function run() {
    setState({ running: true, done: 0 })
    const result = await verifyOripa(o, done => setState(s => ({ ...s, done })))
    setState({ running: false, result })
  }

  return (
    <div className="space-y-4 text-sm">
      <ol className="space-y-3">
        <li className="flex gap-3">
          <span className="w-7 h-7 shrink-0 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold">1</span>
          <p className="text-white/70">판매 시작 순간, 서버가 비밀 값(시드)으로 전체 티켓 순서를 섞어 <b className="text-white">봉인</b>해요. 이후 상품 구성과 순서는 바꿀 수 없어요.</p>
        </li>
        <li className="flex gap-3">
          <span className="w-7 h-7 shrink-0 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold">2</span>
          <p className="text-white/70">시드 자체는 숨기고, 시드의 지문(SHA-256 해시)만 먼저 공개해요. 지문으로는 순서를 알 수 없지만, 나중에 시드를 바꿔치기하면 지문이 달라져요.</p>
        </li>
        <li className="flex gap-3">
          <span className="w-7 h-7 shrink-0 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold">3</span>
          <p className="text-white/70">완판되면 시드와 실제 추첨 순서를 공개해요. 아래 버튼으로 이 브라우저에서 직접 다시 섞어 보고 결과가 같은지 확인할 수 있어요.</p>
        </li>
      </ol>

      <div className="rounded-2xl border border-white/10 bg-black/30 p-4 space-y-2 font-mono text-[11px] break-all">
        <p className="flex items-center gap-1.5 text-white/50 font-sans text-xs"><Lock size={12} />공개된 시드 지문 (판매 시작 시)</p>
        <p className="text-emerald-200 flex items-start gap-2">{o.seedHash ?? '판매 시작 전'}{o.seedHash && <button onClick={() => copy(o.seedHash!)} aria-label="복사" className="text-white/40 hover:text-white shrink-0"><Copy size={12} /></button>}</p>
        {o.status === 'SOLD_OUT' && o.serverSeed ? (
          <>
            <p className="flex items-center gap-1.5 text-white/50 font-sans text-xs pt-2"><Unlock size={12} />공개된 시드 (완판 후)</p>
            <p className="text-amber-200 flex items-start gap-2">{o.serverSeed}<button onClick={() => copy(o.serverSeed!)} aria-label="복사" className="text-white/40 hover:text-white shrink-0"><Copy size={12} /></button></p>
          </>
        ) : (
          <p className="font-sans text-xs text-white/40 pt-2">시드는 완판 후 공개돼요.</p>
        )}
      </div>

      {o.status === 'SOLD_OUT' && o.serverSeed && (
        <div className="space-y-2">
          <button onClick={run} disabled={state.running} className="h-10 px-4 rounded-xl bg-white text-black text-sm font-bold inline-flex items-center gap-2 disabled:opacity-60">
            {state.running ? <><Loader2 size={15} className="animate-spin" />검증 중… {state.done?.toLocaleString()} / {total.toLocaleString()}</> : <><ShieldCheck size={15} />직접 검증하기</>}
          </button>
          {state.result && (
            <div className={`rounded-xl px-4 py-3 text-sm ${state.result.hashOk && state.result.orderOk ? 'bg-emerald-500/10 text-emerald-200' : 'bg-rose-500/10 text-rose-200'}`}>
              <p className="flex items-center gap-1.5 font-bold">{state.result.hashOk && state.result.orderOk ? <ShieldCheck size={15} /> : <ShieldAlert size={15} />}{state.result.hashOk && state.result.orderOk ? '검증 완료 — 봉인된 순서 그대로 추첨되었어요.' : '검증 실패'}</p>
              <p className="text-xs mt-1 opacity-80">시드 지문 일치: {state.result.hashOk ? '예' : '아니오'} · 추첨 순서 일치: {state.result.orderOk ? '예' : '아니오'} ({total.toLocaleString()}장)</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

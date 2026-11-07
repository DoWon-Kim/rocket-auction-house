'use client'

import { useMemo, useSyncExternalStore } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { History, X } from 'lucide-react'
import type { RecentListing } from '@/lib/market'

const KEY = 'recent-listings'
const CHANGE = 'recent-listings-change'

function subscribe(cb: () => void) {
  window.addEventListener('storage', cb)
  window.addEventListener(CHANGE, cb)
  return () => { window.removeEventListener('storage', cb); window.removeEventListener(CHANGE, cb) }
}
const snapshot = () => { try { return localStorage.getItem(KEY) ?? '[]' } catch { return '[]' } }

// 최근 본 상품 — 이 브라우저에서 본 상품 (localStorage)
export function RecentlyViewed({ excludeId }: { excludeId?: string }) {
  const raw = useSyncExternalStore(subscribe, snapshot, () => '[]')
  const items = useMemo(() => {
    try { return (JSON.parse(raw) as RecentListing[]).filter(r => r.id !== excludeId) } catch { return [] }
  }, [raw, excludeId])
  if (items.length === 0) return null

  const clear = () => {
    try { localStorage.removeItem(KEY) } catch { /* 무시 */ }
    window.dispatchEvent(new Event(CHANGE))
  }

  return (
    <section className="rounded-2xl border border-line bg-surface/60 px-4 py-3">
      <div className="flex items-center justify-between mb-2.5">
        <h2 className="text-xs font-semibold text-muted flex items-center gap-1.5"><History size={13} />최근 본 상품</h2>
        <button onClick={clear} className="text-[11px] text-subtle hover:text-fg flex items-center gap-0.5"><X size={11} />지우기</button>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
        {items.map(r => (
          <Link key={r.id} href={`/listings/${r.id}`} className="w-20 shrink-0 group">
            <span className="relative block w-20 h-20 rounded-xl overflow-hidden bg-sunken border border-line">
              {r.thumb ? <Image src={r.thumb} alt="" fill sizes="80px" className="object-cover group-hover:scale-105 transition-transform" /> : <span className="absolute inset-0 flex items-center justify-center text-2xl opacity-20">🃏</span>}
            </span>
            <span className="block mt-1 text-[11px] text-fg-3 truncate">{r.title}</span>
            {r.price != null && <span className="block text-[11px] font-semibold text-fg tabular-nums">{r.price.toLocaleString()}P</span>}
          </Link>
        ))}
      </div>
    </section>
  )
}

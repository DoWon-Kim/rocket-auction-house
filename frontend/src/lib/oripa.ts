// 오리파 공용 타입·등급 스타일·공정성 검증
export interface OripaCardInfo { id: string; name: string; nameKo: string | null; imageUrl: string | null; rarity: string; setName?: string; snkrdunkPrice?: number | null }
export interface OripaPrize {
  id: string
  prizeType: 'CARD' | 'POINT'
  pointAmount: number | null
  label: string | null
  grade: number
  quantity: number
  remaining: number
  exchangeValue: number | null
  isLastOne: boolean
  card: OripaCardInfo | null
}
export interface OripaSummary {
  id: string; title: string; description: string | null; imageUrl: string | null; tcgType: string
  pricePerDraw: number; totalSlots: number; remainSlots: number; maxPerDraw: number
  status: 'DRAFT' | 'LIVE' | 'PAUSED' | 'SOLD_OUT'
  startedAt: string | null; soldOutAt: string | null
  items: OripaPrize[]; prizeCount?: number
  _count: { purchases: number }
}
export interface OripaDetail extends OripaSummary { seedHash: string | null; serverSeed?: string | null; ticketOrder?: string[] }
export interface DrawResult {
  ticketNo: number | null; itemId: string; grade: number; prizeType: 'CARD' | 'POINT'
  pointAmount: number | null; exchangeValue: number | null; label: string | null; isLastOne: boolean
  card: OripaCardInfo | null; name: string; inventoryItemId?: string | null
}

export const prizeName = (p: Pick<OripaPrize, 'label' | 'prizeType' | 'pointAmount' | 'card'>) =>
  p.label || (p.prizeType === 'POINT' ? `${(p.pointAmount ?? 0).toLocaleString()}P` : p.card?.nameKo ?? p.card?.name ?? '상품')

// 등급별 이름·색 (4=최상위상 … 1=하위상, 라스트원상은 별도)
export const GRADE = {
  4: { label: '최상위상', short: 'SSR', text: 'text-amber-200', chip: 'bg-gradient-to-r from-amber-400 via-rose-400 to-fuchsia-500 text-white', ring: 'ring-amber-300/70', glow: 'shadow-[0_0_40px_rgba(251,191,36,0.55)]', bar: 'from-amber-400 to-rose-500', hex: '#fbbf24' },
  3: { label: '상위상', short: 'SR', text: 'text-fuchsia-200', chip: 'bg-fuchsia-500/90 text-white', ring: 'ring-fuchsia-400/60', glow: 'shadow-[0_0_30px_rgba(217,70,239,0.45)]', bar: 'from-fuchsia-500 to-violet-500', hex: '#d946ef' },
  2: { label: '중위상', short: 'R', text: 'text-sky-200', chip: 'bg-sky-500/80 text-white', ring: 'ring-sky-400/50', glow: 'shadow-[0_0_20px_rgba(56,189,248,0.35)]', bar: 'from-sky-400 to-cyan-400', hex: '#38bdf8' },
  1: { label: '하위상', short: 'N', text: 'text-slate-300', chip: 'bg-slate-600 text-white', ring: 'ring-slate-500/40', glow: '', bar: 'from-slate-500 to-slate-400', hex: '#94a3b8' },
} as const
export const gradeOf = (g: number) => GRADE[(Math.min(4, Math.max(1, g)) as 1 | 2 | 3 | 4)]
export const LAST_ONE = { label: '라스트원상', chip: 'bg-gradient-to-r from-emerald-400 to-teal-500 text-white', hex: '#34d399' }

// ── 공정성 검증 (백엔드 src/lib/oripaFair.ts 와 같은 알고리즘) ──────────────
async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

export function baseTickets(items: Array<Pick<OripaPrize, 'id' | 'quantity' | 'isLastOne'>>) {
  return [...items]
    .filter(i => !i.isLastOne && i.quantity > 0)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .flatMap(i => Array<string>(i.quantity).fill(i.id))
}

export async function shuffleTickets(tickets: string[], seed: string, onProgress?: (done: number) => void) {
  const out = [...tickets]
  for (let i = out.length - 1; i > 0; i--) {
    const j = parseInt((await sha256Hex(`${seed}:${i}`)).slice(0, 12), 16) % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
    if (onProgress && i % 200 === 0) onProgress(out.length - i)
  }
  return out
}

// 완판 후: ① 공개 시드의 해시가 판매 전 공개값과 같은지 ② 시드로 섞은 순서가 실제 순서와 같은지
export async function verifyOripa(o: Pick<OripaDetail, 'seedHash' | 'serverSeed' | 'ticketOrder' | 'items'>, onProgress?: (done: number) => void) {
  if (!o.serverSeed || !o.seedHash || !o.ticketOrder) return { hashOk: false, orderOk: false }
  const hashOk = (await sha256Hex(o.serverSeed)) === o.seedHash
  const expected = await shuffleTickets(baseTickets(o.items), o.serverSeed, onProgress)
  const actual = o.ticketOrder.filter(Boolean) // 예전 방식으로 먼저 팔린 자리는 빈칸
  return { hashOk, orderOk: expected.length === actual.length && expected.every((id, k) => id === actual[k]) }
}

export const ORIPA_STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: '준비 중', cls: 'bg-surface-2 text-muted' },
  LIVE: { label: '판매 중', cls: 'bg-emerald-500/15 text-emerald-300' },
  PAUSED: { label: '일시중지', cls: 'bg-amber-500/15 text-amber-300' },
  SOLD_OUT: { label: '완판', cls: 'bg-accent-tint text-accent-soft' },
}

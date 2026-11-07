// 관리자 대시보드 실시간 신호: DB에 의미 있는 변화가 생기면 관리자 소켓 방('admins')에 알린다.
// 여러 쓰기가 몰려도 0.8초 단위로 묶어서 한 번만 보낸다.
import { getIo } from './socketio'

// 모델 → 대시보드 이벤트 종류. create 만 보는 모델과, 상태 변경(update)까지 보는 모델을 구분
const ON_CREATE: Record<string, string> = {
  User: 'signup', Listing: 'listing', Transaction: 'trade', ShopOrder: 'shop', Report: 'report',
  WithdrawalRequest: 'withdrawal', PaymentLog: 'charge', Dispute: 'dispute', ChatMessage: 'chat',
  Offer: 'offer', ShippingRequest: 'shipping',
}
const ON_UPDATE: Record<string, string> = {
  Transaction: 'trade', Listing: 'listing', ShopOrder: 'shop', Report: 'report',
  WithdrawalRequest: 'withdrawal', Dispute: 'dispute', ShippingRequest: 'shipping', Offer: 'offer',
}
// 조회수·찜 수처럼 자주 바뀌는 숫자만 바뀐 경우는 무시
const NOISE_FIELDS = new Set(['viewCount', 'likeCount', 'updatedAt', 'readAt', 'lastMessageAt'])

let pending = new Map<string, number>()
let timer: ReturnType<typeof setTimeout> | null = null

export function pulseKind(model: string | undefined, action: string, data?: unknown): string | null {
  if (!model) return null
  if (action === 'create' || action === 'createMany') return ON_CREATE[model] ?? null
  if (action === 'update' || action === 'updateMany' || action === 'upsert') {
    const kind = ON_UPDATE[model]
    if (!kind) return null
    const keys = data && typeof data === 'object' ? Object.keys(data as object) : []
    if (keys.length > 0 && keys.every(k => NOISE_FIELDS.has(k))) return null
    return kind
  }
  return null
}

export function recordPulse(model: string | undefined, action: string, data?: unknown) {
  const kind = pulseKind(model, action, data)
  if (!kind) return
  pending.set(kind, (pending.get(kind) ?? 0) + 1)
  if (timer) return
  timer = setTimeout(() => {
    const kinds = Object.fromEntries(pending)
    pending = new Map()
    timer = null
    getIo()?.to('admins').emit('admin:pulse', { kinds, at: new Date().toISOString() })
  }, 800)
  timer.unref?.()
}

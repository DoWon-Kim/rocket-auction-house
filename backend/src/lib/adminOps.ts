// 관제실: 거래 상태 판단 (순수 함수 — 컨트롤러·테스트 공용)

export const SHIP_DEADLINE_DAYS = 3     // shipmentDeadlineJob 과 동일: 배송지 확정 후 N일 미발송 → 자동 취소·환불 (판매자 사유)
export const ADDRESS_DEADLINE_DAYS = 3  // shipmentDeadlineJob 과 동일: 낙찰 후 N일 배송지 미입력 → 자동 취소·환불 (구매자 사유)
export const AUTO_CONFIRM_DAYS = 3      // escrowAutoRelease 와 동일: 발송 후 N일 → 자동 구매확정
export const DAY = 86400_000

export type TradeFlag = 'NO_ADDRESS' | 'ADDRESS_OVERDUE' | 'SHIP_DUE_SOON' | 'SHIP_OVERDUE' | 'CONFIRM_WAITING' | 'DISPUTED'

interface TradeLike {
  txStatus: string
  completedAt: Date           // 결제(거래 생성) 시각
  shipClockAt?: Date | null   // 배송지 확정 시각 — 발송 기한의 시작점
  shippedAt: Date | null
  address: string | null
  disputeStatus?: string | null
}

export const shipDeadline = (clockAt: Date) => new Date(clockAt.getTime() + SHIP_DEADLINE_DAYS * DAY)
export const addressDeadline = (paidAt: Date) => new Date(paidAt.getTime() + ADDRESS_DEADLINE_DAYS * DAY)
export const autoConfirmAt = (shippedAt: Date) => new Date(shippedAt.getTime() + AUTO_CONFIRM_DAYS * DAY)

// 발송 대기 거래의 다음 기한: 배송지가 있으면 발송 기한, 없으면 배송지 입력 기한
export function pendingDeadline(tx: TradeLike): { kind: 'SHIP' | 'ADDRESS'; at: Date } | null {
  if (tx.txStatus !== 'PENDING_SHIPMENT') return null
  if (tx.address && tx.shipClockAt) return { kind: 'SHIP', at: shipDeadline(tx.shipClockAt) }
  if (!tx.address) return { kind: 'ADDRESS', at: addressDeadline(tx.completedAt) }
  return { kind: 'SHIP', at: shipDeadline(tx.completedAt) } // 기한 시작 시각이 없는 옛 거래
}

// 관리자가 챙겨야 할 신호
export function tradeFlags(tx: TradeLike, now = new Date()): TradeFlag[] {
  const flags: TradeFlag[] = []
  if (tx.txStatus === 'DISPUTED' || tx.disputeStatus === 'OPEN' || tx.disputeStatus === 'REVIEWING') flags.push('DISPUTED')
  const due = pendingDeadline(tx)
  if (due) {
    const left = due.at.getTime() - now.getTime()
    if (due.kind === 'ADDRESS') {
      flags.push('NO_ADDRESS')
      if (left <= 0) flags.push('ADDRESS_OVERDUE')
    } else if (left <= 0) flags.push('SHIP_OVERDUE')
    else if (left < DAY) flags.push('SHIP_DUE_SOON')
  }
  if (tx.txStatus === 'SHIPPED') flags.push('CONFIRM_WAITING')
  return flags
}

// 거래 목록 필터 → Prisma where 조건용 상태 묶음
export const TRADE_FILTERS: Record<string, string[]> = {
  active: ['PENDING_SHIPMENT', 'SHIPPED', 'DISPUTED'],
  shipping: ['PENDING_SHIPMENT'],
  shipped: ['SHIPPED'],
  done: ['COMPLETED', 'AUTO_COMPLETED'],
  cancelled: ['CANCELLED', 'AUTO_CANCELLED'],
  disputed: ['DISPUTED'],
}

// ── 한국 시간 기준 날짜 (서버가 UTC여도 '오늘'이 한국 자정 기준) ────────────────
const KST = 9 * 3600_000
export const kstDayStart = (now = new Date()) => new Date(Math.floor((now.getTime() + KST) / DAY) * DAY - KST)
export const kstDateKey = (d: Date) => new Date(d.getTime() + KST).toISOString().slice(0, 10)
// 오늘 포함 최근 n일의 날짜 키 (오래된 순)
export const lastKstDays = (n: number, now = new Date()) =>
  Array.from({ length: n }, (_, i) => kstDateKey(new Date(kstDayStart(now).getTime() - (n - 1 - i) * DAY)))

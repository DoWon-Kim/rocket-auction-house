import { tradeFlags, shipDeadline, autoConfirmAt, pendingDeadline, kstDayStart, kstDateKey, lastKstDays } from '../lib/adminOps'

const H = 3600_000
const paid = new Date('2026-09-20T00:00:00Z')
const base = { txStatus: 'PENDING_SHIPMENT', completedAt: paid, shipClockAt: paid, shippedAt: null, address: '서울시' }

describe('거래 신호', () => {
  it('발송 기한은 결제 후 3일, 자동 확정은 발송 후 3일', () => {
    expect(shipDeadline(paid).toISOString()).toBe('2026-09-23T00:00:00.000Z')
    expect(autoConfirmAt(paid).toISOString()).toBe('2026-09-23T00:00:00.000Z')
  })
  it('발송 기한 24시간 이내면 임박, 지나면 초과', () => {
    expect(tradeFlags(base, new Date(paid.getTime() + 40 * H))).toEqual([])
    expect(tradeFlags(base, new Date(paid.getTime() + 50 * H))).toEqual(['SHIP_DUE_SOON'])
    expect(tradeFlags(base, new Date(paid.getTime() + 73 * H))).toEqual(['SHIP_OVERDUE'])
  })
  it('배송지 없는 낙찰 건: 배송지 입력 기한(3일)만 보고, 발송 기한은 아직 시작 안 함', () => {
    const won = { ...base, address: null, shipClockAt: null }
    expect(tradeFlags(won, new Date(paid.getTime() + H))).toEqual(['NO_ADDRESS'])
    expect(tradeFlags(won, new Date(paid.getTime() + 60 * H))).toEqual(['NO_ADDRESS'])
    expect(tradeFlags(won, new Date(paid.getTime() + 73 * H))).toEqual(['NO_ADDRESS', 'ADDRESS_OVERDUE'])
    expect(pendingDeadline(won)).toEqual({ kind: 'ADDRESS', at: new Date('2026-09-23T00:00:00Z') })
  })
  it('낙찰 2일 뒤 배송지를 넣으면 발송 기한은 그때부터 3일', () => {
    const entered = new Date(paid.getTime() + 48 * H)
    const tx = { ...base, shipClockAt: entered }
    expect(pendingDeadline(tx)).toEqual({ kind: 'SHIP', at: new Date('2026-09-25T00:00:00Z') })
    expect(tradeFlags(tx, new Date(paid.getTime() + 73 * H))).toEqual([]) // 결제 기준이면 초과였을 시각
    expect(tradeFlags(tx, new Date(paid.getTime() + 121 * H))).toEqual(['SHIP_OVERDUE'])
  })
  it('발송 후에는 구매확정 대기, 분쟁은 항상 표시', () => {
    expect(tradeFlags({ ...base, txStatus: 'SHIPPED', shippedAt: paid })).toEqual(['CONFIRM_WAITING'])
    expect(tradeFlags({ ...base, txStatus: 'DISPUTED' }, new Date(paid.getTime() + H))).toEqual(['DISPUTED'])
    expect(tradeFlags({ ...base, txStatus: 'COMPLETED', disputeStatus: 'OPEN' })).toEqual(['DISPUTED'])
  })
  it('완료·취소 거래는 신호 없음', () => {
    expect(tradeFlags({ ...base, txStatus: 'COMPLETED' })).toEqual([])
    expect(tradeFlags({ ...base, txStatus: 'AUTO_CANCELLED' })).toEqual([])
  })
})

describe('한국 시간 날짜', () => {
  it('UTC 15시(한국 자정)를 기준으로 날짜가 바뀐다', () => {
    expect(kstDayStart(new Date('2026-09-24T14:59:00Z')).toISOString()).toBe('2026-09-23T15:00:00.000Z')
    expect(kstDayStart(new Date('2026-09-24T15:00:00Z')).toISOString()).toBe('2026-09-24T15:00:00.000Z')
    expect(kstDateKey(new Date('2026-09-24T15:30:00Z'))).toBe('2026-09-25')
  })
  it('최근 N일 날짜 키', () => {
    expect(lastKstDays(3, new Date('2026-09-24T03:00:00Z'))).toEqual(['2026-09-22', '2026-09-23', '2026-09-24'])
  })
})

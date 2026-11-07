import { pulseKind } from '../lib/adminPulse'

describe('관리자 실시간 신호 분류', () => {
  it('새로 생긴 기록은 종류별로 신호', () => {
    expect(pulseKind('Transaction', 'create')).toBe('trade')
    expect(pulseKind('User', 'create')).toBe('signup')
    expect(pulseKind('ChatMessage', 'create')).toBe('chat')
  })
  it('상태 변경은 관리 대상 모델만', () => {
    expect(pulseKind('Transaction', 'update', { txStatus: 'SHIPPED' })).toBe('trade')
    expect(pulseKind('User', 'update', { balance: { increment: 1 } })).toBeNull()
    expect(pulseKind('ChatMessage', 'updateMany', { readAt: new Date() })).toBeNull()
  })
  it('조회수·찜 수만 바뀐 경우는 무시', () => {
    expect(pulseKind('Listing', 'update', { viewCount: { increment: 1 } })).toBeNull()
    expect(pulseKind('Listing', 'update', { likeCount: { increment: 1 } })).toBeNull()
    expect(pulseKind('Listing', 'updateMany', { status: 'SOLD' })).toBe('listing')
  })
  it('조회·삭제·알 수 없는 모델은 무시', () => {
    expect(pulseKind('Transaction', 'findMany')).toBeNull()
    expect(pulseKind('Notification', 'create')).toBeNull()
    expect(pulseKind(undefined, 'create')).toBeNull()
  })
})

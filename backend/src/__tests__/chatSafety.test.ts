import { detectChatRisk } from '../lib/chatSafety'

describe('채팅 위험 신호 감지', () => {
  it('외부 메신저 유도', () => {
    expect(detectChatRisk('카톡으로 얘기해요 아이디 abc123')).toContain('MESSENGER')
    expect(detectChatRisk('오픈채팅 주소 드릴게요')).toContain('MESSENGER')
    expect(detectChatRisk('텔레그램 있으세요?')).toContain('MESSENGER')
  })
  it('전화번호', () => {
    expect(detectChatRisk('010-1234-5678로 문자주세요')).toContain('PHONE')
    expect(detectChatRisk('01012345678')).toContain('PHONE')
  })
  it('계좌번호는 은행 이름과 긴 숫자가 함께 있을 때만', () => {
    expect(detectChatRisk('국민 123456-78-901234 로 보내주세요')).toContain('ACCOUNT')
    expect(detectChatRisk('운송장 680012345678 입니다')).toEqual([])
  })
  it('직접 송금 유도', () => {
    expect(detectChatRisk('선입금 주시면 바로 보내드려요')).toContain('DIRECT_PAY')
    expect(detectChatRisk('안전결제 말고 계좌이체로 해요 수수료 아끼게')).toContain('DIRECT_PAY')
  })
  it('외부 링크 (우리 사이트 링크는 제외)', () => {
    expect(detectChatRisk('여기서 결제하세요 http://pay-safe.xyz/abc')).toContain('LINK')
    expect(detectChatRisk('https://www.rocket-auction.com/listings/1 참고하세요')).toEqual([])
  })
  it('평범한 거래 대화는 통과', () => {
    for (const t of ['안녕하세요! 구매 가능할까요?', '95,000P 가능할까요?', '오늘 중 발송 예정입니다.', '카드 상태 사진 더 볼 수 있을까요?', '택배 거래 가능해요'])
      expect(detectChatRisk(t)).toEqual([])
  })
})

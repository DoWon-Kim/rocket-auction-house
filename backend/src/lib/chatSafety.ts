// 채팅 안전 검사: 외부 메신저·연락처·계좌·직접 송금·외부 링크 유도 감지 (순수 함수)
// 차단하지 않고 '주의' 표시만 한다 — 운송장 번호처럼 정상적인 숫자는 걸리지 않게 보수적으로 판단

export type RiskReason = 'MESSENGER' | 'PHONE' | 'ACCOUNT' | 'DIRECT_PAY' | 'LINK'

const MESSENGER = /(카카오\s*톡|카톡|오픈\s*채팅|오픈채팅방|open\.kakao|텔레\s*그램|telegram|t\.me\/|라인\s*아이디|line\s*id|디엠|DM\s*주세요)/i
const PHONE = /(?:^|[^\d])01[016789][\s.-]?\d{3,4}[\s.-]?\d{4}(?!\d)/
const BANK = /(국민|신한|우리은행|하나은행|농협|기업은행|카카오\s*뱅크|토스\s*뱅크|케이\s*뱅크|새마을|우체국|신협|수협|씨티|SC제일|부산은행|대구은행|계좌)/
const LONG_DIGITS = /\d[\d\s-]{8,}\d/
const DIRECT_PAY = /(선\s*입금|입금\s*(먼저|부터|해\s*주시면)|계좌\s*(이체|로|번호)|송금\s*(해|하시면|부탁)|직접\s*(입금|송금)|안전\s*결제\s*(말고|없이|빼고)|수수료\s*(아끼|없이)|네이버\s*페이로|토스로\s*(보내|송금))/
const LINK = /(https?:\/\/|www\.)(?!(?:[a-z0-9-]+\.)?rocket-auction\.com)/i

export function detectChatRisk(text: string): RiskReason[] {
  const t = text.normalize('NFKC')
  const reasons: RiskReason[] = []
  if (MESSENGER.test(t)) reasons.push('MESSENGER')
  if (PHONE.test(t)) reasons.push('PHONE')
  if (BANK.test(t) && LONG_DIGITS.test(t)) reasons.push('ACCOUNT')
  if (DIRECT_PAY.test(t)) reasons.push('DIRECT_PAY')
  if (LINK.test(t)) reasons.push('LINK')
  return reasons
}

export const RISK_LABEL: Record<RiskReason, string> = {
  MESSENGER: '외부 메신저로 대화를 옮기자는 요청',
  PHONE: '전화번호 공유',
  ACCOUNT: '계좌번호 공유',
  DIRECT_PAY: '안전결제 없이 직접 송금 요청',
  LINK: '외부 링크',
}

// 중고거래 채팅 공용 타입·헬퍼
export interface ChatSender { id: string; nickname: string; avatarUrl: string | null }
export interface ChatMsg {
  id: string
  content: string
  createdAt: string
  readAt: string | null
  type?: 'TEXT' | 'SYSTEM' | 'OFFER'
  offerId?: string | null
  imageUrls?: string[]
  flagged?: boolean
  deletedAt?: string | null
  sender: ChatSender
  // 보내는 중인 메시지 (서버 응답 전)
  clientId?: string
  pending?: boolean
  failed?: string
}

const WEEK = ['일', '월', '화', '수', '목', '금', '토']
const pad = (n: number) => String(n).padStart(2, '0')

export const dayKey = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` }
export const dayLabel = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEK[d.getDay()]}요일` }
export const timeLabel = (iso: string) => {
  const d = new Date(iso)
  const h = d.getHours()
  return `${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}:${pad(d.getMinutes())}`
}
// 같은 사람이 같은 분에 연달아 보낸 메시지는 시간을 마지막에만 표시
export const sameMinute = (a: string, b: string) => Math.floor(new Date(a).getTime() / 60000) === Math.floor(new Date(b).getTime() / 60000)

export function lastSeenLabel(online: boolean, lastSeenAt: string | null | undefined, now = Date.now()) {
  if (online) return '지금 접속 중'
  if (!lastSeenAt) return '최근 접속 기록 없음'
  const m = Math.floor((now - new Date(lastSeenAt).getTime()) / 60000)
  if (m < 1) return '방금 전 접속'
  if (m < 60) return `${m}분 전 접속`
  if (m < 60 * 24) return `${Math.floor(m / 60)}시간 전 접속`
  return `${Math.floor(m / 1440)}일 전 접속`
}

export const QUICK_REPLIES = {
  buyer: ['안녕하세요! 구매 가능할까요?', '상태 사진을 더 볼 수 있을까요?', '가격 조정 가능할까요?', '안전결제로 바로 구매할게요.', '언제쯤 발송 가능할까요?'],
  seller: ['네, 구매 가능합니다!', '예약해 드릴게요. 안전결제 진행해 주세요.', '오늘 중 발송 예정입니다.', '발송했어요! 운송장 확인 부탁드려요.', '죄송하지만 가격 조정은 어려워요.'],
}

export const newClientId = () => `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

// 보낸 메시지 삭제 가능 시간 (서버와 동일: 5분)
export const DELETE_WINDOW_MS = 5 * 60_000
export const withinDeleteWindow = (iso: string, now = Date.now()) => now - new Date(iso).getTime() < DELETE_WINDOW_MS

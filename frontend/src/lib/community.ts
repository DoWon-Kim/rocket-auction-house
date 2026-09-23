import { TCG_LABELS } from '@/lib/utils'

// 카페 게시판 목록 (백엔드 BoardCategory enum과 일치)
export const BOARDS = [
  { key: 'FREE',    label: '자유게시판',  emoji: '💬', desc: '자유롭게 이야기해요' },
  { key: 'SHOWOFF', label: '카드 자랑',   emoji: '✨', desc: '내 컬렉션을 자랑해요', album: true },
  { key: 'INFO',    label: '정보 · 공략', emoji: '📚', desc: '시세, 진품 구별, 덱 공략' },
  { key: 'QNA',     label: '질문 답변',   emoji: '🙋', desc: '궁금한 점을 물어보세요' },
  { key: 'REVIEW',  label: '거래 후기',   emoji: '🤝', desc: '거래 경험을 공유해요' },
] as const

export type BoardKey = typeof BOARDS[number]['key']

export const BOARD_LABEL: Record<string, string> = Object.fromEntries(BOARDS.map(b => [b.key, b.label]))

// 활동 등급 (백엔드 activityGrade와 일치)
export const GRADES: Record<string, { label: string; emoji: string; cls: string }> = {
  SPROUT:  { label: '새싹', emoji: '🌱', cls: 'text-emerald-300 bg-emerald-500/10 border-emerald-400/20' },
  MEMBER:  { label: '일반', emoji: '🙂', cls: 'text-sky-300 bg-sky-500/10 border-sky-400/20' },
  GOOD:    { label: '우수', emoji: '⭐', cls: 'text-amber-300 bg-amber-500/10 border-amber-400/20' },
  DEVOTED: { label: '열심', emoji: '🔥', cls: 'text-orange-300 bg-orange-500/10 border-orange-400/20' },
  VIP:     { label: 'VIP',  emoji: '💎', cls: 'text-violet-200 bg-violet-500/15 border-violet-400/30' },
}

export const TCG_OPTIONS = ['POKEMON', 'YUGIOH', 'MTG', 'DIGIMON', 'ONEPIECE', 'WEISS', 'OTHER']
  .map(value => ({ value, label: TCG_LABELS[value] }))

// 목록용 날짜: 오늘이면 HH:mm, 올해면 MM.dd, 그 외 yy.MM.dd
export function formatListDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  if (d.toDateString() === now.toDateString()) return `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (d.getFullYear() === now.getFullYear()) return `${pad(d.getMonth() + 1)}.${pad(d.getDate())}`
  return `${String(d.getFullYear()).slice(2)}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}. ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// 24시간 이내 글
export function isNewPost(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() < 24 * 3600_000
}

// 본문 이미지 토큰: 한 줄 전체가 ![](https://...) 인 경우만 이미지로 취급
export const IMAGE_LINE = /^!\[\]\((https?:\/\/[^\s)]+)\)$/

// ── 게시판 권한 (백엔드 BoardPermission과 일치)
export type BoardPermission = 'ALL' | 'MEMBER' | 'GOOD' | 'DEVOTED' | 'VIP' | 'ADMIN'
export const PERMISSION_LABEL: Record<BoardPermission, string> = {
  ALL: '전체', MEMBER: '일반 등급 이상', GOOD: '우수 등급 이상', DEVOTED: '열심 등급 이상', VIP: 'VIP 등급', ADMIN: '운영진만',
}
const GRADE_ORDER = ['SPROUT', 'MEMBER', 'GOOD', 'DEVOTED', 'VIP']

export function canUseBoard(perm: BoardPermission | undefined, grade: string | undefined, role: string | undefined): boolean {
  if (!perm || perm === 'ALL' || role === 'ADMIN' || role === 'SUPER_ADMIN') return true
  if (perm === 'ADMIN') return false
  return GRADE_ORDER.indexOf(grade ?? 'SPROUT') >= GRADE_ORDER.indexOf(perm)
}

// 구형(텍스트 + 이미지 줄) 본문을 에디터용 HTML로 변환
export function textToHtml(text: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  return text.split('\n').map(line => {
    const img = line.trim().match(IMAGE_LINE)
    if (img) return `<img src="${esc(img[1])}">`
    return line.trim() ? `<p>${esc(line)}</p>` : '<p></p>'
  }).join('')
}

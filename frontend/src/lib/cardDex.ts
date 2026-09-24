// 카드 도감 공통 표기

export const STAGE_LABEL: Record<string, string> = {
  'Basic': '기본', 'Stage 1': '1진화', 'Stage 2': '2진화',
  'VMAX': 'VMAX', 'VSTAR': 'VSTAR', 'BREAK': 'BREAK', 'MEGA': '메가', 'Restored': '복원', 'Level-Up': '레벨업',
}
export const stageLabel = (s: string | null | undefined) => (s ? STAGE_LABEL[s] ?? s : '')

export type CardLang = 'ja' | 'ko' | 'en'
export const LANG_LABEL: Record<CardLang, string> = { ja: '🇯🇵 일본판', ko: '🇰🇷 한국판', en: '🇺🇸 영문판' }
export const LANG_SHORT: Record<CardLang, string> = { ja: '일판', ko: '한판', en: '영판' }

export const setHref = (tcgType: string, lang: string, code: string) =>
  `/sets/${tcgType}/${lang}/${encodeURIComponent(code)}`

export const won = (v: number) => `₩${v.toLocaleString()}`

export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }) : null

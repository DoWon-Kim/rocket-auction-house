import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const TCG_LABELS: Record<string, string> = {
  POKEMON:  '포켓몬',
  YUGIOH:   '유희왕',
  MTG:      'MTG',
  DIGIMON:  '디지몬',
  ONEPIECE: '원피스',
  WEISS:    '바이스',
  OTHER:    '기타',
}

export const CONDITION_LABELS: Record<string, string> = {
  MINT: '민트',
  NEAR_MINT: '거의 민트',
  EXCELLENT: '매우 좋음',
  GOOD: '좋음',
  LIGHT_PLAYED: '약간 사용',
  PLAYED: '사용',
  POOR: '불량',
}

export const LISTING_TYPE_LABELS: Record<string, string> = {
  BUY_NOW: '즉시구매',
  AUCTION: '경매',
  OFFER: '가격제안',
}

// 포켓몬 / 유희왕 / MTG / 디지몬 / 원피스 레어리티 통합 한국어 매핑
export const RARITY_LABELS: Record<string, string> = {
  // ── 포켓몬 (pokemontcg.io / TCGdex EN) ───────────────────────────────────
  'Common': '커먼',
  'Uncommon': '언커먼',
  'Rare': '레어',
  'Rare Holo': '홀로 레어',
  'Rare Holo EX': '홀로 EX',
  'Rare Holo GX': '홀로 GX',
  'Rare Holo V': '홀로 V',
  'Rare Holo VMAX': '홀로 VMAX',
  'Rare Holo VSTAR': '홀로 VSTAR',
  'Double Rare': '더블 레어',
  'Ultra Rare': '울트라 레어',
  'Illustration Rare': '일러스트 레어',
  'Special Illustration Rare': '스페셜 일러스트 레어',
  'Hyper Rare': '하이퍼 레어',
  'Amazing Rare': '어메이징 레어',
  'Radiant Rare': '레이디언트 레어',
  'Shiny Rare': '샤이니 레어',
  'Shiny Ultra Rare': '샤이니 울트라 레어',
  'Classic Collection': '클래식 컬렉션',
  'Trainer Gallery Rare Holo': '트레이너 갤러리 홀로',
  'Promo': '프로모',
  'LEGEND': '레전드',
  // TCGdex JA
  'C': '커먼', 'U': '언커먼', 'R': '레어', 'RR': '더블 레어',
  'RRR': '트리플 레어', 'S': '샤이니', 'SR': '슈퍼 레어',
  'SSR': '스페셜 아트 레어', 'UR': '울트라 레어', 'HR': '하이퍼 레어',
  'TR': '트레이너 레어', 'CHR': '캐릭터 레어', 'PR': '프리즘 레어',
  'AR': '아트 레어', 'SAR': '스페셜 아트 레어', 'K': '케이', 'A': '에이',
  // TCGdex 한국어 (이미 한국어)
  '커먼': '커먼', '언커먼': '언커먼', '레어': '레어', '더블 레어': '더블 레어',
  '울트라 레어': '울트라 레어', '일러스트 레어': '일러스트 레어',
  '스페셜 일러스트 레어': '스페셜 일러스트 레어', '하이퍼 레어': '하이퍼 레어',
  '프로모': '프로모', '샤이니 레어': '샤이니 레어',
  // ── 유희왕 (YGOProDeck) ───────────────────────────────────────────────────
  'Normal Rare': '노말 레어',
  'Super Rare': '슈퍼 레어',
  'Ultra Rare': '울트라 레어',
  'Secret Rare': '시크릿 레어',
  'Ultimate Rare': '얼티밋 레어',
  'Ghost Rare': '고스트 레어',
  'Starlight Rare': '스타라이트 레어',
  'Prismatic Secret Rare': '프리즈매틱 시크릿 레어',
  'Quarter Century Secret Rare': '쿼터 센추리 시크릿 레어',
  "Collector's Rare": '컬렉터스 레어',
  'Gold Rare': '골드 레어',
  'Platinum Secret Rare': '플래티넘 시크릿 레어',
  'Short Print': '쇼트 프린트',
  'Super Short Print': '슈퍼 쇼트 프린트',
  'Normal Parallel Rare': '노말 패러렐 레어',
  'Super Parallel Rare': '슈퍼 패러렐 레어',
  'Ultra Parallel Rare': '울트라 패러렐 레어',
  'Secret Parallel Rare': '시크릿 패러렐 레어',
  'Duel Terminal Normal Parallel Rare': 'DT 노말 패러렐',
  'Duel Terminal Rare Parallel Rare': 'DT 레어 패러렐',
  'Duel Terminal Super Parallel Rare': 'DT 슈퍼 패러렐',
  'Duel Terminal Ultra Parallel Rare': 'DT 울트라 패러렐',
  'Duel Terminal Secret Parallel Rare': 'DT 시크릿 패러렐',
  'Mosaic Rare': '모자이크 레어',
  'Shatterfoil Rare': '샤터포일 레어',
  'Gold Secret Rare': '골드 시크릿 레어',
  'Premium Gold Rare': '프리미엄 골드 레어',
  'Rare': '레어',
  'Common': '커먼',
  // ── MTG (Scryfall, 소문자) ────────────────────────────────────────────────
  'common': '커먼',
  'uncommon': '언커먼',
  'rare': '레어',
  'mythic': '미식 레어',
  'special': '스페셜',
  'bonus': '보너스',
  'timeshifted': '타임시프트',
  // ── 디지몬 ────────────────────────────────────────────────────────────────
  'UC': '언커먼',
  'SEC': '시크릿 레어',
  'P': '프로모',
  'SP': '스페셜',
  // ── 원피스 ────────────────────────────────────────────────────────────────
  'L': '리더',
  'DON': '돈',
  // ── 공통 ─────────────────────────────────────────────────────────────────
  'Unknown': '알 수 없음',
  '알 수 없음': '알 수 없음',
}

export function rarityLabel(rarity: string | null | undefined): string {
  if (!rarity) return '알 수 없음'
  return RARITY_LABELS[rarity] ?? rarity
}

// TCG별 한국어 설명
export const TCG_DESCRIPTIONS: Record<string, string> = {
  POKEMON:  '포켓몬 카드 게임 - 한국판/일본판/영어판',
  YUGIOH:   '유희왕 오피셜 카드 게임',
  MTG:      '매직: 더 개더링',
  DIGIMON:  '디지몬 카드 게임',
  ONEPIECE: '원피스 카드 게임',
  WEISS:    '바이스 슈바르츠',
  OTHER:    '기타 TCG',
}

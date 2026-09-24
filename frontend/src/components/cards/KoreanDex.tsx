'use client'

import Link from 'next/link'
import { Languages, BookOpen } from 'lucide-react'
import { useKoreanView } from '@/hooks/useKoreanView'

// ── 한국어 보기 토글 · 번역 출처 ────────────────────────────────────────────────

export const KO_SOURCE_LABEL: Record<string, { label: string; cls: string; title: string }> = {
  OFFICIAL: { label: '공식 한글', cls: 'bg-emerald-500/15 text-emerald-300', title: '한국판 공식 카드 텍스트' },
  DICT:     { label: '사전 번역', cls: 'bg-sky-500/15 text-sky-300', title: '공식 카드·도감 용어 사전으로 옮긴 문장' },
  PARTIAL:  { label: '일부 번역', cls: 'bg-amber-500/15 text-amber-300', title: '사전에 없는 문장은 원문으로 보여줍니다' },
}

export function KoViewToggle({ source }: { source?: string | null }) {
  const { on, toggle } = useKoreanView()
  const s = source ? KO_SOURCE_LABEL[source] : null
  return (
    <span className="inline-flex items-center gap-1.5">
      {on && s && <span title={s.title} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${s.cls}`}>{s.label}</span>}
      <button type="button" onClick={toggle} aria-pressed={on}
        className={`inline-flex items-center gap-1 h-6 px-2 rounded-md border text-[10px] font-semibold transition-colors ${on ? 'border-accent-line bg-accent-tint text-accent-soft' : 'border-line text-subtle hover:text-fg'}`}>
        <Languages size={11} />{on ? '한국어' : '원문'}
      </button>
    </span>
  )
}

// ── 포켓몬 도감 정보 ─────────────────────────────────────────────────────────

export interface SpeciesInfo {
  dexId: number; nameKo: string; genusKo: string | null; flavorKo: string | null
  heightDm: number | null; weightHg: number | null; types: string[]; generation: number | null
}

export const POKE_TYPE_KO: Record<string, { label: string; color: string }> = {
  normal: { label: '노말', color: '#A8A77A' }, fire: { label: '불꽃', color: '#EE8130' }, water: { label: '물', color: '#6390F0' },
  electric: { label: '전기', color: '#F7D02C' }, grass: { label: '풀', color: '#7AC74C' }, ice: { label: '얼음', color: '#96D9D6' },
  fighting: { label: '격투', color: '#C22E28' }, poison: { label: '독', color: '#A33EA1' }, ground: { label: '땅', color: '#E2BF65' },
  flying: { label: '비행', color: '#A98FF3' }, psychic: { label: '에스퍼', color: '#F95587' }, bug: { label: '벌레', color: '#A6B91A' },
  rock: { label: '바위', color: '#B6A136' }, ghost: { label: '고스트', color: '#735797' }, dragon: { label: '드래곤', color: '#6F35FC' },
  dark: { label: '악', color: '#705746' }, steel: { label: '강철', color: '#B7B7CE' }, fairy: { label: '페어리', color: '#D685AD' },
}

export function TypePill({ type }: { type: string }) {
  const t = POKE_TYPE_KO[type]
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
      style={{ backgroundColor: `${t?.color ?? '#666'}40`, color: `color-mix(in srgb, ${t?.color ?? '#aaa'} 55%, white)` }}>
      {t?.label ?? type}
    </span>
  )
}

export const artworkUrl = (dexId: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${dexId}.png`

export function PokedexPanel({ species }: { species: SpeciesInfo[] }) {
  if (!species.length) return null
  return (
    <div className="space-y-3">
      {species.map(s => (
        <div key={s.dexId} className="bg-surface border border-line rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-line">
            <span className="flex items-center gap-2 text-xs font-semibold text-muted-2"><BookOpen size={13} className="text-accent-fg" />포켓몬 도감</span>
            <Link href={`/pokedex/${s.dexId}`} className="text-[11px] text-accent-fg hover:underline">No.{String(s.dexId).padStart(4, '0')} 카드 모두 보기 →</Link>
          </div>
          <div className="flex gap-4 p-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- PokeAPI 공식 아트워크 */}
            <img src={artworkUrl(s.dexId)} alt={s.nameKo} loading="lazy" className="w-24 h-24 object-contain shrink-0 drop-shadow-[0_6px_16px_rgba(0,0,0,0.5)]" />
            <div className="min-w-0 space-y-1.5">
              <p className="text-lg font-bold text-fg">{s.nameKo}</p>
              <p className="text-xs text-muted">{s.genusKo}{s.generation ? ` · ${s.generation}세대` : ''}</p>
              <div className="flex flex-wrap gap-1">{s.types.map(t => <TypePill key={t} type={t} />)}</div>
              <p className="text-[11px] text-subtle tabular-nums">
                {s.heightDm != null && `키 ${(s.heightDm / 10).toFixed(1)}m`}{s.heightDm != null && s.weightHg != null && ' · '}
                {s.weightHg != null && `몸무게 ${(s.weightHg / 10).toFixed(1)}kg`}
              </p>
            </div>
          </div>
          {s.flavorKo && <p className="px-4 pb-4 text-xs text-fg-3 leading-relaxed">{s.flavorKo}</p>}
        </div>
      ))}
    </div>
  )
}

// ── 유희왕·MTG·디지몬 스탯 + 효과 (한국어 공식 텍스트 우선) ─────────────────────

type Stats = Record<string, unknown>
const n = (v: unknown) => (v == null || v === '' ? null : String(v))

const YGO_ATTR: Record<string, string> = { DARK: '어둠', LIGHT: '빛', EARTH: '땅', WATER: '물', FIRE: '화염', WIND: '바람', DIVINE: '신' }
const YGO_TYPE: Record<string, string> = {
  'Spell Card': '마법', 'Trap Card': '함정', 'Normal Monster': '일반 몬스터', 'Effect Monster': '효과 몬스터',
  'Fusion Monster': '융합 몬스터', 'Synchro Monster': '싱크로 몬스터', 'XYZ Monster': '엑시즈 몬스터', 'Link Monster': '링크 몬스터',
  'Ritual Monster': '의식 몬스터', 'Ritual Effect Monster': '의식 효과 몬스터', 'Pendulum Effect Monster': '펜듈럼 효과 몬스터',
  'Pendulum Normal Monster': '펜듈럼 일반 몬스터', 'Tuner Monster': '튜너 몬스터', 'Normal Tuner Monster': '일반 튜너 몬스터',
  'Synchro Tuner Monster': '싱크로 튜너 몬스터', 'Flip Effect Monster': '리버스 효과 몬스터', 'Spirit Monster': '스피릿 몬스터',
  'Union Effect Monster': '유니온 효과 몬스터', 'Gemini Monster': '듀얼 몬스터', 'Toon Monster': '툰 몬스터',
  'XYZ Pendulum Effect Monster': '엑시즈 펜듈럼 효과 몬스터', 'Synchro Pendulum Effect Monster': '싱크로 펜듈럼 효과 몬스터',
  'Fusion Pendulum Effect Monster': '융합 펜듈럼 효과 몬스터', 'Token': '토큰', 'Skill Card': '스킬',
}
// 종족 (몬스터) · 마법/함정 종류
const YGO_RACE: Record<string, string> = {
  Spellcaster: '마법사족', Dragon: '드래곤족', Zombie: '언데드족', Warrior: '전사족', 'Beast-Warrior': '야수전사족', Beast: '야수족',
  'Winged Beast': '비행야수족', Fiend: '악마족', Fairy: '천사족', Insect: '곤충족', Dinosaur: '공룡족', Reptile: '파충류족', Fish: '어류족',
  'Sea Serpent': '해룡족', Aqua: '물족', Pyro: '화염족', Thunder: '번개족', Rock: '암석족', Plant: '식물족', Machine: '기계족',
  Psychic: '사이킥족', 'Divine-Beast': '환신야수족', Wyrm: '환룡족', Cyberse: '사이버스족', Illusion: '환상마족', 'Creator-God': '창조신족',
  Normal: '일반', Continuous: '지속', 'Quick-Play': '속공', Field: '필드', Equip: '장착', Ritual: '의식', Counter: '카운터',
}
// 디지몬 용어
const DIGI_KO: Record<string, string> = {
  Digimon: '디지몬', Tamer: '테이머', Option: '옵션', 'Digi-Egg': '디지타마',
  Red: '적', Blue: '청', Yellow: '황', Green: '녹', Black: '흑', Purple: '자', White: '백',
  'In-Training': '유년기', Rookie: '성장기', Champion: '성숙기', Ultimate: '완전체', Mega: '궁극체', 'Armor Form': '아머체', 'Hybrid': '하이브리드체',
  Vaccine: '백신', Data: '데이터', Virus: '바이러스', Free: '프리', Variable: '배리어블', Unknown: '불명',
}
const dk = (v: unknown) => (v == null ? null : DIGI_KO[String(v)] ?? String(v))

function statRows(tcgType: string, s: Stats): Array<[string, string | null]> {
  if (tcgType === 'YUGIOH') {
    const isXyz = String(s.type ?? '').includes('XYZ'), isLink = String(s.type ?? '').includes('Link')
    return [
      ['종류', n(YGO_TYPE[String(s.type)] ?? s.type)], ['속성', n(YGO_ATTR[String(s.attribute)] ?? s.attribute)], ['종족', n(YGO_RACE[String(s.race)] ?? s.race)],
      [isLink ? '링크' : isXyz ? '랭크' : '레벨', n(isLink ? s.linkval : s.level)],
      ['ATK', n(s.atk)], ['DEF', isLink ? null : n(s.def)], ['펜듈럼 스케일', n(s.scale)], ['테마', n(s.archetype)],
    ]
  }
  if (tcgType === 'MTG') {
    return [
      ['마나 비용', n(s.manaCost)], ['타입', n(s.typeLine)],
      ['공격력/방어력', s.power != null ? `${s.power}/${s.toughness}` : null], ['충성도', n(s.loyalty)],
    ]
  }
  if (tcgType === 'DIGIMON') {
    return [
      ['종류', dk(s.type)], ['레벨', n(s.level)], ['DP', n(s.dp)], ['등장 코스트', n(s.playCost)],
      ['진화 코스트', s.evolutionCost != null ? `${s.evolutionCost}${s.evolutionLevel ? ` (Lv.${s.evolutionLevel})` : ''}` : null],
      ['색', Array.isArray(s.color) ? (s.color as string[]).map(c => dk(c)).join(' / ') : dk(s.color)], ['형태', dk(s.form)], ['속성', dk(s.attribute)], ['유형', n(s.digiType)],
    ]
  }
  return []
}

export function TcgStatsPanel({ tcgType, stats, description, textKo, textKoSource }: {
  tcgType: string; stats: Stats | null; description: string | null
  textKo: { effect?: string | null; typeLine?: string | null } | null; textKoSource: string | null
}) {
  const { on } = useKoreanView()
  const rows = stats ? statRows(tcgType, stats).filter(([, v]) => v) : []
  const koEffect = textKo?.effect
  const effect = on && koEffect ? koEffect : description
  if (!rows.length && !effect) return null
  return (
    <div className="bg-surface border border-line rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-line">
        <span className="text-xs font-semibold text-muted-2">카드 정보</span>
        {koEffect && <KoViewToggle source={textKoSource} />}
      </div>
      {rows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-line">
          {rows.map(([label, value]) => (
            <div key={label} className="bg-surface px-3 py-2.5">
              <p className="text-[10px] text-subtle">{label}</p>
              <p className="text-sm font-semibold text-fg truncate" title={value ?? ''}>{value}</p>
            </div>
          ))}
        </div>
      )}
      {on && textKo?.typeLine && <p className="px-4 pt-3 text-[11px] text-muted">{textKo.typeLine}</p>}
      {effect && <p className="px-4 py-3 text-xs text-fg-3 leading-relaxed whitespace-pre-line">{effect}</p>}
    </div>
  )
}

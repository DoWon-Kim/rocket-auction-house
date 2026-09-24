// 한국어 사전 번역 (DB 비의존 순수 함수)
//
// 원칙: 확실한 것만 한국어로. 일부만 번역되는 문장은 섞지 않고 원문을 보여준다.
// - 이름: 카드명 사전 → 포켓몬 이름 치환(메가·지역폼 접두어, ex·V 등 접미어)
// - 기술·특성 이름: 공식 카드 짝에서 모은 사전 → PokeAPI 게임 기술·특성 이름
// - 효과 문장: 공식 카드 짝에서 모은 문장 사전 (숫자는 자리표시자로 일반화)

export type DictKind = 'POKEMON' | 'MOVE' | 'ABILITY' | 'CARD_NAME' | 'ATTACK_NAME' | 'ABILITY_NAME' | 'EFFECT'
export type SrcLang = 'ja' | 'en'

export interface DictEntry { kind: DictKind; srcLang: SrcLang; src: string; ko: string }

// 비교 키: 유니코드 정규화 + 공백 제거 + 소문자 (일판 데이터에 섞인 영문명 'wartortle' 등 대비)
export const normKey = (s: string) => s.normalize('NFKC').replace(/\s+/g, '').toLowerCase().trim()

// 숫자 일반화: "30ダメージ" → "#ダメージ" (숫자는 순서대로 보관)
export function templatize(s: string): { key: string; nums: string[] } {
  const nums: string[] = []
  const key = normKey(s).replace(/\d+/g, m => { nums.push(m); return '#' })
  return { key, nums }
}

// 한국어 문장의 숫자를 자리표시자로 (원문과 숫자 순서가 같을 때만 템플릿으로 쓸 수 있음)
export function templatizeKo(ko: string, nums: string[]): string | null {
  const koNums = ko.match(/\d+/g) ?? []
  if (koNums.length !== nums.length || koNums.some((n, i) => n !== nums[i])) return null
  let i = 0
  return ko.replace(/\d+/g, () => `{${i++}}`)
}

const fillTemplate = (tpl: string, nums: string[]) => tpl.replace(/\{(\d+)\}/g, (_, i) => nums[Number(i)] ?? '')

// 일본어 문장 분리 (。 기준, 구분자 유지)
export function splitJa(text: string): string[] {
  return text.split(/(?<=。)/).map(s => s.trim()).filter(Boolean)
}
// 한국어 문장 분리 ('다.' 등 마침표 기준)
export function splitKo(text: string): string[] {
  return text.split(/(?<=\.)\s*/).map(s => s.trim()).filter(Boolean)
}

export class KoDict {
  private map = new Map<string, string>()

  constructor(entries: DictEntry[]) {
    for (const e of entries) this.map.set(`${e.kind}|${e.srcLang}|${e.src}`, e.ko)
  }

  get size() { return this.map.size }

  lookup(kinds: DictKind[], lang: SrcLang, text: string | null | undefined): string | undefined {
    if (!text) return undefined
    const key = normKey(text)
    for (const k of kinds) {
      const v = this.map.get(`${k}|${lang}|${key}`)
      if (v) return v
    }
    return undefined
  }

  // 효과 문장: 전체 일치 → 숫자 템플릿 → 문장별 (모든 문장이 번역될 때만)
  effect(lang: SrcLang, text: string | null | undefined): string | undefined {
    if (!text) return undefined
    const whole = this.lookupEffect(lang, text)
    if (whole) return whole
    if (lang !== 'ja') return undefined
    const parts = splitJa(text)
    if (parts.length < 2) return undefined
    const out: string[] = []
    for (const p of parts) {
      const t = this.lookupEffect(lang, p)
      if (!t) return undefined
      out.push(t)
    }
    return out.join(' ')
  }

  private lookupEffect(lang: SrcLang, text: string): string | undefined {
    const exact = this.map.get(`EFFECT|${lang}|${normKey(text)}`)
    if (exact) return exact
    const { key, nums } = templatize(text)
    const tpl = nums.length ? this.map.get(`EFFECT|${lang}|${key}`) : undefined
    return tpl && tpl.includes('{') ? fillTemplate(tpl, nums) : undefined
  }

}

// ── 카드 이름 ────────────────────────────────────────────────────────────────

const JA_PREFIX: Array<[string, string]> = [
  ['メガ', '메가'], ['ゲンシ', '원시'], ['アローラ', '알로라 '], ['ガラル', '가라르 '], ['ヒスイ', '히스이 '],
  ['パルデア', '팔데아 '], ['ひかる', '빛나는 '], ['かがやく', '빛나는 '], ['ダーク', '다크 '], ['テラスタル', '테라스탈 '],
]
const EN_PREFIX: Array<[string, string]> = [
  ['Mega ', '메가'], ['Primal ', '원시'], ['Alolan ', '알로라 '], ['Galarian ', '가라르 '], ['Hisuian ', '히스이 '],
  ['Paldean ', '팔데아 '], ['Radiant ', '빛나는 '], ['Shining ', '빛나는 '], ['Dark ', '다크 '],
]
const PAREN_TAG: Record<string, string> = { 'デルタ種': '델타종', 'δ': '델타종' }
const SUFFIX_RE = /\s*(ex|EX|GX|VMAX|VSTAR|V-UNION|V|BREAK|LV\.X|δ|☆|◇|Prism Star)$/
const HAS_JA = /[぀-ヿ一-鿿]/

// 포켓몬 카드명 → 한국어 (확실하지 않으면 null)
export function translateCardName(name: string, lang: SrcLang, dict: KoDict): string | null {
  const exact = dict.lookup(['CARD_NAME', 'POKEMON'], lang, name)
  if (exact) return exact

  let core = name.trim()
  let suffix = ''
  const sm = core.match(SUFFIX_RE)
  if (sm && sm.index! > 0) { suffix = sm[1]; core = core.slice(0, sm.index).trim() }

  // "〇〇の△△" (트레이너의 포켓몬): 소유자 이름이 사전에 있을 때만
  let owner = ''
  if (lang === 'ja' && core.includes('の')) {
    const i = core.lastIndexOf('の')
    const ownerKo = dict.lookup(['CARD_NAME'], lang, core.slice(0, i))
    if (!ownerKo) return null
    owner = `${ownerKo}의 `
    core = core.slice(i + 1)
  } else if (lang === 'en') {
    const m = core.match(/^(.+?)'s (.+)$/)
    if (m) {
      const ownerKo = dict.lookup(['CARD_NAME'], lang, m[1])
      if (!ownerKo) return null
      owner = `${ownerKo}의 `
      core = m[2]
    }
  }

  // "（デルタ種）" 같은 괄호 꼬리표
  let tag = ''
  const tm = core.match(/\s*[（(]([^）)]+)[）)]$/)
  if (tm) {
    const ko = PAREN_TAG[normKey(tm[1])]
    if (!ko) return null
    tag = ` (${ko})`
    core = core.slice(0, tm.index).trim()
  }

  // 태그팀 "トゲピー&ピィ&ププリンGX": 모든 포켓몬 이름을 알 때만
  const koParts: string[] = []
  for (const part of core.split(/\s*[&＆]\s*/)) {
    let prefix = '', p = part
    for (const [px, ko] of lang === 'ja' ? JA_PREFIX : EN_PREFIX) {
      if (p.startsWith(px) && p.length > px.length) { prefix = ko; p = p.slice(px.length); break }
    }
    const species = dict.lookup(['POKEMON'], lang, p)
    if (!species) return null
    koParts.push(`${prefix}${species}`)
  }
  const out = `${owner}${koParts.join('&')}${suffix ? ` ${suffix}` : ''}${tag}`.replace(/\s+/g, ' ').trim()
  return lang === 'ja' && HAS_JA.test(out) ? null : out
}

// ── 카드 전체 ────────────────────────────────────────────────────────────────

export interface AttackIn { name: string; text?: string | null; cost?: string[]; damage?: string | null }
export interface AbilityIn { name: string; text?: string | null; type?: string | null }
export interface KoText {
  attacks?: Array<{ name: string | null; text: string | null }>
  abilities?: Array<{ name: string | null; text: string | null }>
  effect?: string | null
  flavor?: string | null
}

export function translatePokemonCard(
  card: { name: string; attacks?: AttackIn[] | null; abilities?: AbilityIn[] | null; description?: string | null },
  lang: SrcLang,
  dict: KoDict,
  speciesFlavorKo?: string | null,
): { nameKo: string | null; textKo: KoText; total: number; translated: number } {
  let total = 1, translated = 0
  const nameKo = translateCardName(card.name, lang, dict)
  if (nameKo) translated++

  const count = (src: string | null | undefined, out: string | null | undefined) => {
    if (!src) return
    total++
    if (out) translated++
  }

  const attacks = (card.attacks ?? []).map(a => {
    const name = dict.lookup(['ATTACK_NAME', 'MOVE'], lang, a.name) ?? null
    const text = a.text ? dict.effect(lang, a.text) ?? null : null
    count(a.name, name); count(a.text, text)
    return { name, text }
  })
  const abilities = (card.abilities ?? []).map(a => {
    const name = dict.lookup(['ABILITY_NAME', 'ABILITY'], lang, a.name) ?? null
    const text = a.text ? dict.effect(lang, a.text) ?? null : null
    count(a.name, name); count(a.text, text)
    return { name, text }
  })
  const effect = card.description ? dict.effect(lang, card.description) ?? null : null
  count(card.description, effect)

  const textKo: KoText = {}
  if (attacks.length) textKo.attacks = attacks
  if (abilities.length) textKo.abilities = abilities
  if (card.description) textKo.effect = effect
  if (speciesFlavorKo) textKo.flavor = speciesFlavorKo
  return { nameKo, textKo, total, translated }
}

// ── 공식 한판·일판 카드 짝 → 사전 항목 ─────────────────────────────────────────

export interface CardTextSrc {
  name: string
  attacks?: AttackIn[] | null
  abilities?: AbilityIn[] | null
  description?: string | null
}

function effectPairs(ja: string, ko: string): DictEntry[] {
  const out: DictEntry[] = [{ kind: 'EFFECT', srcLang: 'ja', src: normKey(ja), ko: ko.trim() }]
  const t = templatize(ja)
  const tpl = t.nums.length ? templatizeKo(ko, t.nums) : null
  if (tpl) out.push({ kind: 'EFFECT', srcLang: 'ja', src: t.key, ko: tpl })
  // 문장 수가 같으면 문장 단위로도
  const js = splitJa(ja), ks = splitKo(ko)
  if (js.length > 1 && js.length === ks.length) js.forEach((j, i) => out.push(...effectPairs(j, ks[i]).slice(0, 2)))
  return out
}

export function minePairs(ja: CardTextSrc, ko: CardTextSrc): DictEntry[] {
  const out: DictEntry[] = []
  if (ja.name && ko.name && ja.name !== ko.name) out.push({ kind: 'CARD_NAME', srcLang: 'ja', src: normKey(ja.name), ko: ko.name.trim() })
  const ja_a = ja.attacks ?? [], ko_a = ko.attacks ?? []
  if (ja_a.length === ko_a.length) {
    ja_a.forEach((a, i) => {
      const b = ko_a[i]
      if (a.name && b.name) out.push({ kind: 'ATTACK_NAME', srcLang: 'ja', src: normKey(a.name), ko: b.name.trim() })
      if (a.text && b.text) out.push(...effectPairs(a.text, b.text))
    })
  }
  const ja_b = ja.abilities ?? [], ko_b = ko.abilities ?? []
  if (ja_b.length === ko_b.length) {
    ja_b.forEach((a, i) => {
      const b = ko_b[i]
      if (a.name && b.name) out.push({ kind: 'ABILITY_NAME', srcLang: 'ja', src: normKey(a.name), ko: b.name.trim() })
      if (a.text && b.text) out.push(...effectPairs(a.text, b.text))
    })
  }
  if (ja.description && ko.description) out.push(...effectPairs(ja.description, ko.description))
  return out
}

// 같은 원문에 서로 다른 번역이 관측되면 가장 많이 나온 것을 쓴다
export function tallyEntries(entries: DictEntry[]): Array<DictEntry & { hits: number }> {
  const byKey = new Map<string, Map<string, number>>()
  const meta = new Map<string, DictEntry>()
  for (const e of entries) {
    const k = `${e.kind}|${e.srcLang}|${e.src}`
    meta.set(k, e)
    const m = byKey.get(k) ?? new Map<string, number>()
    m.set(e.ko, (m.get(e.ko) ?? 0) + 1)
    byKey.set(k, m)
  }
  return [...byKey].map(([k, m]) => {
    const [ko, hits] = [...m].sort((a, b) => b[1] - a[1])[0]
    return { ...meta.get(k)!, ko, hits }
  })
}

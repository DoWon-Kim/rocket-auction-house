import { KoDict, normKey, templatize, templatizeKo, translateCardName, translatePokemonCard, minePairs, tallyEntries, type DictEntry } from '../lib/koTranslate'

const e = (kind: DictEntry['kind'], src: string, ko: string, srcLang: 'ja' | 'en' = 'ja'): DictEntry => ({ kind, srcLang, src: normKey(src), ko })

const dict = new KoDict([
  e('POKEMON', 'ゲッコウガ', '개굴닌자'), e('POKEMON', 'ゲコガシラ', '개굴반장'), e('POKEMON', 'ニャース', '나옹'),
  e('POKEMON', 'ロコン', '식스테일'), e('POKEMON', 'Greninja', '개굴닌자', 'en'), e('POKEMON', 'Vulpix', '식스테일', 'en'),
  e('CARD_NAME', 'ロケット団', '로켓단'), e('CARD_NAME', 'ナンジャモ', '모야모'),
  e('MOVE', 'たいあたり', '몸통박치기'), e('MOVE', 'Tackle', '몸통박치기', 'en'),
  e('ATTACK_NAME', 'アクアエッジ', '아쿠아에지'),
  e('ABILITY_NAME', 'よるこうさく', '밤의 공작'),
  e('EFFECT', '相手のバトルポケモンをどくにする。', '상대의 배틀 포켓몬을 독으로 만든다.'),
  { kind: 'EFFECT', srcLang: 'ja', src: templatize('このポケモンにも30ダメージ。').key, ko: '이 포켓몬에게도 {0}데미지를 준다.' },
  e('EFFECT', '自分の山札を1枚引く。', '자신의 덱을 1장 뽑는다.'),
])

describe('카드명 번역', () => {
  it('포켓몬 이름 + 접두어·접미어', () => {
    expect(translateCardName('ゲッコウガ', 'ja', dict)).toBe('개굴닌자')
    expect(translateCardName('メガゲッコウガex', 'ja', dict)).toBe('메가개굴닌자 ex')
    expect(translateCardName('アローラロコン', 'ja', dict)).toBe('알로라 식스테일')
    expect(translateCardName('Greninja ex', 'en', dict)).toBe('개굴닌자 ex')
    expect(translateCardName('Alolan Vulpix V', 'en', dict)).toBe('알로라 식스테일 V')
  })
  it('트레이너의 포켓몬은 소유자 이름이 사전에 있을 때만', () => {
    expect(translateCardName('ロケット団のニャース', 'ja', dict)).toBe('로켓단의 나옹')
    expect(translateCardName('ホミカのニャース', 'ja', dict)).toBeNull()
  })
  it('태그팀·델타종·일판 데이터 속 영문명', () => {
    expect(translateCardName('ゲッコウガ&ニャースGX', 'ja', dict)).toBe('개굴닌자&나옹 GX')
    expect(translateCardName('ゲッコウガ&ホミカGX', 'ja', dict)).toBeNull()
    expect(translateCardName('ロコン（デルタ種）', 'ja', dict)).toBe('식스테일 (델타종)')
    expect(translateCardName('greninja', 'en', dict)).toBe('개굴닌자')
  })
  it('모르는 이름은 번역하지 않음', () => {
    expect(translateCardName('ポケモンいれかえ', 'ja', dict)).toBeNull()
    expect(translateCardName('ナンジャモ', 'ja', dict)).toBe('모야모')
  })
})

describe('효과 문장', () => {
  it('정확히 일치', () => {
    expect(dict.effect('ja', '相手のバトルポケモンを どくにする。')).toBe('상대의 배틀 포켓몬을 독으로 만든다.')
  })
  it('숫자만 다른 문장은 템플릿으로', () => {
    expect(dict.effect('ja', 'このポケモンにも50ダメージ。')).toBe('이 포켓몬에게도 50데미지를 준다.')
  })
  it('여러 문장은 모두 번역될 때만', () => {
    expect(dict.effect('ja', '自分の山札を1枚引く。相手のバトルポケモンをどくにする。')).toBe('자신의 덱을 1장 뽑는다. 상대의 배틀 포켓몬을 독으로 만든다.')
    expect(dict.effect('ja', '自分の山札を1枚引く。モヤモヤする。')).toBeUndefined()
  })
  it('템플릿은 숫자 순서가 같을 때만 생성', () => {
    expect(templatizeKo('데미지 30, 추가 20', ['30', '20'])).toBe('데미지 {0}, 추가 {1}')
    expect(templatizeKo('데미지 20, 추가 30', ['30', '20'])).toBeNull()
  })
})

describe('카드 전체 번역', () => {
  it('이름·기술·특성·설명과 번역률', () => {
    const r = translatePokemonCard({
      name: 'ゲコガシラ',
      attacks: [{ name: 'たいあたり', text: '' }, { name: 'アクアエッジ', text: 'このポケモンにも10ダメージ。' }],
      abilities: [{ name: 'よるこうさく', text: '謎の効果。' }],
    }, 'ja', dict, '개굴반장 도감 설명')
    expect(r.nameKo).toBe('개굴반장')
    expect(r.textKo.attacks).toEqual([{ name: '몸통박치기', text: null }, { name: '아쿠아에지', text: '이 포켓몬에게도 10데미지를 준다.' }])
    expect(r.textKo.abilities).toEqual([{ name: '밤의 공작', text: null }])
    expect(r.textKo.flavor).toBe('개굴반장 도감 설명')
    expect(r.translated).toBe(5)   // 이름 + 기술명 2 + 기술 효과 1 + 특성명
    expect(r.total).toBe(6)        // + 특성 효과(미번역)
  })
})

describe('공식 짝에서 사전 만들기', () => {
  it('이름·기술·효과(숫자 템플릿·문장 단위) 추출', () => {
    const entries = minePairs(
      { name: 'ドダイトスex', attacks: [{ name: 'ウッドハンマー', text: 'このポケモンにも30ダメージ。自分の山札を1枚引く。' }] },
      { name: '토대부기 ex', attacks: [{ name: '우드해머', text: '이 포켓몬에게도 30데미지를 준다. 자신의 덱을 1장 뽑는다.' }] },
    )
    const d = new KoDict(entries)
    expect(d.lookup(['CARD_NAME'], 'ja', 'ドダイトスex')).toBe('토대부기 ex')
    expect(d.lookup(['ATTACK_NAME'], 'ja', 'ウッドハンマー')).toBe('우드해머')
    expect(d.effect('ja', 'このポケモンにも90ダメージ。')).toBe('이 포켓몬에게도 90데미지를 준다.')
    expect(d.effect('ja', '自分の山札を1枚引く。')).toBe('자신의 덱을 1장 뽑는다.')
  })
  it('서로 다른 번역은 많이 나온 쪽', () => {
    const t = tallyEntries([e('ATTACK_NAME', 'かみなり', '번개'), e('ATTACK_NAME', 'かみなり', '천둥'), e('ATTACK_NAME', 'かみなり', '번개')])
    expect(t).toEqual([expect.objectContaining({ ko: '번개', hits: 2 })])
  })
})

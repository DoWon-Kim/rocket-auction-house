import { Prisma } from '@prisma/client'
import { mapTcgdexDetail, mapPtcgExtra, normalizeStage } from '../services/cardDetail.service'
import { cardLangOf } from '../lib/cardLang'

jest.mock('../lib/prisma', () => ({ prisma: {} }))

// 실제 TCGdex /v2/ja/cards/M4-091 응답 일부
const crobat = {
  id: 'M4-091', localId: '091', name: 'クロバット', category: 'Pokemon', illustrator: 'Kazuhisa Uragami',
  rarity: 'Illustration rare', hp: 130, types: ['Darkness'], evolveFrom: 'ゴルバット', stage: 'Stage2',
  description: '両足が 羽に 変化。', image: 'https://assets.tcgdex.net/ja/M/M4/091',
  abilities: [{ type: 'Ability', name: 'よるこうさく', effect: '山札から1枚選ぶ。' }],
  attacks: [{ cost: ['Darkness'], name: 'どくおんぱ', effect: 'どくとこんらんにする。', damage: 80 }],
  weaknesses: [{ type: 'Lightning', value: 'x2' }], resistances: [{ type: 'Fighting', value: '-30' }],
  retreat: 1, regulationMark: 'J', dexId: [169],
}

describe('TCGdex 상세 → 카드 필드', () => {
  it('비어 있던 레어도·이미지를 채우고 스탯을 화면 형식으로 변환', () => {
    const d = mapTcgdexDetail(crobat, { rarity: 'Unknown', imageUrl: null, description: null })
    expect(d).toMatchObject({
      rarity: 'Illustration rare', imageUrl: 'https://assets.tcgdex.net/ja/M/M4/091/high.webp',
      supertype: 'Pokémon', subtypes: 'Stage 2', cardTypes: 'Darkness', hp: 130, stage: 'Stage 2',
      evolvesFrom: 'ゴルバット', dexIds: [169], regulationMark: 'J', artist: 'Kazuhisa Uragami',
      flavorText: '両足が 羽に 変化。', retreatCost: 1,
      attacks: [{ name: 'どくおんぱ', cost: ['Darkness'], damage: '80', text: 'どくとこんらんにする。' }],
      abilities: [{ name: 'よるこうさく', text: '山札から1枚選ぶ。', type: 'Ability' }],
    })
    expect(d.detailSyncedAt).toBeInstanceOf(Date)
  })

  it('이미 있는 레어도·이미지는 유지, 없는 기술은 DB null', () => {
    const d = mapTcgdexDetail({ id: 'x', localId: '1', name: 'グッズ', category: 'Trainer', trainerType: 'Item', effect: '1枚引く。', rarity: 'None' },
      { rarity: 'SR', imageUrl: 'https://a/b.png', description: null })
    expect(d.rarity).toBeUndefined()
    expect(d.imageUrl).toBeUndefined()
    expect(d).toMatchObject({ supertype: 'Trainer', subtypes: 'Item', description: '1枚引く。', attacks: Prisma.DbNull, hp: null, dexIds: [] })
  })

  it('진화 단계 표기 정규화', () => {
    expect(normalizeStage('Stage1')).toBe('Stage 1')
    expect(normalizeStage('Basic')).toBe('Basic')
    expect(normalizeStage('VMAX')).toBe('VMAX')
    expect(normalizeStage(undefined)).toBeNull()
  })
})

describe('pokemontcg.io 부가 정보', () => {
  it('진화 단계·진화 전·도감번호·레귤레이션', () => {
    expect(mapPtcgExtra({ id: 'sv3pt5-25', subtypes: ['Basic'], nationalPokedexNumbers: [25], regulationMark: 'G' }))
      .toMatchObject({ stage: 'Basic', evolvesFrom: null, dexIds: [25], regulationMark: 'G' })
    expect(mapPtcgExtra({ id: 'x', subtypes: ['Stage 1', 'ex'], evolvesFrom: 'Pichu' })).toMatchObject({ stage: 'Stage 1', evolvesFrom: 'Pichu' })
  })
})

describe('카드 언어판', () => {
  it('externalId 접두어 기준', () => {
    expect(cardLangOf('tcgdex_ja_M4-091')).toBe('ja')
    expect(cardLangOf('snkrdunk_123')).toBe('ja')
    expect(cardLangOf('tcgdex_ko_SV3a-001')).toBe('ko')
    expect(cardLangOf('pokemon_sv3pt5-25')).toBe('en')
    expect(cardLangOf(null)).toBe('en')
  })
})

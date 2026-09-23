import { cardNumberKey, setCodeKey, cardNumberVariants, nameSimilarity, rankCandidates, pickAutoLink, type MatchCard } from '../lib/cardMatch'
import { isSingleCard, parseProductName, parseProductCode, toSourceItem } from '../services/snkrdunk.service'

jest.mock('../lib/prisma', () => ({ prisma: {} }))

describe('cardMatch 정규화', () => {
  it('카드 번호: 0 패딩·총수량 무시', () => {
    expect(cardNumberKey('079')).toBe('79')
    expect(cardNumberKey('079/062')).toBe('79')
    expect(cardNumberKey('TG01/TG30')).toBe('TG1')
    expect(cardNumberKey('mzmi-jp001')).toBe('MZMI-JP1')
    expect(cardNumberKey('100')).toBe('100')
  })

  it('세트 코드: 대소문자·0 패딩 무시', () => {
    expect(setCodeKey('SV3a')).toBe(setCodeKey('sv3a'))
    expect(setCodeKey('sv01')).toBe(setCodeKey('sv1'))
    expect(setCodeKey('SV10')).not.toBe(setCodeKey('SV1'))
    expect(setCodeKey('M-P')).toBe('m-p')
  })

  it('카드 번호 DB 검색 변형', () => {
    expect(cardNumberVariants('079')).toEqual(expect.arrayContaining(['079', '79']))
    expect(cardNumberVariants('7')).toEqual(expect.arrayContaining(['7', '07', '007']))
  })

  it('이름 유사도', () => {
    expect(nameSimilarity('Pikachu ex', 'Pikachu EX')).toBe(1)
    expect(nameSimilarity('Pikachu', 'Raichu')).toBeLessThan(0.5)
    expect(nameSimilarity('', 'x')).toBe(0)
  })
})

describe('자동 연결 판단', () => {
  const item = { tcgType: 'POKEMON', lang: 'ja', name: 'Pikachu ex SAR', setCode: 'SV3a', cardNumber: '079' }
  const card = (id: string, over: Partial<MatchCard> = {}): MatchCard =>
    ({ id, tcgType: 'POKEMON', name: 'ピカチュウex', setCode: 'SV3a', cardNumber: '079', externalId: `tcgdex_ja_SV3a-079`, ...over })

  it('세트+번호 일치 후보가 하나면 자동 연결', () => {
    const ranked = rankCandidates(item, [card('a'), card('b', { cardNumber: '080' })])
    expect(pickAutoLink(ranked)?.card.id).toBe('a')
  })

  it('번호만 같고 세트가 다르면 연결 안 함', () => {
    expect(pickAutoLink(rankCandidates(item, [card('a', { setCode: 'SV4a' })]))).toBeNull()
  })

  it('일치 후보가 여럿이면 같은 언어판이 하나일 때만 연결', () => {
    const ko = card('ko', { externalId: 'tcgdex_ko_SV3a-079' })
    expect(pickAutoLink(rankCandidates(item, [ko, card('ja')]))?.card.id).toBe('ja')
  })

  it('같은 언어판 중복이면 모호 → 검수', () => {
    expect(pickAutoLink(rankCandidates(item, [card('a'), card('b')]))).toBeNull()
  })

  it('이름 점수 차이만으로는 고르지 않음', () => {
    const noLang = { ...item, lang: null }
    const a = card('a', { name: 'Pikachu ex', externalId: 'pokemon_x' })
    const b = card('b', { name: 'Raichu', externalId: 'pokemon_y' })
    expect(pickAutoLink(rankCandidates(noLang, [a, b]))).toBeNull()
  })

  it('다른 TCG 카드는 후보에서 제외', () => {
    expect(rankCandidates(item, [card('y', { tcgType: 'YUGIOH' })])).toHaveLength(0)
  })
})

describe('스니덩 상품 파싱', () => {
  it('싱글/봉인 제품 구분 (세트명 괄호 안 Pack은 무시)', () => {
    expect(isSingleCard('Pikachu [M6a 136/103](Expansion Pack "30th CELEBRATION")')).toBe(true)
    expect(isSingleCard('Treecko PROMO [107/M-P]("30th Celebration Card Set Treecko, Torchic, Mudkip")')).toBe(true)
    expect(isSingleCard('Pokemon Card Game MEGA Expansion Pack "30th CELEBRATION" Pack')).toBe(false)
    expect(isSingleCard('Pokemon Card Game MEGA [EN] Mega Evolution "Chaos Rising 3 Booster Packs"')).toBe(false)
  })

  it('상품명 → 카드명·세트명', () => {
    expect(parseProductName('Gholdengo AR [M6a 118/103](Expansion Pack "30th CELEBRATION")'))
      .toEqual({ cardName: 'Gholdengo AR', bracket: 'M6a 118/103', setName: '30th CELEBRATION' })
    expect(parseProductName('Dark Paladin - Wave-Motion PSE :Extended Art [YAC1-JP009](Special Pack "Yu-Gi-Oh ORIGINAL ARTWORK COLLECTION")').cardName)
      .toBe('Dark Paladin - Wave-Motion PSE')
    expect(parseProductName('Dominus Spark PSE [BLZD-JP077](BLAZING DOMINION)').setName).toBe('BLAZING DOMINION')
  })

  it('포켓몬 상품 코드', () => {
    expect(parseProductCode('pkmn-tcg-SV3a-079', 'POKEMON', null)).toEqual({ lang: 'ja', setCode: 'SV3a', cardNumber: '079' })
    expect(parseProductCode('pkmn-tcg-M-P-107', 'POKEMON', null)).toEqual({ lang: 'ja', setCode: 'M-P', cardNumber: '107' })
    expect(parseProductCode('pkmn-tcg-en-SVI-001', 'POKEMON', null)).toEqual({ lang: 'en', setCode: 'SVI', cardNumber: '001' })
    expect(parseProductCode('pkmn-tcg-KR-M-P-001', 'POKEMON', null)).toEqual({ lang: 'ko', setCode: 'M-P', cardNumber: '001' })
    // 비정형 코드는 이름 괄호에서
    expect(parseProductCode('pkmn-tcg-M6a-151x', 'POKEMON', 'M6a 151/103')).toEqual({ lang: 'ja', setCode: 'M6a', cardNumber: '151' })
    expect(parseProductCode('pkmn-tcg-M6a-RGB', 'POKEMON', 'M6a G/RGB')).toEqual({ lang: 'ja', setCode: 'M6a', cardNumber: null })
    expect(parseProductCode('pkmn-tcg-XYZ', 'POKEMON', null)).toEqual({ lang: 'ja', setCode: null, cardNumber: null })
  })

  it('유희왕 상품 코드는 DB 표기(세트코드 포함)로', () => {
    expect(parseProductCode('YGO-OCG-TCG-MZMI-JP001', 'YUGIOH', null)).toEqual({ lang: 'ja', setCode: 'MZMI', cardNumber: 'MZMI-JP001' })
    expect(parseProductCode('YGO-OCG-TCG-2026-JPTKN', 'YUGIOH', '2026-JPTKN')).toEqual({ lang: 'ja', setCode: null, cardNumber: null })
  })

  it('API 응답 → 소스 항목', () => {
    const item = toSourceItem({
      id: 1, productNumber: 'pkmn-tcg-M6a-136', name: 'Pikachu [M6a 136/103](Expansion Pack "30th CELEBRATION")',
      minPrice: 38911, listingCount: '5', thumbnailUrl: 'https://cdn.snkrdunk.com/a.webp?size=m',
    }, 'POKEMON')
    expect(item).toMatchObject({
      externalId: '1', name: 'Pikachu', setCode: 'M6a', cardNumber: '136', lang: 'ja',
      price: 38911, listings: '5', imageUrl: 'https://cdn.snkrdunk.com/a.webp?size=l', setName: '30th CELEBRATION',
    })
  })
})

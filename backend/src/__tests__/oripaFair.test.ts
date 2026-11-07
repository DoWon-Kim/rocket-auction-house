import { baseTickets, shuffleTickets, sealTickets, sha256Hex, returnRate, maskName } from '../lib/oripaFair'

const items = [
  { id: 'c-low', quantity: 7, isLastOne: false },
  { id: 'a-top', quantity: 1, isLastOne: false },
  { id: 'b-mid', quantity: 2, isLastOne: false },
  { id: 'z-last', quantity: 1, isLastOne: true },
]

describe('오리파 티켓 봉인', () => {
  it('기본 티켓: id 순서, 수량만큼, 라스트원상 제외', () => {
    expect(baseTickets(items)).toEqual(['a-top', 'b-mid', 'b-mid', ...Array(7).fill('c-low')])
  })
  it('같은 시드면 같은 순서 (검증 가능), 다른 시드면 다른 순서', () => {
    const t = baseTickets(items)
    expect(shuffleTickets(t, 'seed-1')).toEqual(shuffleTickets(t, 'seed-1'))
    const many = new Set(['s1', 's2', 's3', 's4', 's5'].map(s => shuffleTickets(t, s).join(',')))
    expect(many.size).toBeGreaterThan(1)
  })
  it('섞어도 상품 수는 그대로 (순열)', () => {
    const t = baseTickets(items)
    const s = shuffleTickets(t, 'abc')
    expect([...s].sort()).toEqual([...t].sort())
  })
  it('봉인: 공개 해시 = sha256(시드), 시드로 순서 재현', () => {
    const { seed, seedHash, order } = sealTickets(items)
    expect(seed).toMatch(/^[0-9a-f]{64}$/)
    expect(seedHash).toBe(sha256Hex(seed))
    expect(order).toEqual(shuffleTickets(baseTickets(items), seed))
    expect(order).toHaveLength(10)
  })
  it('알고리즘 고정값 (프론트 검증 코드와 동일해야 함)', () => {
    expect(shuffleTickets(['a', 'b', 'c', 'd', 'e'], 'fixed-seed')).toEqual(['d', 'c', 'e', 'b', 'a'])
  })
})

describe('환원율·닉네임', () => {
  it('카드 교환가·포인트 상품·라스트원상 포함', () => {
    const r = returnRate([
      { id: 'a', quantity: 1, isLastOne: false, prizeType: 'CARD', exchangeValue: 50000, pointAmount: null },
      { id: 'b', quantity: 9, isLastOne: false, prizeType: 'POINT', exchangeValue: null, pointAmount: 500 },
      { id: 'c', quantity: 1, isLastOne: true, prizeType: 'CARD', exchangeValue: 10000, pointAmount: null },
    ], 1000, 10)
    expect(r.value).toBe(64500)
    expect(r.rate).toBeCloseTo(6.45)
  })
  it('닉네임 가리기', () => {
    expect(maskName('demo_buyer')).toBe('de***')
    expect(maskName('ab')).toBe('a*')
  })
})

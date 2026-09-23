import { evaluateWarnings } from '../services/syncRun.service'
import { kstDay } from '../services/snkrdunk.service'
import { nextKstRun } from '../jobs/snkrdunkSync'

jest.mock('../lib/prisma', () => ({ prisma: {} }))
jest.mock('../lib/notify', () => ({ notify: jest.fn() }))

const totals = (over: Partial<Parameters<typeof evaluateWarnings>[0]> = {}) => ({
  fetched: 10000, updated: 0, linked: 0, queued: 0, ignored: 0, skipped: 0, errors: 0, emptyBrands: [], ...over,
})

describe('동기화 이상 감지', () => {
  it('정상이면 경고 없음', () => {
    expect(evaluateWarnings(totals(), 9800)).toEqual([])
  })
  it('지난 실행 대비 절반 미만이면 경고', () => {
    expect(evaluateWarnings(totals({ fetched: 4000 }), 10000)[0]).toMatch(/절반 미만/)
  })
  it('이전 실행이 작거나 없으면 급감 판단 안 함', () => {
    expect(evaluateWarnings(totals({ fetched: 100 }), 300)).toEqual([])
    expect(evaluateWarnings(totals({ fetched: 100 }), null)).toEqual([])
  })
  it('브랜드 누락·오류 건수 경고', () => {
    const w = evaluateWarnings(totals({ errors: 3, emptyBrands: ['yu-gi-oh'] }), null)
    expect(w).toEqual(expect.arrayContaining([expect.stringMatching(/yu-gi-oh/), expect.stringMatching(/오류 3건/)]))
  })
})

describe('KST 날짜·예약 시각', () => {
  it('kstDay: UTC 15시 이후는 KST 다음 날', () => {
    expect(kstDay(new Date('2026-09-24T14:59:00Z')).toISOString()).toBe('2026-09-24T00:00:00.000Z')
    expect(kstDay(new Date('2026-09-24T15:00:00Z')).toISOString()).toBe('2026-09-25T00:00:00.000Z')
  })
  it('nextKstRun: 오늘 예약 시각 전이면 오늘, 지났으면 내일', () => {
    // KST 03:00 (= UTC 전날 18:00) → 같은 날 KST 04:00 (= UTC 19:00)
    expect(nextKstRun(4, new Date('2026-09-23T18:00:00Z')).toISOString()).toBe('2026-09-23T19:00:00.000Z')
    // KST 05:00 → 다음 날 KST 04:00
    expect(nextKstRun(4, new Date('2026-09-23T20:00:00Z')).toISOString()).toBe('2026-09-24T19:00:00.000Z')
    // 정각이면 다음 날
    expect(nextKstRun(4, new Date('2026-09-23T19:00:00Z')).toISOString()).toBe('2026-09-24T19:00:00.000Z')
  })
})

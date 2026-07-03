/**
 * fraudDetection — unit tests for risk scoring and seller grade logic.
 * Prisma is mocked so no DB connection is needed.
 */

jest.mock('../lib/prisma', () => ({
  prisma: {
    user:        { findUnique: jest.fn(), update: jest.fn() },
    report:      { count: jest.fn() },
    dispute:     { count: jest.fn() },
    transaction: { count: jest.fn(), aggregate: jest.fn() },
    review:      { aggregate: jest.fn() },
    bid:         { count: jest.fn() },
  },
}))

import { prisma } from '../lib/prisma'
import { analyzeUserRisk, calculateSellerGrade, detectAbnormalBidding } from '../lib/fraudDetection'

const mockPrisma = prisma as jest.Mocked<typeof prisma>

describe('analyzeUserRisk', () => {
  beforeEach(() => jest.clearAllMocks())

  function setupMocks({
    warningCount = 0,
    isSuspended = false,
    accountAgeDays = 60,
    reports = 0,
    disputes = 0,
    cancelledSales = 0,
  }: Partial<{
    warningCount: number; isSuspended: boolean; accountAgeDays: number
    reports: number; disputes: number; cancelledSales: number
  }>) {
    const createdAt = new Date(Date.now() - accountAgeDays * 86400_000);
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ warningCount, isSuspended, createdAt });
    (mockPrisma.report.count as jest.Mock).mockResolvedValue(reports);
    (mockPrisma.dispute.count as jest.Mock).mockResolvedValue(disputes);
    (mockPrisma.transaction.count as jest.Mock).mockResolvedValue(cancelledSales)
  }

  test('returns LOW risk for clean user', async () => {
    setupMocks({})
    const result = await analyzeUserRisk('user-1')
    expect(result.risk).toBe('LOW')
    expect(result.reasons).toHaveLength(0)
  })

  test('returns HIGH risk for user with 3+ warnings and 3+ reports', async () => {
    setupMocks({ warningCount: 3, reports: 4 })
    const result = await analyzeUserRisk('user-2')
    expect(result.risk).toBe('HIGH')
    expect(result.reasons.length).toBeGreaterThanOrEqual(2)
  })

  test('new account (< 30 days) adds a reason', async () => {
    setupMocks({ accountAgeDays: 10 })
    const result = await analyzeUserRisk('user-3')
    expect(result.reasons.some(r => r.includes('신규'))).toBe(true)
  })

  test('returns LOW for unknown userId', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    (mockPrisma.report.count as jest.Mock).mockResolvedValue(0);
    (mockPrisma.dispute.count as jest.Mock).mockResolvedValue(0);
    (mockPrisma.transaction.count as jest.Mock).mockResolvedValue(0)
    const result = await analyzeUserRisk('unknown')
    expect(result.risk).toBe('LOW')
  })
})

describe('calculateSellerGrade', () => {
  beforeEach(() => jest.clearAllMocks())

  test('returns DIAMOND for 100+ sales, 4.8 rating, 0 disputes', async () => {
    (mockPrisma.transaction.count as jest.Mock).mockResolvedValue(120);
    (mockPrisma.review.aggregate as jest.Mock).mockResolvedValue({ _avg: { rating: 4.9 } });
    (mockPrisma.dispute.count as jest.Mock).mockResolvedValue(0)
    expect(await calculateSellerGrade('s-1')).toBe('DIAMOND')
  })

  test('returns BRONZE when disputes >= 3', async () => {
    (mockPrisma.transaction.count as jest.Mock).mockResolvedValue(200);
    (mockPrisma.review.aggregate as jest.Mock).mockResolvedValue({ _avg: { rating: 4.5 } });
    (mockPrisma.dispute.count as jest.Mock).mockResolvedValue(3)
    expect(await calculateSellerGrade('s-2')).toBe('BRONZE')
  })

  test('returns BRONZE when rating < 3.0', async () => {
    (mockPrisma.transaction.count as jest.Mock).mockResolvedValue(50);
    (mockPrisma.review.aggregate as jest.Mock).mockResolvedValue({ _avg: { rating: 2.5 } });
    (mockPrisma.dispute.count as jest.Mock).mockResolvedValue(0)
    expect(await calculateSellerGrade('s-3')).toBe('BRONZE')
  })
})

describe('detectAbnormalBidding', () => {
  beforeEach(() => jest.clearAllMocks())

  test('returns false for < 20 bids in 5 min', async () => {
    (mockPrisma.bid.count as jest.Mock).mockResolvedValue(19)
    expect(await detectAbnormalBidding('user-x')).toBe(false)
  })

  test('returns true for >= 20 bids in 5 min', async () => {
    (mockPrisma.bid.count as jest.Mock).mockResolvedValue(20)
    expect(await detectAbnormalBidding('user-x')).toBe(true)
  })
})

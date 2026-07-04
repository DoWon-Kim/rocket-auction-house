/**
 * Dispute API integration tests — supertest through the real Express router.
 */

process.env.JWT_SECRET         = 'test-secret-key-32chars-minimum-len'
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-32chars-min'
process.env.DATABASE_URL       = 'postgresql://test:test@localhost:5432/test'
process.env.PORT               = '4003'
process.env.FRONTEND_URL       = 'http://localhost:3000'
process.env.API_URL            = 'http://localhost:4001'

jest.mock('../lib/prisma', () => ({
  prisma: {
    user:        { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    dispute:     { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn(), update: jest.fn() },
    transaction: { findUnique: jest.fn(), count: jest.fn(), update: jest.fn() },
    report:      { count: jest.fn() },
    refreshToken: { create: jest.fn(), findFirst: jest.fn(), delete: jest.fn() },
    $queryRaw:   jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    $transaction: jest.fn(),
  },
}))

jest.mock('../lib/notify',        () => ({ notify: jest.fn() }))
jest.mock('../lib/socketio',      () => ({ getIo: jest.fn(() => ({ to: jest.fn(() => ({ emit: jest.fn() })), emit: jest.fn() })), initIo: jest.fn() }))
jest.mock('../middleware/rateLimit', () => ({
  authLimiter:    (_req: unknown, _res: unknown, next: () => void) => next(),
  apiLimiter:     (_req: unknown, _res: unknown, next: () => void) => next(),
  uploadLimiter:  (_req: unknown, _res: unknown, next: () => void) => next(),
  paymentLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  LazyStore: class { init() {} async increment() { return { totalHits: 1, resetTime: new Date() } } async resetKey() {} },
}))
jest.mock('../lib/fraudDetection', () => ({
  analyzeUserRisk:       jest.fn().mockResolvedValue({ risk: 'LOW', reasons: [] }),
  detectAbnormalBidding: jest.fn().mockResolvedValue(false),
  issueWarning:          jest.fn(),
  calculateSellerGrade:  jest.fn().mockResolvedValue('BRONZE'),
}))

import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import router from '../routes'
import { prisma } from '../lib/prisma'

const mockPrisma = prisma as jest.Mocked<typeof prisma>

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api', router)
  return app
}

function makeToken(userId = 'user-1', role = 'USER') {
  return jwt.sign({ userId, role }, process.env.JWT_SECRET!)
}

describe('POST /api/disputes', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 401 without auth token', async () => {
    const app = buildApp()
    const res = await request(app).post('/api/disputes').send({
      transactionId: 'tx-1', reason: 'FRAUD', description: '사기 의심입니다.',
    })
    expect(res.status).toBe(401)
  })

  it('returns 400 with invalid reason enum', async () => {
    const token = makeToken()
    const app = buildApp()
    const res = await request(app)
      .post('/api/disputes')
      .set('Authorization', `Bearer ${token}`)
      .send({ transactionId: 'tx-1', reason: 'INVALID_REASON', description: '사기 의심입니다.' })
    expect(res.status).toBe(400)
  })

  it('returns 400 with description too short', async () => {
    const token = makeToken()
    const app = buildApp()
    const res = await request(app)
      .post('/api/disputes')
      .set('Authorization', `Bearer ${token}`)
      .send({ transactionId: 'tx-1', reason: 'FRAUD', description: '짧은' })
    expect(res.status).toBe(400)
  })

  it('returns 404 when transaction does not exist', async () => {
    const token = makeToken()
    ;(mockPrisma.transaction.findUnique as jest.Mock).mockResolvedValue(null)

    const app = buildApp()
    const res = await request(app)
      .post('/api/disputes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        transactionId: '00000000-0000-0000-0000-000000000000',
        reason: 'FRAUD',
        description: '사기 의심입니다. 충분히 긴 설명입니다.',
      })
    expect(res.status).toBe(404)
  })

  it('returns 403 when caller is not the buyer', async () => {
    const token = makeToken('user-1')
    ;(mockPrisma.transaction.findUnique as jest.Mock).mockResolvedValue({
      buyerId: 'user-other', sellerId: 'user-2',
      txStatus: 'SHIPPED', dispute: null,
    })

    const app = buildApp()
    const res = await request(app)
      .post('/api/disputes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        transactionId: '00000000-0000-0000-0000-000000000000',
        reason: 'FRAUD',
        description: '사기 의심입니다. 충분히 긴 설명입니다.',
      })
    expect(res.status).toBe(403)
  })

  it('returns 201 when dispute is created successfully', async () => {
    const token = makeToken('buyer-1')
    const txId = '00000000-0000-0000-0000-000000000001'
    ;(mockPrisma.transaction.findUnique as jest.Mock).mockResolvedValue({
      buyerId: 'buyer-1', sellerId: 'seller-1',
      txStatus: 'SHIPPED', dispute: null,
    })
    ;(mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn: (t: typeof mockPrisma) => Promise<unknown>) => {
      return fn({
        dispute: { create: jest.fn().mockResolvedValue({ id: 'dispute-1', transactionId: txId }) },
        transaction: { update: jest.fn().mockResolvedValue({}) },
      } as unknown as typeof mockPrisma)
    })

    const app = buildApp()
    const res = await request(app)
      .post('/api/disputes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        transactionId: txId,
        reason: 'FRAUD',
        description: '사기 의심입니다. 충분히 긴 설명입니다.',
      })
    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('dispute')
  })
})

describe('GET /api/disputes', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 401 without auth token', async () => {
    const app = buildApp()
    const res = await request(app).get('/api/disputes')
    expect(res.status).toBe(401)
  })

  it('returns 200 with user disputes list', async () => {
    const token = makeToken('user-1')
    ;(mockPrisma.dispute.findMany as jest.Mock).mockResolvedValue([])

    const app = buildApp()
    const res = await request(app)
      .get('/api/disputes')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('disputes')
  })
})

describe('GET /api/admin/disputes', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 401 without auth', async () => {
    const app = buildApp()
    const res = await request(app).get('/api/admin/disputes')
    expect(res.status).toBe(401)
  })

  it('returns 403 for non-admin users', async () => {
    const token = makeToken('user-1', 'USER')
    const app = buildApp()
    const res = await request(app)
      .get('/api/admin/disputes')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(403)
  })

  it('returns 200 for admin users', async () => {
    const token = makeToken('admin-1', 'ADMIN')
    ;(mockPrisma.dispute.findMany as jest.Mock).mockResolvedValue([])
    ;(mockPrisma.dispute.count   as jest.Mock).mockResolvedValue(0)

    const app = buildApp()
    const res = await request(app)
      .get('/api/admin/disputes')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('disputes')
    expect(res.body).toHaveProperty('total', 0)
  })
})

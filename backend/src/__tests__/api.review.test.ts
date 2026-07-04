/**
 * Review API integration tests — supertest through the real Express router.
 */

process.env.JWT_SECRET         = 'test-secret-key-32chars-minimum-len'
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-32chars-min'
process.env.DATABASE_URL       = 'postgresql://test:test@localhost:5432/test'
process.env.PORT               = '4004'
process.env.FRONTEND_URL       = 'http://localhost:3000'
process.env.API_URL            = 'http://localhost:4001'

jest.mock('../lib/prisma', () => ({
  prisma: {
    user:        { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    review:      { findMany: jest.fn(), create: jest.fn(), count: jest.fn(), findUnique: jest.fn() },
    transaction: { findUnique: jest.fn(), count: jest.fn() },
    report:      { count: jest.fn() },
    dispute:     { count: jest.fn() },
    refreshToken: { create: jest.fn(), findFirst: jest.fn(), delete: jest.fn() },
    $queryRaw:    jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    $executeRaw:  jest.fn().mockResolvedValue(BigInt(1)),
    $transaction: jest.fn(),
  },
}))

jest.mock('../lib/notify',        () => ({ notify: jest.fn().mockResolvedValue(undefined) }))
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

describe('POST /api/reviews', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 401 without auth token', async () => {
    const app = buildApp()
    const res = await request(app).post('/api/reviews').send({
      transactionId: 'tx-1', rating: 5,
    })
    expect(res.status).toBe(401)
  })

  it('returns 400 with invalid rating (out of range)', async () => {
    const token = makeToken()
    const app = buildApp()
    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${token}`)
      .send({ transactionId: 'tx-1', rating: 6 })
    expect(res.status).toBe(400)
  })

  it('returns 404 when transaction does not exist', async () => {
    const token = makeToken('user-1')
    ;(mockPrisma.transaction.findUnique as jest.Mock).mockResolvedValue(null)

    const app = buildApp()
    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${token}`)
      .send({ transactionId: '00000000-0000-0000-0000-000000000000', rating: 5 })
    expect(res.status).toBe(404)
  })

  it('returns 400 when transaction is not completed', async () => {
    const token = makeToken('buyer-1')
    ;(mockPrisma.transaction.findUnique as jest.Mock).mockResolvedValue({
      id: 'tx-1', buyerId: 'buyer-1', sellerId: 'seller-1',
      txStatus: 'PENDING_SHIPMENT',
      reviews: [],
    })

    const app = buildApp()
    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${token}`)
      .send({ transactionId: 'tx-1', rating: 5 })
    expect(res.status).toBe(400)
  })

  it('returns 409 when review already exists', async () => {
    const token = makeToken('buyer-1')
    ;(mockPrisma.transaction.findUnique as jest.Mock).mockResolvedValue({
      id: 'tx-1', buyerId: 'buyer-1', sellerId: 'seller-1',
      txStatus: 'COMPLETED',
      reviews: [{ id: 'existing-review' }],
    })

    const app = buildApp()
    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${token}`)
      .send({ transactionId: 'tx-1', rating: 5 })
    expect(res.status).toBe(409)
  })

  it('returns 201 on successful review creation', async () => {
    const token = makeToken('buyer-1')
    ;(mockPrisma.transaction.findUnique as jest.Mock).mockResolvedValue({
      id: 'tx-1', buyerId: 'buyer-1', sellerId: 'seller-1',
      txStatus: 'COMPLETED',
      reviews: [],
    })
    // $transaction receives [review.create PrismaPromise, $executeRaw PrismaPromise]
    // and we return the resolved array
    ;(mockPrisma.$transaction as jest.Mock).mockResolvedValue([
      { id: 'review-1', rating: 5, role: 'BUYER' },
      BigInt(1),
    ])
    ;(mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ nickname: '구매자' })

    const app = buildApp()
    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${token}`)
      .send({ transactionId: 'tx-1', rating: 5, comment: '좋은 거래였어요!' })
    expect(res.status).toBe(201)
  })
})

describe('GET /api/users/:userId/reviews', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 200 with reviews and aggregate stats (public endpoint)', async () => {
    ;(mockPrisma.review.findMany  as jest.Mock).mockResolvedValue([])
    ;(mockPrisma.review.count     as jest.Mock).mockResolvedValue(3)
    ;(mockPrisma.user.findUnique  as jest.Mock).mockResolvedValue({
      avgRating: 4.5, reviewCount: 3,
    })

    const app = buildApp()
    const res = await request(app).get('/api/users/user-1/reviews')

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('reviews')
    expect(res.body).toHaveProperty('total', 3)
    expect(res.body.avgRating).toBe(4.5)
    expect(res.body.reviewCount).toBe(3)
  })

  it('returns 200 with null avgRating when user does not exist', async () => {
    ;(mockPrisma.review.findMany as jest.Mock).mockResolvedValue([])
    ;(mockPrisma.review.count   as jest.Mock).mockResolvedValue(0)
    ;(mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null)

    const app = buildApp()
    const res = await request(app).get('/api/users/nonexistent/reviews')

    expect(res.status).toBe(200)
    expect(res.body.avgRating).toBeNull()
    expect(res.body.total).toBe(0)
  })
})

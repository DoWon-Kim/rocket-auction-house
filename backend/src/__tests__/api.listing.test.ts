/**
 * Listing API integration tests — supertest through the real Express router.
 */

process.env.JWT_SECRET         = 'test-secret-key-32chars-minimum-len'
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-32chars-min'
process.env.DATABASE_URL       = 'postgresql://test:test@localhost:5432/test'
process.env.PORT               = '4002'
process.env.FRONTEND_URL       = 'http://localhost:3000'
process.env.API_URL            = 'http://localhost:4001'

jest.mock('../lib/prisma', () => ({
  prisma: {
    user:        { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    listing:     { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn(), aggregate: jest.fn() },
    bid:         { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    autoBid:     { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    offer:       { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    transaction: { findUnique: jest.fn(), create: jest.fn(), count: jest.fn(), aggregate: jest.fn() },
    card:        { findUnique: jest.fn() },
    wishlist:    { findMany: jest.fn() },
    report:      { count: jest.fn() },
    dispute:     { count: jest.fn() },
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

const MOCK_LISTING = {
  id: 'listing-1',
  cardId: 'card-1',
  sellerId: 'user-1',
  listingType: 'BUY_NOW',
  condition: 'MINT',
  status: 'ACTIVE',
  buyNowPrice: 50000,
  quantity: 1,
  imageUrls: [],
  description: null,
  viewCount: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  card: { id: 'card-1', name: 'Charizard', nameKo: '리자몽', imageUrl: null, rarity: 'RR', tcgType: 'POKEMON', setName: 'Base Set', setCode: 'BS', cardNumber: '4', cardTypes: 'Fire', supertype: 'Pokémon' },
  seller: { id: 'user-1', nickname: '판매자', avatarUrl: null, avgRating: 4.5, reviewCount: 10 },
  bids: [],
  offers: [],
  _count: { bids: 0, offers: 0 },
}

describe('GET /api/listings', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 200 with listing list', async () => {
    ;(mockPrisma.listing.findMany as jest.Mock).mockResolvedValue([MOCK_LISTING])
    ;(mockPrisma.listing.count    as jest.Mock).mockResolvedValue(1)

    const app = buildApp()
    const res = await request(app).get('/api/listings')

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('listings')
    expect(res.body).toHaveProperty('total', 1)
    expect(res.body.listings).toHaveLength(1)
  })

  it('returns empty list when no listings match filters', async () => {
    ;(mockPrisma.listing.findMany as jest.Mock).mockResolvedValue([])
    ;(mockPrisma.listing.count    as jest.Mock).mockResolvedValue(0)

    const app = buildApp()
    const res = await request(app).get('/api/listings?type=AUCTION&cardName=nonexistent')

    expect(res.status).toBe(200)
    expect(res.body.total).toBe(0)
    expect(res.body.listings).toHaveLength(0)
  })
})

describe('GET /api/listings/:id', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 404 when listing does not exist', async () => {
    ;(mockPrisma.listing.findUnique as jest.Mock).mockResolvedValue(null)

    const app = buildApp()
    const res = await request(app).get('/api/listings/nonexistent-id')

    expect(res.status).toBe(404)
  })

  it('returns 200 with listing detail and market stats', async () => {
    ;(mockPrisma.listing.findUnique as jest.Mock).mockResolvedValue(MOCK_LISTING)
    ;(mockPrisma.listing.update    as jest.Mock).mockResolvedValue({}) // viewCount increment (async)
    ;(mockPrisma.transaction.count as jest.Mock).mockResolvedValue(5)
    ;(mockPrisma.listing.aggregate as jest.Mock).mockResolvedValue({
      _count: 3, _min: { buyNowPrice: 40000, currentPrice: null, minOfferPrice: null },
      _max: { buyNowPrice: 60000, currentPrice: null, minOfferPrice: null },
      _avg: { buyNowPrice: 50000 },
    })
    ;(mockPrisma.transaction.aggregate as jest.Mock).mockResolvedValue({
      _avg: { finalPrice: 48000 }, _count: 3,
    })

    const app = buildApp()
    const res = await request(app).get('/api/listings/listing-1')

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('sellerStats')
    expect(res.body).toHaveProperty('cardMarket')
    expect(res.body.sellerStats.totalSales).toBe(5)
  })
})

describe('POST /api/listings', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 401 without auth token', async () => {
    const app = buildApp()
    const res = await request(app).post('/api/listings').send({
      cardId: 'card-1', listingType: 'BUY_NOW', condition: 'MINT', buyNowPrice: 50000,
    })
    expect(res.status).toBe(401)
  })

  it('returns 400 when required fields are missing', async () => {
    const token = makeToken()
    const app = buildApp()
    // listingType BUY_NOW without buyNowPrice → validation error
    const res = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${token}`)
      .send({ cardId: 'card-1', listingType: 'BUY_NOW', condition: 'MINT' })

    expect(res.status).toBe(400)
  })

  it('returns 201 on successful listing creation', async () => {
    const token = makeToken()
    const createdListing = { ...MOCK_LISTING, card: { ...MOCK_LISTING.card } }
    ;(mockPrisma.listing.create   as jest.Mock).mockResolvedValue(createdListing)
    ;(mockPrisma.wishlist.findMany as jest.Mock).mockResolvedValue([])

    const app = buildApp()
    const res = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${token}`)
      .send({ cardId: '00000000-0000-0000-0000-000000000001', listingType: 'BUY_NOW', condition: 'MINT', buyNowPrice: 50000 })

    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('id')
    expect(res.body.buyNowPrice).toBe(50000)
  })
})

describe('GET /api/health', () => {
  it('returns 200 with status ok', async () => {
    ;(mockPrisma.$queryRaw as jest.Mock).mockResolvedValue([{ '?column?': 1 }])
    const app = buildApp()
    const res = await request(app).get('/api/health')

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body).toHaveProperty('timestamp')
  })
})

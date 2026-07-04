/**
 * Auth API integration tests — supertest through the real Express router.
 * Prisma is mocked so no database connection is needed.
 */

// Set required env vars before any imports
process.env.JWT_SECRET      = 'test-secret-key-32chars-minimum-len'
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-32chars-min'
process.env.DATABASE_URL    = 'postgresql://test:test@localhost:5432/test'
process.env.PORT            = '4001'
process.env.FRONTEND_URL    = 'http://localhost:3000'
process.env.API_URL         = 'http://localhost:4001'

jest.mock('../lib/prisma', () => ({
  prisma: {
    user: {
      findUnique:  jest.fn(),
      findFirst:   jest.fn(),
      create:      jest.fn(),
      update:      jest.fn(),
      updateMany:  jest.fn(),
    },
    report:      { count: jest.fn() },
    dispute:     { count: jest.fn() },
    transaction: { count: jest.fn() },
    bid:         { count: jest.fn() },
    refreshToken: {
      create:     jest.fn(),
      findFirst:  jest.fn(),
      delete:     jest.fn(),
    },
    $transaction: jest.fn(),
  },
}))

jest.mock('../lib/notify',        () => ({ notify: jest.fn() }))
jest.mock('../lib/socketio',      () => ({ getIo: jest.fn(() => ({ emit: jest.fn() })), initIo: jest.fn() }))
jest.mock('../middleware/rateLimit', () => ({
  authLimiter:    (_req: unknown, _res: unknown, next: () => void) => next(),
  apiLimiter:     (_req: unknown, _res: unknown, next: () => void) => next(),
  uploadLimiter:  (_req: unknown, _res: unknown, next: () => void) => next(),
  paymentLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  LazyStore: class { init() {} async increment() { return { totalHits: 1, resetTime: new Date() } } async resetKey() {} },
}))
jest.mock('../lib/fraudDetection', () => ({
  analyzeUserRisk:     jest.fn().mockResolvedValue({ risk: 'LOW', reasons: [] }),
  detectAbnormalBidding: jest.fn().mockResolvedValue(false),
  issueWarning:        jest.fn(),
  calculateSellerGrade: jest.fn().mockResolvedValue('BRONZE'),
}))

import express from 'express'
import request from 'supertest'
import router  from '../routes'
import { prisma } from '../lib/prisma'
import bcrypt from 'bcryptjs'

const mockPrisma = prisma as jest.Mocked<typeof prisma>

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api', router)
  return app
}

describe('POST /api/auth/register', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 400 when email is missing', async () => {
    const app = buildApp()
    const res = await request(app).post('/api/auth/register').send({ password: 'pass123!', nickname: 'user1' })
    expect(res.status).toBe(400)
  })

  it('returns 400 when nickname contains XSS characters', async () => {
    const app = buildApp()
    const res = await request(app).post('/api/auth/register').send({
      email: 'test@example.com', password: 'Pass123!@#', nickname: '<script>alert(1)</script>',
    })
    expect(res.status).toBe(400)
  })

  it('returns 409 when email already exists', async () => {
    (mockPrisma.user.findFirst as jest.Mock).mockResolvedValue({ id: 'existing' })
    const app = buildApp()
    const res = await request(app).post('/api/auth/register').send({
      email: 'dup@example.com', password: 'Pass123!@#', nickname: '중복유저',
    })
    expect(res.status).toBe(409)
  })

  it('returns 201 and token on successful registration', async () => {
    (mockPrisma.user.findFirst as jest.Mock).mockResolvedValue(null);
    (mockPrisma.user.create as jest.Mock).mockResolvedValue({
      id: 'new-user-id', email: 'new@example.com', nickname: '신규유저',
      role: 'USER', balance: 0, avatarUrl: null, emailVerified: false,
      twoFaEnabled: false, isSuspended: false,
    });
    (mockPrisma.refreshToken.create as jest.Mock).mockResolvedValue({ token: 'rt' })

    const app = buildApp()
    const res = await request(app).post('/api/auth/register').send({
      email: 'new@example.com', password: 'Pass123!@#', nickname: '신규유저',
    })
    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('token')
    expect(res.body).toHaveProperty('user')
    expect(res.body.user.email).toBe('new@example.com')
  })
})

describe('POST /api/auth/login', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 400 for missing credentials', async () => {
    const app = buildApp()
    const res = await request(app).post('/api/auth/login').send({ email: 'x@x.com' })
    expect(res.status).toBe(400)
  })

  it('returns 401 when user not found', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null)
    const app = buildApp()
    const res = await request(app).post('/api/auth/login').send({ email: 'none@x.com', password: 'anything' })
    expect(res.status).toBe(401)
  })

  it('returns 401 for wrong password', async () => {
    const hashed = await bcrypt.hash('correctpass', 10);
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'u1', email: 'u@x.com', passwordHash: hashed,
      twoFaEnabled: false, isSuspended: false,
    })
    const app = buildApp()
    const res = await request(app).post('/api/auth/login').send({ email: 'u@x.com', password: 'wrongpass' })
    expect(res.status).toBe(401)
  })

  it('returns 403 for suspended account', async () => {
    const hashed = await bcrypt.hash('pass', 10);
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'u2', email: 'u2@x.com', passwordHash: hashed,
      twoFaEnabled: false, isSuspended: true,
    })
    const app = buildApp()
    const res = await request(app).post('/api/auth/login').send({ email: 'u2@x.com', password: 'pass' })
    expect(res.status).toBe(403)
  })

  it('returns 200 and requiresTwoFa when 2FA enabled', async () => {
    const hashed = await bcrypt.hash('pass', 10);
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'u3', email: 'u3@x.com', passwordHash: hashed,
      twoFaEnabled: true, twoFaSecret: 'SOMESECRET', isSuspended: false,
    })
    const app = buildApp()
    const res = await request(app).post('/api/auth/login').send({ email: 'u3@x.com', password: 'pass' })
    expect(res.status).toBe(200)
    expect(res.body.requiresTwoFa).toBe(true)
    expect(res.body).not.toHaveProperty('token')
  })

  it('returns 200 with token on successful login', async () => {
    const hashed = await bcrypt.hash('goodpass', 10);
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'u4', email: 'ok@x.com', passwordHash: hashed, nickname: '정상', role: 'USER',
      balance: 0, avatarUrl: null, emailVerified: true, twoFaEnabled: false, isSuspended: false,
    });
    (mockPrisma.refreshToken.create as jest.Mock).mockResolvedValue({ token: 'rt' })

    const app = buildApp()
    const res = await request(app).post('/api/auth/login').send({ email: 'ok@x.com', password: 'goodpass' })
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('token')
    expect(res.body.user.email).toBe('ok@x.com')
  })
})

describe('GET /api/auth/me', () => {
  it('returns 401 without Authorization header', async () => {
    const app = buildApp()
    const res = await request(app).get('/api/auth/me')
    expect(res.status).toBe(401)
  })
})

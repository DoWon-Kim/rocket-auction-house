import rateLimit, { Store, IncrementResponse, Options } from 'express-rate-limit'
import { RedisStore } from 'rate-limit-redis'
import Redis from 'ioredis'

let redisClient: Redis | null = null

if (process.env.REDIS_URL) {
  redisClient = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false })
  redisClient.on('connect', () => console.log('[Redis] rate-limit store 연결됨'))
  redisClient.on('error', (err: Error) => console.warn('[Redis] 오류:', err.message))
}

class MemStore implements Store {
  private windowMs = 60_000
  private counts: Map<string, { count: number; resetTime: Date }> = new Map()

  init(options: Options) {
    if (options.windowMs) this.windowMs = options.windowMs
  }

  async increment(key: string): Promise<IncrementResponse> {
    const now = Date.now()
    const entry = this.counts.get(key)
    if (!entry || entry.resetTime.getTime() < now) {
      const resetTime = new Date(now + this.windowMs)
      this.counts.set(key, { count: 1, resetTime })
      return { totalHits: 1, resetTime }
    }
    entry.count++
    return { totalHits: entry.count, resetTime: entry.resetTime }
  }

  async decrement(key: string) {
    const e = this.counts.get(key)
    if (e) e.count = Math.max(0, e.count - 1)
  }

  async resetKey(key: string) { this.counts.delete(key) }
  async resetAll() { this.counts.clear() }
}

// Redis 가용 여부를 요청 시점에 판단하는 lazy store
// — Redis가 준비되면 자동으로 RedisStore를 사용, 아니면 MemoryStore fallback
class LazyStore implements Store {
  prefix: string
  private _redisStore: RedisStore | null = null
  private memStore: MemStore

  constructor(keyPrefix: string) {
    this.prefix = keyPrefix
    this.memStore = new MemStore()
  }

  private getDelegate(): Store {
    if (redisClient?.status === 'ready') {
      if (!this._redisStore) {
        this._redisStore = new RedisStore({
          sendCommand: (...args: string[]) => redisClient!.call(args[0], ...args.slice(1)) as Promise<number>,
          prefix: this.prefix,
        })
      }
      return this._redisStore
    }
    return this.memStore
  }

  init(options: Options) { this.memStore.init(options) }
  async increment(key: string): Promise<IncrementResponse> { return this.getDelegate().increment(key) }
  async decrement(key: string) { return this.getDelegate().decrement?.(key) }
  async resetKey(key: string) { return this.getDelegate().resetKey(key) }
}

// 로그인/회원가입: IP당 15분에 10회
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  store: new LazyStore('rl:auth:'),
  message: { message: '요청이 너무 많습니다. 15분 후 다시 시도해주세요.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// 결제: IP당 1시간에 10회
export const paymentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  store: new LazyStore('rl:payment:'),
  message: { message: '결제 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// 이미지 업로드: IP당 1분에 20회
export const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  store: new LazyStore('rl:upload:'),
  message: { message: '업로드 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// 일반 API: IP당 1분에 120회
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  store: new LazyStore('rl:api:'),
  message: { message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
  standardHeaders: true,
  legacyHeaders: false,
})

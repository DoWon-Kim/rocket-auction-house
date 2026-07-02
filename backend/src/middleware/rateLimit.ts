import rateLimit from 'express-rate-limit'
import { RedisStore } from 'rate-limit-redis'
import Redis from 'ioredis'

// Redis 가용 시 분산 rate-limit, 없으면 메모리 fallback
let redisClient: Redis | null = null
let redisConnected = false

if (process.env.REDIS_URL) {
  redisClient = new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 })
  redisClient.connect()
    .then(() => { redisConnected = true; console.log('[Redis] rate-limit store 연결됨') })
    .catch((err: Error) => console.warn('[Redis] 연결 실패 — 메모리 store로 fallback:', err.message))
}

function makeStore(prefix: string) {
  if (redisConnected && redisClient) {
    return new RedisStore({
      sendCommand: (...args: string[]) => redisClient!.call(args[0], ...args.slice(1)) as Promise<number>,
      prefix,
    })
  }
  return undefined // express-rate-limit 기본 메모리 store
}

// 로그인/회원가입: IP당 15분에 10회
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  store: makeStore('rl:auth:'),
  message: { message: '요청이 너무 많습니다. 15분 후 다시 시도해주세요.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// 결제: IP당 1시간에 10회
export const paymentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  store: makeStore('rl:payment:'),
  message: { message: '결제 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// 이미지 업로드: IP당 1분에 20회
export const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  store: makeStore('rl:upload:'),
  message: { message: '업로드 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// 일반 API: IP당 1분에 120회
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  store: makeStore('rl:api:'),
  message: { message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
  standardHeaders: true,
  legacyHeaders: false,
})

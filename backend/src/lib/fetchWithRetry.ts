/**
 * 외부 API 호출 공통 유틸리티
 *
 * - IPv4 강제: nodeRequest (https.request + family: 4)로 Gabia 서버 ETIMEDOUT 방지
 * - timeout: 지정 시간 초과 시 중단
 * - retry:   5xx / 네트워크 오류 시 지수 백오프로 재시도
 * - cache:   GET 요청 인메모리 TTL 캐시 (API 레이트 리밋 방지)
 */

import { nodeRequest } from './nodeRequest'

interface FetchOptions {
  method?: string
  headers?: Record<string, string>
  body?: string | null
  timeoutMs?: number     // 기본 10s
  retries?: number       // 기본 2
  cacheTtlMs?: number    // 0 = 캐싱 안 함 (기본)
}

interface CacheEntry {
  data: unknown
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()

// 만료된 캐시 항목 정리 (30분마다)
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of cache) {
    if (entry.expiresAt < now) cache.delete(key)
  }
}, 30 * 60 * 1000)

export async function fetchWithRetry<T = unknown>(
  url: string,
  options: FetchOptions = {},
): Promise<T> {
  const {
    timeoutMs  = 10_000,
    retries    = 2,
    cacheTtlMs = 0,
    method,
    headers,
    body,
  } = options

  const cacheKey = `${method ?? 'GET'}:${url}`

  // 캐시 히트 (GET만)
  if (cacheTtlMs > 0 && (!method || method === 'GET')) {
    const cached = cache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data as T
    }
  }

  let lastError: Error | null = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      // 지수 백오프: 500ms, 1000ms
      await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt - 1)))
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const { status, ok, body: bodyText } = await nodeRequest(url, {
        method: method ?? 'GET',
        headers,
        body: body ?? null,
        signal: controller.signal,
        timeoutMs,
      })
      clearTimeout(timer)

      if (!ok) {
        // 4xx는 재시도 불필요 (클라이언트 오류)
        if (status < 500) {
          throw new ExternalApiError(url, status, bodyText)
        }
        lastError = new ExternalApiError(url, status, `HTTP ${status}`)
        continue
      }

      const data = JSON.parse(bodyText) as T

      // 캐시 저장
      if (cacheTtlMs > 0 && (!method || method === 'GET')) {
        cache.set(cacheKey, { data, expiresAt: Date.now() + cacheTtlMs })
      }

      return data
    } catch (err) {
      clearTimeout(timer)
      if (err instanceof ExternalApiError) throw err

      const isAbort = (err as Error).name === 'AbortError'
      lastError = isAbort
        ? new Error(`외부 API 타임아웃: ${url} (${timeoutMs}ms)`)
        : (err as Error)

      if (isAbort) break  // 타임아웃은 재시도해도 의미 없음
    }
  }

  throw lastError ?? new Error(`외부 API 호출 실패: ${url}`)
}

export class ExternalApiError extends Error {
  constructor(
    public readonly url:    string,
    public readonly status: number,
    public readonly body:   string,
  ) {
    super(`외부 API ${status}: ${url}`)
    this.name = 'ExternalApiError'
  }
}

/**
 * IPv4-only HTTP/HTTPS 요청 유틸리티
 * Node.js https.request + family: 4 → Gabia 서버 IPv6 불가 환경에서 ETIMEDOUT 방지
 */

import https from 'https'
import http from 'http'

export interface NodeReqOptions {
  method?: string
  headers?: Record<string, string>
  body?: string | null
  signal?: AbortSignal
  timeoutMs?: number
}

class AbortError extends Error {
  constructor() { super('The operation was aborted'); this.name = 'AbortError' }
}

export function nodeRequest(
  url: string,
  opts: NodeReqOptions = {},
  _redirects = 0,
): Promise<{ status: number; ok: boolean; body: string }> {
  if (_redirects > 5) return Promise.reject(new Error(`Too many redirects: ${url}`))

  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const isHttps = parsed.protocol === 'https:'
    const lib = isHttps ? https : http

    const reqHeaders: Record<string, string> = {
      'Accept-Encoding': 'identity',
      ...opts.headers,
    }
    if (opts.body) reqHeaders['Content-Length'] = String(Buffer.byteLength(opts.body))

    const req = lib.request(
      {
        hostname: parsed.hostname,
        port: Number(parsed.port) || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: opts.method ?? 'GET',
        headers: reqHeaders,
        family: 4,
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume()
          const next = (res.headers.location as string).startsWith('http')
            ? res.headers.location as string
            : new URL(res.headers.location as string, url).href
          nodeRequest(next, opts, _redirects + 1).then(resolve, reject)
          return
        }

        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            ok: (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        )
        res.on('error', reject)
      },
    )

    if (opts.timeoutMs) {
      req.setTimeout(opts.timeoutMs, () => req.destroy(new AbortError()))
    }

    if (opts.signal) {
      const onAbort = () => req.destroy(new AbortError())
      opts.signal.addEventListener('abort', onAbort, { once: true })
      req.on('close', () => opts.signal!.removeEventListener('abort', onAbort))
    }

    req.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code === 'ECONNRESET' || err.message === 'The operation was aborted') {
        reject(new AbortError())
      } else {
        reject(err)
      }
    })

    if (opts.body) req.write(opts.body)
    req.end()
  })
}

export async function nodeRequestJson<T>(url: string, opts?: NodeReqOptions): Promise<T> {
  const { status, ok, body } = await nodeRequest(url, opts)
  if (!ok) throw new Error(`HTTP ${status}: ${url}`)
  return JSON.parse(body) as T
}

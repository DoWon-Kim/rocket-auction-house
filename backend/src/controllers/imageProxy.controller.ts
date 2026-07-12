import { Request, Response } from 'express'

const ALLOWED_HOSTS = new Set([
  'en.onepiece-cardgame.com',
  'www.onepiece-cardgame.com',
])

export async function proxyImage(req: Request, res: Response): Promise<void> {
  const raw = req.query['url']
  if (typeof raw !== 'string' || !raw) {
    res.status(400).json({ message: 'url 파라미터가 필요합니다.' })
    return
  }

  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    res.status(400).json({ message: '유효하지 않은 URL입니다.' })
    return
  }

  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    res.status(403).json({ message: '허용되지 않은 도메인입니다.' })
    return
  }

  try {
    const upstream = await fetch(parsed.href, {
      headers: {
        'Referer': `https://${parsed.hostname}/`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(10_000),
    })

    if (!upstream.ok) {
      res.status(upstream.status).end()
      return
    }

    const contentType = upstream.headers.get('content-type') ?? 'image/png'
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'public, max-age=86400')

    const buf = await upstream.arrayBuffer()
    res.end(Buffer.from(buf))
  } catch {
    res.status(502).json({ message: '이미지를 가져올 수 없습니다.' })
  }
}

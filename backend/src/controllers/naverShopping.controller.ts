import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { fetchWithRetry } from '../lib/fetchWithRetry'

const BASE = 'https://openapi.naver.com/v1/search/shop.json'
const CACHE_TTL = 5 * 60 * 1000   // 5분 캐시

function naverHeaders() {
  const id     = process.env.NAVER_CLIENT_ID
  const secret = process.env.NAVER_CLIENT_SECRET
  if (!id || !secret) throw new Error('NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 환경변수가 설정되지 않았습니다.')
  return { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': secret }
}

// HTML 태그 제거 (<b>포켓몬</b> → 포켓몬)
function stripHtml(s: string) {
  return s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim()
}

interface NaverItem {
  title: string
  link: string
  image: string
  lprice: string
  hprice: string
  mallName: string
  productId: string
  productType: string
  brand: string
  maker: string
  category1: string
  category2: string
  category3: string
}
interface NaverSearchResponse {
  total: number
  display: number
  items: NaverItem[]
}

// ── 어드민: 상품 검색 (샵 등록 autofill) ──────────────────────────────────────

export async function searchNaverShop(req: AuthRequest, res: Response) {
  const q       = (req.query.q as string | undefined)?.trim()
  const display = Math.min(10, Number(req.query.display ?? 8))

  if (!q || q.length < 2) {
    res.status(400).json({ message: '검색어를 2자 이상 입력하세요.' })
    return
  }

  try {
    const url = `${BASE}?query=${encodeURIComponent(q)}&display=${display}&sort=sim`
    const data = await fetchWithRetry<NaverSearchResponse>(url, {
      headers: naverHeaders(),
      cacheTtlMs: CACHE_TTL,
      timeoutMs: 8_000,
    })

    const items = data.items.map(item => ({
      productId: item.productId,
      title:     stripHtml(item.title),
      image:     item.image,
      link:      item.link,
      lprice:    Number(item.lprice),
      hprice:    Number(item.hprice) || Number(item.lprice),
      mallName:  item.mallName,
      brand:     item.brand || item.maker,
      category:  [item.category1, item.category2, item.category3].filter(Boolean).join(' > '),
    }))

    res.json({ total: data.total, items })
  } catch (err) {
    const msg = (err as Error).message
    if (msg.includes('환경변수')) {
      res.status(503).json({ message: '네이버 API 키가 설정되지 않았습니다. 관리자에게 문의하세요.' })
      return
    }
    console.error('[searchNaverShop]', err)
    res.status(502).json({ message: '네이버 쇼핑 검색에 실패했습니다. 잠시 후 다시 시도하세요.' })
  }
}

// ── 공개: 카드 시세 참고가 (리스팅 등록 시 노출) ──────────────────────────────

export async function getNaverPriceRef(req: AuthRequest, res: Response) {
  const q = (req.query.q as string | undefined)?.trim()
  if (!q || q.length < 2) { res.status(400).json({ message: '검색어가 필요합니다.' }); return }

  try {
    const url = `${BASE}?query=${encodeURIComponent(q + ' 카드')}&display=5&sort=sim`
    const data = await fetchWithRetry<NaverSearchResponse>(url, {
      headers: naverHeaders(),
      cacheTtlMs: 10 * 60 * 1000,   // 10분 캐시
      timeoutMs: 6_000,
    })

    if (!data.items.length) { res.json({ found: false }); return }

    const prices = data.items
      .map(i => Number(i.lprice))
      .filter(p => p > 0)
    if (!prices.length) { res.json({ found: false }); return }

    const min = Math.min(...prices)
    const max = Math.max(...prices)
    const avg = Math.round(prices.reduce((s, p) => s + p, 0) / prices.length)

    res.json({
      found: true,
      min, max, avg,
      count: prices.length,
      topItem: {
        title:  stripHtml(data.items[0].title),
        image:  data.items[0].image,
        lprice: Number(data.items[0].lprice),
      },
    })
  } catch (err) {
    const msg = (err as Error).message
    if (msg.includes('환경변수')) { res.json({ found: false, error: 'api_key_missing' }); return }
    console.error('[getNaverPriceRef]', err)
    res.json({ found: false })
  }
}

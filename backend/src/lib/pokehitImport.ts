// 포케히트(pokehit.co.kr) 상품 목록 읽기 — 상품명·가격·품절 여부만 사용 (사진·설명은 가져오지 않음)
import { TcgType, ShopCategory } from '@prisma/client'
import { nodeRequest } from './nodeRequest'

export const POKEHIT_HOST = 'pokehit.co.kr'
export const POKEHIT_DEFAULT_LIST = 'https://pokehit.co.kr/17'

export interface PokehitItem {
  sourceId: string
  name: string
  price: number          // 원
  originalPrice: number | null
  soldOut: boolean
  url: string
  isBreak: boolean       // 팩 브레이크·픽 모집 같은 공동구매형 상품 (박스 판매 아님)
  category: ShopCategory
  tcgType: TcgType
}

const decode = (s: string) => s
  .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

// 상품명 정리: 강조용 ** 제거, 공백 정리
export const cleanName = (name: string) => name.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim()

export function classify(name: string): Pick<PokehitItem, 'isBreak' | 'category' | 'tcgType'> {
  const n = name.replace(/\s+/g, '')
  const isBreak = /팩브레이크|\d+픽|모집완료후개봉/.test(n)
  const tcgType: TcgType = /원피스|ONEPIECE/i.test(n) ? 'ONEPIECE' : /유희왕|YUGIOH/i.test(n) ? 'YUGIOH' : /디지몬/.test(n) ? 'DIGIMON' : 'POKEMON'
  const category: ShopCategory = isBreak ? 'OTHER'
    : /골든박스|프로모|기념|스페셜|프리미엄|컬렉션/.test(n) ? 'SPECIAL'
    : /번들|기프트|세트/.test(n) ? 'GIFT_SET'
    : /덱/.test(n) ? 'STARTER_DECK'
    : /\d+팩$|1팩|단품/.test(n) ? 'SINGLE_PACK'
    : /박스|BOX/i.test(n) ? 'BOOSTER_BOX'
    : 'OTHER'
  return { isBreak, category, tcgType }
}

// 목록 페이지 HTML → 상품 목록 (같은 상품이 여러 위젯에 나오면 한 번만)
export function parsePokehitList(html: string, pageUrl: string): PokehitItem[] {
  const base = new URL(pageUrl)
  const blocks = html.split(/(?=<div class="shop-item _shop_item")/).slice(1)
  const seen = new Map<string, PokehitItem>()
  for (const block of blocks) {
    const m = block.match(/data-product-properties='([^']+)'/)
    if (!m) continue
    let p: { idx?: number; name?: string; price?: number; original_price?: number }
    try { p = JSON.parse(decode(m[1])) } catch { continue }
    if (!p.idx || !p.name || !p.price || p.price <= 0) continue
    const sourceId = String(p.idx)
    if (seen.has(sourceId)) continue
    const name = cleanName(p.name)
    seen.set(sourceId, {
      sourceId, name,
      price: p.price,
      originalPrice: p.original_price && p.original_price > p.price ? p.original_price : null,
      soldOut: /class=["'][^"']*prod_icon[^"']*sold_out/.test(block.slice(0, 8000)),
      url: `${base.origin}${base.pathname.replace(/\/$/, '')}/?idx=${sourceId}`,
      ...classify(name),
    })
  }
  return [...seen.values()]
}

// 우리 판매가 제안: 외부가를 포인트(1원=1P)로, 100P 단위 반올림
export const suggestPrice = (won: number) => Math.round(won / 100) * 100

export function assertPokehitUrl(raw: string): URL {
  let u: URL
  try { u = new URL(raw) } catch { throw Object.assign(new Error('주소 형식이 올바르지 않아요.'), { status: 400 }) }
  if (u.protocol !== 'https:' || (u.hostname !== POKEHIT_HOST && u.hostname !== `www.${POKEHIT_HOST}`)) {
    throw Object.assign(new Error('포케히트(pokehit.co.kr) 상품 목록 주소만 가져올 수 있어요.'), { status: 400 })
  }
  return u
}

export async function fetchPokehitList(pageUrl = POKEHIT_DEFAULT_LIST): Promise<PokehitItem[]> {
  const u = assertPokehitUrl(pageUrl)
  const res = await nodeRequest(u.toString(), {
    method: 'GET',
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RocketAH-PriceCheck/1.0)', Accept: 'text/html' },
    body: null,
    timeoutMs: 15_000,
  })
  if (!res.ok) throw Object.assign(new Error(`포케히트 페이지를 읽지 못했어요. (HTTP ${res.status})`), { status: 502 })
  return parsePokehitList(res.body, u.toString())
}

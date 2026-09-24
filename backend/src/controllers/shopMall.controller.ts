import { Request, Response } from 'express'
import { z } from 'zod'
import { Prisma, ShopCategory, TcgType } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { DEFAULT_SHIPPING, discountRate, makeOrderNo, mergeLines, ratingSummary, shippingFeeFor, type ShippingPolicy } from '../lib/shopPricing'

// ── 쇼핑몰: 메인·목록·상세·장바구니·주문·후기 ──────────────────────────────────

const MAX_QTY = 10
const LOW_STOCK = 5

export async function getShippingPolicy(): Promise<ShippingPolicy> {
  const rows = await prisma.siteConfig.findMany({ where: { key: { in: ['shop.shippingFee', 'shop.freeShippingOver'] } } })
  const get = (k: string, d: number) => {
    const v = Number(rows.find(r => r.key === k)?.value)
    return Number.isFinite(v) && v >= 0 ? v : d
  }
  return { fee: get('shop.shippingFee', DEFAULT_SHIPPING.fee), freeOver: get('shop.freeShippingOver', DEFAULT_SHIPPING.freeOver) }
}

const itemCardSelect = {
  id: true, name: true, tcgType: true, category: true, price: true, originalPrice: true, stock: true,
  imageUrl: true, isSoldOut: true, isFeatured: true, soldCount: true, createdAt: true,
} satisfies Prisma.ShopItemSelect
type ItemCard = Prisma.ShopItemGetPayload<{ select: typeof itemCardSelect }>

// 목록용: 할인율·품절·평점 붙이기
async function decorate(items: ItemCard[]) {
  const ids = items.map(i => i.id)
  const ratings = ids.length
    ? await prisma.shopReview.groupBy({ by: ['shopItemId'], where: { shopItemId: { in: ids } }, _avg: { rating: true }, _count: { _all: true } })
    : []
  const rMap = new Map(ratings.map(r => [r.shopItemId, r]))
  const weekAgo = Date.now() - 14 * 86400_000
  return items.map(i => ({
    ...i,
    soldOut: i.isSoldOut || i.stock <= 0,
    discountRate: discountRate(i.price, i.originalPrice),
    isNew: i.createdAt.getTime() >= weekAgo,
    rating: rMap.get(i.id)?._avg.rating ? Math.round(rMap.get(i.id)!._avg.rating! * 10) / 10 : null,
    reviewCount: rMap.get(i.id)?._count._all ?? 0,
  }))
}

// ── 메인 ─────────────────────────────────────────────────────────────────────

export async function getShopHome(_req: Request, res: Response) {
  try {
    const active = { isActive: true }
    const inStock = { ...active, isSoldOut: false, stock: { gt: 0 } }
    const [featured, newArrivals, best, lowStock, byCategory, byTcg, shipping] = await Promise.all([
      prisma.shopItem.findMany({ where: { ...inStock, isFeatured: true }, select: { ...itemCardSelect, description: true, images: true }, orderBy: { updatedAt: 'desc' }, take: 5 }),
      prisma.shopItem.findMany({ where: inStock, select: itemCardSelect, orderBy: { createdAt: 'desc' }, take: 8 }),
      prisma.shopItem.findMany({ where: { ...active, soldCount: { gt: 0 } }, select: itemCardSelect, orderBy: [{ soldCount: 'desc' }, { createdAt: 'desc' }], take: 8 }),
      prisma.shopItem.findMany({ where: { ...inStock, stock: { gt: 0, lte: LOW_STOCK } }, select: itemCardSelect, orderBy: { stock: 'asc' }, take: 8 }),
      prisma.shopItem.groupBy({ by: ['category'], where: active, _count: { _all: true } }),
      prisma.shopItem.groupBy({ by: ['tcgType'], where: active, _count: { _all: true } }),
      getShippingPolicy(),
    ])
    const [f, n, b, l] = await Promise.all([decorate(featured), decorate(newArrivals), decorate(best), decorate(lowStock)])
    res.json({
      featured: f.map((x, i) => ({ ...x, description: featured[i].description, images: featured[i].images })),
      newArrivals: n, best: b, lowStock: l,
      categories: byCategory.map(c => ({ category: c.category, count: c._count._all })),
      tcgTypes: byTcg.map(c => ({ tcgType: c.tcgType, count: c._count._all })),
      shipping,
    })
  } catch (err) {
    console.error('[getShopHome]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// ── 목록 (검색·정렬) ─────────────────────────────────────────────────────────

export async function listShopItems(req: Request, res: Response) {
  const tcgType = Object.values(TcgType).find(t => t === req.query.tcgType)
  const category = Object.values(ShopCategory).find(c => c === req.query.category)
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 50) : ''
  const sort = String(req.query.sort ?? 'new')
  const page = Math.max(1, Number(req.query.page) || 1)
  const limit = Math.min(48, Math.max(1, Number(req.query.limit) || 24))
  const hideSoldOut = req.query.hideSoldOut === 'true'
  try {
    const where: Prisma.ShopItemWhereInput = {
      isActive: true,
      ...(hideSoldOut ? { isSoldOut: false, stock: { gt: 0 } } : {}),
      ...(tcgType ? { tcgType } : {}),
      ...(category ? { category } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }] } : {}),
    }
    const orderBy: Prisma.ShopItemOrderByWithRelationInput[] =
      sort === 'popular' ? [{ soldCount: 'desc' }, { createdAt: 'desc' }]
      : sort === 'price_asc' ? [{ price: 'asc' }]
      : sort === 'price_desc' ? [{ price: 'desc' }]
      : [{ createdAt: 'desc' }]

    let items: ItemCard[]
    let total: number
    if (sort === 'discount') {
      // 할인율은 계산값이라 메모리에서 정렬 (상품 수가 많지 않은 샵 규모 기준)
      const all = await prisma.shopItem.findMany({ where, select: itemCardSelect })
      total = all.length
      items = all.sort((a, b) => discountRate(b.price, b.originalPrice) - discountRate(a.price, a.originalPrice)).slice((page - 1) * limit, page * limit)
    } else {
      ;[items, total] = await Promise.all([
        prisma.shopItem.findMany({ where, select: itemCardSelect, orderBy: [{ isSoldOut: 'asc' }, ...orderBy], skip: (page - 1) * limit, take: limit }),
        prisma.shopItem.count({ where }),
      ])
    }
    res.json({ items: await decorate(items), total, page, limit })
  } catch (err) {
    console.error('[listShopItems]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// ── 상세 ─────────────────────────────────────────────────────────────────────

export async function getShopItemDetail(req: Request, res: Response) {
  try {
    const item = await prisma.shopItem.findFirst({ where: { id: String(req.params.id), isActive: true } })
    if (!item) { res.status(404).json({ message: '상품을 찾을 수 없습니다.' }); return }
    const [reviews, ratings, related, shipping] = await Promise.all([
      prisma.shopReview.findMany({
        where: { shopItemId: item.id }, orderBy: { createdAt: 'desc' }, take: 5,
        select: { id: true, rating: true, content: true, createdAt: true, user: { select: { nickname: true } } },
      }),
      prisma.shopReview.findMany({ where: { shopItemId: item.id }, select: { rating: true } }),
      prisma.shopItem.findMany({
        where: { isActive: true, id: { not: item.id }, OR: [{ tcgType: item.tcgType }, { category: item.category }] },
        select: itemCardSelect, orderBy: [{ isSoldOut: 'asc' }, { soldCount: 'desc' }], take: 8,
      }),
      getShippingPolicy(),
    ])
    res.json({
      ...item,
      soldOut: item.isSoldOut || item.stock <= 0,
      discountRate: discountRate(item.price, item.originalPrice),
      rating: ratingSummary(ratings.map(r => r.rating)),
      reviews: reviews.map(r => ({ ...r, nickname: r.user.nickname.replace(/^(.).+/, (_, a) => `${a}**`), user: undefined })),
      related: await decorate(related),
      shipping,
    })
  } catch (err) {
    console.error('[getShopItemDetail]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

export async function listShopReviews(req: Request, res: Response) {
  const page = Math.max(1, Number(req.query.page) || 1)
  try {
    const where = { shopItemId: String(req.params.id) }
    const [reviews, total] = await Promise.all([
      prisma.shopReview.findMany({
        where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * 10, take: 10,
        select: { id: true, rating: true, content: true, createdAt: true, user: { select: { nickname: true } } },
      }),
      prisma.shopReview.count({ where }),
    ])
    res.json({ reviews: reviews.map(r => ({ ...r, nickname: r.user.nickname.replace(/^(.).+/, (_, a) => `${a}**`), user: undefined })), total, page })
  } catch (err) {
    console.error('[listShopReviews]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// ── 장바구니 ─────────────────────────────────────────────────────────────────

export async function getCart(req: AuthRequest, res: Response) {
  try {
    const [rows, shipping] = await Promise.all([
      prisma.cartItem.findMany({
        where: { userId: req.userId! }, orderBy: { createdAt: 'desc' },
        select: { shopItemId: true, quantity: true, shopItem: { select: { ...itemCardSelect, isActive: true } } },
      }),
      getShippingPolicy(),
    ])
    const items = rows.map(r => {
      const i = r.shopItem
      const available = i.isActive && !i.isSoldOut && i.stock > 0
      return {
        shopItemId: r.shopItemId, quantity: r.quantity,
        item: { ...i, discountRate: discountRate(i.price, i.originalPrice) },
        available, maxQuantity: Math.min(MAX_QTY, i.stock),
      }
    })
    res.json({ items, shipping })
  } catch (err) {
    console.error('[getCart]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

const cartSchema = z.object({ shopItemId: z.string().min(1), quantity: z.number().int().min(1).max(MAX_QTY) })

export async function addToCart(req: AuthRequest, res: Response) {
  const parsed = cartSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ message: '잘못된 요청입니다.' }); return }
  try {
    const item = await prisma.shopItem.findFirst({ where: { id: parsed.data.shopItemId, isActive: true } })
    if (!item) { res.status(404).json({ message: '상품을 찾을 수 없습니다.' }); return }
    if (item.isSoldOut || item.stock <= 0) { res.status(409).json({ message: '품절된 상품입니다.' }); return }
    const existing = await prisma.cartItem.findUnique({ where: { userId_shopItemId: { userId: req.userId!, shopItemId: item.id } } })
    const quantity = Math.min(MAX_QTY, item.stock, (existing?.quantity ?? 0) + parsed.data.quantity)
    await prisma.cartItem.upsert({
      where: { userId_shopItemId: { userId: req.userId!, shopItemId: item.id } },
      create: { userId: req.userId!, shopItemId: item.id, quantity },
      update: { quantity },
    })
    const count = await prisma.cartItem.count({ where: { userId: req.userId! } })
    res.json({ ok: true, quantity, count })
  } catch (err) {
    console.error('[addToCart]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

export async function updateCartItem(req: AuthRequest, res: Response) {
  const parsed = z.object({ quantity: z.number().int().min(1).max(MAX_QTY) }).safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ message: '수량은 1~10개입니다.' }); return }
  try {
    const r = await prisma.cartItem.updateMany({ where: { userId: req.userId!, shopItemId: String(req.params.shopItemId) }, data: { quantity: parsed.data.quantity } })
    if (!r.count) { res.status(404).json({ message: '장바구니에 없는 상품입니다.' }); return }
    res.json({ ok: true })
  } catch (err) {
    console.error('[updateCartItem]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

export async function removeCartItems(req: AuthRequest, res: Response) {
  // /shop/cart/:shopItemId 또는 body.ids (선택 삭제)
  const ids = req.params.shopItemId ? [String(req.params.shopItemId)] : z.array(z.string()).max(100).safeParse(req.body?.ids).data ?? []
  try {
    await prisma.cartItem.deleteMany({ where: { userId: req.userId!, ...(ids.length ? { shopItemId: { in: ids } } : {}) } })
    res.json({ ok: true, count: await prisma.cartItem.count({ where: { userId: req.userId! } }) })
  } catch (err) {
    console.error('[removeCartItems]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// ── 주문 (여러 상품 한 번에 결제) ──────────────────────────────────────────────

const addressSchema = {
  recipientName:  z.string().trim().min(1, '수령인 이름을 입력해주세요.').max(50),
  recipientPhone: z.string().trim().regex(/^[0-9-]{9,20}$/, '연락처를 확인해주세요.'),
  zipCode:        z.string().trim().min(1, '우편번호를 입력해주세요.').max(10),
  address:        z.string().trim().min(1, '주소를 입력해주세요.').max(200),
  addressDetail:  z.string().trim().max(100).optional(),
  shippingMemo:   z.string().trim().max(200).optional(),
}
const checkoutSchema = z.object({
  items: z.array(z.object({ shopItemId: z.string().min(1), quantity: z.number().int().min(1).max(MAX_QTY) })).min(1).max(30),
  fromCart: z.boolean().optional(),
  expectedTotal: z.number().int().min(0).optional(),   // 화면에 보인 금액과 다르면 결제 중단 (가격 변경 보호)
  ...addressSchema,
})

class CheckoutError extends Error { constructor(public status: number, message: string) { super(message) } }

export async function checkout(req: AuthRequest, res: Response) {
  const parsed = checkoutSchema.safeParse(req.body)
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0]
    res.status(400).json({ message: first ?? '주문 정보를 확인해주세요.' }); return
  }
  const { items: rawItems, fromCart, expectedTotal, ...addr } = parsed.data
  const lines = mergeLines(rawItems)
  if (lines.some(l => l.quantity > MAX_QTY)) { res.status(400).json({ message: `한 상품은 최대 ${MAX_QTY}개까지 주문할 수 있습니다.` }); return }

  try {
    const [products, shipping] = await Promise.all([
      prisma.shopItem.findMany({ where: { id: { in: lines.map(l => l.shopItemId) }, isActive: true } }),
      getShippingPolicy(),
    ])
    const byId = new Map(products.map(p => [p.id, p]))
    for (const l of lines) {
      const p = byId.get(l.shopItemId)
      if (!p) throw new CheckoutError(404, '판매가 종료된 상품이 있습니다. 장바구니를 확인해주세요.')
      if (p.isSoldOut || p.stock < l.quantity) throw new CheckoutError(409, `'${p.name}' 재고가 부족합니다. (남은 재고 ${p.stock}개)`)
    }
    const itemsTotal = lines.reduce((s, l) => s + byId.get(l.shopItemId)!.price * l.quantity, 0)
    const shippingFee = shippingFeeFor(itemsTotal, shipping)
    const totalPaid = itemsTotal + shippingFee
    if (expectedTotal != null && expectedTotal !== totalPaid) {
      throw new CheckoutError(409, `상품 가격이 변경되었습니다. 다시 확인해주세요. (결제 금액 ${totalPaid.toLocaleString()}P)`)
    }

    const purchase = await prisma.$transaction(async tx => {
      // 잔액·재고는 조건부 차감으로 원자적으로 검증 (동시 주문 대비)
      const paid = await tx.user.updateMany({ where: { id: req.userId!, balance: { gte: totalPaid } }, data: { balance: { decrement: totalPaid } } })
      if (!paid.count) throw new CheckoutError(402, `포인트가 부족합니다. (필요: ${totalPaid.toLocaleString()}P)`)

      for (const l of lines) {
        const p = byId.get(l.shopItemId)!
        const ok = await tx.shopItem.updateMany({
          where: { id: p.id, isActive: true, isSoldOut: false, stock: { gte: l.quantity }, price: p.price },
          data: { stock: { decrement: l.quantity }, soldCount: { increment: l.quantity } },
        })
        if (!ok.count) throw new CheckoutError(409, `'${p.name}' 재고 또는 가격이 변경되었습니다. 다시 시도해주세요.`)
      }
      await tx.shopItem.updateMany({ where: { id: { in: lines.map(l => l.shopItemId) }, stock: { lte: 0 } }, data: { isSoldOut: true } })

      let orderNo = makeOrderNo()
      for (let i = 0; i < 3 && await tx.shopPurchase.findUnique({ where: { orderNo }, select: { id: true } }); i++) orderNo = makeOrderNo()

      const addressData = { ...addr, addressDetail: addr.addressDetail || null, shippingMemo: addr.shippingMemo || null }
      const created = await tx.shopPurchase.create({
        data: {
          orderNo, userId: req.userId!, itemsTotal, shippingFee, totalPaid, ...addressData,
          orders: {
            create: lines.map(l => {
              const p = byId.get(l.shopItemId)!
              return { userId: req.userId!, shopItemId: p.id, quantity: l.quantity, unitPrice: p.price, totalPrice: p.price * l.quantity, ...addressData }
            }),
          },
        },
      })
      if (fromCart) await tx.cartItem.deleteMany({ where: { userId: req.userId!, shopItemId: { in: lines.map(l => l.shopItemId) } } })
      return created
    })

    res.status(201).json({ orderNo: purchase.orderNo, totalPaid, itemsTotal, shippingFee })
  } catch (err) {
    if (err instanceof CheckoutError) { res.status(err.status).json({ message: err.message }); return }
    console.error('[checkout]', err)
    res.status(500).json({ message: '주문 처리 중 오류가 발생했습니다.' })
  }
}

// ── 내 주문 ─────────────────────────────────────────────────────────────────

const purchaseInclude = {
  orders: {
    select: {
      id: true, quantity: true, unitPrice: true, totalPrice: true, shippingStatus: true, courier: true, trackingNumber: true,
      shopItem: { select: { id: true, name: true, imageUrl: true, tcgType: true, category: true } },
      review: { select: { id: true, rating: true } },
    },
  },
} satisfies Prisma.ShopPurchaseInclude

export async function listMyPurchases(req: AuthRequest, res: Response) {
  const page = Math.max(1, Number(req.query.page) || 1)
  try {
    const where = { userId: req.userId! }
    const [purchases, total, legacy] = await Promise.all([
      prisma.shopPurchase.findMany({ where, include: purchaseInclude, orderBy: { createdAt: 'desc' }, skip: (page - 1) * 10, take: 10 }),
      prisma.shopPurchase.count({ where }),
      // 장바구니 도입 전 단건 주문
      page === 1 ? prisma.shopOrder.findMany({
        where: { userId: req.userId!, purchaseId: null }, orderBy: { createdAt: 'desc' }, take: 20,
        select: { ...purchaseInclude.orders.select, createdAt: true },
      }) : Promise.resolve([]),
    ])
    res.json({ purchases, total, page, legacyOrders: legacy })
  } catch (err) {
    console.error('[listMyPurchases]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

export async function getMyPurchase(req: AuthRequest, res: Response) {
  try {
    const p = await prisma.shopPurchase.findFirst({ where: { orderNo: String(req.params.orderNo), userId: req.userId! }, include: purchaseInclude })
    if (!p) { res.status(404).json({ message: '주문을 찾을 수 없습니다.' }); return }
    res.json(p)
  } catch (err) {
    console.error('[getMyPurchase]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

export async function getLastAddress(req: AuthRequest, res: Response) {
  try {
    const last = await prisma.shopPurchase.findFirst({
      where: { userId: req.userId! }, orderBy: { createdAt: 'desc' },
      select: { recipientName: true, recipientPhone: true, zipCode: true, address: true, addressDetail: true },
    }) ?? await prisma.shopOrder.findFirst({
      where: { userId: req.userId!, address: { not: null } }, orderBy: { createdAt: 'desc' },
      select: { recipientName: true, recipientPhone: true, zipCode: true, address: true, addressDetail: true },
    })
    res.json({ address: last })
  } catch (err) {
    console.error('[getLastAddress]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// ── 후기 ─────────────────────────────────────────────────────────────────────

export async function createShopReview(req: AuthRequest, res: Response) {
  const parsed = z.object({ rating: z.number().int().min(1).max(5), content: z.string().trim().min(5, '후기는 5자 이상 적어주세요.').max(1000) }).safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ message: parsed.error.issues[0]?.message ?? '잘못된 요청입니다.' }); return }
  try {
    const order = await prisma.shopOrder.findFirst({ where: { id: String(req.params.orderId), userId: req.userId! }, select: { id: true, shopItemId: true, shippingStatus: true, review: { select: { id: true } } } })
    if (!order) { res.status(404).json({ message: '주문을 찾을 수 없습니다.' }); return }
    if (order.review) { res.status(409).json({ message: '이미 후기를 작성한 주문입니다.' }); return }
    if (order.shippingStatus !== 'SHIPPED' && order.shippingStatus !== 'DELIVERED') {
      res.status(409).json({ message: '상품을 받은 뒤(발송 이후) 후기를 작성할 수 있습니다.' }); return
    }
    const review = await prisma.shopReview.create({
      data: { orderId: order.id, shopItemId: order.shopItemId, userId: req.userId!, ...parsed.data },
    })
    res.status(201).json(review)
  } catch (err) {
    console.error('[createShopReview]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// ── 관리자: 배송비 정책 ──────────────────────────────────────────────────────

export async function adminGetShopSettings(_req: AuthRequest, res: Response) {
  res.json(await getShippingPolicy())
}

export async function adminUpdateShopSettings(req: AuthRequest, res: Response) {
  const parsed = z.object({ fee: z.number().int().min(0).max(100000), freeOver: z.number().int().min(0).max(10_000_000) }).safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ message: '배송비는 0 이상 숫자로 입력해주세요.' }); return }
  await prisma.$transaction([
    prisma.siteConfig.upsert({ where: { key: 'shop.shippingFee' }, create: { key: 'shop.shippingFee', value: String(parsed.data.fee) }, update: { value: String(parsed.data.fee) } }),
    prisma.siteConfig.upsert({ where: { key: 'shop.freeShippingOver' }, create: { key: 'shop.freeShippingOver', value: String(parsed.data.freeOver) }, update: { value: String(parsed.data.freeOver) } }),
  ])
  res.json(parsed.data)
}

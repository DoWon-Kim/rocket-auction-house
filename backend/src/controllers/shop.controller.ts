import { Request, Response } from 'express'
import { z } from 'zod'
import { TcgType, ShopCategory } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'

// ─────────────────────────────────────────────────────────────────────────────
// 공개 API
// ─────────────────────────────────────────────────────────────────────────────

export async function getShopItems(req: Request, res: Response) {
  const tcgType    = req.query.tcgType as TcgType | undefined
  const category   = req.query.category as ShopCategory | undefined
  const page       = Math.max(1, Number(req.query.page ?? 1))
  const limit      = Math.min(48, Math.max(1, Number(req.query.limit ?? 20)))
  const hideSoldOut = req.query.hideSoldOut === 'true'

  try {
    const where = {
      isActive: true,
      ...(hideSoldOut ? { isSoldOut: false, stock: { gt: 0 } } : {}),
      ...(tcgType   ? { tcgType }   : {}),
      ...(category  ? { category }  : {}),
    }
    const [items, total] = await Promise.all([
      prisma.shopItem.findMany({
        where,
        orderBy: [{ isSoldOut: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.shopItem.count({ where }),
    ])
    res.json({ items, total, page, limit })
  } catch (err) {
    console.error('[getShopItems]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

export async function getShopItem(req: Request, res: Response) {
  try {
    const item = await prisma.shopItem.findUnique({
      where: { id: String(req.params['id']), isActive: true },
    })
    if (!item) { res.status(404).json({ message: '상품을 찾을 수 없습니다.' }); return }
    res.json(item)
  } catch (err) {
    console.error('[getShopItem]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 구매 (로그인 필요)
// ─────────────────────────────────────────────────────────────────────────────

const buySchema = z.object({ quantity: z.number().int().min(1).max(10).default(1) })

export async function buyShopItem(req: AuthRequest, res: Response) {
  const parsed = buySchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ message: '수량이 올바르지 않습니다.' }); return }
  const { quantity } = parsed.data

  try {
    const item = await prisma.shopItem.findUnique({ where: { id: String(req.params['id']) } })
    if (!item || !item.isActive) { res.status(404).json({ message: '상품을 찾을 수 없습니다.' }); return }
    if (item.isSoldOut || item.stock === 0) { res.status(409).json({ message: '품절된 상품입니다.' }); return }
    if (item.stock < quantity) { res.status(409).json({ message: `재고가 부족합니다. (현재 재고: ${item.stock}개)` }); return }

    const totalPrice = item.price * quantity

    const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { balance: true } })
    if (!user || user.balance < totalPrice) {
      res.status(402).json({ message: `포인트가 부족합니다. (필요: ${totalPrice.toLocaleString()}P)` }); return
    }

    const newStock = item.stock - quantity
    const [, order] = await prisma.$transaction([
      prisma.user.update({ where: { id: req.userId! }, data: { balance: { decrement: totalPrice } } }),
      prisma.shopOrder.create({
        data: { userId: req.userId!, shopItemId: item.id, quantity, unitPrice: item.price, totalPrice },
      }),
      prisma.shopItem.update({
        where: { id: item.id },
        data: { stock: { decrement: quantity }, ...(newStock === 0 ? { isSoldOut: true } : {}) },
      }),
    ])

    res.json({ message: '구매가 완료되었습니다!', orderId: order.id, totalPrice })
  } catch (err) {
    console.error('[buyShopItem]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// 내 구매 내역
export async function getMyShopOrders(req: AuthRequest, res: Response) {
  const page = Math.max(1, Number(req.query.page ?? 1))
  const limit = 20
  try {
    const where = { userId: req.userId! }
    const [orders, total] = await Promise.all([
      prisma.shopOrder.findMany({
        where,
        include: { shopItem: { select: { name: true, imageUrl: true, tcgType: true, category: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.shopOrder.count({ where }),
    ])
    res.json({ orders, total, page, limit })
  } catch (err) {
    console.error('[getMyShopOrders]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 관리자 API
// ─────────────────────────────────────────────────────────────────────────────

// 매출 통계
export async function adminGetShopStats(req: AuthRequest, res: Response) {
  try {
    const [aggregate, itemStats, daily] = await Promise.all([
      prisma.shopOrder.aggregate({
        _sum: { totalPrice: true, quantity: true },
        _count: { _all: true },
      }),
      prisma.shopOrder.groupBy({
        by: ['shopItemId'],
        _sum: { totalPrice: true, quantity: true },
        _count: { _all: true },
        orderBy: { _sum: { totalPrice: 'desc' } },
        take: 10,
      }),
      // 일별 매출 (최근 30일, PostgreSQL)
      prisma.$queryRaw<{ date: string; revenue: bigint; orders: bigint }[]>`
        SELECT
          TO_CHAR("createdAt" AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') AS date,
          SUM("totalPrice")::bigint AS revenue,
          COUNT(*)::bigint AS orders
        FROM "ShopOrder"
        WHERE "createdAt" >= NOW() - INTERVAL '30 days'
        GROUP BY TO_CHAR("createdAt" AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD')
        ORDER BY date ASC
      `,
    ])

    // 상품 상세 조회
    const shopItemIds = itemStats.map(s => s.shopItemId)
    const shopItems = await prisma.shopItem.findMany({
      where: { id: { in: shopItemIds } },
      select: { id: true, name: true, tcgType: true, category: true, imageUrl: true },
    })

    const topItems = itemStats.map(s => {
      const item = shopItems.find(i => i.id === s.shopItemId)
      return {
        shopItemId: s.shopItemId,
        name:          item?.name     ?? '삭제된 상품',
        tcgType:       item?.tcgType  ?? '',
        imageUrl:      item?.imageUrl ?? null,
        totalRevenue:  Number(s._sum.totalPrice  ?? 0),
        totalQuantity: Number(s._sum.quantity     ?? 0),
        orderCount:    s._count._all,
      }
    })

    // 30일치 날짜 채우기
    const last30 = Array.from({ length: 30 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (29 - i))
      return d.toISOString().split('T')[0]
    })
    const dailyMap = new Map(daily.map(d => [d.date, { revenue: Number(d.revenue), orders: Number(d.orders) }]))
    const dailyRevenue = last30.map(date => ({
      date,
      revenue: dailyMap.get(date)?.revenue ?? 0,
      orders:  dailyMap.get(date)?.orders  ?? 0,
    }))

    res.json({
      totalRevenue:  Number(aggregate._sum.totalPrice  ?? 0),
      totalOrders:   aggregate._count._all,
      totalQuantity: Number(aggregate._sum.quantity    ?? 0),
      avgOrderValue: aggregate._count._all > 0
        ? Math.round(Number(aggregate._sum.totalPrice ?? 0) / aggregate._count._all)
        : 0,
      topItems,
      dailyRevenue,
    })
  } catch (err) {
    console.error('[adminGetShopStats]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// 주문 목록 (관리자)
export async function adminGetShopOrders(req: AuthRequest, res: Response) {
  const page       = Math.max(1, Number(req.query.page ?? 1))
  const limit      = 20
  const shopItemId = req.query.shopItemId as string | undefined
  const dateFrom   = req.query.dateFrom   as string | undefined
  const dateTo     = req.query.dateTo     as string | undefined

  try {
    const where = {
      ...(shopItemId ? { shopItemId } : {}),
      ...((dateFrom || dateTo) ? {
        createdAt: {
          ...(dateFrom ? { gte: new Date(dateFrom) }              : {}),
          ...(dateTo   ? { lte: new Date(`${dateTo}T23:59:59`) } : {}),
        },
      } : {}),
    }

    const [orders, total] = await Promise.all([
      prisma.shopOrder.findMany({
        where,
        include: {
          user:     { select: { id: true, nickname: true, avatarUrl: true } },
          shopItem: { select: { id: true, name: true, imageUrl: true, tcgType: true, category: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.shopOrder.count({ where }),
    ])

    res.json({ orders, total, page, limit, totalPages: Math.ceil(total / limit) })
  } catch (err) {
    console.error('[adminGetShopOrders]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

const itemSchema = z.object({
  name:        z.string().min(1).max(100),
  description: z.string().max(2000).optional(),
  tcgType:     z.nativeEnum(TcgType),
  category:    z.nativeEnum(ShopCategory),
  price:       z.number().int().min(1),
  stock:       z.number().int().min(0),
  imageUrl:    z.string().url().optional().or(z.literal('')),
  isActive:    z.boolean().optional(),
})

export async function adminGetShopItems(req: AuthRequest, res: Response) {
  const page = Math.max(1, Number(req.query.page ?? 1))
  const limit = 30
  try {
    const [items, total] = await Promise.all([
      prisma.shopItem.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { _count: { select: { orders: true } } },
      }),
      prisma.shopItem.count(),
    ])
    res.json({ items, total, page, limit })
  } catch (err) {
    console.error('[adminGetShopItems]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

export async function adminCreateShopItem(req: AuthRequest, res: Response) {
  const parsed = itemSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ message: '입력값 오류', errors: parsed.error.flatten() }); return
  }
  try {
    const item = await prisma.shopItem.create({
      data: { ...parsed.data, imageUrl: parsed.data.imageUrl || null },
    })
    res.status(201).json(item)
  } catch (err) {
    console.error('[adminCreateShopItem]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

export async function adminUpdateShopItem(req: AuthRequest, res: Response) {
  const parsed = itemSchema.partial().safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ message: '입력값 오류', errors: parsed.error.flatten() }); return
  }
  try {
    const item = await prisma.shopItem.update({
      where: { id: String(req.params['id']) },
      data: { ...parsed.data, imageUrl: parsed.data.imageUrl === '' ? null : parsed.data.imageUrl },
    })
    res.json(item)
  } catch (err) {
    console.error('[adminUpdateShopItem]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

export async function adminDeleteShopItem(req: AuthRequest, res: Response) {
  try {
    await prisma.shopItem.update({
      where: { id: String(req.params['id']) },
      data: { isActive: false },
    })
    res.json({ message: '상품이 비활성화되었습니다.' })
  } catch (err) {
    console.error('[adminDeleteShopItem]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

export async function adminRestockShopItem(req: AuthRequest, res: Response) {
  const amount = z.number().int().min(1).safeParse(req.body.amount)
  if (!amount.success) { res.status(400).json({ message: '수량을 올바르게 입력해주세요.' }); return }
  try {
    const item = await prisma.shopItem.update({
      where: { id: String(req.params['id']) },
      // 재입고 시 품절 해제
      data: { stock: { increment: amount.data }, isSoldOut: false },
    })
    res.json({ message: `${amount.data}개 입고되었습니다.`, stock: item.stock })
  } catch (err) {
    console.error('[adminRestockShopItem]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// 품절 토글 (재고와 무관하게 명시적 품절/재판매 처리)
export async function adminToggleSoldOut(req: AuthRequest, res: Response) {
  try {
    const current = await prisma.shopItem.findUnique({
      where: { id: String(req.params['id']) },
      select: { isSoldOut: true },
    })
    if (!current) { res.status(404).json({ message: '상품을 찾을 수 없습니다.' }); return }

    const item = await prisma.shopItem.update({
      where: { id: String(req.params['id']) },
      data: { isSoldOut: !current.isSoldOut },
    })
    res.json({ isSoldOut: item.isSoldOut })
  } catch (err) {
    console.error('[adminToggleSoldOut]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

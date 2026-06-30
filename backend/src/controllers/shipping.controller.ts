import { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { ShippingStatus } from '@prisma/client'

const shippingSchema = z.object({
  recipientName: z.string().min(1, '수령인 이름을 입력해주세요.'),
  phone: z.string().min(9).max(15),
  zipCode: z.string().min(5).max(6),
  address: z.string().min(5, '주소를 입력해주세요.'),
  addressDetail: z.string().optional(),
  memo: z.string().optional(),
  items: z.array(z.object({
    inventoryItemId: z.string().uuid(),
    quantity: z.number().int().min(1),
  })).min(1, '배송할 아이템을 선택해주세요.'),
})

export async function createShippingRequest(req: AuthRequest, res: Response) {
  const result = shippingSchema.safeParse(req.body)
  if (!result.success) {
    res.status(400).json({ message: result.error.errors[0]?.message ?? '입력값 오류' })
    return
  }
  const { items, ...shippingData } = result.data

  try {
    // 본인 소유 아이템인지 + 수량 검증
    const inventoryItems = await prisma.inventoryItem.findMany({
      where: { id: { in: items.map((i) => i.inventoryItemId) }, userId: req.userId! },
    })
    if (inventoryItems.length !== items.length) {
      res.status(400).json({ message: '존재하지 않거나 권한이 없는 아이템이 있습니다.' })
      return
    }
    for (const reqItem of items) {
      const inv = inventoryItems.find((i) => i.id === reqItem.inventoryItemId)
      if (!inv || inv.quantity < reqItem.quantity) {
        res.status(400).json({ message: `수량이 부족합니다.` })
        return
      }
    }

    const shipping = await prisma.shippingRequest.create({
      data: {
        userId: req.userId!,
        ...shippingData,
        items: {
          create: items.map((i) => ({
            inventoryItemId: i.inventoryItemId,
            quantity: i.quantity,
          })),
        },
      },
      include: {
        items: { include: { inventoryItem: { include: { card: true } } } },
      },
    })
    res.status(201).json(shipping)
  } catch (err) {
    console.error('[createShippingRequest]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

export async function getMyShippingRequests(req: AuthRequest, res: Response) {
  const page = Math.max(1, Number(req.query.page ?? 1))
  const limit = Math.min(20, Number(req.query.limit ?? 10))
  const skip = (page - 1) * limit

  try {
    const where = { userId: req.userId! }
    const [requests, total] = await Promise.all([
      prisma.shippingRequest.findMany({
        where,
        include: {
          items: {
            include: { inventoryItem: { include: { card: { select: { id: true, name: true, imageUrl: true, tcgType: true } } } } },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.shippingRequest.count({ where }),
    ])
    res.json({ requests, total, page, limit })
  } catch (err) {
    console.error('[getMyShippingRequests]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

export async function cancelShippingRequest(req: AuthRequest, res: Response) {
  try {
    const shipping = await prisma.shippingRequest.findUnique({
      where: { id: String(req.params['id']) },
    })
    if (!shipping || shipping.userId !== req.userId) {
      res.status(403).json({ message: '권한이 없습니다.' })
      return
    }
    if (shipping.status !== 'PENDING') {
      res.status(400).json({ message: '처리가 시작된 배송 신청은 취소할 수 없습니다.' })
      return
    }
    await prisma.shippingRequest.update({
      where: { id: shipping.id },
      data: { status: 'CANCELLED' },
    })
    res.json({ message: '배송 신청이 취소되었습니다.' })
  } catch (err) {
    console.error('[cancelShippingRequest]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// ─── 관리자 ───────────────────────────────────────────────────────────────

export async function getAdminShippings(req: Request, res: Response) {
  const page = Math.max(1, Number(req.query.page ?? 1))
  const limit = Math.min(50, Number(req.query.limit ?? 20))
  const skip = (page - 1) * limit
  const status = req.query.status as string | undefined

  try {
    const where = status ? { status: status as ShippingStatus } : {}
    const [requests, total] = await Promise.all([
      prisma.shippingRequest.findMany({
        where,
        include: {
          user: { select: { id: true, nickname: true, email: true } },
          items: {
            include: { inventoryItem: { include: { card: { select: { id: true, name: true, imageUrl: true } } } } },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.shippingRequest.count({ where }),
    ])
    res.json({ requests, total, page, limit })
  } catch (err) {
    console.error('[getAdminShippings]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

const updateShippingSchema = z.object({
  status: z.enum(['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED']),
  trackingNumber: z.string().optional(),
  courier: z.string().optional(),
})

export async function updateShippingStatus(req: Request, res: Response) {
  const result = updateShippingSchema.safeParse(req.body)
  if (!result.success) {
    res.status(400).json({ message: '입력값 오류' })
    return
  }
  try {
    const shipping = await prisma.shippingRequest.update({
      where: { id: String(req.params['id']) },
      data: result.data,
    })
    res.json(shipping)
  } catch (err) {
    console.error('[updateShippingStatus]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

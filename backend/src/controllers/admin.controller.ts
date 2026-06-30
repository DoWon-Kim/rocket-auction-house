import { Request, Response } from 'express'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { GRANTABLE_SECTIONS } from '../middleware/permissions'

export async function getStats(_req: Request, res: Response) {
  try {
    const [users, listings, transactions, oripas] = await Promise.all([
      prisma.user.count(),
      prisma.listing.count({ where: { status: 'ACTIVE' } }),
      prisma.transaction.count(),
      prisma.oripa.count({ where: { isActive: true } }),
    ])

    const recentTransactions = await prisma.transaction.findMany({
      take: 5,
      orderBy: { completedAt: 'desc' },
      include: {
        buyer: { select: { nickname: true } },
        seller: { select: { nickname: true } },
        listing: { include: { card: { select: { name: true } } } },
      },
    })

    res.json({ users, activeListings: listings, transactions, activeOripas: oripas, recentTransactions })
  } catch (err) {
    console.error('[getStats]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

const cardSchema = z.object({
  name: z.string().min(1),
  tcgType: z.enum(['POKEMON', 'YUGIOH', 'MTG', 'DIGIMON', 'WEISS', 'OTHER']),
  setName: z.string().min(1),
  setCode: z.string().optional(),
  cardNumber: z.string().optional(),
  rarity: z.string().min(1),
  imageUrl: z.string().url().optional().or(z.literal('')),
  description: z.string().optional(),
})

export async function getCards(req: Request, res: Response) {
  try {
    const q = (req.query.q as string | undefined)?.trim()
    const tcgType = req.query.tcgType as string | undefined
    const page = Math.max(1, Number(req.query.page ?? '1'))
    const limit = Math.min(50, Number(req.query.limit ?? '30'))
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = {}
    if (tcgType) where.tcgType = tcgType
    if (q) {
      where.OR = [
        { name:       { contains: q, mode: 'insensitive' } },
        { nameKo:     { contains: q, mode: 'insensitive' } },
        { nameJa:     { contains: q, mode: 'insensitive' } },
        { setName:    { contains: q, mode: 'insensitive' } },
        { setCode:    { contains: q, mode: 'insensitive' } },
        { cardNumber: { contains: q, mode: 'insensitive' } },
      ]
    }

    const [cards, total] = await Promise.all([
      prisma.card.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      prisma.card.count({ where }),
    ])
    res.json({ cards, total })
  } catch (err) {
    console.error('[getCards]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

export async function createCard(req: Request, res: Response) {
  const result = cardSchema.safeParse(req.body)
  if (!result.success) {
    res.status(400).json({ message: '입력값 오류', errors: result.error.flatten() })
    return
  }
  try {
    const data = result.data
    const card = await prisma.card.create({
      data: { ...data, imageUrl: data.imageUrl || undefined },
    })
    res.status(201).json(card)
  } catch (err) {
    console.error('[createCard]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

export async function updateCard(req: Request, res: Response) {
  const result = cardSchema.partial().safeParse(req.body)
  if (!result.success) {
    res.status(400).json({ message: '입력값 오류', errors: result.error.flatten() })
    return
  }
  try {
    const card = await prisma.card.update({
      where: { id: String(req.params['id']) },
      data: result.data,
    })
    res.json(card)
  } catch (err) {
    console.error('[updateCard]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

export async function deleteCard(req: Request, res: Response) {
  try {
    await prisma.card.delete({ where: { id: String(req.params['id']) } })
    res.json({ message: '삭제되었습니다.' })
  } catch (err) {
    console.error('[deleteCard]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

const oripaSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  imageUrl: z.string().url().optional().or(z.literal('')),
  pricePerDraw: z.number().int().min(1),
  totalSlots: z.number().int().min(1),
})

const oripaItemSchema = z.object({
  cardId: z.string().uuid(),
  quantity: z.number().int().min(1),
  grade: z.number().int().min(1).max(3),
  weight: z.number().int().min(0).optional(),
  isLastOne: z.boolean().optional(),
})

export async function getOripas(req: Request, res: Response) {
  try {
    const oripas = await prisma.oripa.findMany({
      include: {
        items: { include: { card: { select: { id: true, name: true, rarity: true, imageUrl: true } } } },
        _count: { select: { purchases: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    res.json(oripas)
  } catch (err) {
    console.error('[getOripas]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

export async function createOripa(req: Request, res: Response) {
  const result = oripaSchema.safeParse(req.body)
  if (!result.success) {
    res.status(400).json({ message: '입력값 오류', errors: result.error.flatten() })
    return
  }
  try {
    const data = result.data
    const oripa = await prisma.oripa.create({
      data: {
        ...data,
        imageUrl: data.imageUrl || undefined,
        remainSlots: data.totalSlots,
      },
    })
    res.status(201).json(oripa)
  } catch (err) {
    console.error('[createOripa]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

export async function updateOripa(req: Request, res: Response) {
  const result = oripaSchema.partial().safeParse(req.body)
  if (!result.success) {
    res.status(400).json({ message: '입력값 오류', errors: result.error.flatten() })
    return
  }
  try {
    const data = result.data
    // totalSlots 변경 시 remainSlots 동기화
    let syncedData: Record<string, unknown> = { ...data }
    if (data.totalSlots !== undefined) {
      const current = await prisma.oripa.findUnique({
        where: { id: String(req.params['id']) },
        select: { totalSlots: true, remainSlots: true },
      })
      if (current) {
        const slotDiff = data.totalSlots - current.totalSlots
        syncedData = { ...data, remainSlots: Math.max(0, current.remainSlots + slotDiff) }
      }
    }
    const oripa = await prisma.oripa.update({
      where: { id: String(req.params['id']) },
      data: syncedData,
    })
    res.json(oripa)
  } catch (err) {
    console.error('[updateOripa]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

export async function toggleOripa(req: Request, res: Response) {
  try {
    const oripa = await prisma.oripa.findUnique({ where: { id: String(req.params['id']) } })
    if (!oripa) { res.status(404).json({ message: '오리파를 찾을 수 없습니다.' }); return }
    const updated = await prisma.oripa.update({
      where: { id: String(req.params['id']) },
      data: { isActive: !oripa.isActive },
    })
    res.json(updated)
  } catch (err) {
    console.error('[toggleOripa]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

export async function addOripaItem(req: Request, res: Response) {
  const result = oripaItemSchema.safeParse(req.body)
  if (!result.success) {
    res.status(400).json({ message: '입력값 오류', errors: result.error.flatten() })
    return
  }
  try {
    const item = await prisma.oripaItem.create({
      data: { oripaId: String(req.params['id']), ...result.data },
      include: { card: true },
    })
    res.status(201).json(item)
  } catch (err) {
    console.error('[addOripaItem]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

export async function removeOripaItem(req: Request, res: Response) {
  try {
    await prisma.oripaItem.delete({ where: { id: String(req.params['itemId']) } })
    res.json({ message: '삭제되었습니다.' })
  } catch (err) {
    console.error('[removeOripaItem]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

export async function getUsers(req: Request, res: Response) {
  try {
    const q = req.query.q as string | undefined
    const role = req.query.role as string | undefined
    const page = req.query.page as string ?? '1'
    const limit = req.query.limit as string ?? '20'
    const where: Record<string, unknown> = {}
    if (q) {
      where.OR = [
        { nickname: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ]
    }
    if (role) where.role = role
    const skip = (Number(page) - 1) * Number(limit)
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true, email: true, nickname: true, balance: true, role: true, createdAt: true,
          _count: { select: { listings: true, transactions: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(limit),
      }),
      prisma.user.count({ where }),
    ])
    res.json({ users, total })
  } catch (err) {
    console.error('[getUsers]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

export async function grantBalance(req: Request, res: Response) {
  const { amount } = req.body
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount === 0) {
    res.status(400).json({ message: '0이 아닌 정수 금액을 입력해주세요.' })
    return
  }
  const userId = String(req.params['id'])
  try {
    const user = await prisma.$transaction(async (tx) => {
      // 차감 시 잔액 조건을 where에 포함해 원자적으로 처리 (TOCTOU 방지)
      const updated = await tx.user.updateMany({
        where: {
          id: userId,
          ...(amount < 0 ? { balance: { gte: -amount } } : {}),
        },
        data: { balance: { increment: amount } },
      })
      if (updated.count === 0) {
        const exists = await tx.user.findUnique({ where: { id: userId }, select: { id: true } })
        if (!exists) throw Object.assign(new Error('NOT_FOUND'), { status: 404, message: '사용자를 찾을 수 없습니다.' })
        throw Object.assign(new Error('INSUFFICIENT'), { status: 400, message: '차감 금액이 현재 잔액을 초과합니다.' })
      }
      return tx.user.findUnique({ where: { id: userId }, select: { id: true, nickname: true, balance: true } })
    })
    res.json(user)
  } catch (err) {
    const e = err as { status?: number; message?: string }
    if (e.status) { res.status(e.status).json({ message: e.message }); return }
    console.error('[grantBalance]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

export async function resetUserPassword(req: Request, res: Response) {
  try {
    const user = await prisma.user.findUnique({ where: { id: String(req.params['id']) }, select: { id: true, nickname: true } })
    if (!user) { res.status(404).json({ message: '사용자를 찾을 수 없습니다.' }); return }

    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
    const tempPassword = Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
    const passwordHash = await bcrypt.hash(tempPassword, 12)

    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } })
    res.json({ nickname: user.nickname, tempPassword })
  } catch (err) {
    console.error('[resetUserPassword]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

export async function setUserRole(req: AuthRequest, res: Response) {
  const { role } = req.body
  if (!['USER', 'ADMIN'].includes(role)) {
    res.status(400).json({ message: '올바르지 않은 역할입니다.' })
    return
  }
  const userId = String(req.params['id'])
  if (userId === req.userId) {
    res.status(400).json({ message: '자신의 역할은 변경할 수 없습니다.' })
    return
  }
  try {
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
    if (!target) { res.status(404).json({ message: '사용자를 찾을 수 없습니다.' }); return }
    if (target.role === 'SUPER_ADMIN') {
      res.status(403).json({ message: '최종 관리자의 역할은 변경할 수 없습니다.' })
      return
    }
    const user = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: { id: true, nickname: true, role: true },
    })
    if (role === 'USER') {
      await prisma.adminPermission.deleteMany({ where: { userId } })
    }
    res.json(user)
  } catch (err) {
    console.error('[setUserRole]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// ─── 권한 관리 ────────────────────────────────────────────────────────────────

export async function getMyPermissions(req: AuthRequest, res: Response) {
  if (req.userRole === 'SUPER_ADMIN') {
    return res.json({ sections: ['dashboard', 'permissions', 'menus', 'posts', 'cards', 'shop', 'oripas', 'users', 'shipping', 'withdrawal'] })
  }
  try {
    const perms = await prisma.adminPermission.findMany({
      where: { userId: req.userId! },
      select: { section: true },
    })
    res.json({ sections: ['dashboard', ...perms.map(p => p.section)] })
  } catch (err) {
    console.error('[getMyPermissions]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

export async function getSubAdmins(_req: AuthRequest, res: Response) {
  try {
    const users = await prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: {
        id: true, nickname: true, email: true, createdAt: true,
        adminPermissions: { select: { section: true } },
      },
      orderBy: { createdAt: 'asc' },
    })
    res.json({ users })
  } catch (err) {
    console.error('[getSubAdmins]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

export async function updateUserPermissions(req: AuthRequest, res: Response) {
  const userId = String(req.params['id'])
  const { sections } = req.body as { sections: string[] }
  const filtered = (sections ?? []).filter(s => (GRANTABLE_SECTIONS as readonly string[]).includes(s))

  try {
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
    if (!target || target.role !== 'ADMIN') {
      res.status(404).json({ message: '중간 관리자를 찾을 수 없습니다.' })
      return
    }
    await prisma.$transaction([
      prisma.adminPermission.deleteMany({ where: { userId } }),
      prisma.adminPermission.createMany({ data: filtered.map(section => ({ userId, section })) }),
    ])
    res.json({ sections: filtered })
  } catch (err) {
    console.error('[updateUserPermissions]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

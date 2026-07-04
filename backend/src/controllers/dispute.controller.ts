import { Response } from 'express'
import { z } from 'zod'
import { ReportReason, DisputeStatus } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { notify } from '../lib/notify'

const createDisputeSchema = z.object({
  transactionId: z.string().uuid(),
  reason:        z.nativeEnum(ReportReason),
  description:   z.string().min(10).max(1000),
  evidenceUrls:  z.array(z.string().url()).max(5).default([]),
})

export async function createDispute(req: AuthRequest, res: Response) {
  const parsed = createDisputeSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ message: '입력값 오류', errors: parsed.error.flatten() })
    return
  }
  const userId = req.userId!
  const { transactionId, reason, description, evidenceUrls } = parsed.data

  const tx = await prisma.transaction.findUnique({
    where: { id: transactionId },
    select: { buyerId: true, sellerId: true, txStatus: true, dispute: { select: { id: true } } },
  })
  if (!tx) { res.status(404).json({ message: '거래를 찾을 수 없습니다.' }); return }
  if (tx.buyerId !== userId) { res.status(403).json({ message: '구매자만 분쟁을 신청할 수 있습니다.' }); return }
  if (tx.dispute) { res.status(409).json({ message: '이미 분쟁이 접수된 거래입니다.' }); return }
  if (!['SHIPPED', 'COMPLETED', 'AUTO_COMPLETED'].includes(tx.txStatus)) {
    res.status(400).json({ message: '발송 완료 이후 거래에만 분쟁을 신청할 수 있습니다.' })
    return
  }

  const dispute = await prisma.$transaction(async (t) => {
    const d = await t.dispute.create({
      data: { transactionId, buyerId: userId, sellerId: tx.sellerId, reason, description, evidenceUrls },
    })
    await t.transaction.update({
      where: { id: transactionId },
      data: { txStatus: 'DISPUTED', disputeStatus: 'OPEN', disputedAt: new Date() },
    })
    return d
  })

  notify({
    userId: tx.sellerId,
    type: 'SYSTEM',
    title: '분쟁이 접수되었습니다',
    body: '거래에 대한 분쟁이 접수되었습니다. 고객센터에서 검토 후 연락드립니다.',
    link: `/my?tab=sales`,
  })

  res.status(201).json({ dispute })
}

export async function getDispute(req: AuthRequest, res: Response) {
  const userId = req.userId!
  const id = String(req.params['id'])

  const dispute = await prisma.dispute.findUnique({
    where: { id },
    include: {
      transaction: { select: { id: true, finalPrice: true, txStatus: true, listing: { select: { id: true, card: { select: { nameKo: true, name: true } } } } } },
      buyer:  { select: { id: true, nickname: true, avatarUrl: true } },
      seller: { select: { id: true, nickname: true, avatarUrl: true } },
    },
  })

  if (!dispute) { res.status(404).json({ message: '분쟁을 찾을 수 없습니다.' }); return }
  if (dispute.buyerId !== userId && dispute.sellerId !== userId) {
    res.status(403).json({ message: '접근 권한이 없습니다.' }); return
  }

  res.json({ dispute })
}

export async function getMyDisputes(req: AuthRequest, res: Response) {
  const userId = req.userId!

  const disputes = await prisma.dispute.findMany({
    where: { OR: [{ buyerId: userId }, { sellerId: userId }] },
    include: {
      transaction: { select: { finalPrice: true, listing: { select: { card: { select: { nameKo: true, name: true } } } } } },
      buyer:  { select: { nickname: true } },
      seller: { select: { nickname: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  res.json({ disputes })
}

// ─── 어드민 전용 ──────────────────────────────────────────────────────────

const RESOLVABLE: DisputeStatus[] = ['REVIEWING', 'RESOLVED', 'REJECTED', 'REFUNDED']

const resolveDisputeSchema = z.object({
  status:    z.enum(['REVIEWING', 'RESOLVED', 'REJECTED', 'REFUNDED']),
  adminNote: z.string().max(500).optional(),
})

export async function adminGetDisputes(req: AuthRequest, res: Response) {
  const status = req.query.status as string | undefined
  const page  = Math.max(1, Number(req.query.page)  || 1)
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20))

  const where = status && status !== 'ALL' ? { status: status as DisputeStatus } : {}

  const [disputes, total] = await Promise.all([
    prisma.dispute.findMany({
      where,
      include: {
        transaction: { select: { finalPrice: true, listing: { select: { card: { select: { nameKo: true, name: true } } } } } },
        buyer:  { select: { id: true, nickname: true } },
        seller: { select: { id: true, nickname: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.dispute.count({ where }),
  ])

  res.json({ disputes, total, page, limit })
}

export async function adminResolveDispute(req: AuthRequest, res: Response) {
  const id = String(req.params['id'])
  const parsed = resolveDisputeSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ message: '입력값 오류', errors: parsed.error.flatten() })
    return
  }
  const { status, adminNote } = parsed.data

  const dispute = await prisma.dispute.findUnique({
    where: { id },
    select: { status: true, buyerId: true, sellerId: true, transactionId: true },
  })
  if (!dispute) { res.status(404).json({ message: '분쟁을 찾을 수 없습니다.' }); return }
  if (!RESOLVABLE.includes(status)) {
    res.status(400).json({ message: '유효하지 않은 상태 전환입니다.' }); return
  }

  // 환불 시 finalPrice 조회 필요
  let finalPrice = 0
  if (status === 'REFUNDED') {
    const txRecord = await prisma.transaction.findUnique({
      where: { id: dispute.transactionId },
      select: { finalPrice: true },
    })
    finalPrice = txRecord?.finalPrice ?? 0
  }

  await prisma.$transaction(async (t) => {
    await t.dispute.update({
      where: { id },
      data: {
        status,
        adminNote,
        resolvedAt: ['RESOLVED', 'REJECTED', 'REFUNDED'].includes(status) ? new Date() : undefined,
      },
    })

    if (status === 'RESOLVED' || status === 'REJECTED') {
      await t.transaction.update({
        where: { id: dispute.transactionId },
        data: { disputeStatus: status },
      })
    }

    if (status === 'REFUNDED') {
      await t.user.update({
        where: { id: dispute.buyerId },
        data: { balance: { increment: finalPrice } },
      })
      await t.transaction.update({
        where: { id: dispute.transactionId },
        data: { txStatus: 'CANCELLED', disputeStatus: 'REFUNDED' },
      })
    }
  })

  const resultLabel = status === 'REVIEWING' ? '검토 중' : status === 'RESOLVED' ? '구매자 승인' : status === 'REJECTED' ? '기각' : '환불 처리'
  const notifyMsg = `분쟁이 ${resultLabel}으로 처리되었습니다.`

  notify({ userId: dispute.buyerId,  type: 'SYSTEM', title: '분쟁 처리 결과', body: notifyMsg, link: '/my?tab=disputes' })
  notify({ userId: dispute.sellerId, type: 'SYSTEM', title: '분쟁 처리 결과', body: notifyMsg, link: '/my?tab=disputes' })

  res.json({ message: '분쟁이 처리되었습니다.' })
}

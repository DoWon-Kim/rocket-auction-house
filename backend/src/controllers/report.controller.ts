import { Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'

const VALID_REASONS = ['FAKE_ITEM', 'NO_SHIPMENT', 'WRONG_ITEM', 'DAMAGED_ITEM', 'FRAUD', 'HARASSMENT', 'OTHER'] as const
const VALID_STATUSES = ['PENDING', 'INVESTIGATING', 'RESOLVED', 'DISMISSED'] as const

const createReportSchema = z.object({
  reportedUserId: z.string().uuid(),
  reason:         z.enum(VALID_REASONS),
  detail:         z.string().max(2000).optional(),
  listingId:      z.string().uuid().optional(),
  transactionId:  z.string().uuid().optional(),
})

const REPORT_SELECT = {
  id: true, reason: true, detail: true, status: true,
  adminNote: true, resolvedAt: true, createdAt: true,
  reporter:     { select: { id: true, nickname: true } },
  reportedUser: { select: { id: true, nickname: true } },
  listing:      { select: { id: true, card: { select: { name: true, nameKo: true } } } },
  transaction:  { select: { id: true, finalPrice: true, txStatus: true } },
}

// ── 유저: 신고 접수 ──────────────────────────────────────────────────────────

export async function createReport(req: AuthRequest, res: Response) {
  const parsed = createReportSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ message: '입력값 오류', errors: parsed.error.flatten() })
    return
  }
  const { reportedUserId, reason, detail, listingId, transactionId } = parsed.data

  if (reportedUserId === req.userId) {
    res.status(400).json({ message: '자기 자신을 신고할 수 없습니다.' })
    return
  }

  try {
    // 같은 대상·같은 리스팅 중복 신고 방지 (PENDING or INVESTIGATING)
    const existing = await prisma.report.findFirst({
      where: {
        reporterId: req.userId!,
        reportedUserId,
        ...(listingId ? { listingId } : {}),
        status: { in: ['PENDING', 'INVESTIGATING'] },
      },
    })
    if (existing) {
      res.status(409).json({ message: '이미 처리 중인 신고가 있습니다.' })
      return
    }

    const report = await prisma.report.create({
      data: {
        reporterId: req.userId!,
        reportedUserId,
        reason,
        detail: detail?.trim() || null,
        listingId:     listingId     || null,
        transactionId: transactionId || null,
      },
      select: REPORT_SELECT,
    })

    // 거래가 있으면 분쟁 상태로 전환
    if (transactionId) {
      await prisma.transaction.updateMany({
        where: {
          id: transactionId,
          txStatus: { in: ['PENDING_SHIPMENT', 'SHIPPED'] },
          OR: [{ buyerId: req.userId }, { sellerId: req.userId }],
        },
        data: { txStatus: 'DISPUTED', disputeStatus: 'OPEN', disputedAt: new Date() },
      })
    }

    // 리스팅 신고 누적 3회 이상 → 자동 숨김 (SUSPENDED)
    if (listingId) {
      const activeReports = await prisma.report.count({
        where: { listingId, status: { in: ['PENDING', 'INVESTIGATING'] } },
      })
      if (activeReports >= 3) {
        await prisma.listing.updateMany({
          where: { id: listingId, status: 'ACTIVE' },
          data: { status: 'SUSPENDED' },
        })
      }
    }

    res.status(201).json(report)
  } catch (err) {
    console.error('[createReport]', err)
    res.status(500).json({ message: '신고 접수 실패' })
  }
}

// ── 유저: 내 신고 내역 ───────────────────────────────────────────────────────

export async function getMyReports(req: AuthRequest, res: Response) {
  try {
    const page  = Math.max(1, Number(req.query.page  ?? 1))
    const limit = Math.min(20, Number(req.query.limit ?? 10))
    const skip  = (page - 1) * limit

    const [list, total] = await Promise.all([
      prisma.report.findMany({
        where: { reporterId: req.userId! },
        select: REPORT_SELECT,
        orderBy: { createdAt: 'desc' },
        skip, take: limit,
      }),
      prisma.report.count({ where: { reporterId: req.userId! } }),
    ])
    res.json({ list, total })
  } catch (err) {
    console.error('[getMyReports]', err)
    res.status(500).json({ message: '조회 실패' })
  }
}

// ── 관리자: 전체 신고 목록 ───────────────────────────────────────────────────

export async function getAdminReports(req: AuthRequest, res: Response) {
  try {
    const statusRaw = req.query.status as string | undefined
    const q         = (req.query.q as string | undefined)?.trim()
    const page      = Math.max(1, Number(req.query.page  ?? 1))
    const limit     = Math.min(50, Number(req.query.limit ?? 20))
    const skip      = (page - 1) * limit

    const where: Record<string, unknown> = {}
    if (statusRaw && statusRaw !== 'ALL') where.status = statusRaw
    if (q) {
      where.OR = [
        { reportedUser: { nickname: { contains: q, mode: 'insensitive' } } },
        { reporter:     { nickname: { contains: q, mode: 'insensitive' } } },
        { detail: { contains: q, mode: 'insensitive' } },
      ]
    }

    const [list, total] = await Promise.all([
      prisma.report.findMany({
        where,
        select: REPORT_SELECT,
        orderBy: { createdAt: 'desc' },
        skip, take: limit,
      }),
      prisma.report.count({ where }),
    ])
    res.json({ list, total, page, totalPages: Math.ceil(total / limit) })
  } catch (err) {
    console.error('[getAdminReports]', err)
    res.status(500).json({ message: '조회 실패' })
  }
}

// ── 관리자: 신고 상태 업데이트 ──────────────────────────────────────────────

export async function updateReport(req: AuthRequest, res: Response) {
  try {
    const id = req.params.id as string
    const { status, adminNote, refundBuyer } = req.body

    if (!status || !(VALID_STATUSES as readonly string[]).includes(status)) {
      res.status(400).json({ message: '유효하지 않은 상태값입니다.' })
      return
    }

    const report = await prisma.report.findUnique({
      where: { id },
      include: { transaction: { select: { id: true, buyerId: true, finalPrice: true, escrowStatus: true, txStatus: true } } },
    })
    if (!report) { res.status(404).json({ message: '신고를 찾을 수 없습니다.' }); return }

    const isResolved = status === 'RESOLVED' || status === 'DISMISSED'

    // 분쟁 거래 처리 (RESOLVED + refundBuyer 옵션)
    if (isResolved && report.transaction && refundBuyer && report.transaction.escrowStatus === 'HELD') {
      await prisma.$transaction([
        prisma.transaction.update({
          where: { id: report.transaction.id },
          data: { txStatus: 'CANCELLED', escrowStatus: 'REFUNDED', disputeStatus: 'RESOLVED' },
        }),
        prisma.user.update({
          where: { id: report.transaction.buyerId },
          data: { balance: { increment: report.transaction.finalPrice } },
        }),
        prisma.report.update({
          where: { id },
          data: { status, adminNote: adminNote?.trim() || null, resolvedAt: new Date() },
        }),
      ])
    } else if (isResolved && report.transactionId) {
      await prisma.$transaction([
        prisma.transaction.update({
          where: { id: report.transactionId },
          data: { disputeStatus: 'RESOLVED' },
        }),
        prisma.report.update({
          where: { id },
          data: { status, adminNote: adminNote?.trim() || null, resolvedAt: new Date() },
        }),
      ])
    } else {
      await prisma.report.update({
        where: { id },
        data: {
          status,
          adminNote:  adminNote?.trim() || null,
          resolvedAt: isResolved ? new Date() : null,
        },
      })
    }

    // 신고 기각(DISMISSED) 시 SUSPENDED 상태 리스팅 복원
    if (status === 'DISMISSED' && report.listingId) {
      const remaining = await prisma.report.count({
        where: { listingId: report.listingId, status: { in: ['PENDING', 'INVESTIGATING'] } },
      })
      if (remaining === 0) {
        await prisma.listing.updateMany({
          where: { id: report.listingId, status: 'SUSPENDED' },
          data: { status: 'ACTIVE' },
        })
      }
    }

    const updated = await prisma.report.findUnique({ where: { id }, select: REPORT_SELECT })
    res.json(updated)
  } catch (err) {
    console.error('[updateReport]', err)
    res.status(500).json({ message: '처리 실패' })
  }
}

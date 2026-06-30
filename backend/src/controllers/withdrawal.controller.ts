import { Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { executeBankTransfer } from '../services/bankTransfer.service'

const MIN_AMOUNT = 10000  // 최소 환전액 1만P

const createSchema = z.object({
  amount:        z.number().int().min(MIN_AMOUNT),
  bankName:      z.string().min(1).max(50),
  accountNumber: z.string().min(5).max(30),
  accountHolder: z.string().min(1).max(30),
})

// ── 유저: 환전 신청 ───────────────────────────────────────────────────────────
export async function createWithdrawal(req: AuthRequest, res: Response) {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ message: '입력값 오류', errors: parsed.error.flatten() })
    return
  }
  const { amount, bankName, accountNumber, accountHolder } = parsed.data

  try {
    // 잔액 차감 + 신청 생성을 트랜잭션으로 처리
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: req.userId! },
        select: { balance: true },
      })
      if (!user) throw new Error('NOT_FOUND')
      if (user.balance < amount) throw new Error('INSUFFICIENT')

      await tx.user.update({
        where: { id: req.userId! },
        data: { balance: { decrement: amount } },
      })

      return tx.withdrawalRequest.create({
        data: { userId: req.userId!, amount, bankName, accountNumber, accountHolder },
      })
    })

    res.status(201).json(result)
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === 'INSUFFICIENT') {
        res.status(400).json({ message: '잔액이 부족합니다.' })
        return
      }
      if (err.message === 'NOT_FOUND') {
        res.status(404).json({ message: '사용자를 찾을 수 없습니다.' })
        return
      }
    }
    console.error('[createWithdrawal]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// ── 유저: 내 환전 내역 ────────────────────────────────────────────────────────
export async function getMyWithdrawals(req: AuthRequest, res: Response) {
  try {
    const page  = Math.max(1, Number(req.query.page ?? 1))
    const limit = Math.min(20, Number(req.query.limit ?? 10))
    const skip  = (page - 1) * limit

    const [list, total] = await Promise.all([
      prisma.withdrawalRequest.findMany({
        where: { userId: req.userId! },
        orderBy: { createdAt: 'desc' },
        skip, take: limit,
      }),
      prisma.withdrawalRequest.count({ where: { userId: req.userId! } }),
    ])

    res.json({ list, total })
  } catch (err) {
    console.error('[getMyWithdrawals]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// ── 유저: 신청 취소 (PENDING만) ───────────────────────────────────────────────
export async function cancelWithdrawal(req: AuthRequest, res: Response) {
  const id = String(req.params['id'])
  try {
    await prisma.$transaction(async (tx) => {
      const wr = await tx.withdrawalRequest.findUnique({ where: { id } })
      if (!wr || wr.userId !== req.userId!) throw new Error('NOT_FOUND')
      if (wr.status !== 'PENDING') throw new Error('NOT_CANCELLABLE')

      await tx.withdrawalRequest.update({
        where: { id },
        data: { status: 'CANCELLED' },
      })
      // 잔액 환불
      await tx.user.update({
        where: { id: req.userId! },
        data: { balance: { increment: wr.amount } },
      })
    })

    res.json({ message: '환전 신청이 취소되었습니다.' })
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === 'NOT_FOUND')       { res.status(404).json({ message: '신청을 찾을 수 없습니다.' }); return }
      if (err.message === 'NOT_CANCELLABLE') { res.status(409).json({ message: '대기 중인 신청만 취소할 수 있습니다.' }); return }
    }
    console.error('[cancelWithdrawal]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// ── 관리자: 전체 환전 신청 목록 ────────────────────────────────────────────────
export async function getAdminWithdrawals(req: AuthRequest, res: Response) {
  try {
    const status = req.query.status as string | undefined
    const q      = (req.query.q as string | undefined)?.trim()
    const page   = Math.max(1, Number(req.query.page ?? 1))
    const limit  = Math.min(50, Number(req.query.limit ?? 20))
    const skip   = (page - 1) * limit

    const where: Record<string, unknown> = {}
    if (status && status !== 'ALL') where.status = status
    if (q) {
      where.user = {
        OR: [
          { nickname:  { contains: q, mode: 'insensitive' } },
          { email:     { contains: q, mode: 'insensitive' } },
        ],
      }
    }

    const [list, total] = await Promise.all([
      prisma.withdrawalRequest.findMany({
        where,
        include: { user: { select: { id: true, nickname: true, email: true, balance: true } } },
        orderBy: { createdAt: 'desc' },
        skip, take: limit,
      }),
      prisma.withdrawalRequest.count({ where }),
    ])

    res.json({ list, total })
  } catch (err) {
    console.error('[getAdminWithdrawals]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

const processSchema = z.object({
  status:    z.enum(['APPROVED', 'COMPLETED', 'REJECTED']),
  adminNote: z.string().max(500).optional(),
})

// ── 관리자: 환전 신청 처리 ─────────────────────────────────────────────────────
export async function processWithdrawal(req: AuthRequest, res: Response) {
  const id = String(req.params['id'])
  const parsed = processSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ message: '입력값 오류', errors: parsed.error.flatten() })
    return
  }
  const { status, adminNote } = parsed.data

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const wr = await tx.withdrawalRequest.findUnique({ where: { id } })
      if (!wr) throw new Error('NOT_FOUND')

      // REJECTED 시 잔액 환불
      if (status === 'REJECTED' && wr.status !== 'REJECTED') {
        await tx.user.update({
          where: { id: wr.userId },
          data: { balance: { increment: wr.amount } },
        })
      }

      return tx.withdrawalRequest.update({
        where: { id },
        data: {
          status,
          adminNote: adminNote ?? wr.adminNote,
          processedAt: ['COMPLETED', 'REJECTED'].includes(status) ? new Date() : wr.processedAt,
        },
        include: { user: { select: { id: true, nickname: true, balance: true } } },
      })
    })

    res.json(updated)
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_FOUND') {
      res.status(404).json({ message: '신청을 찾을 수 없습니다.' })
      return
    }
    console.error('[processWithdrawal]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// ── 관리자: 실제 계좌 이체 실행 ────────────────────────────────────────────────
// PENDING 또는 APPROVED 상태의 신청에 대해 Toss Payouts API로 이체 후 상태 업데이트
export async function executeTransfer(req: AuthRequest, res: Response) {
  const id = String(req.params['id'])

  try {
    const wr = await prisma.withdrawalRequest.findUnique({ where: { id } })
    if (!wr) { res.status(404).json({ message: '신청을 찾을 수 없습니다.' }); return }

    if (!['PENDING', 'APPROVED'].includes(wr.status)) {
      res.status(409).json({ message: `${wr.status} 상태에서는 이체를 실행할 수 없습니다.` })
      return
    }

    // 이미 이체 완료된 경우 중복 방지
    if (wr.transferId) {
      res.status(409).json({ message: `이미 이체된 신청입니다. (이체ID: ${wr.transferId})` })
      return
    }

    // 이체 API 호출
    const result = await executeBankTransfer({
      bankName: wr.bankName,
      accountNumber: wr.accountNumber,
      accountHolder: wr.accountHolder,
      amount: wr.amount,
      memo: `로켓옥션하우스 포인트환전 ${id.slice(0, 8)}`,
    })

    if (result.success) {
      // 이체 성공 → COMPLETED 처리
      const updated = await prisma.withdrawalRequest.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          transferId: result.transferId ?? 'OK',
          transferError: null,
          processedAt: new Date(),
        },
        include: { user: { select: { id: true, nickname: true, balance: true } } },
      })

      res.json({
        message: '이체가 완료되었습니다.',
        transferId: result.transferId,
        withdrawal: updated,
      })
    } else {
      // 이체 실패 → 오류 기록, 상태는 APPROVED로 유지 (재시도 가능)
      await prisma.withdrawalRequest.update({
        where: { id },
        data: {
          status: 'APPROVED',
          transferError: result.errorMessage ?? '알 수 없는 오류',
        },
      })

      res.status(502).json({
        message: `이체 실패: ${result.errorMessage}`,
        errorCode: result.rawStatus,
      })
    }
  } catch (err) {
    console.error('[executeTransfer]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'

interface TossPaymentResponse {
  paymentKey: string
  orderId: string
  amount: number
  status: string
}

export async function confirmPayment(req: AuthRequest, res: Response) {
  const { paymentKey, orderId, amount } = req.body

  if (!paymentKey || !orderId || !amount) {
    res.status(400).json({ message: '필수 파라미터가 없습니다.' })
    return
  }

  const secretKey = process.env.TOSS_SECRET_KEY
  if (!secretKey) {
    res.status(500).json({ message: '결제 키가 설정되지 않았습니다.' })
    return
  }

  // 클라이언트 amount 유효성 검사
  const clientAmount = Number(amount)
  if (!Number.isInteger(clientAmount) || clientAmount < 1000) {
    res.status(400).json({ message: '유효하지 않은 금액입니다.' })
    return
  }

  try {
    // 중복 결제 방지
    const existing = await prisma.paymentLog.findUnique({ where: { orderId } })
    if (existing) {
      res.status(409).json({ message: '이미 처리된 결제입니다.' })
      return
    }

    const encoded = Buffer.from(`${secretKey}:`).toString('base64')

    const tossRes = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${encoded}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ paymentKey, orderId, amount: clientAmount }),
    })

    if (!tossRes.ok) {
      const err = await tossRes.json() as { message?: string }
      res.status(400).json({ message: err.message ?? '결제 확인에 실패했습니다.' })
      return
    }

    // Toss 응답에서 실제 승인된 금액을 사용 (클라이언트 제공 값 신뢰 안 함)
    const tossData = await tossRes.json() as TossPaymentResponse
    const confirmedAmount = tossData.amount

    // 잔액 증가 + 결제 로그 원자적 기록
    const [user] = await prisma.$transaction([
      prisma.user.update({
        where: { id: req.userId },
        data: { balance: { increment: confirmedAmount } },
        select: { balance: true },
      }),
      prisma.paymentLog.create({
        data: { orderId, userId: req.userId!, amount: confirmedAmount },
      }),
    ])

    res.json({ message: '충전이 완료되었습니다.', amount: confirmedAmount, balance: user.balance })
  } catch (err) {
    console.error('[confirmPayment]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

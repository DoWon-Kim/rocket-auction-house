import { Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { notify } from '../lib/notify'

const TX_SELECT = {
  id: true, buyerId: true, sellerId: true, finalPrice: true,
  txStatus: true, escrowStatus: true,
  trackingCarrier: true, trackingNumber: true,
  shippedAt: true, confirmedAt: true, escrowReleasedAt: true,
}

const CARRIERS = [
  'CJ대한통운', '롯데택배', '한진택배', '우체국택배', '로젠택배',
  '카카오T택배', '쿠팡로켓배송', '직접배송', '기타',
] as const

const shipSchema = z.object({
  trackingCarrier: z.string().min(1),
  trackingNumber: z.string().min(1).max(30),
})

// ── 판매자: 발송 처리 (운송장 입력) ───────────────────────────────────────────
export async function shipItem(req: AuthRequest, res: Response) {
  const id = String(req.params['id'])
  const parsed = shipSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ message: '운송장 정보를 올바르게 입력해주세요.' }); return
  }

  try {
    const tx = await prisma.transaction.findUnique({ where: { id }, select: TX_SELECT })
    if (!tx) { res.status(404).json({ message: '거래를 찾을 수 없습니다.' }); return }
    if (tx.sellerId !== req.userId) {
      res.status(403).json({ message: '판매자만 발송 처리할 수 있습니다.' }); return
    }
    if (tx.txStatus !== 'PENDING_SHIPMENT') {
      res.status(409).json({ message: '이미 발송 처리된 거래입니다.' }); return
    }

    const updated = await prisma.transaction.update({
      where: { id },
      data: {
        txStatus: 'SHIPPED',
        trackingCarrier: parsed.data.trackingCarrier,
        trackingNumber: parsed.data.trackingNumber,
        shippedAt: new Date(),
      },
    })

    // 구매자에게 발송 알림
    notify({
      userId: tx.buyerId,
      type: 'TRANSACTION_SHIPPED',
      title: '상품이 발송되었습니다',
      body: `${parsed.data.trackingCarrier} ${parsed.data.trackingNumber} — 수령 후 수령 확인을 눌러주세요.`,
      link: '/my?tab=purchases',
    }).catch(e => console.error('[notify TRANSACTION_SHIPPED]', e))

    res.json({ message: '발송 처리가 완료되었습니다.', transaction: updated })
  } catch (err) {
    console.error('[shipItem]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// ── 구매자: 수령 확인 → 에스크로 해제 → 판매자 정산 ──────────────────────────
export async function confirmReceipt(req: AuthRequest, res: Response) {
  const id = String(req.params['id'])

  try {
    const tx = await prisma.transaction.findUnique({ where: { id }, select: TX_SELECT })
    if (!tx) { res.status(404).json({ message: '거래를 찾을 수 없습니다.' }); return }
    if (tx.buyerId !== req.userId) {
      res.status(403).json({ message: '구매자만 수령 확인을 할 수 있습니다.' }); return
    }
    if (tx.txStatus !== 'SHIPPED') {
      const msg = tx.txStatus === 'PENDING_SHIPMENT'
        ? '판매자가 아직 발송 처리를 하지 않았습니다.'
        : '이미 완료된 거래입니다.'
      res.status(409).json({ message: msg }); return
    }

    await prisma.$transaction([
      prisma.transaction.update({
        where: { id },
        data: {
          txStatus: 'COMPLETED',
          escrowStatus: 'RELEASED',
          escrowReleasedAt: new Date(),
          confirmedAt: new Date(),
        },
      }),
      prisma.user.update({
        where: { id: tx.sellerId },
        data: { balance: { increment: tx.finalPrice } },
      }),
    ])

    // 판매자에게 거래 완료 + 정산 알림
    notify({
      userId: tx.sellerId,
      type: 'TRANSACTION_COMPLETED',
      title: '거래가 완료되었습니다',
      body: `${tx.finalPrice.toLocaleString()}P가 잔액에 정산되었습니다.`,
      link: '/my?tab=sales',
    }).catch(e => console.error('[notify TRANSACTION_COMPLETED]', e))

    res.json({ message: '수령 확인 완료! 판매자에게 대금이 정산되었습니다.' })
  } catch (err) {
    console.error('[confirmReceipt]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// ── 관리자: 강제 정산 (분쟁 처리) ────────────────────────────────────────────
export async function adminReleaseEscrow(req: AuthRequest, res: Response) {
  const id = String(req.params['id'])

  try {
    const tx = await prisma.transaction.findUnique({ where: { id }, select: TX_SELECT })
    if (!tx) { res.status(404).json({ message: '거래를 찾을 수 없습니다.' }); return }
    if (tx.escrowStatus !== 'HELD') {
      res.status(409).json({ message: '에스크로 보관 중이 아닌 거래입니다.' }); return
    }

    await prisma.$transaction([
      prisma.transaction.update({
        where: { id },
        data: {
          txStatus: 'COMPLETED',
          escrowStatus: 'RELEASED',
          escrowReleasedAt: new Date(),
          confirmedAt: new Date(),
        },
      }),
      prisma.user.update({
        where: { id: tx.sellerId },
        data: { balance: { increment: tx.finalPrice } },
      }),
    ])

    res.json({ message: '에스크로가 강제 해제되었습니다.' })
  } catch (err) {
    console.error('[adminReleaseEscrow]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// 택배사 목록 (프론트에서 사용)
export function getCarriers(_req: AuthRequest, res: Response) {
  res.json(CARRIERS)
}

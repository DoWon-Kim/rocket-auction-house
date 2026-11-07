import { Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { notify } from '../lib/notify'
import { txAmount } from '../lib/marketTrade'
import { postTxSystemMessage } from '../lib/chatTrade'

const TX_SELECT = {
  id: true, buyerId: true, sellerId: true, finalPrice: true, shippingFee: true,
  txStatus: true, escrowStatus: true,
  trackingCarrier: true, trackingNumber: true,
  shippedAt: true, confirmedAt: true, escrowReleasedAt: true, address: true,
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
      res.status(409).json({ message: '이미 발송 처리되었거나 취소된 거래입니다.' }); return
    }
    if (!tx.address) {
      res.status(400).json({ message: '구매자가 배송지를 입력한 뒤에 발송할 수 있어요.' }); return
    }

    // 같은 순간 자동 취소가 돌아도 둘 중 하나만 반영되도록 조건부 업데이트
    const r = await prisma.transaction.updateMany({
      where: { id, txStatus: 'PENDING_SHIPMENT', escrowStatus: 'HELD' },
      data: {
        txStatus: 'SHIPPED',
        trackingCarrier: parsed.data.trackingCarrier,
        trackingNumber: parsed.data.trackingNumber,
        shippedAt: new Date(),
      },
    })
    if (r.count === 0) { res.status(409).json({ message: '이미 발송 처리되었거나 취소된 거래입니다.' }); return }
    const updated = await prisma.transaction.findUnique({ where: { id }, select: TX_SELECT })

    // 구매자에게 발송 알림
    notify({
      userId: tx.buyerId,
      type: 'TRANSACTION_SHIPPED',
      title: '상품이 발송되었습니다',
      body: `${parsed.data.trackingCarrier} ${parsed.data.trackingNumber} — 수령 후 수령 확인을 눌러주세요.`,
      link: '/my?tab=purchases',
    }).catch(e => console.error('[notify TRANSACTION_SHIPPED]', e))
    await postTxSystemMessage(id, req.userId!, `판매자가 상품을 발송했어요.\n${parsed.data.trackingCarrier} ${parsed.data.trackingNumber}\n받으신 후 구매 확정을 눌러주세요. (발송 3일 후 자동 확정)`)

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
        data: { balance: { increment: txAmount(tx) } },
      }),
    ])

    // 판매자에게 거래 완료 + 정산 알림
    notify({
      userId: tx.sellerId,
      type: 'TRANSACTION_COMPLETED',
      title: '거래가 완료되었습니다',
      body: `${txAmount(tx).toLocaleString()}P가 잔액에 정산되었습니다.`,
      link: '/my?tab=sales',
    }).catch(e => console.error('[notify TRANSACTION_COMPLETED]', e))
    await postTxSystemMessage(id, req.userId!, `구매자가 구매를 확정했어요. 판매자에게 ${txAmount(tx).toLocaleString()}P가 정산되었습니다.\n거래 후기를 남겨주세요!`)

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
        data: { balance: { increment: txAmount(tx) } },
      }),
    ])

    await postTxSystemMessage(id, req.userId!, `[운영자] 거래가 확정 처리되어 판매자에게 ${txAmount(tx).toLocaleString()}P가 정산되었습니다.`)
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

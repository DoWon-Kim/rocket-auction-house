import { prisma } from '../lib/prisma'

const DEADLINE_DAYS = 3  // 발송 기한 (결제 후 N일)
let isRunning = false

export async function runShipmentDeadlineJob() {
  if (isRunning) return
  isRunning = true

  const cutoff = new Date(Date.now() - DEADLINE_DAYS * 86400 * 1000)

  try {
    // 결제 후 3일 내 발송 안 한 거래 자동 취소 + 구매자 환불
    const stale = await prisma.transaction.findMany({
      where: {
        txStatus: 'PENDING_SHIPMENT',
        escrowStatus: 'HELD',
        completedAt: { lt: cutoff },
      },
      select: { id: true, buyerId: true, sellerId: true, finalPrice: true },
    })

    for (const tx of stale) {
      try {
        await prisma.$transaction([
          prisma.transaction.update({
            where: { id: tx.id },
            data: {
              txStatus: 'AUTO_CANCELLED',
              escrowStatus: 'REFUNDED',
            },
          }),
          // 구매자 전액 환불
          prisma.user.update({
            where: { id: tx.buyerId },
            data: { balance: { increment: tx.finalPrice } },
          }),
          // 리스팅 상태 다시 ACTIVE로 복구 (재판매 가능)
          prisma.listing.updateMany({
            where: { transaction: { id: tx.id } },
            data: { status: 'ACTIVE' },
          }),
        ])
        console.log(`[ShipmentDeadline] tx=${tx.id} 미발송 자동 취소 → ${tx.buyerId} 환불 ${tx.finalPrice}P`)
      } catch (err) {
        console.error(`[ShipmentDeadline] tx=${tx.id} 처리 실패:`, err)
      }
    }
  } catch (err) {
    console.error('[ShipmentDeadlineJob]', err)
  } finally {
    isRunning = false
  }
}

export function startShipmentDeadlineJob() {
  runShipmentDeadlineJob()
  setInterval(runShipmentDeadlineJob, 60 * 60 * 1000)  // 1시간마다 체크
}

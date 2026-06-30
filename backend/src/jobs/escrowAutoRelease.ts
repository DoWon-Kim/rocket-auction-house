import { prisma } from '../lib/prisma'
import { notify } from '../lib/notify'

const AUTO_CONFIRM_DAYS = 3
let isRunning = false

export async function runEscrowAutoRelease() {
  if (isRunning) return
  isRunning = true

  const cutoff = new Date(Date.now() - AUTO_CONFIRM_DAYS * 86400 * 1000)

  try {
    const stale = await prisma.transaction.findMany({
      where: {
        txStatus: 'SHIPPED',
        escrowStatus: 'HELD',
        shippedAt: { lt: cutoff },
      },
      select: { id: true, sellerId: true, finalPrice: true },
    })

    for (const tx of stale) {
      try {
        await prisma.$transaction([
          prisma.transaction.update({
            where: { id: tx.id },
            data: {
              txStatus: 'AUTO_COMPLETED',
              escrowStatus: 'AUTO_RELEASED',
              escrowReleasedAt: new Date(),
              confirmedAt: new Date(),
            },
          }),
          prisma.user.update({
            where: { id: tx.sellerId },
            data: { balance: { increment: tx.finalPrice } },
          }),
        ])
        console.log(`[EscrowAutoRelease] tx=${tx.id} 자동 구매 확정 (${tx.finalPrice}P)`)
        notify({
          userId: tx.sellerId,
          type: 'TRANSACTION_COMPLETED',
          title: '거래가 자동 완료되었습니다',
          body: `${tx.finalPrice.toLocaleString()}P가 잔액에 정산되었습니다.`,
          link: '/my?tab=sales',
        })
      } catch (txErr) {
        console.error(`[EscrowAutoRelease] tx=${tx.id} 정산 실패:`, txErr)
      }
    }
  } catch (err) {
    console.error('[EscrowAutoRelease]', err)
  } finally {
    isRunning = false
  }
}

export function startEscrowAutoReleaseJob() {
  runEscrowAutoRelease()
  setInterval(runEscrowAutoRelease, 60 * 60 * 1000)
}

import { txAmount } from '../lib/marketTrade'
import { prisma } from '../lib/prisma'
import { removePurchasedItems } from '../lib/tradeCancel'
import { postTxSystemMessage } from '../lib/chatTrade'
import { notify } from '../lib/notify'

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
      select: { id: true, listingId: true, buyerId: true, sellerId: true, finalPrice: true, shippingFee: true },
    })

    for (const tx of stale) {
      try {
        const cancelled = await prisma.$transaction(async t => {
          // 그 사이 발송·환불됐으면 건너뜀 (중복 환불 방지)
          const r = await t.transaction.updateMany({
            where: { id: tx.id, txStatus: 'PENDING_SHIPMENT', escrowStatus: 'HELD' },
            data: { txStatus: 'AUTO_CANCELLED', escrowStatus: 'REFUNDED' },
          })
          if (r.count === 0) return false
          // 구매자 전액 환불 + 보관함에 들어간 카드 회수
          await t.user.update({ where: { id: tx.buyerId }, data: { balance: { increment: txAmount(tx) } } })
          await removePurchasedItems(t, tx.id)
          // 상품을 다시 판매중으로 (다른 구매자가 새 거래로 살 수 있음)
          await t.listing.updateMany({
            where: { id: tx.listingId, status: 'SOLD' },
            data: { status: 'ACTIVE', reservedForId: null, reservedPrice: null, reservedAt: null },
          })
          return true
        })
        if (!cancelled) continue
        const amount = txAmount(tx)
        await postTxSystemMessage(tx.id, tx.sellerId, `판매자가 ${DEADLINE_DAYS}일 안에 발송하지 않아 거래가 자동 취소되었습니다.\n구매자에게 ${amount.toLocaleString()}P가 환불되었어요.`)
        await Promise.allSettled([
          notify({ userId: tx.buyerId, type: 'SYSTEM', title: '미발송으로 거래가 취소되었어요', body: `${amount.toLocaleString()}P가 잔액으로 돌아왔어요.`, link: `/listings/${tx.listingId}` }),
          notify({ userId: tx.sellerId, type: 'SYSTEM', title: '발송 기한이 지나 거래가 취소되었어요', body: '상품은 다시 판매중으로 바뀌었어요.', link: `/listings/${tx.listingId}` }),
        ])
        console.log(`[ShipmentDeadline] tx=${tx.id} 미발송 자동 취소 → ${tx.buyerId} 환불 ${amount}P`)
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

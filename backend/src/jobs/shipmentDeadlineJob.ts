import { Prisma } from '@prisma/client'
import { txAmount } from '../lib/marketTrade'
import { prisma } from '../lib/prisma'
import { removePurchasedItems } from '../lib/tradeCancel'
import { postTxSystemMessage } from '../lib/chatTrade'
import { notify } from '../lib/notify'
import { SHIP_DEADLINE_DAYS, ADDRESS_DEADLINE_DAYS, DAY } from '../lib/adminOps'

let isRunning = false

type StaleTx = { id: string; listingId: string; buyerId: string; sellerId: string; finalPrice: number; shippingFee: number; listing: { listingType: string } }
type Reason = 'NO_SHIP' | 'NO_ADDRESS'

const TX_SELECT = { id: true, listingId: true, buyerId: true, sellerId: true, finalPrice: true, shippingFee: true, listing: { select: { listingType: true } } } as const

// 자동 취소 + 구매자 전액 환불 + 보관함 카드 회수 + 상품 상태 복구
// - 일반 상품: 다시 판매중 (다른 구매자가 새 거래로 구매 가능)
// - 경매 상품: 이미 끝난 경매라 유찰로 — 판매중으로 되돌리면 같은 입찰로 다시 낙찰돼버림
async function autoCancel(tx: StaleTx, reason: Reason, guard: Prisma.TransactionWhereInput): Promise<boolean> {
  const isAuction = tx.listing.listingType === 'AUCTION'
  const cancelled = await prisma.$transaction(async t => {
    // 그 사이 발송·배송지 입력·환불됐으면 건너뜀 (중복 환불 방지)
    const r = await t.transaction.updateMany({
      where: { id: tx.id, txStatus: 'PENDING_SHIPMENT', escrowStatus: 'HELD', ...guard },
      data: { txStatus: 'AUTO_CANCELLED', escrowStatus: 'REFUNDED' },
    })
    if (r.count === 0) return false
    await t.user.update({ where: { id: tx.buyerId }, data: { balance: { increment: txAmount(tx) } } })
    await removePurchasedItems(t, tx.id)
    await t.listing.updateMany({
      where: { id: tx.listingId, status: 'SOLD' },
      data: isAuction
        ? { status: 'EXPIRED' }
        : { status: 'ACTIVE', reservedForId: null, reservedPrice: null, reservedAt: null },
    })
    return true
  })
  if (!cancelled) return false

  const amount = txAmount(tx).toLocaleString()
  const link = `/listings/${tx.listingId}`
  const listingNote = isAuction ? '경매 상품은 유찰 처리됐어요. 다시 올리려면 새로 등록해주세요.' : '상품은 다시 판매중으로 바뀌었어요.'
  if (reason === 'NO_SHIP') {
    await postTxSystemMessage(tx.id, tx.sellerId, `판매자가 ${SHIP_DEADLINE_DAYS}일 안에 발송하지 않아 거래가 자동 취소되었습니다.\n구매자에게 ${amount}P가 환불되었어요.`)
    await Promise.allSettled([
      notify({ userId: tx.buyerId, type: 'SYSTEM', title: '미발송으로 거래가 취소되었어요', body: `${amount}P가 잔액으로 돌아왔어요.`, link }),
      notify({ userId: tx.sellerId, type: 'SYSTEM', title: '발송 기한이 지나 거래가 취소되었어요', body: listingNote, link }),
    ])
  } else {
    await postTxSystemMessage(tx.id, tx.buyerId, `구매자가 ${ADDRESS_DEADLINE_DAYS}일 안에 배송지를 입력하지 않아 거래가 자동 취소되었습니다.\n구매자에게 ${amount}P가 환불되었어요.`)
    await Promise.allSettled([
      notify({ userId: tx.buyerId, type: 'SYSTEM', title: '배송지 미입력으로 거래가 취소되었어요', body: `${amount}P가 잔액으로 돌아왔어요.`, link }),
      notify({ userId: tx.sellerId, type: 'SYSTEM', title: '구매자가 배송지를 입력하지 않아 거래가 취소되었어요', body: listingNote, link }),
    ])
  }
  console.log(`[ShipmentDeadline] tx=${tx.id} ${reason} 자동 취소 → ${tx.buyerId} 환불 ${amount}P`)
  return true
}

export async function runShipmentDeadlineJob() {
  if (isRunning) return
  isRunning = true
  const now = Date.now()

  try {
    // 1) 배송지 확정 후 N일 안에 발송 안 함 → 판매자 사유 취소
    const noShip = await prisma.transaction.findMany({
      where: { txStatus: 'PENDING_SHIPMENT', escrowStatus: 'HELD', shipClockAt: { lt: new Date(now - SHIP_DEADLINE_DAYS * DAY) } },
      select: TX_SELECT,
    })
    for (const tx of noShip) {
      await autoCancel(tx, 'NO_SHIP', { shipClockAt: { lt: new Date(now - SHIP_DEADLINE_DAYS * DAY) } })
        .catch(err => console.error(`[ShipmentDeadline] tx=${tx.id} 처리 실패:`, err))
    }

    // 2) 경매 낙찰 후 N일 안에 배송지 입력 안 함 → 구매자 사유 취소
    const noAddress = await prisma.transaction.findMany({
      where: { txStatus: 'PENDING_SHIPMENT', escrowStatus: 'HELD', address: null, completedAt: { lt: new Date(now - ADDRESS_DEADLINE_DAYS * DAY) } },
      select: TX_SELECT,
    })
    for (const tx of noAddress) {
      await autoCancel(tx, 'NO_ADDRESS', { address: null })
        .catch(err => console.error(`[ShipmentDeadline] tx=${tx.id} 처리 실패:`, err))
    }

    // 3) 배송지 입력 마감 하루 전 알림 (1시간 주기라 1시간 구간에 걸린 거래만 → 한 번만 보냄)
    const remindFrom = new Date(now - (ADDRESS_DEADLINE_DAYS - 1) * DAY - 3600_000)
    const remindTo = new Date(now - (ADDRESS_DEADLINE_DAYS - 1) * DAY)
    const remind = await prisma.transaction.findMany({
      where: { txStatus: 'PENDING_SHIPMENT', escrowStatus: 'HELD', address: null, completedAt: { gte: remindFrom, lt: remindTo } },
      select: { id: true, buyerId: true, chatRoom: { select: { id: true } } },
    })
    await Promise.allSettled(remind.map(tx => notify({
      userId: tx.buyerId, type: 'SYSTEM', title: '배송지를 입력해주세요 (마감 24시간 전)',
      body: '배송지를 입력하지 않으면 거래가 자동 취소되고 환불돼요.',
      link: tx.chatRoom ? `/chat/${tx.chatRoom.id}` : '/my?tab=purchases',
    })))
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

import cron from 'node-cron'
import { CardCondition } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { getIo } from '../lib/socketio'
import { notify } from '../lib/notify'

let isRunning = false

async function processExpiredAuctions() {
  if (isRunning) return
  isRunning = true
  try {
    await doProcess()
  } finally {
    isRunning = false
  }
}

type SettleListing = {
  id: string
  sellerId: string
  cardId: string
  quantity: number
  condition: CardCondition
  gradingCompany: string | null
  gradingGrade: string | null
  imageUrls: string[]
}

async function trySettleWithBidder(
  listing: SettleListing,
  bidderId: string,
  bidId: string,
  amount: number,
): Promise<boolean> {
  try {
    await prisma.$transaction(async (tx) => {
      // 잔액 차감을 트랜잭션 안에서 원자적으로 처리
      const deducted = await tx.user.updateMany({
        where: { id: bidderId, balance: { gte: amount } },
        data: { balance: { decrement: amount } },
      })
      if (deducted.count === 0) throw new Error('INSUFFICIENT_BALANCE')

      // isWinning 플래그도 트랜잭션 안에서 처리 — 크래시 시 일관성 보장
      await tx.bid.updateMany({ where: { listingId: listing.id }, data: { isWinning: false } })
      await tx.bid.update({ where: { id: bidId }, data: { isWinning: true } })

      await tx.listing.update({ where: { id: listing.id }, data: { status: 'SOLD' } })
      const txRecord = await tx.transaction.create({
        data: {
          listingId: listing.id, buyerId: bidderId, sellerId: listing.sellerId,
          finalPrice: amount, escrowStatus: 'HELD',
        },
      })
      await tx.inventoryItem.create({
        data: {
          userId: bidderId, cardId: listing.cardId, quantity: listing.quantity,
          source: 'PURCHASE', sourceId: txRecord.id,
          condition: listing.condition, gradingCompany: listing.gradingCompany,
          gradingGrade: listing.gradingGrade, imageUrls: listing.imageUrls,
        },
      })
      await tx.chatRoom.upsert({
        where: { listingId_buyerId: { listingId: listing.id, buyerId: bidderId } },
        create: { listingId: listing.id, buyerId: bidderId, sellerId: listing.sellerId, transactionId: txRecord.id },
        update: { transactionId: txRecord.id },
      })
    })
    return true
  } catch (err) {
    if (err instanceof Error && err.message !== 'INSUFFICIENT_BALANCE') {
      console.error(`[AuctionExpiry] listingId=${listing.id} 정산 실패:`, err)
    }
    return false
  }
}

async function doProcess() {
  const now = new Date()

  const expiredListings = await prisma.listing.findMany({
    where: { listingType: 'AUCTION', status: 'ACTIVE', auctionEndsAt: { lte: now } },
    include: {
      bids: {
        orderBy: { amount: 'desc' },
        include: { bidder: { select: { id: true, balance: true, nickname: true } } },
      },
    },
  })

  if (expiredListings.length === 0) return

  for (const listing of expiredListings) {
    if (listing.bids.length === 0) {
      await prisma.listing.update({ where: { id: listing.id }, data: { status: 'EXPIRED' } })
      getIo()?.to(`listing:${listing.id}`).emit('auction:expired', { listingId: listing.id })
      continue
    }

    const settleListing: SettleListing = {
      id: listing.id,
      sellerId: listing.sellerId,
      cardId: listing.cardId,
      quantity: listing.quantity,
      condition: listing.condition,
      gradingCompany: listing.gradingCompany,
      gradingGrade: listing.gradingGrade,
      imageUrls: listing.imageUrls,
    }

    let settled = false
    for (const bid of listing.bids) {
      if (!bid.bidder) continue  // FK 보호로 발생하지 않지만 방어적 처리

      const ok = await trySettleWithBidder(settleListing, bid.bidder.id, bid.id, bid.amount)
      if (ok) {
        getIo()?.to(`listing:${listing.id}`).emit('auction:sold', {
          listingId: listing.id,
          winnerId: bid.bidder.id,
          winnerNickname: bid.bidder.nickname,
          finalPrice: bid.amount,
          isRunnerUp: bid !== listing.bids[0],
        })
        notify({
          userId: bid.bidder.id,
          type: 'BID_WON',
          title: '경매에 낙찰되셨습니다!',
          body: `${bid.amount.toLocaleString()}P에 낙찰되었습니다. 거래를 진행해 주세요.`,
          link: '/my?tab=purchases',
        })
        settled = true
        break
      }
    }

    if (!settled) {
      await prisma.listing.update({ where: { id: listing.id }, data: { status: 'EXPIRED' } })
      getIo()?.to(`listing:${listing.id}`).emit('auction:expired', {
        listingId: listing.id,
        reason: '모든 입찰자 잔액 부족',
      })
    }
  }
}

export function startAuctionExpiryJob() {
  cron.schedule('* * * * *', () => {
    processExpiredAuctions().catch((err) =>
      console.error('[AuctionExpiry] 스케줄 실행 오류:', err)
    )
  })
  console.log('[AuctionExpiry] 경매 자동 마감 잡 시작됨 (1분 주기)')
}

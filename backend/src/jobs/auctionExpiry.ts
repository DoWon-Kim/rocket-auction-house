import cron from 'node-cron'
import { prisma } from '../lib/prisma'
import { getIo } from '../lib/socketio'
import { createAuctionTrade, announceAuctionWin, InsufficientBalanceError, type AuctionListing } from '../lib/auctionTrade'

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

// 이 입찰자로 낙찰 정산 시도 — 잔액(낙찰가 + 배송비)이 모자라면 false → 다음 순위 입찰자로
async function trySettleWithBidder(listing: AuctionListing, bidderId: string, bidId: string, amount: number): Promise<string | null> {
  try {
    const won = await prisma.$transaction(async (tx) => {
      // 그 사이 즉시낙찰 등으로 이미 팔렸으면 중단
      const sold = await tx.listing.updateMany({ where: { id: listing.id, status: 'ACTIVE' }, data: { status: 'SOLD' } })
      if (sold.count === 0) throw new Error('ALREADY_SOLD')
      // isWinning 플래그도 트랜잭션 안에서 처리 — 크래시 시 일관성 보장
      await tx.bid.updateMany({ where: { listingId: listing.id }, data: { isWinning: false } })
      await tx.bid.update({ where: { id: bidId }, data: { isWinning: true } })
      return createAuctionTrade(tx, listing, bidderId, amount)
    })
    return won.roomId
  } catch (err) {
    if (!(err instanceof InsufficientBalanceError) && !(err instanceof Error && err.message === 'ALREADY_SOLD')) {
      console.error(`[AuctionExpiry] listingId=${listing.id} 정산 실패:`, err)
    }
    return null
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

    let settled = false
    for (const bid of listing.bids) {
      if (!bid.bidder) continue  // FK 보호로 발생하지 않지만 방어적 처리

      const roomId = await trySettleWithBidder(listing, bid.bidder.id, bid.id, bid.amount)
      if (roomId) {
        getIo()?.to(`listing:${listing.id}`).emit('auction:sold', {
          listingId: listing.id,
          winnerId: bid.bidder.id,
          winnerNickname: bid.bidder.nickname,
          finalPrice: bid.amount,
          isRunnerUp: bid !== listing.bids[0],
        })
        await announceAuctionWin({ listingId: listing.id, sellerId: listing.sellerId, buyerId: bid.bidder.id, amount: bid.amount, shippingFee: listing.shippingFee, roomId })
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

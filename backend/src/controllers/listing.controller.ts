import { Response } from 'express'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { getIo } from '../lib/socketio'
import { notify } from '../lib/notify'

const GRADING_COMPANIES = ['PSA', 'BGS', 'CGC', 'SGC', 'HGA', 'ACE', '기타'] as const

const createListingSchema = z.object({
  cardId: z.string().uuid(),
  listingType: z.enum(['BUY_NOW', 'AUCTION', 'OFFER']),
  condition: z.enum(['MINT', 'NEAR_MINT', 'EXCELLENT', 'GOOD', 'LIGHT_PLAYED', 'PLAYED', 'POOR']),
  quantity: z.number().int().min(1).default(1),
  description: z.string().optional(),
  imageUrls: z.array(z.string().url()).max(5).optional(),
  buyNowPrice: z.number().int().min(1).optional(),
  startingPrice: z.number().int().min(1).optional(),
  auctionEndsAt: z.string().datetime().optional(),
  instantBuyPrice: z.number().int().min(1).optional(),   // 경매 즉시낙찰가
  autoExtendMinutes: z.number().int().min(1).max(60).optional(), // 스나이핑 방지
  maxAutoExtends: z.number().int().min(1).max(10).optional(),
  minOfferPrice: z.number().int().min(1).optional(),
  gradingCompany: z.enum(GRADING_COMPANIES).optional(),
  gradingGrade: z.string().max(20).optional(),
})

export async function getListings(req: AuthRequest, res: Response) {
  try {
    const type = req.query.type as string | undefined
    const tcgType = req.query.tcgType as string | undefined
    const cardName = req.query.cardName as string | undefined
    const minPrice = req.query.minPrice as string | undefined
    const maxPrice = req.query.maxPrice as string | undefined
    const sort = req.query.sort as string | undefined
    const sellerId = req.query.sellerId as string | undefined
    const condition = req.query.condition as string | undefined
    const gradingCompany = req.query.gradingCompany as string | undefined
    const hasGrading = req.query.hasGrading as string | undefined
    const rawPage = Number(req.query.page)
    const rawLimit = Number(req.query.limit)
    const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 100) : 20

    const where: Record<string, unknown> = { status: 'ACTIVE' }
    if (type) where.listingType = type
    if (sellerId) where.sellerId = sellerId
    if (condition) where.condition = condition
    if (hasGrading === 'true') where.gradingCompany = { not: null }
    if (gradingCompany) where.gradingCompany = gradingCompany

    if (tcgType || cardName) {
      where.card = {
        ...(tcgType ? { tcgType } : {}),
        ...(cardName ? {
          OR: [
            { name:       { contains: cardName, mode: 'insensitive' } },
            { nameKo:     { contains: cardName, mode: 'insensitive' } },
            { nameJa:     { contains: cardName, mode: 'insensitive' } },
            { cardNumber: { contains: cardName, mode: 'insensitive' } },
            { setCode:    { contains: cardName, mode: 'insensitive' } },
          ],
        } : {}),
      }
    }
    if (minPrice || maxPrice) {
      const priceRange: { gte?: number; lte?: number } = {}
      if (minPrice) priceRange.gte = Number(minPrice)
      if (maxPrice) priceRange.lte = Number(maxPrice)
      if (type === 'BUY_NOW') {
        where.buyNowPrice = priceRange
      } else if (type === 'AUCTION') {
        where.currentPrice = priceRange
      } else if (type === 'OFFER') {
        where.minOfferPrice = priceRange
      } else {
        where.OR = [
          { buyNowPrice: priceRange },
          { currentPrice: priceRange },
          { minOfferPrice: priceRange },
        ]
      }
    }

    const orderBy = ((): Prisma.ListingOrderByWithRelationInput | Prisma.ListingOrderByWithRelationInput[] => {
      if (sort === 'price_asc' || sort === 'price_desc') {
        const dir = sort === 'price_asc' ? 'asc' as const : 'desc' as const
        if (type === 'AUCTION') return { currentPrice: dir }
        if (type === 'OFFER')   return { minOfferPrice: dir }
        return { buyNowPrice: dir }
      }
      if (sort === 'ending_soon') return { auctionEndsAt: 'asc' as const }
      if (sort === 'popular')     return { viewCount: 'desc' as const }
      if (sort === 'bid_count')   return [{ bids: { _count: 'desc' as const } }, { createdAt: 'desc' as const }]
      return { createdAt: 'desc' as const }
    })()

    const skip = (page - 1) * limit
    const [listings, total] = await Promise.all([
      prisma.listing.findMany({
        where,
        include: {
          card: { select: { id: true, name: true, nameKo: true, imageUrl: true, rarity: true, tcgType: true, setName: true, setCode: true, cardNumber: true, cardTypes: true, supertype: true } },
          seller: { select: { id: true, nickname: true, avatarUrl: true, avgRating: true, reviewCount: true } },
          _count: { select: { bids: true, offers: true } },
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.listing.count({ where }),
    ])

    res.json({ listings, total, page, limit })
  } catch (err) {
    console.error('[getListings]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

export async function getListing(req: AuthRequest, res: Response) {
  try {
    const listingId = String(req.params['id'])

    const [listing] = await Promise.all([
      prisma.listing.findUnique({
        where: { id: listingId },
        include: {
          card: true,
          seller: { select: { id: true, nickname: true, avatarUrl: true, avgRating: true, reviewCount: true } },
          bids: {
            include: { bidder: { select: { id: true, nickname: true } } },
            orderBy: { amount: 'desc' },
            take: 10,
          },
          offers: req.userId
            ? { where: { buyerId: req.userId }, orderBy: { createdAt: 'desc' } }
            : undefined,
        },
      }),
    ])

    if (!listing) {
      res.status(404).json({ message: '리스팅을 찾을 수 없습니다.' })
      return
    }

    // 조회수 비동기 증가
    prisma.listing.update({ where: { id: listingId }, data: { viewCount: { increment: 1 } } }).catch(() => {})

    const [totalSales, completedSales, cardMarketStats] = await Promise.all([
      prisma.transaction.count({ where: { sellerId: listing.seller.id } }),
      prisma.transaction.count({
        where: {
          sellerId: listing.seller.id,
          txStatus: { in: ['COMPLETED', 'AUTO_COMPLETED'] },
        },
      }),
      // 이 카드의 시장 현황 — 활성 리스팅 기준
      prisma.listing.aggregate({
        where: { cardId: listing.cardId, status: 'ACTIVE' },
        _count: true,
        _min: { buyNowPrice: true, currentPrice: true, minOfferPrice: true },
        _max: { buyNowPrice: true, currentPrice: true, minOfferPrice: true },
        _avg: { buyNowPrice: true },
      }),
    ])

    // 최근 30일 체결가 평균
    const recentAvg = await prisma.transaction.aggregate({
      where: {
        listing: { cardId: listing.cardId },
        completedAt: { gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) },
      },
      _avg: { finalPrice: true },
      _count: true,
    })

    res.json({
      ...listing,
      sellerStats: {
        totalSales,
        completedSales,
        completionRate: totalSales > 0 ? Math.round((completedSales / totalSales) * 100) : null,
      },
      cardMarket: {
        activeCount: cardMarketStats._count,
        minPrice: cardMarketStats._min.buyNowPrice ?? cardMarketStats._min.currentPrice ?? cardMarketStats._min.minOfferPrice,
        maxPrice: cardMarketStats._max.buyNowPrice ?? cardMarketStats._max.currentPrice ?? cardMarketStats._max.minOfferPrice,
        avgBuyNow: cardMarketStats._avg.buyNowPrice ? Math.round(cardMarketStats._avg.buyNowPrice) : null,
        recentAvgPrice: recentAvg._avg.finalPrice ? Math.round(recentAvg._avg.finalPrice) : null,
        recentTxCount: recentAvg._count,
      },
    })
  } catch (err) {
    console.error('[getListing]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

export async function createListing(req: AuthRequest, res: Response) {
  const result = createListingSchema.safeParse(req.body)
  if (!result.success) {
    res.status(400).json({ message: '입력값 오류', errors: result.error.flatten() })
    return
  }
  const data = result.data

  if (data.listingType === 'BUY_NOW' && !data.buyNowPrice) {
    res.status(400).json({ message: '즉시구매가를 입력해주세요.' })
    return
  }
  if (data.listingType === 'AUCTION' && (!data.startingPrice || !data.auctionEndsAt)) {
    res.status(400).json({ message: '경매 시작가와 종료 시간을 입력해주세요.' })
    return
  }
  if (data.listingType === 'OFFER' && !data.minOfferPrice) {
    res.status(400).json({ message: '최소 제안가를 입력해주세요.' })
    return
  }
  if (data.instantBuyPrice && data.startingPrice && data.instantBuyPrice <= data.startingPrice) {
    res.status(400).json({ message: '즉시낙찰가는 시작가보다 높아야 합니다.' })
    return
  }

  try {
    const listing = await prisma.listing.create({
      data: {
        sellerId: req.userId!,
        cardId: data.cardId,
        listingType: data.listingType,
        condition: data.condition,
        quantity: data.quantity,
        description: data.description,
        imageUrls: data.imageUrls ?? [],
        buyNowPrice: data.buyNowPrice,
        startingPrice: data.startingPrice,
        currentPrice: data.startingPrice,
        auctionEndsAt: data.auctionEndsAt ? new Date(data.auctionEndsAt) : undefined,
        instantBuyPrice: data.listingType === 'AUCTION' ? data.instantBuyPrice : undefined,
        autoExtendMinutes: data.listingType === 'AUCTION' ? data.autoExtendMinutes : undefined,
        maxAutoExtends: data.listingType === 'AUCTION' ? (data.maxAutoExtends ?? 3) : undefined,
        minOfferPrice: data.minOfferPrice,
        gradingCompany: data.gradingCompany ?? null,
        gradingGrade: data.gradingCompany ? (data.gradingGrade ?? null) : null,
      },
      include: { card: true },
    })

    // 위시리스트 가격 알림 — 비동기
    ;(async () => {
      try {
        const listingPrice = data.buyNowPrice ?? data.minOfferPrice ?? data.startingPrice
        if (!listingPrice) return

        const alerts = await prisma.wishlist.findMany({
          where: {
            cardId: data.cardId,
            userId: { not: req.userId! },
            targetPrice: { gte: listingPrice },
          },
          select: { userId: true, targetPrice: true },
        })

        const cardName = listing.card.nameKo ?? listing.card.name
        await Promise.allSettled(alerts.map(alert =>
          notify({
            userId: alert.userId,
            type: 'WISHLIST_PRICE_ALERT',
            title: '위시리스트 가격 알림',
            body: `${cardName} — 목표가(${alert.targetPrice!.toLocaleString()}P) 이하 리스팅이 등록되었습니다. (${listingPrice.toLocaleString()}P)`,
            link: `/listings/${listing.id}`,
          })
        ))
      } catch (e) {
        console.error('[wishlist-alert]', e)
      }
    })()

    res.status(201).json(listing)
  } catch (err) {
    console.error('[createListing]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

export async function buyNow(req: AuthRequest, res: Response) {
  try {
    // 사전 빠른 유효성 검사 (트랜잭션 밖에서)
    const listing = await prisma.listing.findUnique({ where: { id: String(req.params['id']) } })
    if (!listing || listing.listingType !== 'BUY_NOW' || listing.status !== 'ACTIVE') {
      res.status(400).json({ message: '구매할 수 없는 리스팅입니다.' }); return
    }
    if (listing.sellerId === req.userId) {
      res.status(400).json({ message: '본인 리스팅은 구매할 수 없습니다.' }); return
    }

    const price = listing.buyNowPrice!

    // 모든 작업을 단일 트랜잭션으로 — 실패 시 자동 롤백 (잔액 포함)
    await prisma.$transaction(async (tx) => {
      // 잔액 차감 + 충분한지 원자적 확인
      const deducted = await tx.user.updateMany({
        where: { id: req.userId!, balance: { gte: price } },
        data: { balance: { decrement: price } },
      })
      if (deducted.count === 0) {
        throw Object.assign(new Error('INSUFFICIENT_BALANCE'), { status: 400, message: '잔액이 부족합니다.' })
      }

      // 리스팅 상태 변경 — ACTIVE인 경우만 (동시 구매 방지)
      const updated = await tx.listing.updateMany({
        where: { id: listing.id, status: 'ACTIVE' },
        data: { status: 'SOLD' },
      })
      if (updated.count === 0) {
        throw Object.assign(new Error('ALREADY_SOLD'), { status: 400, message: '이미 판매된 리스팅입니다.' })
      }

      const txRecord = await tx.transaction.create({
        data: {
          listingId: listing.id, buyerId: req.userId!, sellerId: listing.sellerId,
          finalPrice: price, escrowStatus: 'HELD',
        },
      })
      await tx.inventoryItem.create({
        data: {
          userId: req.userId!, cardId: listing.cardId, quantity: listing.quantity,
          source: 'PURCHASE', sourceId: txRecord.id,
          condition: listing.condition, gradingCompany: listing.gradingCompany,
          gradingGrade: listing.gradingGrade, imageUrls: listing.imageUrls,
        },
      })
      await tx.chatRoom.upsert({
        where: { listingId_buyerId: { listingId: listing.id, buyerId: req.userId! } },
        create: { listingId: listing.id, buyerId: req.userId!, sellerId: listing.sellerId, transactionId: txRecord.id },
        update: { transactionId: txRecord.id },
      })
    })

    res.json({ message: '구매가 완료되었습니다. 물품 수령 후 수령 확인을 눌러주세요.' })
  } catch (err) {
    const e = err as { status?: number; message?: string }
    if (e.status === 400) { res.status(400).json({ message: e.message }); return }
    console.error('[buyNow]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

export async function placeBid(req: AuthRequest, res: Response) {
  const { amount } = req.body
  if (!amount || typeof amount !== 'number') {
    res.status(400).json({ message: '입찰 금액을 입력해주세요.' })
    return
  }

  try {
    const listing = await prisma.listing.findUnique({ where: { id: String(req.params['id']) } })
    if (!listing || listing.listingType !== 'AUCTION' || listing.status !== 'ACTIVE') {
      res.status(400).json({ message: '입찰할 수 없는 리스팅입니다.' })
      return
    }
    if (listing.sellerId === req.userId) {
      res.status(400).json({ message: '본인 리스팅에는 입찰할 수 없습니다.' })
      return
    }
    const now = new Date()
    if (listing.auctionEndsAt && now > listing.auctionEndsAt) {
      res.status(400).json({ message: '경매가 종료되었습니다.' })
      return
    }
    if (amount <= (listing.currentPrice ?? 0)) {
      res.status(400).json({ message: `현재가(${listing.currentPrice?.toLocaleString()}P)보다 높은 금액을 입찰해주세요.` })
      return
    }

    const bidder = await prisma.user.findUnique({ where: { id: req.userId }, select: { nickname: true, balance: true } })

    const prevWinningBid = await prisma.bid.findFirst({
      where: { listingId: listing.id, isWinning: true },
      select: { bidderId: true },
    })

    // ── 즉시낙찰 처리 ────────────────────────────────────────────────────────
    if (listing.instantBuyPrice != null && amount >= listing.instantBuyPrice) {
      await prisma.$transaction(async (tx) => {
        const deducted = await tx.user.updateMany({
          where: { id: req.userId!, balance: { gte: amount } },
          data: { balance: { decrement: amount } },
        })
        if (deducted.count === 0) {
          throw Object.assign(new Error('INSUFFICIENT_BALANCE'), { status: 400, message: '잔액이 부족합니다.' })
        }
        const sold = await tx.listing.updateMany({
          where: { id: listing.id, status: 'ACTIVE' },
          data: { currentPrice: amount, status: 'SOLD' },
        })
        if (sold.count === 0) {
          throw Object.assign(new Error('ALREADY_SOLD'), { status: 400, message: '이미 판매된 리스팅입니다.' })
        }
        await tx.bid.updateMany({ where: { listingId: listing.id }, data: { isWinning: false } })
        await tx.bid.create({ data: { listingId: listing.id, bidderId: req.userId!, amount, isWinning: true } })
        const txRecord = await tx.transaction.create({
          data: {
            listingId: listing.id, buyerId: req.userId!, sellerId: listing.sellerId,
            finalPrice: amount, escrowStatus: 'HELD',
          },
        })
        await tx.inventoryItem.create({
          data: {
            userId: req.userId!, cardId: listing.cardId, quantity: listing.quantity,
            source: 'PURCHASE', sourceId: txRecord.id,
            condition: listing.condition, gradingCompany: listing.gradingCompany,
            gradingGrade: listing.gradingGrade, imageUrls: listing.imageUrls,
          },
        })
        await tx.chatRoom.upsert({
          where: { listingId_buyerId: { listingId: listing.id, buyerId: req.userId! } },
          create: { listingId: listing.id, buyerId: req.userId!, sellerId: listing.sellerId, transactionId: txRecord.id },
          update: { transactionId: txRecord.id },
        })
      })
      getIo()?.to(`listing:${listing.id}`).emit('auction:sold', {
        listingId: listing.id, winnerId: req.userId, finalPrice: amount, isInstantBuy: true,
      })
      res.json({ message: '즉시낙찰되었습니다!', currentPrice: amount, instantBuy: true })
      return
    }

    // ── 일반 입찰: 스나이핑 방지 자동연장 ────────────────────────────────────
    let newEndsAt = listing.auctionEndsAt
    let extended = false

    if (
      listing.auctionEndsAt &&
      listing.autoExtendMinutes != null &&
      listing.autoExtendCount < listing.maxAutoExtends
    ) {
      const minutesLeft = (listing.auctionEndsAt.getTime() - now.getTime()) / 60000
      if (minutesLeft < listing.autoExtendMinutes) {
        newEndsAt = new Date(listing.auctionEndsAt.getTime() + listing.autoExtendMinutes * 60000)
        extended = true
      }
    }

    // ── 자동 입찰 정산 ────────────────────────────────────────────────────────
    const autoBids = await prisma.autoBid.findMany({
      where: { listingId: listing.id, isActive: true },
      orderBy: { maxAmount: 'desc' },
      include: { bidder: { select: { id: true, nickname: true } } },
    })

    const myAutoBid    = autoBids.find(ab => ab.bidderId === req.userId)
    const otherAutoBid = autoBids.find(ab => ab.bidderId !== req.userId)

    let finalPrice    = amount
    let finalWinnerId = req.userId!
    let autoWinnerNickname: string | null = null
    let outbidUserId: string | null = null

    if (otherAutoBid && otherAutoBid.maxAmount > amount) {
      if (myAutoBid && myAutoBid.maxAmount >= otherAutoBid.maxAmount) {
        // 내 자동 입찰이 더 높음 → 내가 승리
        finalPrice    = Math.min(otherAutoBid.maxAmount + 1, myAutoBid.maxAmount)
        finalWinnerId = req.userId!
        outbidUserId  = otherAutoBid.bidderId
      } else {
        // 경쟁자 자동 입찰이 더 높음 → 경쟁자 승리
        finalPrice         = myAutoBid ? Math.min(myAutoBid.maxAmount + 1, otherAutoBid.maxAmount) : amount + 1
        finalWinnerId      = otherAutoBid.bidderId
        autoWinnerNickname = otherAutoBid.bidder.nickname
        outbidUserId       = req.userId!
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.bid.updateMany({ where: { listingId: listing.id }, data: { isWinning: false } })
      await tx.bid.create({
        data: {
          listingId: listing.id,
          bidderId:  req.userId!,
          amount,
          isWinning: finalWinnerId === req.userId && finalPrice === amount,
        },
      })
      if (finalPrice !== amount) {
        await tx.bid.create({
          data: {
            listingId: listing.id,
            bidderId:  finalWinnerId,
            amount:    finalPrice,
            isAuto:    true,
            isWinning: true,
          },
        })
      } else {
        await tx.bid.updateMany({
          where: { listingId: listing.id, bidderId: req.userId!, amount },
          data: { isWinning: true },
        })
      }
      await tx.listing.update({
        where: { id: listing.id },
        data: {
          currentPrice: finalPrice,
          ...(extended
            ? { auctionEndsAt: newEndsAt, autoExtendCount: { increment: 1 } }
            : {}),
        },
      })
    })

    // 밀린 입찰자 알림
    const outbidTarget = outbidUserId ?? (prevWinningBid?.bidderId !== req.userId ? prevWinningBid?.bidderId : null)
    if (outbidTarget) {
      notify({
        userId: outbidTarget,
        type: 'BID_OUTBID',
        title: '입찰이 밀렸습니다',
        body: autoWinnerNickname
          ? `자동 입찰로 ${finalPrice.toLocaleString()}P에 재입찰되었습니다.`
          : `${bidder?.nickname ?? '다른 사용자'}님이 ${finalPrice.toLocaleString()}P에 재입찰했습니다.`,
        link: `/listings/${listing.id}`,
      }).catch(e => console.error('[notify BID_OUTBID]', e))
    }

    getIo()?.to(`listing:${listing.id}`).emit('bid:placed', {
      listingId: listing.id,
      amount: finalPrice,
      currentPrice: finalPrice,
      bidderNickname: autoWinnerNickname ?? bidder?.nickname ?? '익명',
      isAuto: finalPrice !== amount,
      ...(extended ? { newEndsAt: newEndsAt?.toISOString(), extended: true, extendMinutes: listing.autoExtendMinutes } : {}),
    })

    const isAutoWin = finalWinnerId !== req.userId
    res.json({
      message: isAutoWin
        ? `자동 입찰에 의해 ${finalPrice.toLocaleString()}P로 밀렸습니다. 금액을 높여 재입찰하세요.`
        : extended
          ? `입찰 완료! 경매가 ${listing.autoExtendMinutes}분 연장되었습니다.`
          : '입찰이 완료되었습니다.',
      currentPrice: finalPrice,
      outbid: isAutoWin,
      ...(extended ? { newEndsAt: newEndsAt?.toISOString(), extended: true } : {}),
    })
  } catch (err) {
    console.error('[placeBid]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// ── POST /listings/:id/auto-bid ────────────────────────────────────────────────
export async function setAutoBid(req: AuthRequest, res: Response) {
  const { maxAmount } = req.body
  if (!maxAmount || typeof maxAmount !== 'number' || maxAmount < 1) {
    res.status(400).json({ message: '최대 입찰 금액을 입력해주세요.' })
    return
  }

  try {
    const listing = await prisma.listing.findUnique({ where: { id: String(req.params['id']) } })
    if (!listing || listing.listingType !== 'AUCTION' || listing.status !== 'ACTIVE') {
      res.status(400).json({ message: '자동 입찰 설정이 불가한 리스팅입니다.' })
      return
    }
    if (listing.sellerId === req.userId) {
      res.status(400).json({ message: '본인 리스팅에는 자동 입찰을 설정할 수 없습니다.' })
      return
    }
    const currentPrice = listing.currentPrice ?? listing.startingPrice ?? 0
    if (maxAmount <= currentPrice) {
      res.status(400).json({ message: `현재가(${currentPrice.toLocaleString()}P)보다 높은 금액을 설정해주세요.` })
      return
    }

    // 자동 입찰 등록/업데이트
    const autoBid = await prisma.autoBid.upsert({
      where: { listingId_bidderId: { listingId: listing.id, bidderId: req.userId! } },
      create: { listingId: listing.id, bidderId: req.userId!, maxAmount, isActive: true },
      update: { maxAmount, isActive: true },
    })

    // 즉시 자동 입찰 발동: 현재가보다 내 최대가가 높으면 바로 입찰
    const otherAutoBids = await prisma.autoBid.findMany({
      where: { listingId: listing.id, isActive: true, bidderId: { not: req.userId! } },
      orderBy: { maxAmount: 'desc' },
    })
    const prevWinner = await prisma.bid.findFirst({
      where: { listingId: listing.id, isWinning: true },
      select: { bidderId: true, amount: true },
    })

    let fireAmount = currentPrice + 1
    let iWin = true
    const bestOther = otherAutoBids[0]

    if (bestOther && bestOther.maxAmount >= maxAmount) {
      // 경쟁 자동 입찰이 더 높음 → 나는 지금 1P 높여봤자 질 운명
      fireAmount = Math.min(maxAmount, bestOther.maxAmount + 1)
      if (fireAmount > maxAmount) { iWin = false }
    } else if (bestOther) {
      fireAmount = Math.min(bestOther.maxAmount + 1, maxAmount)
    }

    if (iWin && fireAmount > currentPrice) {
      await prisma.$transaction([
        prisma.bid.updateMany({ where: { listingId: listing.id }, data: { isWinning: false } }),
        prisma.bid.create({ data: { listingId: listing.id, bidderId: req.userId!, amount: fireAmount, isAuto: true, isWinning: true } }),
        prisma.listing.update({ where: { id: listing.id }, data: { currentPrice: fireAmount } }),
      ])

      if (prevWinner && prevWinner.bidderId !== req.userId) {
        const bidder = await prisma.user.findUnique({ where: { id: req.userId! }, select: { nickname: true } })
        notify({
          userId: prevWinner.bidderId,
          type: 'BID_OUTBID',
          title: '자동 입찰에 밀렸습니다',
          body: `${bidder?.nickname ?? '다른 사용자'}님의 자동 입찰로 현재가가 ${fireAmount.toLocaleString()}P가 되었습니다.`,
          link: `/listings/${listing.id}`,
        }).catch(() => {})
      }

      getIo()?.to(`listing:${listing.id}`).emit('bid:placed', {
        listingId: listing.id, amount: fireAmount, currentPrice: fireAmount, isAuto: true,
        bidderNickname: '자동입찰',
      })
    }

    res.json({ autoBid, message: `자동 입찰이 설정되었습니다. 최대 ${maxAmount.toLocaleString()}P까지 자동으로 입찰됩니다.` })
  } catch (err) {
    console.error('[setAutoBid]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// ── DELETE /listings/:id/auto-bid ──────────────────────────────────────────────
export async function cancelAutoBid(req: AuthRequest, res: Response) {
  try {
    await prisma.autoBid.updateMany({
      where: { listingId: String(req.params['id']), bidderId: req.userId! },
      data: { isActive: false },
    })
    res.json({ message: '자동 입찰이 취소되었습니다.' })
  } catch (err) {
    console.error('[cancelAutoBid]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// ── GET /listings/:id/auto-bid ─────────────────────────────────────────────────
export async function getAutoBid(req: AuthRequest, res: Response) {
  try {
    const autoBid = await prisma.autoBid.findUnique({
      where: { listingId_bidderId: { listingId: String(req.params['id']), bidderId: req.userId! } },
    })
    res.json({ autoBid: autoBid?.isActive ? autoBid : null })
  } catch (err) {
    console.error('[getAutoBid]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

export async function makeOffer(req: AuthRequest, res: Response) {
  const { amount, message } = req.body
  if (!amount || typeof amount !== 'number') {
    res.status(400).json({ message: '제안 금액을 입력해주세요.' })
    return
  }

  try {
    const listing = await prisma.listing.findUnique({ where: { id: String(req.params['id']) } })
    if (!listing || listing.listingType !== 'OFFER' || listing.status !== 'ACTIVE') {
      res.status(400).json({ message: '제안할 수 없는 리스팅입니다.' })
      return
    }
    if (listing.sellerId === req.userId) {
      res.status(400).json({ message: '본인 리스팅에는 제안할 수 없습니다.' })
      return
    }
    if (listing.minOfferPrice && amount < listing.minOfferPrice) {
      res.status(400).json({ message: `최소 제안가(${listing.minOfferPrice.toLocaleString()}P)보다 높은 금액을 제안해주세요.` })
      return
    }

    const [offer, buyer] = await Promise.all([
      prisma.offer.create({ data: { listingId: listing.id, buyerId: req.userId!, amount, message } }),
      prisma.user.findUnique({ where: { id: req.userId! }, select: { nickname: true } }),
    ])

    notify({
      userId: listing.sellerId,
      type: 'OFFER_RECEIVED',
      title: '새 제안이 도착했습니다',
      body: `${buyer?.nickname ?? '구매자'}님이 ${amount.toLocaleString()}P를 제안했습니다.`,
      link: `/listings/${listing.id}`,
    }).catch(e => console.error('[notify OFFER_RECEIVED]', e))

    res.status(201).json(offer)
  } catch (err) {
    console.error('[makeOffer]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

export async function respondToOffer(req: AuthRequest, res: Response) {
  const { offerId } = req.params
  const { action } = req.body

  try {
    const offer = await prisma.offer.findUnique({ where: { id: String(offerId) } })
    if (!offer) { res.status(404).json({ message: '제안을 찾을 수 없습니다.' }); return }

    const offerListing = await prisma.listing.findUnique({ where: { id: offer.listingId }, select: { sellerId: true } })
    if (!offerListing || offerListing.sellerId !== req.userId) {
      res.status(403).json({ message: '권한이 없습니다.' })
      return
    }
    if (offer.status !== 'PENDING') {
      res.status(400).json({ message: '이미 처리된 제안입니다.' })
      return
    }

    if (action === 'ACCEPTED') {
      const fullListing = await prisma.listing.findUnique({ where: { id: offer.listingId } })
      if (!fullListing) {
        res.status(404).json({ message: '리스팅을 찾을 수 없습니다.' })
        return
      }
      await prisma.$transaction(async (tx) => {
        const balanceUpdated = await tx.user.updateMany({
          where: { id: offer.buyerId, balance: { gte: offer.amount } },
          data: { balance: { decrement: offer.amount } },
        })
        if (balanceUpdated.count === 0) {
          throw Object.assign(new Error('BALANCE'), { status: 400, message: '구매자의 잔액이 부족합니다.' })
        }
        await tx.offer.update({ where: { id: String(offerId) }, data: { status: 'ACCEPTED' } })
        await tx.offer.updateMany({
          where: { listingId: offer.listingId, id: { not: String(offerId) }, status: 'PENDING' },
          data: { status: 'DECLINED' },
        })
        await tx.listing.update({ where: { id: offer.listingId }, data: { status: 'SOLD' } })
        const txRecord = await tx.transaction.create({
          data: {
            listingId: offer.listingId, buyerId: offer.buyerId, sellerId: req.userId!,
            finalPrice: offer.amount, escrowStatus: 'HELD',
          },
        })
        await tx.inventoryItem.create({
          data: {
            userId: offer.buyerId, cardId: fullListing.cardId, quantity: fullListing.quantity,
            source: 'PURCHASE', sourceId: txRecord.id,
            condition: fullListing.condition, gradingCompany: fullListing.gradingCompany,
            gradingGrade: fullListing.gradingGrade, imageUrls: fullListing.imageUrls,
          },
        })
        await tx.chatRoom.upsert({
          where: { listingId_buyerId: { listingId: offer.listingId, buyerId: offer.buyerId } },
          create: { listingId: offer.listingId, buyerId: offer.buyerId, sellerId: req.userId!, transactionId: txRecord.id },
          update: { transactionId: txRecord.id },
        })
      })
    } else {
      await prisma.offer.update({ where: { id: String(offerId) }, data: { status: 'DECLINED' } })
    }

    if (action === 'ACCEPTED') {
      notify({
        userId: offer.buyerId,
        type: 'OFFER_ACCEPTED',
        title: '제안이 수락되었습니다',
        body: `${offer.amount.toLocaleString()}P 제안이 수락되었습니다. 거래를 진행해 주세요.`,
        link: '/my?tab=purchases',
      }).catch(e => console.error('[notify OFFER_ACCEPTED]', e))
    } else {
      notify({
        userId: offer.buyerId,
        type: 'OFFER_REJECTED',
        title: '제안이 거절되었습니다',
        body: `${offer.amount.toLocaleString()}P 제안이 거절되었습니다.`,
        link: '/my?tab=offers-sent',
      }).catch(e => console.error('[notify OFFER_REJECTED]', e))
    }

    res.json({ message: action === 'ACCEPTED' ? '제안을 수락했습니다.' : '제안을 거절했습니다.' })
  } catch (err) {
    const e = err as { status?: number; message?: string }
    if (e.status) { res.status(e.status).json({ message: e.message }); return }
    console.error('[respondToOffer]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// ── 시장 현황 요약 ─────────────────────────────────────────────────────────────
export async function getMarketSummary(req: AuthRequest, res: Response) {
  try {
    const now = new Date()
    const since24h = new Date(now.getTime() - 24 * 3600 * 1000)
    const since7d  = new Date(now.getTime() - 7 * 24 * 3600 * 1000)

    const [
      activeCount,
      activeAuctions,
      tx24h,
      tx7d,
      topCards,
      recentDeals,
    ] = await Promise.all([
      // 활성 리스팅 수
      prisma.listing.count({ where: { status: 'ACTIVE' } }),
      // 진행 중 경매 수
      prisma.listing.count({ where: { status: 'ACTIVE', listingType: 'AUCTION' } }),
      // 24h 체결 건수 + 총액
      prisma.transaction.aggregate({
        where: { completedAt: { gte: since24h } },
        _count: true,
        _sum: { finalPrice: true },
        _avg: { finalPrice: true },
      }),
      // 7일 체결 건수 + 총액
      prisma.transaction.aggregate({
        where: { completedAt: { gte: since7d } },
        _count: true,
        _sum: { finalPrice: true },
      }),
      // 최근 7일 가장 많이 거래된 카드 TOP 5
      prisma.transaction.groupBy({
        by: ['listingId'],
        where: { completedAt: { gte: since7d } },
        _count: { listingId: true },
        _avg: { finalPrice: true },
        orderBy: { _count: { listingId: 'desc' } },
        take: 10,
      }).then(async (rows) => {
        if (!rows.length) return []
        const listingIds = rows.map(r => r.listingId)
        const listings = await prisma.listing.findMany({
          where: { id: { in: listingIds } },
          select: { id: true, card: { select: { id: true, name: true, nameKo: true, imageUrl: true, tcgType: true, rarity: true } } },
        })
        return rows.slice(0, 5).map(r => {
          const l = listings.find(x => x.id === r.listingId)
          return {
            cardId: l?.card.id,
            name: l?.card.nameKo ?? l?.card.name,
            imageUrl: l?.card.imageUrl,
            tcgType: l?.card.tcgType,
            rarity: l?.card.rarity,
            txCount: r._count.listingId,
            avgPrice: r._avg.finalPrice ? Math.round(r._avg.finalPrice) : null,
          }
        }).filter(r => r.cardId)
      }),
      // 최근 체결 5건
      prisma.transaction.findMany({
        where: { completedAt: { gte: since24h } },
        orderBy: { completedAt: 'desc' },
        take: 5,
        select: {
          id: true, finalPrice: true, completedAt: true,
          listing: { select: { card: { select: { name: true, nameKo: true, imageUrl: true, tcgType: true } }, listingType: true } },
        },
      }),
    ])

    // TCG 별 활성 리스팅 분포
    const tcgBreakdown = await prisma.listing.groupBy({
      by: ['cardId'],
      where: { status: 'ACTIVE' },
      _count: true,
    })

    res.json({
      activeCount,
      activeAuctions,
      tx24h: {
        count: tx24h._count,
        volume: tx24h._sum.finalPrice ?? 0,
        avgPrice: tx24h._avg.finalPrice ? Math.round(tx24h._avg.finalPrice) : null,
      },
      tx7d: {
        count: tx7d._count,
        volume: tx7d._sum.finalPrice ?? 0,
      },
      topCards,
      recentDeals: recentDeals.map(d => ({
        id: d.id,
        finalPrice: d.finalPrice,
        completedAt: d.completedAt,
        cardName: d.listing.card.nameKo ?? d.listing.card.name,
        cardImage: d.listing.card.imageUrl,
        tcgType: d.listing.card.tcgType,
        listingType: d.listing.listingType,
      })),
    })
  } catch (err) {
    console.error('[getMarketSummary]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

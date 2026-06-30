import { Response } from 'express'
import { z } from 'zod'
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
    const rawPage = Number(req.query.page)
    const rawLimit = Number(req.query.limit)
    const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 100) : 20

    const where: Record<string, unknown> = { status: 'ACTIVE' }
    if (type) where.listingType = type
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

    const orderBy = (() => {
      if (sort === 'price_asc' || sort === 'price_desc') {
        const dir = sort === 'price_asc' ? 'asc' as const : 'desc' as const
        if (type === 'AUCTION') return { currentPrice: dir }
        if (type === 'OFFER')   return { minOfferPrice: dir }
        return { buyNowPrice: dir }
      }
      if (sort === 'ending_soon') return { auctionEndsAt: 'asc' as const }
      return { createdAt: 'desc' as const }
    })()

    const skip = (Number(page) - 1) * Number(limit)
    const [listings, total] = await Promise.all([
      prisma.listing.findMany({
        where,
        include: {
          card: { select: { id: true, name: true, nameKo: true, imageUrl: true, rarity: true, tcgType: true, setName: true, setCode: true, cardNumber: true } },
          seller: { select: { id: true, nickname: true, avatarUrl: true } },
          _count: { select: { bids: true, offers: true } },
        },
        orderBy,
        skip,
        take: Number(limit),
      }),
      prisma.listing.count({ where }),
    ])

    res.json({ listings, total, page: Number(page), limit: Number(limit) })
  } catch (err) {
    console.error('[getListings]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

export async function getListing(req: AuthRequest, res: Response) {
  try {
    const [listing, sellerStats] = await Promise.all([
      prisma.listing.findUnique({
        where: { id: String(req.params['id']) },
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
      // 판매자 신뢰 지표는 listing 조회 후 sellerId로 계산
      null as null,  // placeholder — computed below after listing is confirmed
    ])

    if (!listing) {
      res.status(404).json({ message: '리스팅을 찾을 수 없습니다.' })
      return
    }

    // 판매자 거래 신뢰 지표
    const [totalSales, completedSales] = await Promise.all([
      prisma.transaction.count({ where: { sellerId: listing.seller.id } }),
      prisma.transaction.count({
        where: {
          sellerId: listing.seller.id,
          txStatus: { in: ['COMPLETED', 'AUTO_COMPLETED'] },
        },
      }),
    ])

    res.json({
      ...listing,
      sellerStats: {
        totalSales,
        completedSales,
        completionRate: totalSales > 0 ? Math.round((completedSales / totalSales) * 100) : null,
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

    // 위시리스트 가격 알림 — 비동기 (응답 차단 X)
    ;(async () => {
      try {
        const listingPrice = data.buyNowPrice ?? data.minOfferPrice ?? data.startingPrice
        if (!listingPrice) return

        const alerts = await prisma.wishlist.findMany({
          where: {
            cardId: data.cardId,
            userId: { not: req.userId! }, // 본인 제외
            targetPrice: { gte: listingPrice }, // 목표가 이상이어야 알림 발생
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
    const listing = await prisma.listing.findUnique({ where: { id: String(req.params['id']) } })
    if (!listing || listing.listingType !== 'BUY_NOW' || listing.status !== 'ACTIVE') {
      res.status(400).json({ message: '구매할 수 없는 리스팅입니다.' })
      return
    }
    if (listing.sellerId === req.userId) {
      res.status(400).json({ message: '본인 리스팅은 구매할 수 없습니다.' })
      return
    }

    const price = listing.buyNowPrice!
    const deducted = await prisma.user.updateMany({
      where: { id: req.userId!, balance: { gte: price } },
      data: { balance: { decrement: price } },
    })
    if (deducted.count === 0) {
      res.status(400).json({ message: '잔액이 부족합니다.' })
      return
    }

    try {
      await prisma.$transaction(async (tx) => {
        await tx.listing.update({ where: { id: listing.id }, data: { status: 'SOLD' } })
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
        // 채팅방 생성 (없으면)
        await tx.chatRoom.upsert({
          where: { listingId_buyerId: { listingId: listing.id, buyerId: req.userId! } },
          create: {
            listingId: listing.id, buyerId: req.userId!,
            sellerId: listing.sellerId, transactionId: txRecord.id,
          },
          update: { transactionId: txRecord.id },
        })
      })
    } catch (txErr) {
      await prisma.user.update({ where: { id: req.userId! }, data: { balance: { increment: price } } })
      throw txErr
    }

    res.json({ message: '구매가 완료되었습니다. 물품 수령 후 수령 확인을 눌러주세요.' })
  } catch (err) {
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

    // 현재 최고 입찰자 (밀릴 예정)
    const prevWinningBid = await prisma.bid.findFirst({
      where: { listingId: listing.id, isWinning: true },
      select: { bidderId: true },
    })

    // ── 즉시낙찰 처리 ─────────────────────────────────────────────────────────
    if (listing.instantBuyPrice != null && amount >= listing.instantBuyPrice) {
      if (!bidder || bidder.balance < amount) {
        res.status(400).json({ message: '잔액이 부족합니다.' })
        return
      }
      const deducted = await prisma.user.updateMany({
        where: { id: req.userId!, balance: { gte: amount } },
        data: { balance: { decrement: amount } },
      })
      if (deducted.count === 0) {
        res.status(400).json({ message: '잔액이 부족합니다.' })
        return
      }
      try {
        await prisma.$transaction(async (tx) => {
          await tx.bid.updateMany({ where: { listingId: listing.id }, data: { isWinning: false } })
          await tx.bid.create({ data: { listingId: listing.id, bidderId: req.userId!, amount, isWinning: true } })
          await tx.listing.update({ where: { id: listing.id }, data: { currentPrice: amount, status: 'SOLD' } })
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
      } catch (txErr) {
        await prisma.user.update({ where: { id: req.userId! }, data: { balance: { increment: amount } } })
        throw txErr
      }
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

    await prisma.$transaction([
      prisma.bid.updateMany({ where: { listingId: listing.id }, data: { isWinning: false } }),
      prisma.bid.create({ data: { listingId: listing.id, bidderId: req.userId!, amount, isWinning: true } }),
      prisma.listing.update({
        where: { id: listing.id },
        data: {
          currentPrice: amount,
          ...(extended
            ? { auctionEndsAt: newEndsAt, autoExtendCount: { increment: 1 } }
            : {}),
        },
      }),
    ])

    // 이전 최고 입찰자에게 밀림 알림
    if (prevWinningBid && prevWinningBid.bidderId !== req.userId) {
      notify({
        userId: prevWinningBid.bidderId,
        type: 'BID_OUTBID',
        title: '입찰이 밀렸습니다',
        body: `${bidder?.nickname ?? '다른 사용자'}님이 ${amount.toLocaleString()}P에 재입찰했습니다.`,
        link: `/listings/${listing.id}`,
      })
    }

    getIo()?.to(`listing:${listing.id}`).emit('bid:placed', {
      listingId: listing.id,
      amount,
      currentPrice: amount,
      bidderNickname: bidder?.nickname ?? '익명',
      ...(extended ? { newEndsAt: newEndsAt?.toISOString(), extended: true, extendMinutes: listing.autoExtendMinutes } : {}),
    })

    res.json({
      message: extended
        ? `입찰 완료! 경매가 ${listing.autoExtendMinutes}분 연장되었습니다.`
        : '입찰이 완료되었습니다.',
      currentPrice: amount,
      ...(extended ? { newEndsAt: newEndsAt?.toISOString(), extended: true } : {}),
    })
  } catch (err) {
    console.error('[placeBid]', err)
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
    })

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
      const buyer = await prisma.user.findUnique({ where: { id: offer.buyerId } })
      if (!buyer || buyer.balance < offer.amount) {
        res.status(400).json({ message: '구매자의 잔액이 부족합니다.' })
        return
      }
      const fullListing = await prisma.listing.findUnique({ where: { id: offer.listingId } })
      if (!fullListing) {
        res.status(404).json({ message: '리스팅을 찾을 수 없습니다.' })
        return
      }
      await prisma.$transaction(async (tx) => {
        await tx.offer.update({ where: { id: String(offerId) }, data: { status: 'ACCEPTED' } })
        await tx.offer.updateMany({
          where: { listingId: offer.listingId, id: { not: String(offerId) }, status: 'PENDING' },
          data: { status: 'DECLINED' },
        })
        await tx.listing.update({ where: { id: offer.listingId }, data: { status: 'SOLD' } })
        await tx.user.update({ where: { id: offer.buyerId }, data: { balance: { decrement: offer.amount } } })
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
      })
    } else {
      notify({
        userId: offer.buyerId,
        type: 'OFFER_REJECTED',
        title: '제안이 거절되었습니다',
        body: `${offer.amount.toLocaleString()}P 제안이 거절되었습니다.`,
        link: '/my?tab=offers-sent',
      })
    }

    res.json({ message: action === 'ACCEPTED' ? '제안을 수락했습니다.' : '제안을 거절했습니다.' })
  } catch (err) {
    console.error('[respondToOffer]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

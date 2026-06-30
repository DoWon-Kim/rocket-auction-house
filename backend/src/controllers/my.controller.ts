import { Response } from 'express'
import { ListingStatus, OfferStatus } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'

function paginate(query: AuthRequest['query']) {
  const page = Math.max(1, Number(query.page ?? '1'))
  const limit = Math.min(50, Math.max(1, Number(query.limit ?? '20')))
  return { page, limit, skip: (page - 1) * limit }
}

export async function getMyListings(req: AuthRequest, res: Response) {
  const { page, limit, skip } = paginate(req.query)
  const status = req.query.status as string | undefined

  try {
    const where = {
      sellerId: req.userId,
      ...(status ? { status: status as ListingStatus } : {}),
    }
    const [listings, total] = await Promise.all([
      prisma.listing.findMany({
        where,
        include: {
          card: true,
          _count: { select: { bids: true, offers: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.listing.count({ where }),
    ])
    res.json({ listings, total, page, limit })
  } catch (err) {
    console.error('[getMyListings]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

export async function cancelListing(req: AuthRequest, res: Response) {
  try {
    const listing = await prisma.listing.findUnique({ where: { id: String(req.params['id']) } })
    if (!listing || listing.sellerId !== req.userId) {
      res.status(403).json({ message: '권한이 없습니다.' })
      return
    }
    if (listing.status !== 'ACTIVE') {
      res.status(400).json({ message: '취소할 수 없는 리스팅입니다.' })
      return
    }
    await prisma.$transaction([
      prisma.listing.update({ where: { id: listing.id }, data: { status: 'CANCELLED' } }),
      // 경매 리스팅이었다면 보류 중인 입찰 기록 처리 (isWinning = false)
      ...(listing.listingType === 'AUCTION'
        ? [prisma.bid.updateMany({ where: { listingId: listing.id }, data: { isWinning: false } })]
        : []),
    ])
    res.json({ message: '리스팅이 취소되었습니다.' })
  } catch (err) {
    console.error('[cancelListing]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

export async function getMyPurchases(req: AuthRequest, res: Response) {
  const { page, limit, skip } = paginate(req.query)
  try {
    const where = { buyerId: req.userId }
    const [purchases, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: {
          listing: { include: { card: true } },
          seller: { select: { nickname: true, avgRating: true, reviewCount: true } },
          chatRoom: { select: { id: true } },
          reviews: { where: { reviewerId: req.userId! }, select: { id: true } },
        },
        orderBy: { completedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.transaction.count({ where }),
    ])
    res.json({ purchases, total, page, limit })
  } catch (err) {
    console.error('[getMyPurchases]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

export async function getMySales(req: AuthRequest, res: Response) {
  const { page, limit, skip } = paginate(req.query)
  try {
    const where = { sellerId: req.userId }
    const [sales, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: {
          listing: { include: { card: true } },
          buyer: { select: { nickname: true, avgRating: true, reviewCount: true } },
          chatRoom: { select: { id: true } },
          reviews: { where: { reviewerId: req.userId! }, select: { id: true } },
        },
        orderBy: { completedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.transaction.count({ where }),
    ])
    res.json({ sales, total, page, limit })
  } catch (err) {
    console.error('[getMySales]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

export async function getReceivedOffers(req: AuthRequest, res: Response) {
  const { page, limit, skip } = paginate(req.query)
  const status = req.query.status as string | undefined
  try {
    const where = {
      listing: { sellerId: req.userId },
      ...(status ? { status: status as OfferStatus } : {}),
    }
    const [offers, total] = await Promise.all([
      prisma.offer.findMany({
        where,
        include: {
          listing: { include: { card: true } },
          buyer: { select: { id: true, nickname: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.offer.count({ where }),
    ])
    res.json({ offers, total, page, limit })
  } catch (err) {
    console.error('[getReceivedOffers]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

export async function getSentOffers(req: AuthRequest, res: Response) {
  const { page, limit, skip } = paginate(req.query)
  try {
    const where = { buyerId: req.userId }
    const [offers, total] = await Promise.all([
      prisma.offer.findMany({
        where,
        include: {
          listing: { include: { card: true, seller: { select: { nickname: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.offer.count({ where }),
    ])
    res.json({ offers, total, page, limit })
  } catch (err) {
    console.error('[getSentOffers]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

export async function withdrawOffer(req: AuthRequest, res: Response) {
  try {
    const offer = await prisma.offer.findUnique({ where: { id: String(req.params['id']) } })
    if (!offer || offer.buyerId !== req.userId) {
      res.status(403).json({ message: '권한이 없습니다.' })
      return
    }
    if (offer.status !== 'PENDING') {
      res.status(400).json({ message: '이미 처리된 제안입니다.' })
      return
    }
    await prisma.offer.update({ where: { id: offer.id }, data: { status: 'WITHDRAWN' } })
    res.json({ message: '제안을 철회했습니다.' })
  } catch (err) {
    console.error('[withdrawOffer]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

export async function getMyBids(req: AuthRequest, res: Response) {
  const { page, limit, skip } = paginate(req.query)
  try {
    // 리스팅당 가장 높은 입찰가만 반환 (groupBy 대신 서브쿼리 방식)
    const where = { bidderId: req.userId }
    const [bids, total] = await Promise.all([
      prisma.bid.findMany({
        where,
        include: {
          listing: {
            include: {
              card: true,
              seller: { select: { nickname: true } },
            },
          },
        },
        orderBy: [{ listingId: 'asc' }, { amount: 'desc' }],
        distinct: ['listingId'],
        skip,
        take: limit,
      }),
      prisma.bid.findMany({ where, distinct: ['listingId'], select: { id: true } })
        .then(r => r.length),
    ])
    res.json({ bids, total, page, limit })
  } catch (err) {
    console.error('[getMyBids]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

export async function getMyOripaHistory(req: AuthRequest, res: Response) {
  const { page, limit, skip } = paginate(req.query)
  try {
    const where = { userId: req.userId }
    const [history, total] = await Promise.all([
      prisma.oripaPurchase.findMany({
        where,
        include: { oripa: { select: { title: true, imageUrl: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.oripaPurchase.count({ where }),
    ])
    res.json({ history, total, page, limit })
  } catch (err) {
    console.error('[getMyOripaHistory]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

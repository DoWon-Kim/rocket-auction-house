import { Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { notify } from '../lib/notify'

const REVIEWABLE = ['COMPLETED', 'AUTO_COMPLETED']

// ── 리뷰 작성 ─────────────────────────────────────────────────────────────────

const createSchema = z.object({
  transactionId: z.string().min(1),
  rating:        z.number().int().min(1).max(5),
  comment:       z.string().max(300).optional(),
})

export async function createReview(req: AuthRequest, res: Response) {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ message: '입력값이 올바르지 않습니다.' }); return }

  const { transactionId, rating, comment } = parsed.data
  const userId = req.userId!

  try {
    const tx = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { reviews: { where: { reviewerId: userId }, select: { id: true } } },
    })

    if (!tx) { res.status(404).json({ message: '거래를 찾을 수 없습니다.' }); return }
    if (!REVIEWABLE.includes(tx.txStatus)) {
      res.status(400).json({ message: '완료된 거래에만 리뷰를 작성할 수 있습니다.' }); return
    }

    const isBuyer  = tx.buyerId  === userId
    const isSeller = tx.sellerId === userId
    if (!isBuyer && !isSeller) { res.status(403).json({ message: '거래 당사자만 리뷰를 작성할 수 있습니다.' }); return }
    if (tx.reviews.length > 0) { res.status(409).json({ message: '이미 리뷰를 작성하셨습니다.' }); return }

    const revieweeId = isBuyer ? tx.sellerId : tx.buyerId
    const role = isBuyer ? 'BUYER' : 'SELLER'

    // 리뷰 생성 + 대상 유저 avgRating/reviewCount 업데이트
    const [review] = await prisma.$transaction([
      prisma.review.create({
        data: { transactionId, reviewerId: userId, revieweeId, role, rating, comment },
      }),
      // 대상 유저의 기존 통계를 가져와 업데이트 (원자적 계산은 raw SQL로)
      prisma.$executeRaw`
        UPDATE "User"
        SET
          "reviewCount" = "reviewCount" + 1,
          "avgRating"   = (
            SELECT AVG(r.rating::float)
            FROM "Review" r
            WHERE r."revieweeId" = ${revieweeId}
          )
        WHERE id = ${revieweeId}
      `,
    ])

    // 평가 대상에게 알림
    const reviewer = await prisma.user.findUnique({ where: { id: userId }, select: { nickname: true } })
    notify({
      userId: revieweeId,
      type: 'REVIEW_RECEIVED',
      title: '새 리뷰가 도착했습니다',
      body: `${reviewer?.nickname ?? '익명'}님이 ★${rating} 평가를 남겼습니다.`,
      link: `/my?tab=${role === 'BUYER' ? 'sales' : 'purchases'}`,
    })

    res.status(201).json(review)
  } catch (err) {
    console.error('[createReview]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// ── 유저 리뷰 목록 조회 (공개) ────────────────────────────────────────────────

export async function getUserReviews(req: AuthRequest, res: Response) {
  const userId = String(req.params['userId'])
  const page   = Math.max(1, Number(req.query.page ?? 1))
  const limit  = 10

  try {
    const [reviews, total, user] = await Promise.all([
      prisma.review.findMany({
        where: { revieweeId: userId },
        include: {
          reviewer: { select: { id: true, nickname: true, avatarUrl: true } },
          transaction: {
            include: {
              listing: { include: { card: { select: { name: true, nameKo: true, tcgType: true } } } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip:  (page - 1) * limit,
        take:  limit,
      }),
      prisma.review.count({ where: { revieweeId: userId } }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { avgRating: true, reviewCount: true },
      }),
    ])

    res.json({
      reviews,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      avgRating:   user?.avgRating  ?? null,
      reviewCount: user?.reviewCount ?? 0,
    })
  } catch (err) {
    console.error('[getUserReviews]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// ── 내가 작성 대기 중인 리뷰 (완료됐지만 미작성) ────────────────────────────

export async function getMyPendingReviews(req: AuthRequest, res: Response) {
  const userId = req.userId!

  try {
    // 완료 거래 중 내가 리뷰 안 쓴 것
    const pending = await prisma.transaction.findMany({
      where: {
        txStatus: { in: ['COMPLETED', 'AUTO_COMPLETED'] },
        OR: [{ buyerId: userId }, { sellerId: userId }],
        NOT: { reviews: { some: { reviewerId: userId } } },
      },
      include: {
        listing: { include: { card: { select: { name: true, nameKo: true, tcgType: true, imageUrl: true } } } },
        buyer:   { select: { id: true, nickname: true, avatarUrl: true } },
        seller:  { select: { id: true, nickname: true, avatarUrl: true } },
      },
      orderBy: { completedAt: 'desc' },
      take: 20,
    })

    res.json(pending)
  } catch (err) {
    console.error('[getMyPendingReviews]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

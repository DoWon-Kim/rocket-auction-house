import { prisma } from './prisma'

export type FraudSignal = {
  userId: string
  risk: 'LOW' | 'MEDIUM' | 'HIGH'
  reasons: string[]
}

// 유저 리스크 분석 — 거래/분쟁/신고 이력 기반
export async function analyzeUserRisk(userId: string): Promise<FraudSignal> {
  const [user, recentReports, recentDisputes, cancelledSales] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { warningCount: true, isSuspended: true, createdAt: true },
    }),
    // 최근 30일 신고 수
    prisma.report.count({
      where: { reportedUserId: userId, createdAt: { gte: new Date(Date.now() - 30 * 86400_000) } },
    }),
    // 최근 90일 분쟁 (판매자로서)
    prisma.dispute.count({
      where: { sellerId: userId, createdAt: { gte: new Date(Date.now() - 90 * 86400_000) } },
    }),
    // 취소된 판매 거래 (30일)
    prisma.transaction.count({
      where: { sellerId: userId, txStatus: 'CANCELLED', completedAt: { gte: new Date(Date.now() - 30 * 86400_000) } },
    }),
  ])

  const reasons: string[] = []
  let score = 0

  if (!user) return { userId, risk: 'LOW', reasons: [] }

  if (user.warningCount >= 3) { score += 3; reasons.push(`경고 ${user.warningCount}회`) }
  if (recentReports >= 3) { score += 2; reasons.push(`최근 신고 ${recentReports}건`) }
  if (recentDisputes >= 2) { score += 2; reasons.push(`최근 분쟁 ${recentDisputes}건`) }
  if (cancelledSales >= 3) { score += 1; reasons.push(`취소 판매 ${cancelledSales}건`) }

  // 신규 계정 (30일 미만) + 고액 거래 패턴
  const accountAge = Date.now() - user.createdAt.getTime()
  if (accountAge < 30 * 86400_000) { score += 1; reasons.push('신규 계정 (30일 미만)') }

  const risk: FraudSignal['risk'] = score >= 4 ? 'HIGH' : score >= 2 ? 'MEDIUM' : 'LOW'
  return { userId, risk, reasons }
}

// 셀러 등급 계산
export type SellerGrade = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'DIAMOND'

export async function calculateSellerGrade(userId: string): Promise<SellerGrade> {
  const [totalSales, avgRating, disputeCount] = await Promise.all([
    prisma.transaction.count({
      where: { sellerId: userId, txStatus: { in: ['COMPLETED', 'AUTO_COMPLETED'] } },
    }),
    prisma.review.aggregate({
      where: { revieweeId: userId },
      _avg: { rating: true },
    }),
    prisma.dispute.count({ where: { sellerId: userId } }),
  ])

  const rating = avgRating._avg?.rating ?? 0

  // 분쟁 비율이 높으면 등급 하락
  if (disputeCount >= 3 || rating < 3.0) return 'BRONZE'
  if (totalSales >= 100 && rating >= 4.8 && disputeCount === 0) return 'DIAMOND'
  if (totalSales >= 50 && rating >= 4.5) return 'PLATINUM'
  if (totalSales >= 20 && rating >= 4.0) return 'GOLD'
  if (totalSales >= 5 && rating >= 3.5) return 'SILVER'
  return 'BRONZE'
}

// 이상 거래 감지 — 짧은 시간 내 대량 입찰/구매 시도 감지
export async function detectAbnormalBidding(userId: string): Promise<boolean> {
  const recentBids = await prisma.bid.count({
    where: { bidderId: userId, createdAt: { gte: new Date(Date.now() - 5 * 60_000) } },
  })
  return recentBids >= 20  // 5분에 20회 이상 입찰 = 이상
}

// 경고 부여 및 임계치 초과 시 자동 정지
export async function issueWarning(userId: string, reason: string): Promise<void> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { warningCount: { increment: 1 } },
    select: { warningCount: true, nickname: true },
  })

  console.warn(`[Fraud] 경고 부여: userId=${userId} nickname=${user.nickname} 사유=${reason} 누적=${user.warningCount}`)

  // 경고 5회 이상 → 자동 7일 정지
  if (user.warningCount >= 5) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        isSuspended: true,
        suspendedAt: new Date(),
        suspendedReason: `경고 ${user.warningCount}회 누적: ${reason}`,
      },
    })
    console.warn(`[Fraud] 자동 정지: userId=${userId}`)
  }
}

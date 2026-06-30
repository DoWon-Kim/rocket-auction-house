import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'

// 내 알림 목록 (최신순, 페이지네이션)
export async function getNotifications(req: AuthRequest, res: Response) {
  const userId = req.userId!
  const page   = Math.max(1, Number(req.query.page ?? 1))
  const limit  = 20

  try {
    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.notification.count({ where: { userId } }),
      prisma.notification.count({ where: { userId, isRead: false } }),
    ])

    res.json({ notifications, total, page, totalPages: Math.ceil(total / limit), unreadCount })
  } catch (err) {
    console.error('[getNotifications]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// 읽지 않은 알림 수
export async function getUnreadCount(req: AuthRequest, res: Response) {
  try {
    const count = await prisma.notification.count({ where: { userId: req.userId!, isRead: false } })
    res.json({ count })
  } catch (err) {
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// 특정 알림 읽음 처리
export async function markRead(req: AuthRequest, res: Response) {
  try {
    await prisma.notification.updateMany({
      where: { id: String(req.params['id']), userId: req.userId! },
      data: { isRead: true },
    })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// 전체 읽음 처리
export async function markAllRead(req: AuthRequest, res: Response) {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.userId!, isRead: false },
      data: { isRead: true },
    })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// 알림 삭제
export async function deleteNotification(req: AuthRequest, res: Response) {
  try {
    await prisma.notification.deleteMany({
      where: { id: String(req.params['id']), userId: req.userId! },
    })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

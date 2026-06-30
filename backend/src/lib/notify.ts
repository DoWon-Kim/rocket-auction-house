import { NotificationType } from '@prisma/client'
import { prisma } from './prisma'
import { getIo } from './socketio'
import { sendEmail, buildEmailFromNotification } from './email'

interface NotifyParams {
  userId: string
  type: NotificationType
  title: string
  body?: string
  link?: string
}

export async function notify(params: NotifyParams) {
  try {
    const notification = await prisma.notification.create({
      data: params,
      select: { id: true, type: true, title: true, body: true, link: true, isRead: true, createdAt: true },
    })

    // 실시간 전송 (소켓 연결 중인 경우)
    getIo()?.to(`user:${params.userId}`).emit('notification:new', notification)

    // 이메일 발송 (비동기, 비차단)
    ;(async () => {
      try {
        const user = await prisma.user.findUnique({
          where: { id: params.userId },
          select: { email: true, emailNotifications: true },
        })
        if (!user?.emailNotifications) return

        const payload = buildEmailFromNotification(params.type, params.title, params.body, params.link)
        if (!payload) return

        await sendEmail({ to: user.email, subject: payload.subject, html: payload.html })
      } catch (e) {
        console.error('[notify:email] failed:', e)
      }
    })()

    return notification
  } catch (err) {
    console.error('[notify] failed:', err)
  }
}

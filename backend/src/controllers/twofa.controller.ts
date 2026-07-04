import { Response } from 'express'
import { authenticator } from 'otplib'
import QRCode from 'qrcode'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'

const APP_NAME = 'Rocket Auction House'

// 2FA 설정 시작 — secret 생성 + QR 코드 반환 (아직 활성화 안 됨)
export async function setup2FA(req: AuthRequest, res: Response) {
  const userId = req.userId!
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, twoFaEnabled: true },
  })
  if (!user) { res.status(404).json({ message: '사용자를 찾을 수 없습니다.' }); return }
  if (user.twoFaEnabled) { res.status(400).json({ message: '이미 2단계 인증이 활성화되어 있습니다.' }); return }

  const secret = authenticator.generateSecret()
  await prisma.user.update({ where: { id: userId }, data: { twoFaSecret: secret } })

  const otpAuthUrl = authenticator.keyuri(user.email, APP_NAME, secret)
  const qrCodeDataUrl = await QRCode.toDataURL(otpAuthUrl)

  res.json({
    secret,
    qrCode: qrCodeDataUrl,
    message: 'QR 코드를 인증 앱으로 스캔하고 코드를 입력해 활성화하세요.',
  })
}

// 2FA 활성화 확인 — TOTP 코드 검증
export async function confirm2FA(req: AuthRequest, res: Response) {
  const userId = req.userId!
  const { code } = req.body as { code?: string }
  if (!code) { res.status(400).json({ message: 'TOTP 코드가 필요합니다.' }); return }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFaSecret: true, twoFaEnabled: true },
  })
  if (!user?.twoFaSecret) { res.status(400).json({ message: '2FA 설정을 먼저 시작해주세요.' }); return }
  if (user.twoFaEnabled) { res.status(400).json({ message: '이미 활성화되어 있습니다.' }); return }

  const valid = authenticator.verify({ token: code, secret: user.twoFaSecret })
  if (!valid) { res.status(400).json({ message: '코드가 올바르지 않습니다. 다시 시도해주세요.' }); return }

  await prisma.user.update({ where: { id: userId }, data: { twoFaEnabled: true } })
  res.json({ message: '2단계 인증이 활성화되었습니다.' })
}

// 2FA 비활성화
export async function disable2FA(req: AuthRequest, res: Response) {
  const userId = req.userId!
  const { code } = req.body as { code?: string }
  if (!code) { res.status(400).json({ message: 'TOTP 코드가 필요합니다.' }); return }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFaSecret: true, twoFaEnabled: true },
  })
  if (!user?.twoFaEnabled || !user.twoFaSecret) {
    res.status(400).json({ message: '2FA가 활성화되어 있지 않습니다.' }); return
  }

  const valid = authenticator.verify({ token: code, secret: user.twoFaSecret })
  if (!valid) { res.status(400).json({ message: '코드가 올바르지 않습니다.' }); return }

  await prisma.user.update({
    where: { id: userId },
    data: { twoFaEnabled: false, twoFaSecret: null },
  })
  res.json({ message: '2단계 인증이 비활성화되었습니다.' })
}

// 2FA 상태 조회
export async function get2FAStatus(req: AuthRequest, res: Response) {
  const userId = req.userId!
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFaEnabled: true },
  })
  res.json({ twoFaEnabled: user?.twoFaEnabled ?? false })
}

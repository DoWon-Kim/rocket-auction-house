import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { z } from 'zod'
import { authenticator } from 'otplib'
import { prisma } from '../lib/prisma'
import { sendPasswordResetEmail, sendVerificationEmail } from '../services/mailer'
import { AuthRequest } from '../middleware/auth'
import { sendSms, generateOtp } from '../lib/sms'

const phoneRegex = /^01[016789]\d{7,8}$/

const registerSchema = z.object({
  email:    z.string().email(),
  nickname: z.string().min(2).max(20).regex(/^[^\s<>"'&\\]+$/, '닉네임에 사용할 수 없는 문자가 포함되어 있습니다.'),
  password: z.string().min(8),
  phone:    z.string().regex(phoneRegex, '올바른 휴대폰 번호를 입력해주세요.').optional(),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

function signAccessToken(userId: string, role: string) {
  return jwt.sign({ userId, role }, process.env.JWT_SECRET!, { expiresIn: '15m' })
}

const MAX_REFRESH_TOKENS_PER_USER = 5

async function issueRefreshToken(userId: string): Promise<string> {
  const raw = crypto.randomBytes(40).toString('hex')
  const tokenHash = crypto.createHash('sha256').update(raw).digest('hex')

  await prisma.$transaction(async (tx) => {
    await tx.refreshToken.create({
      data: { userId, tokenHash, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    })
    // 만료 토큰 정리 + 사용자당 최대 개수 초과 시 오래된 것 삭제
    await tx.refreshToken.deleteMany({ where: { userId, expiresAt: { lt: new Date() } } })
    const tokens = await tx.refreshToken.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    })
    if (tokens.length > MAX_REFRESH_TOKENS_PER_USER) {
      const toDelete = tokens.slice(MAX_REFRESH_TOKENS_PER_USER).map(t => t.id)
      await tx.refreshToken.deleteMany({ where: { id: { in: toDelete } } })
    }
  })

  return raw
}

export async function register(req: Request, res: Response) {
  const result = registerSchema.safeParse(req.body)
  if (!result.success) {
    res.status(400).json({ message: '입력값 오류', errors: result.error.flatten() })
    return
  }
  const { email, nickname, password } = result.data

  try {
    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { nickname }] },
    })
    if (existing) {
      res.status(409).json({ message: '이미 사용 중인 이메일 또는 닉네임입니다.' })
      return
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const verifyToken = crypto.randomBytes(32).toString('hex')
    const user = await prisma.user.create({
      data: {
        email, nickname, passwordHash, phone: result.data.phone ?? null,
        emailVerifyToken: verifyToken,
        emailVerifyExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      select: { id: true, email: true, nickname: true, avatarUrl: true, balance: true, role: true, emailVerified: true },
    })

    // 인증 메일 발송 (실패해도 가입은 완료)
    sendVerificationEmail(email, nickname, verifyToken).catch(e =>
      console.error('[register] 인증 메일 발송 실패:', e)
    )

    const [accessToken, refreshToken] = await Promise.all([
      signAccessToken(user.id, user.role),
      issueRefreshToken(user.id),
    ])

    res.status(201).json({ token: accessToken, refreshToken, user })
  } catch (err) {
    console.error('[register]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

export async function login(req: Request, res: Response) {
  const result = loginSchema.safeParse(req.body)
  if (!result.success) {
    res.status(400).json({ message: '입력값 오류' })
    return
  }
  const { email, password } = result.data

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, nickname: true, avatarUrl: true, balance: true, role: true, passwordHash: true, emailVerified: true, twoFaEnabled: true, twoFaSecret: true, isSuspended: true },
    })
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      res.status(401).json({ message: '이메일 또는 비밀번호가 올바르지 않습니다.' })
      return
    }
    if (user.isSuspended) {
      res.status(403).json({ message: '계정이 정지되었습니다. 고객센터에 문의해주세요.' })
      return
    }

    // 2FA 활성화된 경우 TOTP 코드 요구
    if (user.twoFaEnabled && user.twoFaSecret) {
      const { totpCode } = req.body as { totpCode?: string }
      if (!totpCode) {
        res.status(200).json({ requiresTwoFa: true })
        return
      }
      const valid = authenticator.verify({ token: totpCode, secret: user.twoFaSecret })
      if (!valid) {
        res.status(401).json({ message: '2단계 인증 코드가 올바르지 않습니다.' })
        return
      }
    }

    const [accessToken, refreshToken] = await Promise.all([
      signAccessToken(user.id, user.role),
      issueRefreshToken(user.id),
    ])

    res.json({
      token: accessToken,
      refreshToken,
      user: {
        id: user.id, email: user.email, nickname: user.nickname,
        avatarUrl: user.avatarUrl, balance: user.balance, role: user.role,
        emailVerified: user.emailVerified,
      },
    })
  } catch (err) {
    console.error('[login]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// ── 아이디(닉네임) 찾기 ──────────────────────────────────────────────────────
export async function findId(req: Request, res: Response) {
  const { email: rawEmail, phone: rawPhone } = req.body

  try {
    let user: { nickname: string; email: string; createdAt: Date } | null = null

    if (rawPhone) {
      const parsed = z.string().regex(phoneRegex).safeParse(String(rawPhone).replace(/-/g, ''))
      if (!parsed.success) { res.status(400).json({ message: '올바른 휴대폰 번호를 입력해주세요.' }); return }
      user = await prisma.user.findFirst({ where: { phone: parsed.data }, select: { nickname: true, email: true, createdAt: true } })
    } else if (rawEmail) {
      const parsed = z.string().email().safeParse(rawEmail)
      if (!parsed.success) { res.status(400).json({ message: '올바른 이메일을 입력해주세요.' }); return }
      user = await prisma.user.findUnique({ where: { email: parsed.data }, select: { nickname: true, email: true, createdAt: true } })
    } else {
      res.status(400).json({ message: '이메일 또는 휴대폰 번호를 입력해주세요.' }); return
    }

    if (!user) { res.json({ found: false }); return }

    const [local, domain] = user.email.split('@')
    const maskedLocal = local.slice(0, 2) + '*'.repeat(Math.max(3, local.length - 2))
    const maskedNickname = user.nickname.slice(0, 2) + '*'.repeat(Math.max(1, user.nickname.length - 2))

    res.json({
      found: true,
      nickname: maskedNickname,
      email: `${maskedLocal}@${domain}`,
      joinedAt: user.createdAt,
    })
  } catch (err) {
    console.error('[findId]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// ── 비밀번호 재설정 요청 ─────────────────────────────────────────────────────
export async function requestPasswordReset(req: Request, res: Response) {
  const email = z.string().email().safeParse(req.body.email)
  if (!email.success) {
    res.status(400).json({ message: '올바른 이메일을 입력해주세요.' }); return
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: email.data },
      select: { id: true, nickname: true, email: true },
    })

    // 계정 존재 여부를 노출하지 않기 위해 항상 200 응답 (보안)
    if (!user) {
      res.json({ message: '이메일이 존재하면 재설정 링크를 발송했습니다.' }); return
    }

    // 기존 토큰 삭제 후 새로 생성
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } })

    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1시간

    await prisma.passwordResetToken.create({
      data: { userId: user.id, token, expiresAt },
    })

    await sendPasswordResetEmail(user.email, user.nickname, token)

    res.json({ message: '이메일이 존재하면 재설정 링크를 발송했습니다.' })
  } catch (err) {
    console.error('[requestPasswordReset]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// ── 비밀번호 재설정 실행 ─────────────────────────────────────────────────────
const resetSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, '비밀번호는 최소 8자 이상이어야 합니다.'),
})

export async function resetPassword(req: Request, res: Response) {
  const parsed = resetSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.errors[0]?.message ?? '입력값 오류' }); return
  }
  const { token, password } = parsed.data

  try {
    const record = await prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: { select: { id: true } } },
    })

    if (!record) {
      res.status(400).json({ message: '유효하지 않거나 만료된 링크입니다.' }); return
    }
    if (record.expiresAt < new Date()) {
      await prisma.passwordResetToken.delete({ where: { token } })
      res.status(400).json({ message: '링크가 만료되었습니다. 다시 요청해주세요.' }); return
    }

    const passwordHash = await bcrypt.hash(password, 12)

    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      prisma.passwordResetToken.delete({ where: { token } }),
    ])

    res.json({ message: '비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.' })
  } catch (err) {
    console.error('[resetPassword]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

export async function getMe(req: Request & { userId?: string }, res: Response) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, email: true, nickname: true, avatarUrl: true, balance: true, role: true, emailNotifications: true, emailVerified: true },
    })
    if (!user) {
      res.status(404).json({ message: '유저를 찾을 수 없습니다.' })
      return
    }
    res.json(user)
  } catch (err) {
    console.error('[getMe]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

const profileSchema = z.object({
  nickname:        z.string().min(2).max(20).regex(/^[^\s<>"'&\\]+$/, '닉네임에 사용할 수 없는 문자가 포함되어 있습니다.').optional(),
  avatarUrl:       z.string().url().optional().or(z.literal('')),
  currentPassword: z.string().optional(),
  newPassword:     z.string().min(8).optional(),
})

export async function updateProfile(req: AuthRequest, res: Response) {
  const parsed = profileSchema.safeParse(req.body)
  if (!parsed.success) {
    const firstErr = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0]
    res.status(400).json({ message: firstErr ?? '입력값 오류' }); return
  }
  const { nickname, avatarUrl, currentPassword, newPassword } = parsed.data

  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId! } })
    if (!user) { res.status(404).json({ message: '사용자를 찾을 수 없습니다.' }); return }

    // 비밀번호 변경 요청 시 현재 비밀번호 검증
    if (newPassword) {
      if (!currentPassword) { res.status(400).json({ message: '현재 비밀번호를 입력해주세요.' }); return }
      const valid = await bcrypt.compare(currentPassword, user.passwordHash)
      if (!valid) { res.status(401).json({ message: '현재 비밀번호가 올바르지 않습니다.' }); return }
    }

    // 닉네임 중복 검사
    if (nickname && nickname !== user.nickname) {
      const dup = await prisma.user.findUnique({ where: { nickname } })
      if (dup) { res.status(409).json({ message: '이미 사용 중인 닉네임입니다.' }); return }
    }

    const data: Record<string, unknown> = {}
    if (nickname) data.nickname = nickname
    if (avatarUrl !== undefined) data.avatarUrl = avatarUrl || null
    if (newPassword) data.passwordHash = await bcrypt.hash(newPassword, 12)

    const updated = await prisma.user.update({
      where: { id: req.userId! },
      data,
      select: { id: true, email: true, nickname: true, avatarUrl: true, balance: true, role: true, emailNotifications: true },
    })
    res.json(updated)
  } catch (err) {
    console.error('[updateProfile]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

export async function updateEmailNotifications(req: AuthRequest, res: Response) {
  if (!req.userId) { res.status(401).json({ message: '인증이 필요합니다.' }); return }
  const { enabled } = req.body
  if (typeof enabled !== 'boolean') {
    res.status(400).json({ message: 'enabled 값이 올바르지 않습니다.' }); return
  }
  try {
    await prisma.user.update({
      where: { id: req.userId },
      data: { emailNotifications: enabled },
    })
    res.json({ emailNotifications: enabled })
  } catch (err) {
    console.error('[updateEmailNotifications]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// ── 휴대폰 OTP 발송 ────────────────────────────────────────────────────────────

export async function requestPhoneOtp(req: Request, res: Response) {
  const phone = z.string().regex(phoneRegex, '올바른 휴대폰 번호를 입력해주세요.')
    .safeParse(req.body.phone?.replace(/-/g, ''))
  if (!phone.success) { res.status(400).json({ message: phone.error.errors[0]?.message }); return }

  try {
    // 60초 쿨다운 — 타이밍 공격 방지를 위해 번호 등록 여부와 무관하게 적용
    const recent = await prisma.phoneOtp.findFirst({
      where: { phone: phone.data, createdAt: { gt: new Date(Date.now() - 60_000) } },
      orderBy: { createdAt: 'desc' },
    })
    if (recent) {
      const left = Math.ceil((recent.createdAt.getTime() + 60_000 - Date.now()) / 1000)
      res.status(429).json({ message: `${left}초 후에 재요청할 수 있습니다.`, retryAfter: left })
      return
    }

    await prisma.phoneOtp.deleteMany({ where: { phone: phone.data } })

    const otp = generateOtp()
    await prisma.phoneOtp.create({
      data: { phone: phone.data, otp, expiresAt: new Date(Date.now() + 5 * 60_000) },
    })

    const user = await prisma.user.findFirst({ where: { phone: phone.data }, select: { id: true } })
    if (user) {
      try {
        await sendSms(phone.data, `[Rocket AH] 인증번호: ${otp} (5분 이내 입력)`)
      } catch (smsErr) {
        console.error('[requestPhoneOtp] SMS 발송 실패:', smsErr)
      }
    }

    res.json({ message: '인증번호를 발송했습니다.' })
  } catch (err) {
    console.error('[requestPhoneOtp]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// ── 휴대폰 OTP 검증 + 비밀번호 재설정 ─────────────────────────────────────────

const phoneResetSchema = z.object({
  phone:       z.string().regex(phoneRegex),
  otp:         z.string().length(6),
  newPassword: z.string().min(8, '비밀번호는 최소 8자 이상이어야 합니다.'),
})

// ── 이메일 인증 ──────────────────────────────────────────────────────────────

export async function verifyEmail(req: Request, res: Response) {
  const token = z.string().min(1).safeParse(req.params['token'])
  if (!token.success) { res.status(400).json({ message: '유효하지 않은 링크입니다.' }); return }

  try {
    const user = await prisma.user.findFirst({
      where: { emailVerifyToken: token.data, emailVerifyExpires: { gt: new Date() } },
    })
    if (!user) {
      res.status(400).json({ message: '인증 링크가 만료되었거나 유효하지 않습니다. 재발송 후 시도해주세요.' })
      return
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, emailVerifyToken: null, emailVerifyExpires: null },
    })
    res.json({ message: '이메일 인증이 완료되었습니다!' })
  } catch (err) {
    console.error('[verifyEmail]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

export async function resendVerificationEmail(req: AuthRequest, res: Response) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { email: true, nickname: true, emailVerified: true },
    })
    if (!user) { res.status(404).json({ message: '사용자를 찾을 수 없습니다.' }); return }
    if (user.emailVerified) { res.status(400).json({ message: '이미 인증된 이메일입니다.' }); return }

    const verifyToken = crypto.randomBytes(32).toString('hex')
    await prisma.user.update({
      where: { id: req.userId! },
      data: { emailVerifyToken: verifyToken, emailVerifyExpires: new Date(Date.now() + 24 * 60 * 60 * 1000) },
    })
    await sendVerificationEmail(user.email, user.nickname, verifyToken)
    res.json({ message: '인증 이메일을 재발송했습니다.' })
  } catch (err) {
    console.error('[resendVerificationEmail]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// ── 리프레시 토큰 ────────────────────────────────────────────────────────────

export async function refreshTokens(req: Request, res: Response) {
  const { refreshToken } = req.body
  if (!refreshToken || typeof refreshToken !== 'string') {
    res.status(401).json({ message: '리프레시 토큰이 없습니다.' }); return
  }

  try {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex')
    const record = await prisma.refreshToken.findUnique({ where: { tokenHash }, include: { user: { select: { id: true, role: true } } } })

    if (!record || record.expiresAt < new Date()) {
      if (record) await prisma.refreshToken.delete({ where: { tokenHash } })
      res.status(401).json({ message: '만료된 세션입니다. 다시 로그인해주세요.' }); return
    }

    // 기존 토큰 교체 (rotation)
    await prisma.refreshToken.delete({ where: { tokenHash } })
    const [newAccess, newRefresh] = await Promise.all([
      signAccessToken(record.user.id, record.user.role),
      issueRefreshToken(record.user.id),
    ])
    res.json({ token: newAccess, refreshToken: newRefresh })
  } catch (err) {
    console.error('[refreshTokens]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// ── 로그아웃 ─────────────────────────────────────────────────────────────────

export async function logout(req: Request, res: Response) {
  const { refreshToken } = req.body
  if (refreshToken && typeof refreshToken === 'string') {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex')
    await prisma.refreshToken.deleteMany({ where: { tokenHash } }).catch(() => {})
  }
  res.json({ message: '로그아웃되었습니다.' })
}

export async function verifyPhoneOtpAndReset(req: Request, res: Response) {
  const parsed = phoneResetSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ message: parsed.error.errors[0]?.message }); return }

  const { phone, otp, newPassword } = parsed.data
  try {
    const record = await prisma.phoneOtp.findFirst({
      where: { phone, used: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    })

    if (!record) { res.status(400).json({ message: '인증번호가 만료되었습니다. 재발송해주세요.' }); return }

    if (record.attempts >= 5) {
      res.status(429).json({ message: '인증 시도 횟수를 초과했습니다. 재발송해주세요.' }); return
    }

    if (record.otp !== otp) {
      await prisma.phoneOtp.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } })
      const remaining = 4 - record.attempts
      res.status(400).json({
        message: remaining > 0
          ? `인증번호가 올바르지 않습니다. (남은 시도: ${remaining}회)`
          : '인증 시도 횟수를 초과했습니다. 재발송해주세요.',
      })
      return
    }

    const user = await prisma.user.findFirst({ where: { phone }, select: { id: true } })
    if (!user) { res.status(404).json({ message: '등록된 사용자를 찾을 수 없습니다.' }); return }

    const passwordHash = await bcrypt.hash(newPassword, 12)
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
      prisma.phoneOtp.update({ where: { id: record.id }, data: { used: true } }),
    ])
    res.json({ message: '비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.' })
  } catch (err) {
    console.error('[verifyPhoneOtpAndReset]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

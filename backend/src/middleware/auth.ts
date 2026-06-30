import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

export interface AuthRequest extends Request {
  userId?: string
  userRole?: string
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) {
    res.status(401).json({ message: '인증 토큰이 없습니다.' })
    return
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as {
      userId: string
      role: string
    }
    req.userId = payload.userId
    req.userRole = payload.role
    next()
  } catch {
    res.status(401).json({ message: '유효하지 않은 토큰입니다.' })
    return
  }
}

export function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(' ')[1]
  if (token) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string; role: string }
      req.userId   = payload.userId
      req.userRole = payload.role
    } catch { /* 토큰 오류 시 무시 */ }
  }
  next()
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.userRole !== 'ADMIN' && req.userRole !== 'SUPER_ADMIN') {
    res.status(403).json({ message: '관리자 권한이 필요합니다.' })
    return
  }
  next()
}

export function requireSuperAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.userRole !== 'SUPER_ADMIN') {
    res.status(403).json({ message: '최고 관리자 권한이 필요합니다.' })
    return
  }
  next()
}

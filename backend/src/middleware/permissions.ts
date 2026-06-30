import { Response, NextFunction } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from './auth'

// 중간 관리자에게 부여 가능한 섹션 목록
export const GRANTABLE_SECTIONS = ['posts', 'cards', 'shop', 'oripas', 'shipping', 'withdrawal'] as const

// SUPER_ADMIN은 무조건 통과, ADMIN은 DB에서 권한 확인
export function requireSection(section: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.userRole === 'SUPER_ADMIN') { next(); return }
    if (req.userRole !== 'ADMIN') {
      res.status(403).json({ message: '관리자 권한이 필요합니다.' })
      return
    }
    try {
      const perm = await prisma.adminPermission.findUnique({
        where: { userId_section: { userId: req.userId!, section } },
      })
      if (!perm) {
        res.status(403).json({ message: `'${section}' 섹션에 대한 접근 권한이 없습니다.` })
        return
      }
      next()
    } catch {
      res.status(500).json({ message: '서버 오류가 발생했습니다.' })
    }
  }
}

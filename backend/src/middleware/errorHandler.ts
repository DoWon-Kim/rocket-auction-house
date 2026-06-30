import { Request, Response, NextFunction } from 'express'

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  const error = err as { status?: number; message?: string; code?: string }

  // Prisma 에러 분류
  if (error.code === 'P2002') {
    res.status(409).json({ message: '이미 존재하는 데이터입니다.' })
    return
  }
  if (error.code === 'P2025') {
    res.status(404).json({ message: '데이터를 찾을 수 없습니다.' })
    return
  }

  const status = error.status ?? 500
  const message = status < 500 ? (error.message ?? '요청 오류') : '서버 오류가 발생했습니다.'

  if (status >= 500) {
    console.error('[ERROR]', err)
  }

  res.status(status).json({ message })
}

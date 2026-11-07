import { PrismaClient } from '@prisma/client'
import { recordPulse } from './adminPulse'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

function createClient() {
  const client = new PrismaClient({ log: ['error'] })
  // 쓰기가 성공하면 관리자 대시보드에 실시간 신호 (실패해도 요청에는 영향 없음)
  client.$use(async (params, next) => {
    const result = await next(params)
    try { recordPulse(params.model, params.action, (params.args as { data?: unknown } | undefined)?.data) } catch { /* 무시 */ }
    return result
  })
  return client
}

export const prisma = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

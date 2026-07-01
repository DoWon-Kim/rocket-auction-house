import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const p = new PrismaClient()

async function main() {
  // ONEPIECE enum 값이 이미 있는지 확인 후 추가
  try {
    await p.$executeRaw`ALTER TYPE "TcgType" ADD VALUE IF NOT EXISTS 'ONEPIECE'`
    console.log('✅ TcgType enum에 ONEPIECE 추가 완료')
  } catch (err) {
    // IF NOT EXISTS는 Postgres 12+ 지원. 이전 버전이면 오류 무시
    console.log('ℹ️  ONEPIECE 이미 존재하거나 ADD VALUE 오류:', err)
  }
}

main().finally(() => p.$disconnect())

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const email = process.argv[2]
  if (!email) {
    console.error('Usage: ts-node scripts/make-admin.ts <email>')
    process.exit(1)
  }
  const user = await prisma.user.update({
    where: { email },
    data: { role: 'ADMIN' },
    select: { nickname: true, email: true, role: true },
  })
  console.log('✅ 관리자로 설정됨:', user)
}

main().catch(console.error).finally(() => prisma.$disconnect())

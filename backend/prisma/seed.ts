import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const email = 'admin@rocket.com'
  const nickname = 'admin'
  const password = 'Admin1234!'

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { nickname }] },
  })

  if (existing) {
    // 이미 존재하면 role만 ADMIN으로 보장
    if (existing.role !== 'ADMIN') {
      await prisma.user.update({ where: { id: existing.id }, data: { role: 'ADMIN' } })
      console.log(`✅ 기존 계정(${existing.email})을 ADMIN으로 승격했습니다.`)
    } else {
      console.log(`ℹ️  관리자 계정(${existing.email})이 이미 존재합니다.`)
    }
    return
  }

  const passwordHash = await bcrypt.hash(password, 12)
  const admin = await prisma.user.create({
    data: {
      email,
      nickname,
      passwordHash,
      role: 'ADMIN',
      balance: 0,
    },
  })

  console.log('✅ 관리자 계정이 생성되었습니다.')
  console.log(`   이메일  : ${admin.email}`)
  console.log(`   닉네임  : ${admin.nickname}`)
  console.log(`   비밀번호 : ${password}`)
  console.log('   ⚠️  로그인 후 비밀번호를 변경해주세요.')
}

main()
  .catch((e) => { console.error('❌ 시드 오류:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())

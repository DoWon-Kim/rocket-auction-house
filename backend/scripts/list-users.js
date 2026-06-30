const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
p.user.findMany({ select: { email: true, nickname: true, createdAt: true }, orderBy: { createdAt: 'asc' } })
  .then(users => {
    console.log(JSON.stringify(users, null, 2))
    return p.$disconnect()
  })

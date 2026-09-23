// 로컬 디자인 확인용 데모 데이터. 모든 레코드는 demo_ 접두어로 식별됩니다.
//   생성: node scripts/demo-data.js
//   삭제: node scripts/demo-data.js --clean
require('dotenv/config')

// 운영 DB에 알려진 비밀번호·잔액을 가진 계정이 생기지 않도록 차단
if (process.env.NODE_ENV === 'production') {
  console.error('production 환경에서는 데모 데이터 스크립트를 실행할 수 없습니다.')
  process.exit(1)
}

const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()
const SELLER_EMAIL = 'demo_seller@example.com'
const BUYER_EMAIL = 'demo_buyer@example.com'

const CARDS = [
  { externalId: 'demo_base1-4', name: 'Charizard', nameKo: '리자몽', number: '4', rarity: 'Rare Holo', hp: 120, types: 'Fire' },
  { externalId: 'demo_base1-2', name: 'Blastoise', nameKo: '거북왕', number: '2', rarity: 'Rare Holo', hp: 100, types: 'Water' },
  { externalId: 'demo_base1-15', name: 'Venusaur', nameKo: '이상해꽃', number: '15', rarity: 'Rare Holo', hp: 100, types: 'Grass' },
  { externalId: 'demo_base1-58', name: 'Pikachu', nameKo: '피카츄', number: '58', rarity: 'Common', hp: 40, types: 'Lightning' },
]

async function clean() {
  const users = await prisma.user.findMany({ where: { OR: [{ email: { in: [SELLER_EMAIL, BUYER_EMAIL] } }, { email: { startsWith: 'demo_liker' } }] }, select: { id: true } })
  const userIds = users.map(u => u.id)
  const cards = await prisma.card.findMany({ where: { externalId: { startsWith: 'demo_' } }, select: { id: true } })
  const cardIds = cards.map(c => c.id)
  const listings = await prisma.listing.findMany({ where: { OR: [{ cardId: { in: cardIds } }, { sellerId: { in: userIds } }] }, select: { id: true } })
  const listingIds = listings.map(l => l.id)
  await prisma.$transaction([
    prisma.commentLike.deleteMany({ where: { userId: { in: userIds } } }),
    prisma.postLike.deleteMany({ where: { userId: { in: userIds } } }),
    prisma.comment.deleteMany({ where: { authorId: { in: userIds }, replies: { none: {} } } }),
    prisma.comment.deleteMany({ where: { authorId: { in: userIds } } }),
    prisma.post.deleteMany({ where: { authorId: { in: userIds } } }),
    prisma.bid.deleteMany({ where: { listingId: { in: listingIds } } }),
    prisma.autoBid.deleteMany({ where: { listingId: { in: listingIds } } }),
    prisma.offer.deleteMany({ where: { listingId: { in: listingIds } } }),
    prisma.listing.deleteMany({ where: { id: { in: listingIds } } }),
    prisma.card.deleteMany({ where: { id: { in: cardIds } } }),
    prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } }),
    prisma.notification.deleteMany({ where: { userId: { in: userIds } } }),
    prisma.user.deleteMany({ where: { id: { in: userIds } } }),
  ])
  console.log(`삭제: 유저 ${userIds.length}, 카드 ${cardIds.length}, 리스팅 ${listingIds.length}`)
}

async function create() {
  await clean()
  const passwordHash = await bcrypt.hash('demo-password-1234', 10)
  const seller = await prisma.user.create({ data: { email: SELLER_EMAIL, nickname: 'demo_seller', passwordHash, balance: 0, emailVerified: true } })
  const buyer = await prisma.user.create({ data: { email: BUYER_EMAIL, nickname: 'demo_buyer', passwordHash, balance: 250000, emailVerified: true } })

  const cards = []
  for (const c of CARDS) {
    cards.push(await prisma.card.create({
      data: {
        externalId: c.externalId, name: c.name, nameKo: c.nameKo, tcgType: 'POKEMON',
        setName: 'Base Set', setCode: 'base1', cardNumber: c.number, rarity: c.rarity,
        imageUrl: `https://images.pokemontcg.io/base1/${c.number}_hires.png`,
        supertype: 'Pokémon', subtypes: 'Stage 2', cardTypes: c.types, hp: c.hp,
      },
    }))
  }

  const day = 86400_000
  await prisma.listing.create({ data: { sellerId: seller.id, cardId: cards[0].id, listingType: 'BUY_NOW', condition: 'NEAR_MINT', buyNowPrice: 1_280_000, gradingCompany: 'PSA', gradingGrade: '9', description: '데모 매물입니다.' } })
  const auction = await prisma.listing.create({ data: { sellerId: seller.id, cardId: cards[1].id, listingType: 'AUCTION', condition: 'EXCELLENT', startingPrice: 150_000, currentPrice: 182_000, auctionEndsAt: new Date(Date.now() + 2 * day), autoExtendMinutes: 5, maxAutoExtends: 3 } })
  await prisma.bid.create({ data: { listingId: auction.id, bidderId: buyer.id, amount: 182_000, isWinning: true } })
  await prisma.listing.create({ data: { sellerId: seller.id, cardId: cards[2].id, listingType: 'OFFER', condition: 'GOOD', minOfferPrice: 90_000 } })
  await prisma.listing.create({ data: { sellerId: seller.id, cardId: cards[3].id, listingType: 'BUY_NOW', condition: 'MINT', buyNowPrice: 35_000 } })

  // ── 커뮤니티(카페) 데모 글
  const img = n => `https://images.pokemontcg.io/base1/${n}_hires.png`
  const POSTS = [
    { by: buyer,  category: 'SHOWOFF', tcgType: 'POKEMON', title: '드디어 1판 리자몽 PSA 9 받았습니다', images: [img(4)],
      content: `3개월 기다린 보람이 있네요.
![](${img(4)})
다들 그레이딩 얼마나 걸리셨나요?`, likes: 12, views: 342 },
    { by: seller, category: 'INFO', tcgType: 'POKEMON', title: '베이스 세트 진품 구별법 정리 (홀로 패턴 / 폰트)', images: [img(2), img(15)],
      content: `가품이 많이 돌아서 정리해봤습니다.

1. 홀로 패턴 확인
![](${img(2)})
2. 뒷면 색감과 폰트 굵기
![](${img(15)})

궁금한 점은 댓글로 남겨주세요.`, likes: 24, views: 1203 },
    { by: buyer,  category: 'QNA', tcgType: 'POKEMON', title: '에스크로 거래 시 발송은 며칠 안에 해야 하나요?', images: [],
      content: '처음 판매해보는데 발송 기한이 궁금합니다.', likes: 1, views: 57 },
    { by: seller, category: 'REVIEW', tcgType: null, title: 'demo_buyer님과 거래 후기 — 포장 꼼꼼하게 해주셨어요', images: [],
      content: '빠른 입금, 친절한 응대 감사합니다. 다음에도 거래해요!', likes: 3, views: 88 },
    { by: buyer,  category: 'FREE', tcgType: null, title: '다들 요즘 어떤 박스 까세요?', images: [],
      content: '요즘 신규 팩 가격이 너무 올라서 고민이네요.', likes: 0, views: 23 },
  ]
  // 추천 수를 채우기 위한 더미 추천인 (demo_ 접두어)
  const likers = []
  for (let i = 0; i < 24; i++) {
    likers.push(await prisma.user.create({ data: { email: `demo_liker${i}@example.com`, nickname: `demo_liker${i}`, passwordHash } }))
  }
  for (const [i, p] of POSTS.entries()) {
    const post = await prisma.post.create({ data: {
      type: 'COMMUNITY', category: p.category, tcgType: p.tcgType, title: p.title, content: p.content,
      imageUrls: p.images, imageUrl: p.images[0] ?? null, authorId: p.by.id, viewCount: p.views,
      createdAt: new Date(Date.now() - (POSTS.length - i) * 3 * 3600_000),
    } })
    await prisma.postLike.createMany({ data: likers.slice(0, p.likes).map(u => ({ postId: post.id, userId: u.id })) })
    if (i === 1) {
      const c = await prisma.comment.create({ data: { postId: post.id, authorId: buyer.id, content: '정리 감사합니다! 폰트 차이는 처음 알았네요.' } })
      await prisma.comment.create({ data: { postId: post.id, authorId: seller.id, parentId: c.id, content: '도움이 되셨다니 다행입니다 :)' } })
      await prisma.comment.create({ data: { postId: post.id, authorId: likers[0].id, content: '스크랩해갑니다.' } })
    }
    if (i === 2) {
      await prisma.comment.create({ data: { postId: post.id, authorId: seller.id, content: '결제 후 3일 안에 발송하지 않으면 자동 취소돼요.' } })
    }
  }

  console.log(`생성 완료 — 로그인: ${BUYER_EMAIL} / demo-password-1234`)
  console.log(`카드 상세: /cards/${cards[0].id}  경매 상세: /listings/${auction.id}`)
}

;(process.argv.includes('--clean') ? clean() : create())
  .catch(e => { console.error(e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())

import type { CardCondition, Prisma } from '@prisma/client'
import { notify } from './notify'
import { postChatMessage } from './chatTrade'
import { ADDRESS_DEADLINE_DAYS, SHIP_DEADLINE_DAYS } from './adminOps'

export type AuctionListing = {
  id: string
  sellerId: string
  cardId: string
  quantity: number
  condition: CardCondition
  gradingCompany: string | null
  gradingGrade: string | null
  imageUrls: string[]
  shippingFee: number
}

export class InsufficientBalanceError extends Error {
  status = 400
  constructor() { super('잔액이 부족합니다. (낙찰가 + 배송비)') }
}

// 경매 낙찰 거래 생성 — 낙찰가 + 배송비를 차감하고 안전결제 거래·보관함·채팅방을 만든다.
// 배송지는 아직 없으므로 발송 기한(shipClockAt)은 구매자가 배송지를 입력할 때 시작된다.
// 호출하는 쪽에서 상품 상태(SOLD)와 입찰 기록을 같은 트랜잭션 안에서 처리할 것.
export async function createAuctionTrade(t: Prisma.TransactionClient, listing: AuctionListing, buyerId: string, amount: number) {
  const total = amount + listing.shippingFee
  const deducted = await t.user.updateMany({ where: { id: buyerId, balance: { gte: total } }, data: { balance: { decrement: total } } })
  if (deducted.count === 0) throw new InsufficientBalanceError()

  const txRecord = await t.transaction.create({
    data: {
      listingId: listing.id, buyerId, sellerId: listing.sellerId,
      finalPrice: amount, shippingFee: listing.shippingFee, escrowStatus: 'HELD',
    },
  })
  await t.inventoryItem.create({
    data: {
      userId: buyerId, cardId: listing.cardId, quantity: listing.quantity,
      source: 'PURCHASE', sourceId: txRecord.id,
      condition: listing.condition, gradingCompany: listing.gradingCompany,
      gradingGrade: listing.gradingGrade, imageUrls: listing.imageUrls,
    },
  })
  const room = await t.chatRoom.upsert({
    where: { listingId_buyerId: { listingId: listing.id, buyerId } },
    create: { listingId: listing.id, buyerId, sellerId: listing.sellerId, transactionId: txRecord.id },
    update: { transactionId: txRecord.id },
    select: { id: true },
  })
  return { transactionId: txRecord.id, roomId: room.id, total }
}

// 낙찰 직후 안내 — 채팅방 안내 메시지 + 구매자(배송지 입력)·판매자 알림
export async function announceAuctionWin(p: { listingId: string; sellerId: string; buyerId: string; amount: number; shippingFee: number; roomId: string; instant?: boolean }) {
  const total = p.amount + p.shippingFee
  const fee = p.shippingFee ? ` (배송비 ${p.shippingFee.toLocaleString()}P 포함)` : ''
  await postChatMessage({
    roomId: p.roomId, senderId: p.buyerId, type: 'SYSTEM',
    content: `${p.instant ? '즉시낙찰' : '경매 낙찰'} · ${total.toLocaleString()}P 안전결제 완료${fee}\n구매자는 ${ADDRESS_DEADLINE_DAYS}일 안에 배송지를 입력해주세요. 입력하지 않으면 자동 취소·환불돼요.\n배송지가 입력되면 판매자 발송 기한(${SHIP_DEADLINE_DAYS}일)이 시작됩니다.`,
  }).catch(e => console.error('[announceAuctionWin chat]', e))
  await Promise.allSettled([
    notify({
      userId: p.buyerId, type: 'BID_WON', title: p.instant ? '즉시낙찰되었어요! 배송지를 입력해주세요' : '경매에 낙찰되었어요! 배송지를 입력해주세요',
      body: `${total.toLocaleString()}P 결제 완료${fee}. ${ADDRESS_DEADLINE_DAYS}일 안에 배송지를 입력해야 거래가 진행돼요.`,
      link: `/chat/${p.roomId}`,
    }),
    notify({
      userId: p.sellerId, type: 'PURCHASE_PAID', title: '경매가 낙찰되었어요',
      body: `${p.amount.toLocaleString()}P에 낙찰 · 구매자가 배송지를 입력하면 ${SHIP_DEADLINE_DAYS}일 안에 발송해주세요.`,
      link: `/chat/${p.roomId}`,
    }),
  ])
}

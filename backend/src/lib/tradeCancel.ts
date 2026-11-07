import type { Prisma } from '@prisma/client'

// 취소·환불된 거래로 구매자 보관함에 들어갔던 카드를 회수 (이미 배송 신청에 묶인 건 건드리지 않음)
export function removePurchasedItems(db: Prisma.TransactionClient, transactionId: string) {
  return db.inventoryItem.deleteMany({
    where: { source: 'PURCHASE', sourceId: transactionId, shippingItems: { none: {} } },
  })
}

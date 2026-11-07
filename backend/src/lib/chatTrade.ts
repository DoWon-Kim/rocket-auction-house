import { ChatMessageType, Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { getIo } from './socketio'

type Db = Prisma.TransactionClient | typeof prisma

export const CHAT_MSG_SELECT = {
  id: true, content: true, createdAt: true, readAt: true, type: true, offerId: true, imageUrls: true, flagged: true, deletedAt: true,
  sender: { select: { id: true, nickname: true, avatarUrl: true } },
} satisfies Prisma.ChatMessageSelect

// 삭제된 메시지는 내용·사진을 비워서 내려준다
export function maskDeleted<T extends { deletedAt: Date | null; content: string; imageUrls: string[] }>(m: T): T {
  return m.deletedAt ? { ...m, content: '', imageUrls: [] } : m
}

// 상품·구매자 조합의 채팅방 (없으면 생성)
export function ensureChatRoom(db: Db, listingId: string, buyerId: string, sellerId: string) {
  return db.chatRoom.upsert({
    where: { listingId_buyerId: { listingId, buyerId } },
    create: { listingId, buyerId, sellerId },
    update: {},
    select: { id: true },
  })
}

// 채팅방에 메시지를 남기고 실시간 전송 (거래 진행 안내·가격 제안 등)
export async function postChatMessage(params: {
  roomId: string; senderId: string; content: string; type?: ChatMessageType; offerId?: string
}) {
  const msg = await prisma.chatMessage.create({
    data: {
      roomId: params.roomId, senderId: params.senderId, content: params.content,
      type: params.type ?? 'TEXT', offerId: params.offerId,
    },
    select: CHAT_MSG_SELECT,
  })
  await prisma.chatRoom.update({ where: { id: params.roomId }, data: { lastMessageAt: new Date() } })
  getIo()?.to(`chat:${params.roomId}`).emit('chat:message', msg)
  // 방 밖에 있는 상대에게도 목록 갱신 신호
  const room = await prisma.chatRoom.findUnique({ where: { id: params.roomId }, select: { buyerId: true, sellerId: true } })
  if (room) for (const uid of [room.buyerId, room.sellerId]) getIo()?.to(`user:${uid}`).emit('chat:room-updated', { roomId: params.roomId })
  return msg
}

// 거래(Transaction)에 연결된 채팅방에 안내 메시지 — 실패해도 거래 처리에는 영향 없음
export async function postTxSystemMessage(transactionId: string, senderId: string, content: string) {
  try {
    const room = await prisma.chatRoom.findUnique({ where: { transactionId }, select: { id: true } })
    if (room) await postChatMessage({ roomId: room.id, senderId, content, type: 'SYSTEM' })
  } catch (e) {
    console.error('[postTxSystemMessage]', e)
  }
}

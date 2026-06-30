import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { getIo } from '../lib/socketio'
import { notify } from '../lib/notify'

const USER_SELECT = { id: true, nickname: true, avatarUrl: true }

// 친구 ID 정규화 — 항상 작은 ID가 user1
function normalizeIds(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a]
}

// ── 친구 요청 보내기 ──────────────────────────────────────────────────────────

export async function sendFriendRequest(req: AuthRequest, res: Response) {
  const myId = req.userId!
  const targetId = String(req.params['userId'])

  if (myId === targetId) {
    res.status(400).json({ message: '자기 자신에게 친구 신청할 수 없습니다.' })
    return
  }

  try {
    const target = await prisma.user.findUnique({ where: { id: targetId }, select: USER_SELECT })
    if (!target) { res.status(404).json({ message: '사용자를 찾을 수 없습니다.' }); return }

    // 이미 요청이 있거나 수락된 상태인지 확인 (양방향)
    const existing = await prisma.friendRequest.findFirst({
      where: {
        OR: [
          { senderId: myId,     receiverId: targetId },
          { senderId: targetId, receiverId: myId },
        ],
      },
    })

    if (existing) {
      if (existing.status === 'ACCEPTED') {
        res.status(409).json({ message: '이미 친구입니다.' }); return
      }
      if (existing.status === 'PENDING') {
        if (existing.senderId === myId) {
          res.status(409).json({ message: '이미 친구 요청을 보냈습니다.' }); return
        }
        // 상대방이 보낸 요청이 있으면 바로 수락
        const accepted = await prisma.friendRequest.update({
          where: { id: existing.id },
          data: { status: 'ACCEPTED', updatedAt: new Date() },
        })
        await prisma.friendRoom.create({
          data: { user1Id: normalizeIds(myId, targetId)[0], user2Id: normalizeIds(myId, targetId)[1] },
        })
        res.json({ message: '친구 요청을 수락했습니다.', request: accepted })
        return
      }
      // REJECTED → 재신청 허용
      await prisma.friendRequest.delete({ where: { id: existing.id } })
    }

    const request = await prisma.friendRequest.create({
      data: { senderId: myId, receiverId: targetId },
      include: { sender: { select: USER_SELECT }, receiver: { select: USER_SELECT } },
    })

    // 수신자에게 실시간 + DB 알림
    getIo()?.to(`user:${targetId}`).emit('friend:request', {
      requestId: request.id,
      sender: request.sender,
    })
    notify({
      userId: targetId,
      type: 'FRIEND_REQUEST',
      title: '친구 요청이 왔습니다',
      body: `${request.sender.nickname}님이 친구 요청을 보냈습니다.`,
      link: '/friends',
    })

    res.status(201).json(request)
  } catch (err) {
    console.error('[sendFriendRequest]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// ── 친구 요청 응답 (수락/거절) ─────────────────────────────────────────────────

export async function respondFriendRequest(req: AuthRequest, res: Response) {
  const myId     = req.userId!
  const requestId = String(req.params['requestId'])
  const action   = req.body.action as 'accept' | 'reject'

  if (action !== 'accept' && action !== 'reject') {
    res.status(400).json({ message: 'action은 accept 또는 reject여야 합니다.' })
    return
  }

  try {
    const request = await prisma.friendRequest.findUnique({ where: { id: requestId } })
    if (!request || request.receiverId !== myId) {
      res.status(404).json({ message: '요청을 찾을 수 없습니다.' }); return
    }
    if (request.status !== 'PENDING') {
      res.status(409).json({ message: '이미 처리된 요청입니다.' }); return
    }

    const updated = await prisma.friendRequest.update({
      where: { id: requestId },
      data: { status: action === 'accept' ? 'ACCEPTED' : 'REJECTED' },
    })

    if (action === 'accept') {
      const [u1, u2] = normalizeIds(request.senderId, myId)
      await prisma.friendRoom.upsert({
        where: { user1Id_user2Id: { user1Id: u1, user2Id: u2 } },
        create: { user1Id: u1, user2Id: u2 },
        update: {},
      })
      // 요청자에게 수락 알림
      const me = await prisma.user.findUnique({ where: { id: myId }, select: USER_SELECT })
      getIo()?.to(`user:${request.senderId}`).emit('friend:accepted', { by: me })
      notify({
        userId: request.senderId,
        type: 'FRIEND_ACCEPTED',
        title: '친구 요청이 수락되었습니다',
        body: `${me?.nickname ?? ''}님과 친구가 되었습니다!`,
        link: '/friends',
      })
    }

    res.json(updated)
  } catch (err) {
    console.error('[respondFriendRequest]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// ── 받은 친구 요청 목록 ────────────────────────────────────────────────────────

export async function getFriendRequests(req: AuthRequest, res: Response) {
  try {
    const requests = await prisma.friendRequest.findMany({
      where: { receiverId: req.userId!, status: 'PENDING' },
      include: { sender: { select: USER_SELECT } },
      orderBy: { createdAt: 'desc' },
    })
    res.json(requests)
  } catch (err) {
    console.error('[getFriendRequests]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// ── 보낸 친구 요청 목록 ────────────────────────────────────────────────────────

export async function getSentRequests(req: AuthRequest, res: Response) {
  try {
    const requests = await prisma.friendRequest.findMany({
      where: { senderId: req.userId!, status: 'PENDING' },
      include: { receiver: { select: USER_SELECT } },
      orderBy: { createdAt: 'desc' },
    })
    res.json(requests)
  } catch (err) {
    console.error('[getSentRequests]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// ── 친구 목록 ─────────────────────────────────────────────────────────────────

export async function getFriends(req: AuthRequest, res: Response) {
  const myId = req.userId!
  try {
    const accepted = await prisma.friendRequest.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [{ senderId: myId }, { receiverId: myId }],
      },
      include: {
        sender:   { select: USER_SELECT },
        receiver: { select: USER_SELECT },
      },
      orderBy: { updatedAt: 'desc' },
    })
    const friends = accepted.map(r => r.senderId === myId ? r.receiver : r.sender)
    res.json(friends)
  } catch (err) {
    console.error('[getFriends]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// ── 친구 삭제 ─────────────────────────────────────────────────────────────────

export async function removeFriend(req: AuthRequest, res: Response) {
  const myId     = req.userId!
  const targetId = String(req.params['userId'])
  try {
    await prisma.friendRequest.deleteMany({
      where: {
        status: 'ACCEPTED',
        OR: [
          { senderId: myId,     receiverId: targetId },
          { senderId: targetId, receiverId: myId },
        ],
      },
    })
    res.json({ ok: true })
  } catch (err) {
    console.error('[removeFriend]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// ── 유저 검색 (친구 추가용) ───────────────────────────────────────────────────

export async function searchUsers(req: AuthRequest, res: Response) {
  const myId = req.userId!
  const q = String(req.query.q ?? '').trim()
  if (q.length < 1) { res.json([]); return }

  try {
    const users = await prisma.user.findMany({
      where: {
        id: { not: myId },
        nickname: { contains: q },
      },
      select: USER_SELECT,
      take: 10,
    })

    // 각 유저에 대한 친구 상태 조회
    const requests = await prisma.friendRequest.findMany({
      where: {
        OR: users.flatMap(u => [
          { senderId: myId,  receiverId: u.id },
          { senderId: u.id,  receiverId: myId },
        ]),
      },
      select: { senderId: true, receiverId: true, status: true, id: true },
    })

    const result = users.map(u => {
      const req = requests.find(r =>
        (r.senderId === myId && r.receiverId === u.id) ||
        (r.senderId === u.id && r.receiverId === myId)
      )
      let friendStatus: string | null = null
      if (req) {
        if (req.status === 'ACCEPTED') friendStatus = 'ACCEPTED'
        else if (req.senderId === myId) friendStatus = 'PENDING_SENT'
        else friendStatus = 'PENDING_RECEIVED'
      }
      return { ...u, friendStatus, requestId: req?.id ?? null }
    })

    res.json(result)
  } catch (err) {
    console.error('[searchUsers]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// ── 대기 중인 수신 요청 수 ────────────────────────────────────────────────────

export async function getPendingRequestCount(req: AuthRequest, res: Response) {
  try {
    const count = await prisma.friendRequest.count({
      where: { receiverId: req.userId!, status: 'PENDING' },
    })
    res.json({ count })
  } catch (err) {
    console.error('[getPendingRequestCount]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// ── DM 채팅방 가져오기 or 생성 ───────────────────────────────────────────────

export async function getOrCreateDmRoom(req: AuthRequest, res: Response) {
  const myId     = req.userId!
  const friendId = String(req.params['userId'])

  try {
    // 친구인지 확인
    const friendship = await prisma.friendRequest.findFirst({
      where: {
        status: 'ACCEPTED',
        OR: [
          { senderId: myId,     receiverId: friendId },
          { senderId: friendId, receiverId: myId },
        ],
      },
    })
    if (!friendship) {
      res.status(403).json({ message: '친구 사이에서만 DM을 보낼 수 있습니다.' }); return
    }

    const [u1, u2] = normalizeIds(myId, friendId)
    const room = await prisma.friendRoom.upsert({
      where: { user1Id_user2Id: { user1Id: u1, user2Id: u2 } },
      create: { user1Id: u1, user2Id: u2 },
      update: {},
      include: {
        user1:    { select: USER_SELECT },
        user2:    { select: USER_SELECT },
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 50,
          select: { id: true, content: true, createdAt: true, readAt: true, senderId: true, sender: { select: USER_SELECT } },
        },
      },
    })
    res.json(room)
  } catch (err) {
    console.error('[getOrCreateDmRoom]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// ── 내 DM 방 목록 ─────────────────────────────────────────────────────────────

export async function getMyDmRooms(req: AuthRequest, res: Response) {
  const myId = req.userId!
  try {
    const rooms = await (prisma as any).friendRoom.findMany({
      where: { OR: [{ user1Id: myId }, { user2Id: myId }] },
      include: {
        user1: { select: USER_SELECT },
        user2: { select: USER_SELECT },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, content: true, createdAt: true, senderId: true, readAt: true },
        },
        _count: {
          select: { messages: { where: { senderId: { not: myId }, readAt: null } } },
        },
      },
      orderBy: { lastMessageAt: { sort: 'desc', nulls: 'last' } },
    })
    res.json(rooms)
  } catch (err) {
    console.error('[getMyDmRooms]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// ── DM 방 메시지 조회 (페이지네이션) ─────────────────────────────────────────

export async function getDmMessages(req: AuthRequest, res: Response) {
  const myId  = req.userId!
  const roomId = String(req.params['roomId'])
  try {
    const room = await prisma.friendRoom.findUnique({ where: { id: roomId } })
    if (!room || (room.user1Id !== myId && room.user2Id !== myId)) {
      res.status(403).json({ message: '접근 권한이 없습니다.' }); return
    }

    const before = req.query.before as string | undefined
    const limit  = Math.min(50, Number(req.query.limit ?? 30))

    const messages = await prisma.friendMessage.findMany({
      where: { roomId, ...(before ? { createdAt: { lt: new Date(before) } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true, content: true, createdAt: true, readAt: true, senderId: true,
        sender: { select: USER_SELECT },
      },
    })

    await prisma.friendMessage.updateMany({
      where: { roomId, senderId: { not: myId }, readAt: null },
      data: { readAt: new Date() },
    })

    res.json(messages.reverse())
  } catch (err) {
    console.error('[getDmMessages]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// ── DM 방 상세 (메타 + 메시지) ───────────────────────────────────────────────

export async function getDmRoomDetail(req: AuthRequest, res: Response) {
  const myId   = req.userId!
  const roomId = String(req.params['roomId'])
  try {
    const room = await prisma.friendRoom.findUnique({
      where: { id: roomId },
      include: {
        user1:    { select: USER_SELECT },
        user2:    { select: USER_SELECT },
        messages: {
          orderBy: { createdAt: 'asc' }, take: 50,
          select: {
            id: true, content: true, createdAt: true, readAt: true, senderId: true,
            sender: { select: USER_SELECT },
          },
        },
      },
    })
    if (!room || (room.user1Id !== myId && room.user2Id !== myId)) {
      res.status(403).json({ message: '접근 권한이 없습니다.' }); return
    }
    // 읽음 처리
    await prisma.friendMessage.updateMany({
      where: { roomId, senderId: { not: myId }, readAt: null },
      data: { readAt: new Date() },
    })
    res.json(room)
  } catch (err) {
    console.error('[getDmRoomDetail]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

// ── 상대방과의 친구 상태 확인 ─────────────────────────────────────────────────

export async function getFriendStatus(req: AuthRequest, res: Response) {
  const myId     = req.userId!
  const targetId = String(req.params['userId'])
  try {
    const request = await prisma.friendRequest.findFirst({
      where: {
        OR: [
          { senderId: myId,     receiverId: targetId },
          { senderId: targetId, receiverId: myId },
        ],
      },
    })
    if (!request) { res.json({ status: 'none' }); return }
    res.json({
      status: request.status,
      direction: request.senderId === myId ? 'sent' : 'received',
      requestId: request.id,
    })
  } catch (err) {
    console.error('[getFriendStatus]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

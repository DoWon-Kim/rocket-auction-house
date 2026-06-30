import { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'

const VALID_TYPES   = ['NOTICE', 'EVENT', 'COMMUNITY'] as const
const VALID_TCGTYPES = ['POKEMON', 'YUGIOH', 'MTG', 'DIGIMON', 'WEISS', 'OTHER'] as const
type PostTypeStr = typeof VALID_TYPES[number]

const createPostSchema = z.object({
  type:         z.enum(['NOTICE', 'EVENT', 'COMMUNITY']),
  title:        z.string().min(1).max(200),
  content:      z.string().min(1).max(50000),
  pinned:       z.boolean().optional(),
  imageUrl:     z.string().url().optional().nullable(),
  tcgType:      z.enum(VALID_TCGTYPES).optional().nullable(),
  eventStartAt: z.string().datetime().optional().nullable(),
  eventEndAt:   z.string().datetime().optional().nullable(),
})

// ── 공개 ──────────────────────────────────────────────────────────────────

export async function getPosts(req: Request, res: Response) {
  try {
    const typeRaw  = req.query.type    as string | undefined
    const tcgRaw   = req.query.tcgType as string | undefined
    const sortRaw  = req.query.sort    as string | undefined
    const type    = typeRaw && (VALID_TYPES as readonly string[]).includes(typeRaw)    ? typeRaw    as PostTypeStr : undefined
    const tcgType = tcgRaw && (VALID_TCGTYPES as readonly string[]).includes(tcgRaw)  ? tcgRaw    : undefined
    const popular = sortRaw === 'popular'

    const page  = Math.max(1, Number(req.query.page  ?? 1))
    const limit = Math.min(30, Number(req.query.limit ?? 20))
    const skip  = (page - 1) * limit

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {}
    if (type)    where.type    = type
    if (tcgType) where.tcgType = tcgType

    const orderBy = popular
      ? [{ pinned: 'desc' as const }, { likes: { _count: 'desc' as const } }, { createdAt: 'desc' as const }]
      : [{ pinned: 'desc' as const }, { createdAt: 'desc' as const }]

    const [posts, total] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (prisma as any).post.findMany({
        where,
        select: {
          id: true, type: true, title: true, pinned: true,
          viewCount: true, imageUrl: true, tcgType: true,
          eventStartAt: true, eventEndAt: true, createdAt: true,
          author: { select: { id: true, nickname: true, avatarUrl: true } },
          _count: { select: { comments: true, likes: true } },
        },
        orderBy,
        skip, take: limit,
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (prisma as any).post.count({ where }),
    ])

    res.json({ posts, total, page, totalPages: Math.ceil(total / limit) })
  } catch (err) {
    console.error('[getPosts]', err)
    res.status(500).json({ message: '게시글 조회 실패' })
  }
}

export async function getPost(req: AuthRequest, res: Response) {
  try {
    const id     = req.params.id as string
    const userId = req.userId

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const post = await (prisma as any).post.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, nickname: true, avatarUrl: true } },
        _count: { select: { likes: true } },
        ...(userId ? { likes: { where: { userId }, select: { userId: true } } } : {}),
        comments: {
          include: {
            author: { select: { id: true, nickname: true, avatarUrl: true } },
            _count: { select: { likes: true } },
            ...(userId ? { likes: { where: { userId }, select: { userId: true } } } : {}),
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    })
    if (!post) { res.status(404).json({ message: '게시글을 찾을 수 없습니다.' }); return }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any).post.update({ where: { id }, data: { viewCount: { increment: 1 } } })

    // 직렬화
    const { likes: postLikes, _count, comments, ...rest } = post
    res.json({
      ...rest,
      viewCount:  rest.viewCount + 1,
      likeCount:  _count.likes,
      likedByMe:  userId ? (postLikes?.length > 0) : false,
      comments: comments.map((c: any) => {                     // eslint-disable-line @typescript-eslint/no-explicit-any
        const { likes: cLikes, _count: cCount, ...cRest } = c
        return { ...cRest, likeCount: cCount.likes, likedByMe: userId ? (cLikes?.length > 0) : false }
      }),
    })
  } catch (err) {
    console.error('[getPost]', err)
    res.status(500).json({ message: '게시글 조회 실패' })
  }
}

// ── 좋아요 토글 ───────────────────────────────────────────────────────────

export async function togglePostLike(req: AuthRequest, res: Response) {
  try {
    const postId = req.params.id
    const userId = req.userId!
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = await (prisma as any).postLike.findUnique({
      where: { postId_userId: { postId, userId } },
    })
    if (existing) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma as any).postLike.delete({ where: { postId_userId: { postId, userId } } })
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma as any).postLike.create({ data: { postId, userId } })
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const likeCount = await (prisma as any).postLike.count({ where: { postId } })
    res.json({ liked: !existing, likeCount })
  } catch (err) {
    console.error('[togglePostLike]', err)
    res.status(500).json({ message: '좋아요 처리 실패' })
  }
}

export async function toggleCommentLike(req: AuthRequest, res: Response) {
  try {
    const commentId = req.params.commentId
    const userId    = req.userId!
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = await (prisma as any).commentLike.findUnique({
      where: { commentId_userId: { commentId, userId } },
    })
    if (existing) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma as any).commentLike.delete({ where: { commentId_userId: { commentId, userId } } })
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma as any).commentLike.create({ data: { commentId, userId } })
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const likeCount = await (prisma as any).commentLike.count({ where: { commentId } })
    res.json({ liked: !existing, likeCount })
  } catch (err) {
    console.error('[toggleCommentLike]', err)
    res.status(500).json({ message: '좋아요 처리 실패' })
  }
}

// ── 댓글 ──────────────────────────────────────────────────────────────────

export async function addComment(req: AuthRequest, res: Response) {
  try {
    const { content } = req.body
    if (!content?.trim()) { res.status(400).json({ message: '내용을 입력해주세요.' }); return }
    if (content.length > 1000) { res.status(400).json({ message: '1000자 이내로 입력해주세요.' }); return }
    const postId = req.params.id as string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const post = await (prisma as any).post.findUnique({ where: { id: postId }, select: { id: true } })
    if (!post) { res.status(404).json({ message: '게시글을 찾을 수 없습니다.' }); return }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const comment = await (prisma as any).comment.create({
      data: { postId: post.id, authorId: req.userId!, content: content.trim() },
      include: { author: { select: { id: true, nickname: true, avatarUrl: true } } },
    })
    res.status(201).json({ ...comment, likeCount: 0, likedByMe: false })
  } catch (err) {
    console.error('[addComment]', err)
    res.status(500).json({ message: '댓글 작성 실패' })
  }
}

export async function deleteComment(req: AuthRequest, res: Response) {
  try {
    const commentId = req.params.commentId as string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const comment = await (prisma as any).comment.findUnique({ where: { id: commentId }, select: { authorId: true } })
    if (!comment) { res.status(404).json({ message: '댓글을 찾을 수 없습니다.' }); return }
    if (comment.authorId !== req.userId && req.userRole !== 'ADMIN' && req.userRole !== 'SUPER_ADMIN') {
      res.status(403).json({ message: '권한이 없습니다.' }); return
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any).comment.delete({ where: { id: commentId } })
    res.json({ ok: true })
  } catch (err) {
    console.error('[deleteComment]', err)
    res.status(500).json({ message: '댓글 삭제 실패' })
  }
}

// ── 일반 유저 (커뮤니티만) ────────────────────────────────────────────────

export async function userCreatePost(req: AuthRequest, res: Response) {
  try {
    const { title, content, imageUrl, tcgType } = req.body
    if (!title?.trim() || title.length > 200) { res.status(400).json({ message: '제목은 1~200자이어야 합니다.' }); return }
    if (!content?.trim() || content.length > 50000) { res.status(400).json({ message: '내용은 1~50000자이어야 합니다.' }); return }
    if (imageUrl && !/^https?:\/\//.test(imageUrl)) { res.status(400).json({ message: '이미지 URL이 올바르지 않습니다.' }); return }
    const validTcg = tcgType && (VALID_TCGTYPES as readonly string[]).includes(tcgType) ? tcgType : null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const post = await (prisma as any).post.create({
      data: {
        type: 'COMMUNITY',
        title: title.trim(),
        content: content.trim(),
        imageUrl: imageUrl?.trim() || null,
        tcgType: validTcg,
        authorId: req.userId!,
      },
      include: { author: { select: { id: true, nickname: true } } },
    })
    res.status(201).json(post)
  } catch (err) {
    console.error('[userCreatePost]', err)
    res.status(500).json({ message: '게시글 작성 실패' })
  }
}

export async function userUpdatePost(req: AuthRequest, res: Response) {
  try {
    const id = req.params.id as string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const post = await (prisma as any).post.findUnique({ where: { id }, select: { authorId: true, type: true } })
    if (!post) { res.status(404).json({ message: '게시글을 찾을 수 없습니다.' }); return }
    if (post.type !== 'COMMUNITY') { res.status(403).json({ message: '커뮤니티 게시글만 수정할 수 있습니다.' }); return }
    if (post.authorId !== req.userId) { res.status(403).json({ message: '본인 게시글만 수정할 수 있습니다.' }); return }

    const { title, content, imageUrl, tcgType } = req.body
    if (!title?.trim() || title.length > 200) { res.status(400).json({ message: '제목은 1~200자이어야 합니다.' }); return }
    if (!content?.trim() || content.length > 50000) { res.status(400).json({ message: '내용은 1~50000자이어야 합니다.' }); return }
    if (imageUrl && !/^https?:\/\//.test(imageUrl)) { res.status(400).json({ message: '이미지 URL이 올바르지 않습니다.' }); return }
    const validTcg = tcgType && (VALID_TCGTYPES as readonly string[]).includes(tcgType) ? tcgType : null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updated = await (prisma as any).post.update({
      where: { id },
      data: {
        title:    title.trim(),
        content:  content.trim(),
        imageUrl: imageUrl?.trim() || null,
        tcgType:  validTcg,
      },
    })
    res.json(updated)
  } catch (err) {
    console.error('[userUpdatePost]', err)
    res.status(500).json({ message: '게시글 수정 실패' })
  }
}

export async function userDeletePost(req: AuthRequest, res: Response) {
  try {
    const id = req.params.id as string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const post = await (prisma as any).post.findUnique({ where: { id }, select: { authorId: true, type: true } })
    if (!post) { res.status(404).json({ message: '게시글을 찾을 수 없습니다.' }); return }
    if (post.authorId !== req.userId && req.userRole !== 'ADMIN' && req.userRole !== 'SUPER_ADMIN') {
      res.status(403).json({ message: '권한이 없습니다.' }); return
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any).post.delete({ where: { id } })
    res.json({ ok: true })
  } catch (err) {
    console.error('[userDeletePost]', err)
    res.status(500).json({ message: '게시글 삭제 실패' })
  }
}

// ── 관리자 ────────────────────────────────────────────────────────────────

export async function adminCreatePost(req: AuthRequest, res: Response) {
  try {
    const body = createPostSchema.parse(req.body)
    if (body.imageUrl && !/^https?:\/\//.test(body.imageUrl)) {
      res.status(400).json({ message: '이미지 URL이 올바르지 않습니다.' }); return
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const post = await (prisma as any).post.create({
      data: {
        ...body,
        authorId:     req.userId!,
        eventStartAt: body.eventStartAt ?? null,
        eventEndAt:   body.eventEndAt   ?? null,
        imageUrl:     body.imageUrl     ?? null,
        tcgType:      body.type === 'COMMUNITY' ? (body.tcgType ?? null) : null,
      },
      include: { author: { select: { id: true, nickname: true } } },
    })
    res.status(201).json(post)
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ message: err.errors[0]?.message }); return }
    console.error('[adminCreatePost]', err)
    res.status(500).json({ message: '게시글 작성 실패' })
  }
}

export async function adminUpdatePost(req: AuthRequest, res: Response) {
  try {
    const id   = req.params.id as string
    const body = createPostSchema.partial().parse(req.body)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const post = await (prisma as any).post.update({
      where: { id },
      data: {
        ...body,
        eventStartAt: body.eventStartAt ?? undefined,
        eventEndAt:   body.eventEndAt   ?? undefined,
        imageUrl:     body.imageUrl     ?? undefined,
        tcgType:      body.tcgType      !== undefined ? (body.tcgType ?? null) : undefined,
      },
    })
    res.json(post)
  } catch (err) {
    if (err instanceof z.ZodError) { res.status(400).json({ message: err.errors[0]?.message }); return }
    console.error('[adminUpdatePost]', err)
    res.status(500).json({ message: '게시글 수정 실패' })
  }
}

export async function adminTogglePin(req: AuthRequest, res: Response) {
  try {
    const id = req.params.id as string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const current = await (prisma as any).post.findUnique({ where: { id }, select: { pinned: true, type: true } })
    if (!current) { res.status(404).json({ message: '게시글을 찾을 수 없습니다.' }); return }
    if (current.type === 'COMMUNITY') { res.status(400).json({ message: '커뮤니티 게시글은 고정할 수 없습니다.' }); return }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const post = await (prisma as any).post.update({ where: { id }, data: { pinned: !current.pinned } })
    res.json({ pinned: post.pinned })
  } catch (err) {
    console.error('[adminTogglePin]', err)
    res.status(500).json({ message: '고정 처리 실패' })
  }
}

export async function adminDeletePost(req: AuthRequest, res: Response) {
  try {
    const id = req.params.id as string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any).post.delete({ where: { id } })
    res.json({ ok: true })
  } catch (err) {
    console.error('[adminDeletePost]', err)
    res.status(500).json({ message: '게시글 삭제 실패' })
  }
}

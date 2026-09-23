import crypto from 'crypto'
import { Response } from 'express'
import { z } from 'zod'
import { Prisma, BoardCategory, BoardPermission, PostType, TcgType } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { notify } from '../lib/notify'
import { sanitizePostHtml, htmlToText, imagesInHtml } from '../lib/sanitizeHtml'

const VALID_TYPES      = Object.values(PostType)
const VALID_TCGTYPES   = ['POKEMON', 'YUGIOH', 'MTG', 'DIGIMON', 'ONEPIECE', 'WEISS', 'OTHER'] as const
const VALID_CATEGORIES = Object.values(BoardCategory)

// 추천 수가 이 값 이상이면 인기글
export const BEST_THRESHOLD = 10

const httpUrl = z.string().url().refine(u => /^https?:\/\//.test(u), '이미지 URL이 올바르지 않습니다.')

const createPostSchema = z.object({
  type:         z.enum(['NOTICE', 'EVENT', 'COMMUNITY']),
  title:        z.string().min(1).max(200),
  content:      z.string().min(1).max(50000),
  pinned:       z.boolean().optional(),
  imageUrl:     httpUrl.optional().nullable(),
  tcgType:      z.enum(VALID_TCGTYPES).optional().nullable(),
  eventStartAt: z.string().datetime().optional().nullable(),
  eventEndAt:   z.string().datetime().optional().nullable(),
})

const communityPostSchema = z.object({
  title:     z.string().trim().min(1, '제목을 입력해주세요.').max(200, '제목은 200자 이내로 입력해주세요.'),
  content:   z.string().trim().min(1, '내용을 입력해주세요.').max(100000, '내용이 너무 깁니다.'),
  format:    z.enum(['TEXT', 'HTML']).default('TEXT'),
  category:  z.nativeEnum(BoardCategory).default('FREE'),
  tcgType:   z.enum(VALID_TCGTYPES).optional().nullable(),
  imageUrls: z.array(httpUrl).max(20, '이미지는 최대 20장까지 첨부할 수 있습니다.').default([]),
})

const commentSchema = z.object({
  content:  z.string().trim().min(1, '내용을 입력해주세요.').max(1000, '1000자 이내로 입력해주세요.'),
  parentId: z.string().uuid().optional().nullable(),
})

// 활동 점수(글 3점, 댓글 1점)로 카페식 등급 산정
export function activityGrade(postCount: number, commentCount: number): string {
  const score = postCount * 3 + commentCount
  if (score >= 400) return 'VIP'
  if (score >= 150) return 'DEVOTED'
  if (score >= 50)  return 'GOOD'
  if (score >= 10)  return 'MEMBER'
  return 'SPROUT'
}

async function gradesFor(authorIds: string[]): Promise<Record<string, string>> {
  if (authorIds.length === 0) return {}
  const [postCounts, commentCounts] = await Promise.all([
    prisma.post.groupBy({ by: ['authorId'], where: { authorId: { in: authorIds }, type: 'COMMUNITY' }, _count: true }),
    prisma.comment.groupBy({ by: ['authorId'], where: { authorId: { in: authorIds }, deletedAt: null }, _count: true }),
  ])
  const p = new Map(postCounts.map(r => [r.authorId, r._count]))
  const c = new Map(commentCounts.map(r => [r.authorId, r._count]))
  return Object.fromEntries(authorIds.map(id => [id, activityGrade(p.get(id) ?? 0, c.get(id) ?? 0)]))
}

function isAdminRole(role?: string) {
  return role === 'ADMIN' || role === 'SUPER_ADMIN'
}

const GRADE_ORDER = ['SPROUT', 'MEMBER', 'GOOD', 'DEVOTED', 'VIP']
const PERMISSION_LABEL: Record<BoardPermission, string> = {
  ALL: '전체', MEMBER: '일반 등급 이상', GOOD: '우수 등급 이상', DEVOTED: '열심 등급 이상', VIP: 'VIP 등급', ADMIN: '운영진',
}

async function userGrade(userId: string): Promise<string> {
  const [posts, comments] = await Promise.all([
    prisma.post.count({ where: { authorId: userId, type: 'COMMUNITY' } }),
    prisma.comment.count({ where: { authorId: userId, deletedAt: null } }),
  ])
  return activityGrade(posts, comments)
}

async function boardSetting(category: BoardCategory) {
  return (await prisma.boardSetting.findUnique({ where: { category } }))
    ?? { category, writePermission: 'ALL' as BoardPermission, commentPermission: 'ALL' as BoardPermission }
}

// 권한이 없으면 사용자에게 보여줄 사유를, 있으면 null 반환
async function permissionDenied(perm: BoardPermission, userId: string, role?: string): Promise<string | null> {
  if (perm === 'ALL' || isAdminRole(role)) return null
  if (perm === 'ADMIN') return '운영진만 작성할 수 있는 게시판입니다.'
  const grade = await userGrade(userId)
  const need = ['MEMBER', 'GOOD', 'DEVOTED', 'VIP'].indexOf(perm) + 1
  return GRADE_ORDER.indexOf(grade) >= need ? null : `${PERMISSION_LABEL[perm]}만 작성할 수 있습니다. (활동으로 등급을 올려보세요)`
}

// 본문 정리: HTML은 sanitize, TEXT는 이미지 줄을 뺀 평문을 검색용으로 저장
function prepareContent(format: 'TEXT' | 'HTML', raw: string, textImages: string[]) {
  if (format === 'HTML') {
    const content = sanitizePostHtml(raw)
    const contentText = htmlToText(content)
    const imageUrls = imagesInHtml(content).slice(0, 20)
    if (!contentText && imageUrls.length === 0) return null
    return { content, contentText, imageUrls, contentFormat: 'HTML' as const }
  }
  const contentText = raw.split('\n').filter(l => !/^!\[\]\(https?:\/\/[^\s)]+\)$/.test(l.trim())).join('\n').trim()
  return { content: raw, contentText, imageUrls: textImages, contentFormat: 'TEXT' as const }
}

// 같은 사람(유저 또는 IP)은 24시간에 한 번만 조회수 증가
const VIEW_WINDOW_MS = 24 * 3600_000
function viewerKey(req: AuthRequest): string {
  if (req.userId) return `u:${req.userId}`
  const salt = process.env.JWT_SECRET ?? ''
  return 'ip:' + crypto.createHash('sha256').update(`${req.ip}|${salt}`).digest('hex').slice(0, 32)
}
async function registerView(postId: string, key: string): Promise<boolean> {
  const refreshed = await prisma.postView.updateMany({
    where: { postId, viewerKey: key, viewedAt: { lt: new Date(Date.now() - VIEW_WINDOW_MS) } },
    data: { viewedAt: new Date() },
  })
  if (refreshed.count > 0) return true
  try {
    await prisma.postView.create({ data: { postId, viewerKey: key } })
    return true
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') return false
    throw err
  }
}

// 한국 시간 기준 오늘 0시 (서버 타임존과 무관)
function startOfTodayKst(): Date {
  const KST = 9 * 3600_000
  const now = Date.now() + KST
  return new Date(now - (now % 86400_000) - KST)
}

// ── 공개 ──────────────────────────────────────────────────────────────────

export async function getPosts(req: AuthRequest, res: Response) {
  try {
    const q = req.query as Record<string, string | undefined>
    const type     = q.type && (VALID_TYPES as string[]).includes(q.type) ? q.type as PostType : undefined
    const tcgType  = q.tcgType && (VALID_TCGTYPES as readonly string[]).includes(q.tcgType) ? q.tcgType as TcgType : undefined
    const category = q.category && (VALID_CATEGORIES as string[]).includes(q.category) ? q.category as BoardCategory : undefined
    const keyword  = q.q?.trim().slice(0, 100)
    const field    = ['title', 'content', 'author', 'all'].includes(q.field ?? '') ? q.field : 'all'

    const page  = Math.max(1, Math.floor(Number(q.page) || 1))
    const limit = Math.min(50, Math.max(1, Math.floor(Number(q.limit) || 20)))
    const skip  = (page - 1) * limit

    const where: Prisma.PostWhereInput = {}
    if (type)     where.type = type
    if (tcgType)  where.tcgType = tcgType
    if (category) where.category = category

    if (q.author === 'me' || q.scrap === 'me') {
      if (!req.userId) { res.json({ posts: [], total: 0, page, totalPages: 0 }); return }
      if (q.author === 'me') where.authorId = req.userId
      if (q.scrap === 'me') where.scraps = { some: { userId: req.userId } }
    }

    if (keyword) {
      const title   = { title:   { contains: keyword, mode: 'insensitive' as const } }
      const content = { contentText: { contains: keyword, mode: 'insensitive' as const } }
      const author  = { author:  { nickname: { contains: keyword, mode: 'insensitive' as const } } }
      where.AND = [field === 'title' ? title : field === 'content' ? content : field === 'author' ? author : { OR: [title, content] }]
    }

    if (q.best === '1') {
      const best = await prisma.postLike.groupBy({
        by: ['postId'],
        _count: { postId: true },
        having: { postId: { _count: { gte: BEST_THRESHOLD } } },
      })
      where.id = { in: best.map(b => b.postId) }
    }

    const sort = q.sort
    const orderBy: Prisma.PostOrderByWithRelationInput[] =
      sort === 'popular'  ? [{ pinned: 'desc' }, { likes: { _count: 'desc' } }, { createdAt: 'desc' }]
      : sort === 'comments' ? [{ pinned: 'desc' }, { comments: { _count: 'desc' } }, { createdAt: 'desc' }]
      : sort === 'views'    ? [{ pinned: 'desc' }, { viewCount: 'desc' }, { createdAt: 'desc' }]
      : [{ pinned: 'desc' }, { createdAt: 'desc' }]

    const [rows, total] = await Promise.all([
      prisma.post.findMany({
        where,
        select: {
          id: true, type: true, title: true, pinned: true, category: true,
          viewCount: true, imageUrl: true, imageUrls: true, tcgType: true,
          eventStartAt: true, eventEndAt: true, createdAt: true,
          author: { select: { id: true, nickname: true, avatarUrl: true } },
          _count: { select: { comments: { where: { deletedAt: null } }, likes: true } },
        },
        orderBy,
        skip, take: limit,
      }),
      prisma.post.count({ where }),
    ])

    const grades = await gradesFor([...new Set(rows.map(r => r.author.id))])
    const posts = rows.map(({ imageUrls, ...p }) => ({
      ...p,
      thumbnail: imageUrls[0] ?? p.imageUrl ?? null,
      imageCount: imageUrls.length || (p.imageUrl ? 1 : 0),
      isBest: p._count.likes >= BEST_THRESHOLD,
      author: { ...p.author, grade: grades[p.author.id] },
    }))

    res.json({ posts, total, page, limit, totalPages: Math.ceil(total / limit) })
  } catch (err) {
    console.error('[getPosts]', err)
    res.status(500).json({ message: '게시글 조회 실패' })
  }
}

// 카페 사이드바: 게시판별 글 수, 오늘 새 글, 주간 인기글, 공지, 내 활동
export async function getCommunityStats(req: AuthRequest, res: Response) {
  try {
    const community = { type: 'COMMUNITY' as const }
    const weekAgo = new Date(Date.now() - 7 * 86400_000)
    const [byCategory, total, today, weeklyTop, notices, myPosts, myComments, myScraps, settings] = await Promise.all([
      prisma.post.groupBy({ by: ['category'], where: community, _count: true }),
      prisma.post.count({ where: community }),
      prisma.post.count({ where: { ...community, createdAt: { gte: startOfTodayKst() } } }),
      prisma.post.findMany({
        where: { ...community, createdAt: { gte: weekAgo } },
        orderBy: [{ likes: { _count: 'desc' } }, { viewCount: 'desc' }],
        take: 5,
        select: { id: true, title: true, _count: { select: { likes: true, comments: { where: { deletedAt: null } } } } },
      }),
      prisma.post.findMany({
        where: { type: { in: ['NOTICE', 'EVENT'] } },
        orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
        take: 3,
        select: { id: true, type: true, title: true, createdAt: true },
      }),
      req.userId ? prisma.post.count({ where: { ...community, authorId: req.userId } }) : Promise.resolve(null),
      req.userId ? prisma.comment.count({ where: { authorId: req.userId, deletedAt: null } }) : Promise.resolve(null),
      req.userId ? prisma.postScrap.count({ where: { userId: req.userId } }) : Promise.resolve(null),
      prisma.boardSetting.findMany(),
    ])
    const settingMap = new Map(settings.map(b => [b.category, b]))

    res.json({
      total,
      today,
      byCategory: Object.fromEntries(byCategory.map(r => [r.category ?? 'FREE', r._count])),
      weeklyTop: weeklyTop.filter(p => p._count.likes > 0 || p._count.comments > 0),
      notices,
      me: myPosts === null ? null : {
        postCount: myPosts,
        commentCount: myComments,
        scrapCount: myScraps ?? 0,
        grade: activityGrade(myPosts, myComments ?? 0),
      },
      boards: VALID_CATEGORIES.map(category => ({
        category,
        writePermission: settingMap.get(category)?.writePermission ?? 'ALL',
        commentPermission: settingMap.get(category)?.commentPermission ?? 'ALL',
      })),
      bestThreshold: BEST_THRESHOLD,
    })
  } catch (err) {
    console.error('[getCommunityStats]', err)
    res.status(500).json({ message: '게시판 정보 조회 실패' })
  }
}

export async function getPost(req: AuthRequest, res: Response) {
  try {
    const id     = String(req.params.id)
    const userId = req.userId

    const post = await prisma.post.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, nickname: true, avatarUrl: true } },
        _count: { select: { likes: true, scraps: true } },
        likes: userId ? { where: { userId }, select: { userId: true } } : false,
        scraps: userId ? { where: { userId }, select: { userId: true } } : false,
        comments: {
          include: {
            author: { select: { id: true, nickname: true, avatarUrl: true } },
            _count: { select: { likes: true } },
            likes: userId ? { where: { userId }, select: { userId: true } } : false,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    })
    if (!post) { res.status(404).json({ message: '게시글을 찾을 수 없습니다.' }); return }

    // 본인 조회는 제외, 같은 사람은 24시간에 한 번만
    const counted = userId !== post.authorId && await registerView(id, viewerKey(req))
    if (Math.random() < 0.01) {
      prisma.postView.deleteMany({ where: { viewedAt: { lt: new Date(Date.now() - 2 * VIEW_WINDOW_MS) } } }).catch(() => {})
    }
    if (counted) {
      await prisma.post.update({ where: { id }, data: { viewCount: { increment: 1 } } })
    }

    // 같은 게시판 내 이전글(더 오래된 글) / 다음글(더 최근 글)
    const sameBoard: Prisma.PostWhereInput = post.type === 'COMMUNITY'
      ? { type: 'COMMUNITY', ...(post.category ? { category: post.category } : {}) }
      : { type: post.type }
    const [prev, next, grades] = await Promise.all([
      prisma.post.findFirst({ where: { ...sameBoard, createdAt: { lt: post.createdAt } }, orderBy: { createdAt: 'desc' }, select: { id: true, title: true } }),
      prisma.post.findFirst({ where: { ...sameBoard, createdAt: { gt: post.createdAt } }, orderBy: { createdAt: 'asc' }, select: { id: true, title: true } }),
      gradesFor([...new Set([post.authorId, ...post.comments.map(c => c.authorId)])]),
    ])

    const { likes: postLikes, scraps: postScraps, _count, comments, ...rest } = post
    res.json({
      ...rest,
      viewCount: rest.viewCount + (counted ? 1 : 0),
      likeCount: _count.likes,
      likedByMe: !!postLikes?.length,
      scrapCount: _count.scraps,
      scrappedByMe: !!postScraps?.length,
      isBest:    _count.likes >= BEST_THRESHOLD,
      author:    { ...rest.author, grade: grades[rest.author.id] },
      prev, next,
      comments: comments.map(({ likes: cLikes, _count: cCount, ...c }) => {
        const deleted = !!c.deletedAt
        return {
          ...c,
          content:   deleted ? null : c.content,
          author:    deleted ? null : { ...c.author, grade: grades[c.author.id] },
          likeCount: cCount.likes,
          likedByMe: !!cLikes?.length,
        }
      }),
    })
  } catch (err) {
    console.error('[getPost]', err)
    res.status(500).json({ message: '게시글 조회 실패' })
  }
}

// ── 스크랩 토글 ───────────────────────────────────────────────────────────

export async function togglePostScrap(req: AuthRequest, res: Response) {
  try {
    const postId = String(req.params.id)
    const userId = req.userId!
    const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true } })
    if (!post) { res.status(404).json({ message: '게시글을 찾을 수 없습니다.' }); return }
    const existing = await prisma.postScrap.findUnique({ where: { postId_userId: { postId, userId } } })
    if (existing) {
      await prisma.postScrap.delete({ where: { postId_userId: { postId, userId } } })
    } else {
      await prisma.postScrap.create({ data: { postId, userId } })
    }
    const scrapCount = await prisma.postScrap.count({ where: { postId } })
    res.json({ scrapped: !existing, scrapCount })
  } catch (err) {
    console.error('[togglePostScrap]', err)
    res.status(500).json({ message: '스크랩 처리 실패' })
  }
}

// ── 좋아요 토글 ───────────────────────────────────────────────────────────

export async function togglePostLike(req: AuthRequest, res: Response) {
  try {
    const postId = String(req.params.id)
    const userId = req.userId!
    const existing = await prisma.postLike.findUnique({ where: { postId_userId: { postId, userId } } })
    if (existing) {
      await prisma.postLike.delete({ where: { postId_userId: { postId, userId } } })
    } else {
      await prisma.postLike.create({ data: { postId, userId } })
    }
    const likeCount = await prisma.postLike.count({ where: { postId } })
    res.json({ liked: !existing, likeCount })
  } catch (err) {
    console.error('[togglePostLike]', err)
    res.status(500).json({ message: '좋아요 처리 실패' })
  }
}

export async function toggleCommentLike(req: AuthRequest, res: Response) {
  try {
    const commentId = String(req.params.commentId)
    const userId    = req.userId!
    const existing = await prisma.commentLike.findUnique({ where: { commentId_userId: { commentId, userId } } })
    if (existing) {
      await prisma.commentLike.delete({ where: { commentId_userId: { commentId, userId } } })
    } else {
      await prisma.commentLike.create({ data: { commentId, userId } })
    }
    const likeCount = await prisma.commentLike.count({ where: { commentId } })
    res.json({ liked: !existing, likeCount })
  } catch (err) {
    console.error('[toggleCommentLike]', err)
    res.status(500).json({ message: '좋아요 처리 실패' })
  }
}

// ── 댓글 ──────────────────────────────────────────────────────────────────

export async function addComment(req: AuthRequest, res: Response) {
  const parsed = commentSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ message: parsed.error.errors[0]?.message ?? '입력값 오류' }); return }
  const { content } = parsed.data

  try {
    const postId = String(req.params.id)
    const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true, type: true, title: true, authorId: true, category: true } })
    if (!post) { res.status(404).json({ message: '게시글을 찾을 수 없습니다.' }); return }
    if (post.type === 'COMMUNITY' && post.category) {
      const denied = await permissionDenied((await boardSetting(post.category)).commentPermission, req.userId!, req.userRole)
      if (denied) { res.status(403).json({ message: denied.replace('작성할', '댓글을 달') }); return }
    }

    // 답글은 1단계만: 답글에 단 답글은 원 댓글 아래로 붙임
    let parentId: string | null = null
    let parentAuthorId: string | null = null
    if (parsed.data.parentId) {
      const parent = await prisma.comment.findUnique({
        where: { id: parsed.data.parentId },
        select: { id: true, postId: true, parentId: true, authorId: true, deletedAt: true },
      })
      if (!parent || parent.postId !== postId) { res.status(400).json({ message: '답글을 달 댓글을 찾을 수 없습니다.' }); return }
      if (parent.deletedAt && !parent.parentId) { res.status(400).json({ message: '삭제된 댓글에는 답글을 달 수 없습니다.' }); return }
      parentId = parent.parentId ?? parent.id
      parentAuthorId = parent.authorId
    }

    const comment = await prisma.comment.create({
      data: { postId, authorId: req.userId!, content, parentId },
      include: { author: { select: { id: true, nickname: true, avatarUrl: true } } },
    })

    // 알림: 글쓴이 + 답글 대상 댓글 작성자 (본인 제외, 중복 제외)
    const link = post.type === 'COMMUNITY' ? `/community/${postId}` : `/notice/${postId}`
    const shortTitle = post.title.length > 30 ? `${post.title.slice(0, 30)}…` : post.title
    const targets = new Map<string, string>()
    if (parentAuthorId && parentAuthorId !== req.userId) targets.set(parentAuthorId, '내 댓글에 답글이 달렸습니다')
    if (post.authorId !== req.userId && !targets.has(post.authorId)) targets.set(post.authorId, '내 글에 새 댓글이 달렸습니다')
    for (const [userId, title] of targets) {
      notify({ userId, type: 'COMMUNITY_COMMENT', title, body: `「${shortTitle}」 ${content.slice(0, 60)}`, link })
        .catch(e => console.error('[notify COMMUNITY_COMMENT]', e))
    }

    res.status(201).json({ ...comment, likeCount: 0, likedByMe: false })
  } catch (err) {
    console.error('[addComment]', err)
    res.status(500).json({ message: '댓글 작성 실패' })
  }
}

export async function updateComment(req: AuthRequest, res: Response) {
  const parsed = commentSchema.pick({ content: true }).safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ message: parsed.error.errors[0]?.message ?? '입력값 오류' }); return }
  try {
    const commentId = String(req.params.commentId)
    const comment = await prisma.comment.findUnique({ where: { id: commentId }, select: { authorId: true, deletedAt: true } })
    if (!comment || comment.deletedAt) { res.status(404).json({ message: '댓글을 찾을 수 없습니다.' }); return }
    if (comment.authorId !== req.userId) { res.status(403).json({ message: '본인 댓글만 수정할 수 있습니다.' }); return }
    const updated = await prisma.comment.update({ where: { id: commentId }, data: { content: parsed.data.content } })
    res.json({ id: updated.id, content: updated.content, updatedAt: updated.updatedAt })
  } catch (err) {
    console.error('[updateComment]', err)
    res.status(500).json({ message: '댓글 수정 실패' })
  }
}

export async function deleteComment(req: AuthRequest, res: Response) {
  try {
    const commentId = String(req.params.commentId)
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      select: { authorId: true, parentId: true, deletedAt: true, _count: { select: { replies: true } } },
    })
    if (!comment || comment.deletedAt) { res.status(404).json({ message: '댓글을 찾을 수 없습니다.' }); return }
    if (comment.authorId !== req.userId && !isAdminRole(req.userRole)) {
      res.status(403).json({ message: '권한이 없습니다.' }); return
    }

    if (comment._count.replies > 0) {
      // 답글이 있으면 자리만 남김
      await prisma.comment.update({ where: { id: commentId }, data: { deletedAt: new Date(), content: '' } })
    } else {
      await prisma.comment.delete({ where: { id: commentId } })
      // 마지막 답글이 지워져 비어버린 삭제 댓글 정리
      if (comment.parentId) {
        await prisma.comment.deleteMany({ where: { id: comment.parentId, deletedAt: { not: null }, replies: { none: {} } } })
      }
    }
    res.json({ ok: true })
  } catch (err) {
    console.error('[deleteComment]', err)
    res.status(500).json({ message: '댓글 삭제 실패' })
  }
}

// ── 일반 유저 (커뮤니티만) ────────────────────────────────────────────────

export async function userCreatePost(req: AuthRequest, res: Response) {
  const parsed = communityPostSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ message: parsed.error.errors[0]?.message ?? '입력값 오류' }); return }
  const { title, category, tcgType } = parsed.data
  try {
    const denied = await permissionDenied((await boardSetting(category)).writePermission, req.userId!, req.userRole)
    if (denied) { res.status(403).json({ message: denied }); return }
    const body = prepareContent(parsed.data.format, parsed.data.content, parsed.data.imageUrls)
    if (!body) { res.status(400).json({ message: '내용을 입력해주세요.' }); return }

    const post = await prisma.post.create({
      data: {
        type: 'COMMUNITY', title, category, ...body,
        imageUrl: body.imageUrls[0] ?? null,
        tcgType: tcgType ?? null,
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
  const parsed = communityPostSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ message: parsed.error.errors[0]?.message ?? '입력값 오류' }); return }
  const { title, category, tcgType } = parsed.data
  try {
    const id = String(req.params.id)
    const post = await prisma.post.findUnique({ where: { id }, select: { authorId: true, type: true, category: true } })
    if (!post) { res.status(404).json({ message: '게시글을 찾을 수 없습니다.' }); return }
    if (post.type !== 'COMMUNITY') { res.status(403).json({ message: '커뮤니티 게시글만 수정할 수 있습니다.' }); return }
    if (post.authorId !== req.userId) { res.status(403).json({ message: '본인 게시글만 수정할 수 있습니다.' }); return }

    if (category !== post.category) {
      const denied = await permissionDenied((await boardSetting(category)).writePermission, req.userId!, req.userRole)
      if (denied) { res.status(403).json({ message: denied }); return }
    }
    const body = prepareContent(parsed.data.format, parsed.data.content, parsed.data.imageUrls)
    if (!body) { res.status(400).json({ message: '내용을 입력해주세요.' }); return }

    const updated = await prisma.post.update({
      where: { id },
      data: { title, category, ...body, imageUrl: body.imageUrls[0] ?? null, tcgType: tcgType ?? null },
    })
    res.json(updated)
  } catch (err) {
    console.error('[userUpdatePost]', err)
    res.status(500).json({ message: '게시글 수정 실패' })
  }
}

export async function userDeletePost(req: AuthRequest, res: Response) {
  try {
    const id = String(req.params.id)
    const post = await prisma.post.findUnique({ where: { id }, select: { authorId: true } })
    if (!post) { res.status(404).json({ message: '게시글을 찾을 수 없습니다.' }); return }
    if (post.authorId !== req.userId && !isAdminRole(req.userRole)) {
      res.status(403).json({ message: '권한이 없습니다.' }); return
    }
    await prisma.post.delete({ where: { id } })
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
    const post = await prisma.post.create({
      data: {
        ...body,
        authorId:     req.userId!,
        eventStartAt: body.eventStartAt ?? null,
        eventEndAt:   body.eventEndAt   ?? null,
        imageUrl:     body.imageUrl     ?? null,
        tcgType:      body.type === 'COMMUNITY' ? (body.tcgType ?? null) : null,
        category:     body.type === 'COMMUNITY' ? 'FREE' : null,
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
    const id   = String(req.params.id)
    const body = createPostSchema.partial().parse(req.body)
    const post = await prisma.post.update({
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
    const id = String(req.params.id)
    const current = await prisma.post.findUnique({ where: { id }, select: { pinned: true, type: true } })
    if (!current) { res.status(404).json({ message: '게시글을 찾을 수 없습니다.' }); return }
    if (current.type === 'COMMUNITY') { res.status(400).json({ message: '커뮤니티 게시글은 고정할 수 없습니다.' }); return }
    const post = await prisma.post.update({ where: { id }, data: { pinned: !current.pinned } })
    res.json({ pinned: post.pinned })
  } catch (err) {
    console.error('[adminTogglePin]', err)
    res.status(500).json({ message: '고정 처리 실패' })
  }
}

const boardSettingSchema = z.object({
  writePermission:   z.nativeEnum(BoardPermission).optional(),
  commentPermission: z.nativeEnum(BoardPermission).optional(),
})

export async function adminUpdateBoardSetting(req: AuthRequest, res: Response) {
  const category = String(req.params.category)
  if (!(VALID_CATEGORIES as string[]).includes(category)) { res.status(404).json({ message: '게시판을 찾을 수 없습니다.' }); return }
  const parsed = boardSettingSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ message: '권한 값이 올바르지 않습니다.' }); return }
  try {
    const setting = await prisma.boardSetting.upsert({
      where: { category: category as BoardCategory },
      create: { category: category as BoardCategory, ...parsed.data },
      update: parsed.data,
    })
    res.json(setting)
  } catch (err) {
    console.error('[adminUpdateBoardSetting]', err)
    res.status(500).json({ message: '게시판 설정 저장 실패' })
  }
}

export async function adminDeletePost(req: AuthRequest, res: Response) {
  try {
    await prisma.post.delete({ where: { id: String(req.params.id) } })
    res.json({ ok: true })
  } catch (err) {
    console.error('[adminDeletePost]', err)
    res.status(500).json({ message: '게시글 삭제 실패' })
  }
}


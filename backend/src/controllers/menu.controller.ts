import { Request, Response } from 'express'
import { prisma } from '../lib/prisma'

const DEFAULT_MENUS = [
  { key: 'marketplace', label: '마켓플레이스', path: '/listings',  order: 1 },
  { key: 'shop',        label: '샵',          path: '/shop',      order: 2 },
  { key: 'notice',      label: '공지/이벤트',  path: '/notice',    order: 3 },
  { key: 'community',   label: '공유 게시판',  path: '/community', order: 4 },
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any

async function ensureMenus() {
  for (const m of DEFAULT_MENUS) {
    await db.siteMenu.upsert({
      where: { key: m.key },
      update: {},
      create: { key: m.key, label: m.label, path: m.path, order: m.order, enabled: true },
    })
  }
}

export async function getMenus(_req: Request, res: Response) {
  try {
    await ensureMenus()
    const menus = await db.siteMenu.findMany({ orderBy: { order: 'asc' } })
    res.json(menus)
  } catch (err) {
    console.error('[getMenus]', err)
    res.status(500).json({ message: '메뉴 조회 실패' })
  }
}

export async function toggleMenu(req: Request, res: Response) {
  try {
    const key = req.params.key as string
    const menu = await db.siteMenu.findUnique({ where: { key } })
    if (!menu) { res.status(404).json({ message: '메뉴를 찾을 수 없습니다.' }); return }
    const updated = await db.siteMenu.update({
      where: { key },
      data: { enabled: !menu.enabled },
    })
    res.json(updated)
  } catch (err) {
    console.error('[toggleMenu]', err)
    res.status(500).json({ message: '메뉴 상태 변경 실패' })
  }
}

export async function updateMenuOrder(req: Request, res: Response) {
  try {
    const items = req.body.items as { key: string; order: number }[]
    if (!Array.isArray(items)) { res.status(400).json({ message: '올바른 형식이 아닙니다.' }); return }
    await Promise.all(items.map(i => db.siteMenu.update({ where: { key: i.key }, data: { order: i.order } })))
    res.json({ ok: true })
  } catch (err) {
    console.error('[updateMenuOrder]', err)
    res.status(500).json({ message: '메뉴 순서 변경 실패' })
  }
}

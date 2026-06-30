import { Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'

const KEY = 'maintenance'

interface MaintenanceValue {
  enabled: boolean
  message: string
  endsAt: string | null
}

const DEFAULT: MaintenanceValue = { enabled: false, message: '', endsAt: null }

function parse(raw: string | undefined): MaintenanceValue {
  try { return raw ? JSON.parse(raw) : DEFAULT } catch { return DEFAULT }
}

export async function getMaintenanceStatus(_req: Request, res: Response) {
  try {
    const row = await prisma.siteConfig.findUnique({ where: { key: KEY } })
    res.json(parse(row?.value))
  } catch {
    res.json(DEFAULT)
  }
}

export async function updateMaintenance(req: AuthRequest, res: Response) {
  const { enabled, message, endsAt } = req.body as Partial<MaintenanceValue>
  const current = parse(
    (await prisma.siteConfig.findUnique({ where: { key: KEY } }))?.value
  )
  const next: MaintenanceValue = {
    enabled:  enabled  !== undefined ? !!enabled  : current.enabled,
    message:  message  !== undefined ? String(message)  : current.message,
    endsAt:   endsAt   !== undefined ? (endsAt || null)  : current.endsAt,
  }
  try {
    await prisma.siteConfig.upsert({
      where:  { key: KEY },
      create: { key: KEY, value: JSON.stringify(next) },
      update: { value: JSON.stringify(next) },
    })
    res.json(next)
  } catch (err) {
    console.error('[updateMaintenance]', err)
    res.status(500).json({ message: '서버 오류가 발생했습니다.' })
  }
}

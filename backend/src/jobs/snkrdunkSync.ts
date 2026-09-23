import { prisma } from '../lib/prisma'
import { runSnkrdunkSync, SyncBusyError } from '../services/syncRun.service'

// ── 스니덩 시세 자동 동기화 (매일 KST 지정 시각) ──────────────────────────────
// SNKRDUNK_SYNC_ENABLED  : true/false (기본: production에서만 켜짐)
// SNKRDUNK_SYNC_HOUR_KST : 0~23 (기본 4시)

const CATCH_UP_DELAY_MS = 5 * 60 * 1000   // 서버 시작 후 따라잡기 실행까지 대기
const CATCH_UP_AFTER_H = 26               // 마지막 성공이 이보다 오래되면 따라잡기

let nextRunAt: Date | null = null

export function snkrdunkSyncEnabled() {
  const v = process.env.SNKRDUNK_SYNC_ENABLED
  return v ? v === 'true' : process.env.NODE_ENV === 'production'
}

export function snkrdunkSyncHourKst() {
  const h = Number(process.env.SNKRDUNK_SYNC_HOUR_KST ?? 4)
  return Number.isInteger(h) && h >= 0 && h <= 23 ? h : 4
}

export function snkrdunkSchedule() {
  return { enabled: snkrdunkSyncEnabled(), hourKst: snkrdunkSyncHourKst(), nextRunAt }
}

// 다음 KST hour:00 시각
export function nextKstRun(hourKst: number, now = new Date()): Date {
  const kstNow = new Date(now.getTime() + 9 * 3600_000)
  const target = new Date(Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate(), hourKst) - 9 * 3600_000)
  if (target.getTime() <= now.getTime()) target.setUTCDate(target.getUTCDate() + 1)
  return target
}

async function runScheduled(label: string) {
  try {
    const { run } = await runSnkrdunkSync({ trigger: 'SCHEDULE' })
    console.log(`[SnkrdunkSync] ${label} ${run.status}`, run.stats)
  } catch (err) {
    if (err instanceof SyncBusyError) console.log(`[SnkrdunkSync] ${label} 건너뜀 — 이미 실행 중`)
    else console.error(`[SnkrdunkSync] ${label} 실패`, err)
  }
}

function scheduleNext() {
  nextRunAt = nextKstRun(snkrdunkSyncHourKst())
  const t = setTimeout(async () => {
    await runScheduled('정기 실행')
    scheduleNext()
  }, nextRunAt.getTime() - Date.now())
  t.unref?.()
}

export function startSnkrdunkSyncJob() {
  if (!snkrdunkSyncEnabled()) {
    console.log('[SnkrdunkSync] 자동 동기화 꺼짐 (SNKRDUNK_SYNC_ENABLED=true 로 켤 수 있음)')
    return
  }
  scheduleNext()
  console.log(`[SnkrdunkSync] 자동 동기화 예약 — 매일 ${snkrdunkSyncHourKst()}시(KST), 다음 ${nextRunAt?.toISOString()}`)

  // 서버가 예약 시각에 꺼져 있었으면 시작 직후 한 번 따라잡기
  const t = setTimeout(async () => {
    const last = await prisma.syncRun.findFirst({
      where: { source: 'SNKRDUNK', status: 'SUCCESS' }, orderBy: { startedAt: 'desc' }, select: { startedAt: true },
    }).catch(() => null)
    if (!last || Date.now() - last.startedAt.getTime() > CATCH_UP_AFTER_H * 3600_000) await runScheduled('따라잡기 실행')
  }, CATCH_UP_DELAY_MS)
  t.unref?.()
}

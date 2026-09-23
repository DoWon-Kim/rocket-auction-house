import { Prisma, SyncRun, SyncTrigger } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { notify } from '../lib/notify'
import { syncSnkrdunk, kstDay, type SyncEvent, type SyncTotals } from './snkrdunk.service'

// ── 외부 소스 동기화 실행 관리 ────────────────────────────────────────────────
// - DB 락: 같은 소스 동기화는 서버가 여러 대여도 한 번에 하나만
// - 실행 기록: 상태·통계·경고를 SyncRun에 남겨 관리자 화면에서 확인
// - 이상 감지: 가져온 수가 급감하거나 오류가 나면 최종 관리자에게 알림

const STALE_MS = 10 * 60 * 1000          // 하트비트가 이만큼 멈추면 비정상 종료로 간주
const HEARTBEAT_MS = 20 * 1000
const SNAPSHOT_RETENTION_DAYS = 400

export class SyncBusyError extends Error {
  constructor(public running: SyncRun) { super('이미 동기화가 실행 중입니다.') }
}

// 실행 중 취소 요청 (같은 프로세스에서 시작한 실행만)
const cancelRequests = new Set<string>()
export function requestCancel(runId: string) { cancelRequests.add(runId) }

async function acquireRun(trigger: SyncTrigger, triggeredById?: string): Promise<SyncRun> {
  return prisma.$transaction(async tx => {
    // 트랜잭션 범위 advisory lock으로 "확인 후 생성" 구간 직렬화
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('sync-run:SNKRDUNK'))`
    await tx.syncRun.updateMany({
      where: { source: 'SNKRDUNK', status: 'RUNNING', heartbeatAt: { lt: new Date(Date.now() - STALE_MS) } },
      data: { status: 'FAILED', finishedAt: new Date(), error: '응답 없음 — 서버 재시작 등으로 중단된 것으로 보입니다.' },
    })
    const running = await tx.syncRun.findFirst({ where: { source: 'SNKRDUNK', status: 'RUNNING' } })
    if (running) throw new SyncBusyError(running)
    return tx.syncRun.create({ data: { source: 'SNKRDUNK', trigger, triggeredById } })
  })
}

export function evaluateWarnings(totals: SyncTotals & { errors: number; emptyBrands: string[] }, prevFetched: number | null): string[] {
  const w: string[] = []
  if (prevFetched && prevFetched >= 500 && totals.fetched < prevFetched * 0.5) {
    w.push(`가져온 상품 수가 지난 실행의 절반 미만입니다 (${prevFetched.toLocaleString()} → ${totals.fetched.toLocaleString()}). API 변경·차단 여부를 확인하세요.`)
  }
  for (const b of totals.emptyBrands) w.push(`${b} 상품을 하나도 가져오지 못했습니다.`)
  if (totals.errors > 0) w.push(`페이지·항목 처리 오류 ${totals.errors.toLocaleString()}건`)
  return w
}

async function alertAdmins(title: string, body: string) {
  const admins = await prisma.user.findMany({ where: { role: 'SUPER_ADMIN' }, select: { id: true } })
  await Promise.all(admins.map(a => notify({ userId: a.id, type: 'SYSTEM', title, body, link: '/admin/card-sources' })))
}

export interface RunResult { run: SyncRun; totals: SyncTotals | null }

export async function runSnkrdunkSync(opts: {
  trigger: SyncTrigger
  triggeredById?: string
  onEvent?: (e: SyncEvent) => void
  isCancelled?: () => boolean
  onStart?: (run: SyncRun) => void
  maxPages?: number   // 점검·테스트용 페이지 제한
}): Promise<RunResult> {
  const run = await acquireRun(opts.trigger, opts.triggeredById)
  opts.onStart?.(run)
  const t0 = Date.now()
  let errors = 0
  const emptyBrands: string[] = []
  let lastBeat = 0
  let beat: Promise<unknown> = Promise.resolve()   // 마지막 하트비트 (최종 기록보다 늦게 덮어쓰지 않도록 대기)
  const cancelled = () => cancelRequests.has(run.id) || (opts.isCancelled?.() ?? false)

  try {
    const totals = await syncSnkrdunk({
      maxPages: opts.maxPages,
      isCancelled: cancelled,
      onEvent: e => {
        opts.onEvent?.(e)
        if (e.type === 'error' || e.type === 'item-error') errors++
        if (e.type === 'brand-done' && !e.fetched && !cancelled()) emptyBrands.push(String(e.brand))
        if (Date.now() - lastBeat > HEARTBEAT_MS) {
          lastBeat = Date.now()
          beat = prisma.syncRun.update({ where: { id: run.id }, data: { heartbeatAt: new Date(), stats: { progress: e } as Prisma.InputJsonValue } })
            .catch(() => { /* 하트비트 실패는 무시 */ })
        }
      },
    })

    await beat
    const wasCancelled = cancelled()
    const prev = await prisma.syncRun.findFirst({
      where: { source: 'SNKRDUNK', status: 'SUCCESS', id: { not: run.id } },
      orderBy: { startedAt: 'desc' }, select: { stats: true },
    })
    const prevFetched = (prev?.stats as { fetched?: number } | null)?.fetched ?? null
    const warnings = wasCancelled ? [] : evaluateWarnings({ ...totals, errors, emptyBrands }, prevFetched)
    const failed = !wasCancelled && totals.fetched === 0

    if (!wasCancelled && !failed) {
      await prisma.cardPriceSnapshot.deleteMany({
        where: { source: 'SNKRDUNK', date: { lt: kstDay(new Date(Date.now() - SNAPSHOT_RETENTION_DAYS * 86400_000)) } },
      })
    }

    const done = await prisma.syncRun.update({
      where: { id: run.id },
      data: {
        status: wasCancelled ? 'CANCELLED' : failed ? 'FAILED' : 'SUCCESS',
        finishedAt: new Date(), heartbeatAt: new Date(),
        stats: { ...totals, errors, durationSec: Math.round((Date.now() - t0) / 1000) },
        warnings,
        error: failed ? '가져온 상품이 없습니다. API 응답 형식 변경 또는 접속 차단 가능성이 있습니다.' : null,
      },
    })
    if (failed) await alertAdmins('스니덩 시세 동기화 실패', done.error ?? '')
    else if (warnings.length) await alertAdmins('스니덩 시세 동기화 경고', warnings.join('\n'))
    return { run: done, totals }
  } catch (err) {
    await beat
    const done = await prisma.syncRun.update({
      where: { id: run.id },
      data: { status: 'FAILED', finishedAt: new Date(), error: String(err).slice(0, 1000), stats: { errors, durationSec: Math.round((Date.now() - t0) / 1000) } },
    })
    await alertAdmins('스니덩 시세 동기화 실패', done.error ?? '')
    return { run: done, totals: null }
  } finally {
    cancelRequests.delete(run.id)
  }
}

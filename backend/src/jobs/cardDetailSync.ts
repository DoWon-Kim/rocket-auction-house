import { runCardDetailSync, CardDetailBusyError } from '../services/cardDetail.service'
import { mineOfficialPairs, applyKorean } from '../services/koDex.service'
import { nextKstRun } from './snkrdunkSync'

// ── 카드 상세·세트 정보 자동 보강 + 한국어 적용 (매일 KST 5시, 새로 임포트된 카드만) ──
// CARD_DETAIL_SYNC_ENABLED : true/false (기본: production에서만 켜짐)

const DAILY_MAX_CARDS = 5000

function enabled() {
  const v = process.env.CARD_DETAIL_SYNC_ENABLED
  return v ? v === 'true' : process.env.NODE_ENV === 'production'
}

function scheduleNext() {
  const at = nextKstRun(5)
  const t = setTimeout(async () => {
    try {
      const r = await runCardDetailSync({ maxCards: DAILY_MAX_CARDS })
      // 새로 보강된 한판 카드로 사전을 갱신하고, 일판·영문판 카드에 한국어를 다시 적용
      const mined = await mineOfficialPairs()
      const applied = await applyKorean()
      console.log('[CardDetailSync] 완료', r, mined, applied)
    } catch (err) {
      if (err instanceof CardDetailBusyError) console.log('[CardDetailSync] 건너뜀 — 이미 실행 중')
      else console.error('[CardDetailSync] 실패', err)
    }
    scheduleNext()
  }, at.getTime() - Date.now())
  t.unref?.()
}

export function startCardDetailSyncJob() {
  if (!enabled()) {
    console.log('[CardDetailSync] 자동 보강 꺼짐 (CARD_DETAIL_SYNC_ENABLED=true 로 켤 수 있음)')
    return
  }
  scheduleNext()
}

'use client'

import { useCallback, useSyncExternalStore } from 'react'

// "한국어로 보기" 설정 (기본 켜짐). 브라우저에 저장하고 같은 페이지의 다른 컴포넌트와 즉시 공유
const KEY = 'ko-view'
const EVENT = 'ko-view-change'

function read(): boolean {
  try { return localStorage.getItem(KEY) !== 'off' } catch { return true }
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb)
  window.addEventListener('storage', cb)
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener('storage', cb) }
}

export function useKoreanView() {
  const on = useSyncExternalStore(subscribe, read, () => true)
  const toggle = useCallback(() => {
    try { localStorage.setItem(KEY, read() ? 'off' : 'on') } catch { /* 저장 불가 환경 무시 */ }
    window.dispatchEvent(new Event(EVENT))
  }, [])
  return { on, toggle }
}

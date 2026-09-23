'use client'

import { useRef, type ReactNode } from 'react'

// 포인터 위치에 따라 기울고 홀로그램 광택이 따라오는 카드 프레임.
// 상태 없이 CSS 변수만 갱신해 리렌더를 일으키지 않음.
export function TiltCard({ children, className = '', glowClassName = 'bg-accent/35' }: {
  children: ReactNode
  className?: string
  glowClassName?: string
}) {
  const ref = useRef<HTMLDivElement>(null)

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const el = ref.current
    if (!el || e.pointerType !== 'mouse') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const r = el.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    const y = (e.clientY - r.top) / r.height
    el.style.setProperty('--rx', `${(0.5 - y) * 14}deg`)
    el.style.setProperty('--ry', `${(x - 0.5) * 18}deg`)
    el.style.setProperty('--gx', `${x * 100}%`)
    el.style.setProperty('--gy', `${y * 100}%`)
    el.style.setProperty('--go', '1')
  }

  function onLeave() {
    const el = ref.current
    if (!el) return
    el.style.setProperty('--rx', '0deg')
    el.style.setProperty('--ry', '0deg')
    el.style.setProperty('--go', '0')
  }

  return (
    <div className={`relative [perspective:1200px] ${className}`}>
      {/* 뒤쪽 글로우 */}
      <div className={`absolute inset-[8%] rounded-[24px] blur-3xl ${glowClassName}`} />
      <div
        ref={ref}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        className="relative rounded-[20px] overflow-hidden ring-1 ring-white/10 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] transition-transform duration-300 ease-out will-change-transform [transform:rotateX(var(--rx,0deg))_rotateY(var(--ry,0deg))]"
      >
        {children}
        {/* 광택 */}
        <div
          className="pointer-events-none absolute inset-0 mix-blend-screen transition-opacity duration-300 [opacity:var(--go,0)]"
          style={{
            background:
              'radial-gradient(circle at var(--gx,50%) var(--gy,50%), rgba(255,255,255,0.28), transparent 45%), linear-gradient(115deg, transparent 25%, rgba(167,139,250,0.22) 45%, rgba(34,211,238,0.18) 55%, transparent 75%)',
          }}
        />
      </div>
    </div>
  )
}

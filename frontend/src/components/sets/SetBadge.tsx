// 세트 로고 (없으면 세트 코드로 대체)
export function SetBadge({ set, size = 'md' }: { set: { logoUrl: string | null; code: string }; size?: 'md' | 'lg' }) {
  const box = size === 'lg' ? 'h-24 w-full sm:w-48' : 'h-16 w-full'
  if (set.logoUrl) {
    return (
      <div className={`${box} flex items-center justify-center`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- 세트 로고 호스트(TCGdex·pokemontcg)가 여러 곳이라 img 사용 */}
        <img src={set.logoUrl} alt="" loading="lazy" className="max-h-full max-w-full object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]" />
      </div>
    )
  }
  // 로고가 없는 세트(일판 등)는 세트 코드로 표시
  return (
    <div className={`${box} flex items-center justify-center rounded-xl bg-gradient-to-br from-accent/20 via-surface-2 to-sky-500/10 border border-line`}>
      <span className={`font-display font-bold tracking-tight text-fg ${size === 'lg' ? 'text-3xl' : 'text-xl'}`}>{set.code}</span>
    </div>
  )
}

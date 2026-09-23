import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center space-y-6">
      <div className="text-8xl font-black text-surface-2 select-none">404</div>
      <div>
        <h1 className="text-[26px] sm:text-3xl font-bold tracking-tight text-fg mb-2">페이지를 찾을 수 없습니다</h1>
        <p className="text-muted-2 text-sm">요청하신 페이지가 존재하지 않거나 이동되었습니다.</p>
      </div>
      <div className="flex gap-3">
        <Link href="/"
          className="h-10 px-6 flex items-center bg-accent hover:bg-accent-strong text-white text-sm font-semibold rounded-xl transition-all shadow-[0_0_16px_rgba(139,92,246,0.2)]">
          홈으로 가기
        </Link>
        <Link href="/listings"
          className="h-10 px-6 flex items-center bg-surface border border-line hover:border-line-strong text-fg-3 hover:text-fg-2 text-sm rounded-xl transition-all">
          마켓플레이스
        </Link>
      </div>
    </div>
  )
}

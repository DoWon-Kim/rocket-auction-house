import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center space-y-6">
      <div className="text-8xl font-black text-[#221a12] select-none">404</div>
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">페이지를 찾을 수 없습니다</h1>
        <p className="text-[#7a6040] text-sm">요청하신 페이지가 존재하지 않거나 이동되었습니다.</p>
      </div>
      <div className="flex gap-3">
        <Link href="/"
          className="h-10 px-6 flex items-center bg-[#d4a853] hover:bg-[#c49440] text-white text-sm font-semibold rounded-xl transition-all shadow-[0_0_16px_rgba(212,168,83,0.2)]">
          홈으로 가기
        </Link>
        <Link href="/listings"
          className="h-10 px-6 flex items-center bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] text-[#9e8a6a] hover:text-[#e8d5b0] text-sm rounded-xl transition-all">
          마켓플레이스
        </Link>
      </div>
    </div>
  )
}

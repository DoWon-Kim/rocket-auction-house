'use client'

import { useEffect } from 'react'
import { AlertCircle } from 'lucide-react'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center space-y-6">
      <div className="w-16 h-16 rounded-full bg-red-950/60 border border-red-800/40 flex items-center justify-center">
        <AlertCircle size={32} className="text-red-400" />
      </div>
      <div>
        <h1 className="text-xl font-bold text-white mb-2">오류가 발생했습니다</h1>
        <p className="text-[#7a6040] text-sm">일시적인 오류입니다. 다시 시도해주세요.</p>
      </div>
      <div className="flex gap-3">
        <button onClick={reset}
          className="h-10 px-6 flex items-center bg-[#d4a853] hover:bg-[#c49440] text-white text-sm font-semibold rounded-xl transition-all">
          다시 시도
        </button>
        <a href="/"
          className="h-10 px-6 flex items-center bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] text-[#9e8a6a] hover:text-[#e8d5b0] text-sm rounded-xl transition-all">
          홈으로
        </a>
      </div>
    </div>
  )
}

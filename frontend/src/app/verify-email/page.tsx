'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { CheckCircle, XCircle, Loader2, Mail } from 'lucide-react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/store'

type Status = 'verifying' | 'success' | 'error' | 'resending' | 'resent'

function VerifyEmailContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('token')
  const { user, updateUser } = useAuthStore()

  const [status, setStatus] = useState<Status>(token ? 'verifying' : 'error')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (!token) {
      setErrorMsg('인증 링크가 올바르지 않습니다.')
      return
    }

    api.get(`/auth/verify-email/${token}`)
      .then(() => {
        updateUser({ emailVerified: true })
        setStatus('success')
        setTimeout(() => router.push('/'), 3000)
      })
      .catch((err) => {
        setStatus('error')
        setErrorMsg(
          err?.response?.data?.message ?? '인증에 실패했습니다. 링크가 만료되었을 수 있습니다.'
        )
      })
  }, [token])

  async function resend() {
    setStatus('resending')
    try {
      await api.post('/auth/resend-verification')
      setStatus('resent')
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      setStatus('error')
      setErrorMsg(e?.response?.data?.message ?? '재전송 중 오류가 발생했습니다.')
    }
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="bg-[#1a1208] border border-[#3d2e1a] rounded-2xl p-10 max-w-md w-full text-center">
        {status === 'verifying' && (
          <>
            <Loader2 className="w-12 h-12 text-[#d4a853] mx-auto mb-4 animate-spin" />
            <h1 className="text-lg font-semibold text-[#e8d5b0] mb-2">이메일 인증 중...</h1>
            <p className="text-sm text-[#7a6040]">잠시만 기다려 주세요.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-4" />
            <h1 className="text-lg font-semibold text-[#e8d5b0] mb-2">이메일 인증 완료!</h1>
            <p className="text-sm text-[#7a6040] mb-6">3초 후 홈으로 이동합니다.</p>
            <Link href="/" className="text-sm text-[#d4a853] hover:underline">
              바로 이동
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h1 className="text-lg font-semibold text-[#e8d5b0] mb-2">인증 실패</h1>
            <p className="text-sm text-[#7a6040] mb-6">{errorMsg}</p>
            {user && !user.emailVerified && (
              <button
                onClick={resend}
                className="px-5 py-2 text-sm bg-[#d4a853] text-[#0f0b08] font-semibold rounded-lg hover:bg-[#e8c06a] transition-colors"
              >
                인증 메일 재전송
              </button>
            )}
            <div className="mt-4">
              <Link href="/" className="text-sm text-[#5a4830] hover:text-[#d4a853] transition-colors">
                홈으로
              </Link>
            </div>
          </>
        )}

        {status === 'resending' && (
          <>
            <Loader2 className="w-12 h-12 text-[#d4a853] mx-auto mb-4 animate-spin" />
            <h1 className="text-lg font-semibold text-[#e8d5b0] mb-2">재전송 중...</h1>
          </>
        )}

        {status === 'resent' && (
          <>
            <Mail className="w-12 h-12 text-[#d4a853] mx-auto mb-4" />
            <h1 className="text-lg font-semibold text-[#e8d5b0] mb-2">메일을 재전송했습니다</h1>
            <p className="text-sm text-[#7a6040] mb-6">받은 편지함을 확인해 주세요. 스팸 폴더도 확인해 보세요.</p>
            <Link href="/" className="text-sm text-[#5a4830] hover:text-[#d4a853] transition-colors">
              홈으로
            </Link>
          </>
        )}
      </div>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-[#d4a853] animate-spin" />
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  )
}

'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore, useAuthHydrated } from '@/lib/store'
import { api } from '@/lib/api'
import { BOARDS } from '@/lib/community'
import { PostEditor } from '@/components/community/PostEditor'
import { CommunityShell } from '@/components/community/CommunityShell'

function WriteContent() {
  const router = useRouter()
  const sp = useSearchParams()
  const qc = useQueryClient()
  const user = useAuthStore(s => s.user)
  const hydrated = useAuthHydrated()
  const board = BOARDS.some(b => b.key === sp.get('board')) ? sp.get('board')! : 'FREE'

  if (!hydrated) return null
  if (!user) {
    return (
      <div className="max-w-md mx-auto py-24 text-center space-y-4">
        <p className="text-muted">로그인 후 글을 작성할 수 있습니다.</p>
        <Link href="/login" className="inline-flex h-11 px-6 items-center rounded-full bg-white text-bg text-sm font-semibold">로그인하기</Link>
      </div>
    )
  }

  return (
    <CommunityShell active={board}>
      <h1 className="text-[26px] sm:text-3xl font-bold tracking-tight text-fg mb-5">카페 글쓰기</h1>
      <PostEditor
        autosave
        initial={{ title: '', content: '', category: board, tcgType: '' }}
        submitLabel="등록"
        cancelHref={`/community?board=${board}`}
        onSubmit={async d => {
          const res = await api.post('/posts', { ...d, tcgType: d.tcgType || null })
          qc.invalidateQueries({ queryKey: ['posts', 'COMMUNITY'] })
          qc.invalidateQueries({ queryKey: ['community-stats'] })
          router.push(`/community/${res.data.id}`)
        }}
      />
    </CommunityShell>
  )
}

export default function CommunityWritePage() {
  return <Suspense><WriteContent /></Suspense>
}

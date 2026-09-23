'use client'

import { useParams, useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore, useAuthHydrated } from '@/lib/store'
import { api } from '@/lib/api'
import { PostEditor } from '@/components/community/PostEditor'
import { CommunityShell } from '@/components/community/CommunityShell'
import { textToHtml } from '@/lib/community'

interface EditablePost {
  title: string
  content: string
  contentFormat: 'TEXT' | 'HTML'
  category: string | null
  tcgType: string | null
  imageUrls: string[]
  imageUrl: string | null
  author: { id: string }
}

export default function CommunityEditPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const qc = useQueryClient()
  const user = useAuthStore(s => s.user)
  const hydrated = useAuthHydrated()

  const { data: post, isLoading } = useQuery<EditablePost>({
    queryKey: ['post-edit', id],
    queryFn: () => api.get(`/posts/${id}`).then(r => r.data),
    enabled: !!id,
  })

  if (!hydrated || isLoading) {
    return <div className="py-24 flex justify-center"><div className="w-6 h-6 rounded-full border-2 border-line border-t-accent animate-spin" /></div>
  }
  if (!post || !user || post.author.id !== user.id) {
    return <div className="py-24 text-center text-muted">본인 게시글만 수정할 수 있습니다.</div>
  }

  // 예전 텍스트 글은 서식 에디터용 HTML로 변환 (대표 이미지 1장 방식이면 맨 위에 넣음)
  const legacyImage = post.imageUrls.length === 0 && post.imageUrl ? `![](${post.imageUrl})\n` : ''
  const initialHtml = post.contentFormat === 'HTML' ? post.content : textToHtml(legacyImage + post.content)

  return (
    <CommunityShell active={post.category ?? 'FREE'}>
      <h1 className="text-[26px] sm:text-3xl font-bold tracking-tight text-fg mb-5">글 수정</h1>
      <PostEditor
        initial={{ title: post.title, content: initialHtml, category: post.category ?? 'FREE', tcgType: post.tcgType ?? '' }}
        currentCategory={post.category ?? 'FREE'}
        submitLabel="수정 완료"
        cancelHref={`/community/${id}`}
        onSubmit={async d => {
          await api.patch(`/posts/${id}`, { ...d, tcgType: d.tcgType || null })
          qc.invalidateQueries({ queryKey: ['post', id] })
          qc.invalidateQueries({ queryKey: ['posts', 'COMMUNITY'] })
          router.push(`/community/${id}`)
        }}
      />
    </CommunityShell>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import { api } from '@/lib/api'
import { ArrowLeft, Save } from 'lucide-react'
import Link from 'next/link'
import { ImageUpload } from '@/components/ImageUpload'
import { TCG_LABELS } from '@/lib/utils'

const TCG_OPTIONS = [
  { value: 'POKEMON',  label: TCG_LABELS.POKEMON },
  { value: 'YUGIOH',   label: TCG_LABELS.YUGIOH },
  { value: 'MTG',      label: TCG_LABELS.MTG },
  { value: 'DIGIMON',  label: TCG_LABELS.DIGIMON },
  { value: 'ONEPIECE', label: TCG_LABELS.ONEPIECE },
  { value: 'WEISS',    label: TCG_LABELS.WEISS },
  { value: 'OTHER',    label: TCG_LABELS.OTHER },
]

const inputCls = 'w-full bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] focus:border-[#d4a853]/40 rounded-xl px-4 py-2.5 text-sm text-[#f5ead8] placeholder:text-[#5a4830] focus:outline-none transition-colors'

export default function CommunityEditPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuthStore()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [tcgType, setTcgType] = useState('')
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return
    api.get(`/posts/${id}`).then(r => {
      const p = r.data
      if (user && p.author.id !== user.id) { router.replace(`/community/${id}`); return }
      setTitle(p.title)
      setContent(p.content)
      setImageUrl(p.imageUrl ?? '')
      setTcgType(p.tcgType ?? '')
    }).catch(() => router.replace('/community')).finally(() => setFetching(false))
  }, [id, user, router])

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center">
        <p className="text-[#8a7055]">로그인이 필요합니다.</p>
      </div>
    )
  }

  if (fetching) {
    return (
      <div className="max-w-2xl mx-auto py-20 flex justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-[#2e2318] border-t-[#d4a853] animate-spin" />
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !content.trim()) { setError('제목과 내용을 입력해주세요.'); return }
    setLoading(true); setError('')
    try {
      await api.patch(`/posts/${id}`, {
        title: title.trim(),
        content: content.trim(),
        imageUrl: imageUrl.trim() || null,
        tcgType: tcgType || null,
      })
      router.push(`/community/${id}`)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } }
      setError(e.response?.data?.message ?? '수정에 실패했습니다.')
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-10 space-y-6">
      <Link href={`/community/${id}`} className="inline-flex items-center gap-1.5 text-sm text-[#7a6040] hover:text-[#e8d5b0] transition-colors group">
        <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" /> 게시글로 돌아가기
      </Link>

      <div>
        <h1 className="text-xl font-bold text-white">게시글 수정</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-[#1a1410] border border-[#2e2318] rounded-2xl p-6 space-y-5">
        {error && (
          <div className="text-sm text-red-400 bg-red-950/50 border border-red-800/40 rounded-xl px-4 py-3">{error}</div>
        )}

        <div className="space-y-1.5">
          <label className="text-xs text-[#7a6040] uppercase tracking-wider font-semibold">제목</label>
          <input value={title} onChange={e => setTitle(e.target.value)} maxLength={200}
            placeholder="제목을 입력하세요" required className={inputCls} />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-[#7a6040] uppercase tracking-wider font-semibold">내용</label>
          <textarea value={content} onChange={e => setContent(e.target.value)}
            placeholder="내용을 입력하세요" rows={12} required
            className={`${inputCls} resize-none leading-relaxed`} />
        </div>

        {/* TCG 카테고리 */}
        <div className="space-y-1.5">
          <label className="text-xs text-[#7a6040] uppercase tracking-wider font-semibold">
            TCG 카테고리 <span className="normal-case font-normal text-[#4a3820]">(선택)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {TCG_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTcgType(prev => prev === opt.value ? '' : opt.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  tcgType === opt.value
                    ? 'bg-[#d4a853]/20 text-[#e0b878] border-[#d4a853]/40'
                    : 'bg-transparent text-[#7a6040] border-[#2e2318] hover:border-[#4a3520] hover:text-[#9e8a6a]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <ImageUpload value={imageUrl} onChange={setImageUrl} />

        <div className="flex gap-3 pt-2">
          <Link href={`/community/${id}`}
            className="flex-1 h-11 flex items-center justify-center bg-[#1a1410] border border-[#2e2318] hover:border-[#4a3520] text-[#9e8a6a] rounded-xl text-sm transition-all">
            취소
          </Link>
          <button type="submit" disabled={loading}
            className="flex-1 h-11 flex items-center justify-center gap-2 bg-[#d4a853] hover:bg-[#c49440] disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-all shadow-[0_0_16px_rgba(212,168,83,0.2)]">
            {loading
              ? <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              : <><Save size={14} /> 수정 완료</>}
          </button>
        </div>
      </form>
    </div>
  )
}

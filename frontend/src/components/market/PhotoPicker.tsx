'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import { Camera, X, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'

// 실물 사진 여러 장 업로드 (첫 장이 대표 사진)
export function PhotoPicker({ value, onChange, max = 10 }: { value: string[]; onChange: (urls: string[]) => void; max?: number }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function upload(files: File[]) {
    setError(''); setUploading(true)
    const urls: string[] = []
    try {
      for (const file of files.slice(0, max - value.length)) {
        const fd = new FormData()
        fd.append('file', file)
        const { data } = await api.post<{ url: string }>('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
        urls.push(data.url)
      }
    } catch {
      setError('일부 사진을 올리지 못했어요. (최대 5MB, 이미지 파일만)')
    } finally {
      if (urls.length) onChange([...value, ...urls])
      setUploading(false)
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-2">
        {value.length < max && (
          <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}
            className="w-20 h-20 rounded-xl border border-dashed border-line-strong bg-sunken flex flex-col items-center justify-center text-muted hover:text-fg hover:border-accent/50 disabled:opacity-50">
            {uploading ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
            <span className="text-[10px] mt-1 tabular-nums">{value.length}/{max}</span>
          </button>
        )}
        {value.map((u, i) => (
          <div key={u + i} className="group relative w-20 h-20 rounded-xl overflow-hidden border border-line bg-sunken">
            <Image src={u} alt="" fill sizes="80px" className="object-cover" />
            {i === 0
              ? <span className="absolute bottom-0 inset-x-0 bg-accent/90 text-[10px] text-center text-white py-0.5 font-semibold">대표</span>
              : <button type="button" onClick={() => onChange([u, ...value.filter((_, n) => n !== i)])} aria-label="대표 사진으로"
                  className="absolute bottom-0 inset-x-0 bg-black/60 text-[10px] text-center text-white py-0.5 opacity-0 group-hover:opacity-100 focus:opacity-100">대표로</button>}
            <button type="button" onClick={() => onChange(value.filter((_, n) => n !== i))} aria-label="사진 삭제"
              className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center"><X size={11} /></button>
          </div>
        ))}
      </div>
      <input ref={inputRef} type="file" accept="image/*" multiple hidden
        onChange={e => { const f = Array.from(e.target.files ?? []); e.target.value = ''; if (f.length) upload(f) }} />
      {error && <p className="text-xs text-rose-300">{error}</p>}
    </div>
  )
}

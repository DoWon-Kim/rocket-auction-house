'use client'

import { useRef, useState } from 'react'
import { ImageIcon, X, Upload } from 'lucide-react'
import { api } from '@/lib/api'

interface Props {
  value: string
  onChange: (url: string) => void
  label?: string
}

export function ImageUpload({ value, onChange, label = '이미지' }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function handleFile(file: File) {
    setError('')
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const { data } = await api.post('/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      onChange(data.url)
    } catch {
      setError('이미지 업로드에 실패했습니다. (최대 5MB, 이미지 파일만)')
    } finally {
      setUploading(false)
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file && file.type.startsWith('image/')) handleFile(file)
  }

  return (
    <div className="space-y-1.5">
      <label className="text-xs text-[#7a6040] uppercase tracking-wider font-semibold flex items-center gap-1.5">
        <ImageIcon size={12} /> {label} <span className="text-[#4a3820] normal-case font-normal">(선택)</span>
      </label>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleChange}
        className="sr-only"
      />

      {value ? (
        <div className="relative rounded-xl overflow-hidden border border-[#2e2318] bg-[#2a1c0c]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="첨부 이미지" className="w-full max-h-64 object-contain" />
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute top-2 right-2 w-7 h-7 bg-black/70 hover:bg-black/90 rounded-full flex items-center justify-center text-white transition-colors"
          >
            <X size={14} />
          </button>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="absolute bottom-2 right-2 flex items-center gap-1.5 px-3 py-1.5 bg-black/70 hover:bg-black/90 text-white text-xs rounded-lg transition-colors"
          >
            <Upload size={12} /> 교체
          </button>
        </div>
      ) : (
        <div
          onClick={() => !uploading && inputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="border-2 border-dashed border-[#2e2318] hover:border-[#4a3520] rounded-xl p-8 flex flex-col items-center gap-2 cursor-pointer transition-colors group"
        >
          {uploading ? (
            <>
              <div className="w-6 h-6 rounded-full border-2 border-[#2e2318] border-t-[#d4a853] animate-spin" />
              <span className="text-xs text-[#7a6040]">업로드 중...</span>
            </>
          ) : (
            <>
              <Upload size={20} className="text-[#4a3520] group-hover:text-[#7a6040] transition-colors" />
              <span className="text-xs text-[#9e8a6a]">클릭하거나 이미지를 드래그하세요</span>
              <span className="text-xs text-[#4a3820]">PNG · JPG · GIF · WEBP · 최대 5MB</span>
            </>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}

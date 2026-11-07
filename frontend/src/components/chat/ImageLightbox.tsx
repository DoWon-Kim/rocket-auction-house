'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import { X, ChevronLeft, ChevronRight, Download } from 'lucide-react'

// 채팅 사진 크게 보기 (좌우 화살표·ESC)
export function ImageLightbox({ images, start, onClose }: { images: string[]; start: number; onClose: () => void }) {
  const [i, setI] = useState(start)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') setI(v => Math.min(images.length - 1, v + 1))
      if (e.key === 'ArrowLeft') setI(v => Math.max(0, v - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [images.length, onClose])

  return createPortal(
    <div className="fixed inset-0 z-[120] bg-black/90 flex items-center justify-center" onClick={onClose} role="dialog" aria-modal="true" aria-label="사진 보기">
      <div className="absolute top-4 right-4 flex gap-2">
        <a href={images[i]} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20" aria-label="원본 보기"><Download size={18} /></a>
        <button onClick={onClose} className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20" aria-label="닫기"><X size={20} /></button>
      </div>
      <div className="relative w-[92vw] h-[82vh]" onClick={e => e.stopPropagation()}>
        <Image src={images[i]} alt="" fill sizes="92vw" className="object-contain" />
      </div>
      {images.length > 1 && (
        <>
          <button onClick={e => { e.stopPropagation(); setI(v => Math.max(0, v - 1)) }} disabled={i === 0} className="absolute left-4 w-11 h-11 rounded-full bg-white/10 text-white flex items-center justify-center disabled:opacity-30" aria-label="이전"><ChevronLeft size={22} /></button>
          <button onClick={e => { e.stopPropagation(); setI(v => Math.min(images.length - 1, v + 1)) }} disabled={i === images.length - 1} className="absolute right-4 w-11 h-11 rounded-full bg-white/10 text-white flex items-center justify-center disabled:opacity-30" aria-label="다음"><ChevronRight size={22} /></button>
          <span className="absolute bottom-5 text-sm text-white/80 tabular-nums">{i + 1} / {images.length}</span>
        </>
      )}
    </div>,
    document.body,
  )
}

'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { X, ExternalLink } from 'lucide-react'
import { RefundPolicyContent } from '@/components/policy/RefundPolicyContent'

// 환불 정책을 페이지 이동 없이 창으로 보여주는 링크 (주문서 등 작성 중인 화면에서 사용)
export function RefundPolicyLink({ className, children = '환불 정책' }: { className?: string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={e => { e.preventDefault(); e.stopPropagation(); setOpen(true) }} className={className ?? 'underline'}>
        {children}
      </button>
      {open && <RefundPolicyModal onClose={() => setOpen(false)} />}
    </>
  )
}

export function RefundPolicyModal({ onClose }: { onClose: () => void }) {
  // ESC로 닫기 + 뒤 페이지 스크롤 잠금
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey) }
  }, [onClose])

  // label 안에서 열려도 클릭이 체크박스로 전달되지 않도록 body에 띄운다
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm sm:p-6" onClick={onClose}
      role="dialog" aria-modal="true" aria-labelledby="refund-policy-title">
      <div className="w-full sm:max-w-2xl max-h-[88dvh] flex flex-col rounded-t-3xl sm:rounded-3xl border border-line bg-bg shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 sm:px-6 py-4 border-b border-line shrink-0">
          <div className="flex-1 min-w-0">
            <h2 id="refund-policy-title" className="text-lg font-bold text-fg">환불 및 청약철회 정책</h2>
            <p className="text-[11px] text-subtle">전자상거래 등에서의 소비자보호에 관한 법률 제17조에 따른 안내</p>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-muted hover:text-fg hover:bg-surface-2"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5">
          <RefundPolicyContent />
        </div>
        <div className="flex items-center justify-between gap-2 px-5 sm:px-6 py-3 border-t border-line shrink-0">
          <Link href="/refund-policy" target="_blank" className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
            새 탭에서 전체 보기 <ExternalLink size={12} />
          </Link>
          <button type="button" onClick={onClose} className="h-10 px-5 rounded-xl bg-accent text-sm font-semibold text-white">확인</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

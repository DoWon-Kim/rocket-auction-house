import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'

export default function Footer() {
  return (
    <footer className="relative border-t border-line mt-24 overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/50 to-transparent" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-14 pb-10">

        {/* 상단: 브랜드 + 링크 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-10">
          <div>
            <p className="font-display text-xl font-bold mb-1 tracking-tight">
              <span className="text-white">Rocket</span>
              <span className="text-accent-fg">.AH</span>
            </p>
            <p className="text-[11px] text-muted uppercase tracking-[0.2em] font-medium mb-4">TCG Auction House</p>
            <p className="text-sm text-muted leading-relaxed max-w-xs">
              포켓몬·유희왕·MTG·원피스 등 안전하게 거래하세요.
            </p>
          </div>

          <div>
            <p className="text-xs text-fg-3 font-semibold mb-4">서비스</p>
            <ul className="space-y-2.5 text-sm text-muted">
              <li><Link href="/listings" className="hover:text-fg transition-colors">마켓플레이스</Link></li>
              <li><Link href="/shop" className="hover:text-fg transition-colors">샵</Link></li>
              <li><Link href="/listings?type=AUCTION" className="hover:text-fg transition-colors">경매</Link></li>
              <li><Link href="/charge" className="hover:text-fg transition-colors">포인트 충전</Link></li>
            </ul>
          </div>

          <div>
            <p className="text-xs text-fg-3 font-semibold mb-4">정책 및 약관</p>
            <ul className="space-y-2.5 text-sm text-muted">
              <li><Link href="/terms" className="hover:text-fg transition-colors">이용약관</Link></li>
              <li><Link href="/privacy" className="hover:text-fg transition-colors">개인정보 처리방침</Link></li>
              <li><Link href="/refund-policy" className="hover:text-fg transition-colors">환불 및 청약철회 정책</Link></li>
              <li><Link href="/escrow" className="hover:text-fg transition-colors">에스크로 서비스 안내</Link></li>
            </ul>
          </div>
        </div>

        {/* 구분선 */}
        <div className="h-px bg-line mb-8" />

        {/* 사업자 정보 — 전자상거래법 제13조 */}
        <div className="space-y-1.5 text-[11px] text-subtle leading-relaxed">
          <p className="text-xs text-muted-2 font-semibold mb-2">사업자 정보</p>
          <p>상호: <span className="text-muted-2">로켓옥션하우스</span> &nbsp;|&nbsp; 대표자: <span className="text-muted-2">김도원</span> &nbsp;|&nbsp; 사업자등록번호: <span className="text-muted-2">사업자 등록 준비 중</span></p>
          <p>통신판매업 신고번호: <span className="text-muted-2">통신판매업 신고 준비 중</span></p>
          <p>이메일: <span className="text-muted-2">support@rocket-auction.com</span> &nbsp;|&nbsp; 고객센터: <span className="text-muted-2">평일 10:00 – 18:00</span></p>
          <p>개인정보보호 책임자: <span className="text-muted-2">김도원</span> &nbsp;(이메일: <span className="text-muted-2">privacy@rocket-auction.com</span>)</p>
          <p>호스팅 서비스: <span className="text-muted-2">Railway (railway.app)</span></p>
        </div>

        {/* 에스크로 안내 + 저작권 */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mt-6 pt-6 border-t border-line">
          <div className="flex items-center gap-2 text-[11px] text-subtle">
            <ShieldCheck size={14} className="text-emerald-400 shrink-0" />
            <span>
              본 사이트는{' '}
              <Link href="/escrow" className="text-muted-2 hover:text-fg-2 underline underline-offset-2 transition-colors">
                에스크로(구매안전서비스)
              </Link>
              를 통해 소비자 결제금액을 보호합니다.
            </span>
          </div>
          <p className="text-[11px] text-subtle">
            © {new Date().getFullYear()} Rocket Auction House. All rights reserved.
          </p>
        </div>

      </div>
    </footer>
  )
}

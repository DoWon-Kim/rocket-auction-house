import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'

export default function Footer() {
  return (
    <footer className="border-t border-[#2e2318] bg-[#0f0b08] mt-20">
      <div className="max-w-7xl mx-auto px-4 py-12">

        {/* 상단: 브랜드 + 링크 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-10">
          <div>
            <p className="text-sm font-bold mb-0.5">
              <span className="text-white">Rocket</span>
              <span className="text-[#d4a853]"> Auction House</span>
            </p>
            <p className="text-[10px] text-[#d4a853]/50 uppercase tracking-widest font-medium mb-3">TCG 전문 경매 거래소</p>
            <p className="text-xs text-[#5a4830] leading-relaxed">
              포켓몬·유희왕·MTG 등 안전하게 거래하세요.
            </p>
          </div>

          <div>
            <p className="text-xs text-[#5a4830] uppercase tracking-wider font-semibold mb-3">서비스</p>
            <ul className="space-y-2 text-xs text-[#7a5a38]">
              <li><Link href="/listings" className="hover:text-[#e8d5b0] transition-colors">마켓플레이스</Link></li>
              <li><Link href="/shop" className="hover:text-[#e8d5b0] transition-colors">샵</Link></li>
              <li><Link href="/listings?type=AUCTION" className="hover:text-[#e8d5b0] transition-colors">경매</Link></li>
              <li><Link href="/charge" className="hover:text-[#e8d5b0] transition-colors">포인트 충전</Link></li>
            </ul>
          </div>

          <div>
            <p className="text-xs text-[#5a4830] uppercase tracking-wider font-semibold mb-3">정책 및 약관</p>
            <ul className="space-y-2 text-xs text-[#7a5a38]">
              <li><Link href="/terms" className="hover:text-[#e8d5b0] transition-colors">이용약관</Link></li>
              <li><Link href="/privacy" className="hover:text-[#e8d5b0] transition-colors">개인정보 처리방침</Link></li>
              <li><Link href="/refund-policy" className="hover:text-[#e8d5b0] transition-colors">환불 및 청약철회 정책</Link></li>
              <li><Link href="/escrow" className="hover:text-[#e8d5b0] transition-colors">에스크로 서비스 안내</Link></li>
            </ul>
          </div>
        </div>

        {/* 구분선 */}
        <div className="h-px bg-[#2e2318] mb-8" />

        {/* 사업자 정보 — 전자상거래법 제13조 */}
        <div className="space-y-1.5 text-[11px] text-[#5a4830] leading-relaxed">
          <p className="text-xs text-[#7a6040] font-semibold mb-2">사업자 정보</p>
          <p>상호: <span className="text-[#7a5a38]">로켓옥션하우스</span> &nbsp;|&nbsp; 대표자: <span className="text-[#7a5a38]">[대표자명]</span> &nbsp;|&nbsp; 사업자등록번호: <span className="text-[#7a5a38]">[000-00-00000]</span></p>
          <p>통신판매업 신고번호: <span className="text-[#7a5a38]">[제0000-서울00-0000호]</span></p>
          <p>주소: <span className="text-[#7a5a38]">[사업장 주소]</span> &nbsp;|&nbsp; 전화: <span className="text-[#7a5a38]">[전화번호]</span> &nbsp;|&nbsp; 이메일: <span className="text-[#7a5a38]">[이메일]</span></p>
          <p>개인정보보호 책임자: <span className="text-[#7a5a38]">[성명]</span> &nbsp;(이메일: <span className="text-[#7a5a38]">[이메일]</span>)</p>
          <p>호스팅 서비스: <span className="text-[#7a5a38]">[서비스명]</span></p>
        </div>

        {/* 에스크로 안내 + 저작권 */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mt-6 pt-6 border-t border-[#2e2318]">
          <div className="flex items-center gap-2 text-[11px] text-[#5a4830]">
            <ShieldCheck size={14} className="text-[#4ade80] shrink-0" />
            <span>
              본 사이트는{' '}
              <Link href="/escrow" className="text-[#7a5a38] hover:text-[#e8d5b0] underline underline-offset-2 transition-colors">
                에스크로(구매안전서비스)
              </Link>
              를 통해 소비자 결제금액을 보호합니다.
            </span>
          </div>
          <p className="text-[11px] text-[#4a3820]">
            © {new Date().getFullYear()} Rocket Auction House. All rights reserved.
          </p>
        </div>

      </div>
    </footer>
  )
}

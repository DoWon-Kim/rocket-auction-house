import type { Metadata } from 'next'
import { ShieldCheck, Wallet, CheckCircle, AlertCircle } from 'lucide-react'

export const metadata: Metadata = {
  title: '에스크로 서비스 안내 | Rocket Auction House',
}

export default function EscrowPage() {
  return (
    <div className="max-w-3xl mx-auto py-12 space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">에스크로(구매안전서비스) 안내</h1>
        <p className="text-sm text-[#5a4830]">전자상거래 등에서의 소비자보호에 관한 법률 제24조에 따른 안내</p>
      </div>

      {/* 핵심 안내 배너 */}
      <div className="bg-[#1a1410] border border-[#2e2318] rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-xl bg-emerald-950/60 border border-emerald-800/40 flex items-center justify-center">
            <ShieldCheck size={24} className="text-emerald-400" />
          </div>
          <div>
            <p className="font-bold text-white">에스크로 보호 거래</p>
            <p className="text-xs text-[#7a6040]">구매 확정 전까지 결제금액 전액 보호</p>
          </div>
        </div>
        <p className="text-sm text-[#8a7055] leading-relaxed">
          Rocket Auction House는 <strong className="text-[#e8d5b0]">모든 거래에 에스크로(구매안전서비스)를 적용</strong>합니다.
          구매자가 결제한 금액은 구매자가 상품을 수령하고 구매 확정을 누를 때까지
          회사가 안전하게 보관하며, 판매자는 그 이후에 정산을 받습니다.
        </p>
      </div>

      {/* 거래 흐름 */}
      <div className="bg-[#1a1410] border border-[#2e2318] rounded-2xl p-6 space-y-4">
        <h2 className="text-base font-bold text-white mb-4">에스크로 거래 흐름</h2>
        {[
          { step: '1', icon: <Wallet size={16} className="text-[#d4a853]" />, title: '구매자 결제', desc: '구매자가 포인트로 결제하면 금액이 에스크로(회사)에 보관됩니다.' },
          { step: '2', icon: <CheckCircle size={16} className="text-[#f0a832]" />, title: '판매자 발송', desc: '판매자가 상품을 발송하고 운송장 번호를 등록합니다.' },
          { step: '3', icon: <CheckCircle size={16} className="text-[#c084fc]" />, title: '구매자 수령 확인', desc: '구매자가 상품을 받고 마이페이지에서 구매 확정을 누릅니다.' },
          { step: '4', icon: <ShieldCheck size={16} className="text-[#4ade80]" />, title: '판매자 정산', desc: '구매 확정 후 에스크로 금액이 판매자 포인트로 즉시 지급됩니다.' },
        ].map(item => (
          <div key={item.step} className="flex items-start gap-4">
            <div className="w-7 h-7 rounded-full bg-[#221a12] border border-[#2e2318] flex items-center justify-center text-xs font-bold text-[#7a6040] shrink-0 mt-0.5">
              {item.step}
            </div>
            <div className="flex-1 pb-4 border-b border-[#2e2318] last:border-0 last:pb-0">
              <div className="flex items-center gap-2 mb-1">
                {item.icon}
                <span className="text-sm font-semibold text-[#e8d5b0]">{item.title}</span>
              </div>
              <p className="text-xs text-[#7a5a38] leading-relaxed">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 보호 기간 */}
      <div className="bg-[#1a1410] border border-[#2e2318] rounded-2xl p-6 space-y-4">
        <h2 className="text-base font-bold text-white">자동 구매 확정</h2>
        <p className="text-sm text-[#8a7055] leading-relaxed">
          구매자가 배송 완료 후 <strong className="text-[#e8d5b0]">7일 이내에 수령 확인을 하지 않을 경우</strong>, 분쟁 신청이 없으면 자동으로 구매 확정 처리됩니다.
        </p>
        <div className="flex items-start gap-3 bg-[#2a1f08]/50 border border-[#3d2e0c] rounded-xl p-4">
          <AlertCircle size={15} className="text-[#f0a832] shrink-0 mt-0.5" />
          <p className="text-xs text-[#9e8a6a] leading-relaxed">
            문제가 있는 경우 배송 완료 후 7일 이내에 반드시 분쟁 신청을 해주세요.
            자동 확정 후에는 에스크로 보호가 종료됩니다.
          </p>
        </div>
      </div>

      {/* 법적 근거 */}
      <div className="text-xs text-[#4a3820] space-y-1 pt-2">
        <p>본 에스크로 서비스는 「전자상거래 등에서의 소비자보호에 관한 법률」 제24조에 따라 제공됩니다.</p>
        <p>에스크로 관련 문의: <span className="text-[#5a4830]">[고객센터 이메일]</span></p>
      </div>
    </div>
  )
}

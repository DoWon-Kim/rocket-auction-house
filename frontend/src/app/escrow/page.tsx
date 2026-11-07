import type { Metadata } from 'next'
import { ShieldCheck, Wallet, CheckCircle, AlertCircle } from 'lucide-react'

export const metadata: Metadata = {
  title: '에스크로 서비스 안내 | Rocket Auction House',
}

export default function EscrowPage() {
  return (
    <div className="max-w-3xl mx-auto py-12 space-y-10">
      <div>
        <h1 className="text-[26px] sm:text-3xl font-bold tracking-tight text-fg mb-2">에스크로(구매안전서비스) 안내</h1>
        <p className="text-sm text-subtle">전자상거래 등에서의 소비자보호에 관한 법률 제24조에 따른 안내</p>
      </div>

      {/* 핵심 안내 배너 */}
      <div className="bg-surface border border-line rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-xl bg-emerald-950/60 border border-emerald-800/40 flex items-center justify-center">
            <ShieldCheck size={24} className="text-emerald-400" />
          </div>
          <div>
            <p className="font-bold text-white">에스크로 보호 거래</p>
            <p className="text-xs text-muted-2">구매 확정 전까지 결제금액 전액 보호</p>
          </div>
        </div>
        <p className="text-sm text-muted leading-relaxed">
          Rocket Auction House는 <strong className="text-fg-2">모든 거래에 에스크로(구매안전서비스)를 적용</strong>합니다.
          구매자가 결제한 금액은 구매자가 상품을 수령하고 구매 확정을 누를 때까지
          회사가 안전하게 보관하며, 판매자는 그 이후에 정산을 받습니다.
        </p>
      </div>

      {/* 거래 흐름 */}
      <div className="bg-surface border border-line rounded-2xl p-6 space-y-4">
        <h2 className="text-base font-bold text-white mb-4">에스크로 거래 흐름</h2>
        {[
          { step: '1', icon: <Wallet size={16} className="text-accent-fg" />, title: '구매자 결제', desc: '구매자가 포인트로 결제(상품 금액 + 배송비)하면 금액이 에스크로(회사)에 보관됩니다. 경매는 낙찰되는 순간 결제됩니다.' },
          { step: '2', icon: <CheckCircle size={16} className="text-accent-2" />, title: '배송지 확정', desc: '일반 구매는 결제할 때 배송지를 함께 입력합니다. 경매 낙찰은 낙찰 후 3일 안에 채팅방에서 배송지를 입력해야 합니다.' },
          { step: '3', icon: <CheckCircle size={16} className="text-accent-2" />, title: '판매자 발송', desc: '배송지가 확정된 때부터 3일 안에 판매자가 상품을 발송하고 운송장 번호를 등록합니다.' },
          { step: '4', icon: <CheckCircle size={16} className="text-[#c084fc]" />, title: '구매자 수령 확인', desc: '구매자가 상품을 받고 채팅방이나 마이페이지에서 구매 확정을 누릅니다.' },
          { step: '5', icon: <ShieldCheck size={16} className="text-[#4ade80]" />, title: '판매자 정산', desc: '구매 확정 후 에스크로 금액이 판매자 포인트로 즉시 지급됩니다.' },
        ].map(item => (
          <div key={item.step} className="flex items-start gap-4">
            <div className="w-7 h-7 rounded-full bg-surface-2 border border-line flex items-center justify-center text-xs font-bold text-muted-2 shrink-0 mt-0.5">
              {item.step}
            </div>
            <div className="flex-1 pb-4 border-b border-line last:border-0 last:pb-0">
              <div className="flex items-center gap-2 mb-1">
                {item.icon}
                <span className="text-sm font-semibold text-fg-2">{item.title}</span>
              </div>
              <p className="text-xs text-muted-2 leading-relaxed">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 보호 기간 */}
      <div className="bg-surface border border-line rounded-2xl p-6 space-y-4">
        <h2 className="text-base font-bold text-white">기한과 자동 처리</h2>
        <ul className="text-sm text-muted leading-relaxed space-y-2">
          <li><strong className="text-fg-2">발송 기한</strong> — 배송지가 확정된 때부터 3일. 넘기면 거래가 자동 취소되고 구매자에게 전액 환불됩니다.</li>
          <li><strong className="text-fg-2">배송지 입력 기한 (경매)</strong> — 낙찰 후 3일. 입력하지 않으면 거래가 자동 취소되고 구매자에게 전액 환불되며, 경매 상품은 유찰 처리됩니다.</li>
          <li><strong className="text-fg-2">자동 구매 확정</strong> — 판매자 발송 후 3일 안에 구매 확정이나 분쟁 신청이 없으면 자동으로 구매 확정되고 판매자에게 정산됩니다.</li>
        </ul>
        <div className="flex items-start gap-3 bg-accent-tint/50 border border-accent-line rounded-xl p-4">
          <AlertCircle size={15} className="text-accent-2 shrink-0 mt-0.5" />
          <p className="text-xs text-fg-3 leading-relaxed">
            받은 상품에 문제가 있다면 발송 후 3일 안에, 구매 확정 전에 분쟁을 신청해주세요.
            자동 확정 후에는 에스크로 보호가 종료됩니다.
          </p>
        </div>
      </div>

      {/* 법적 근거 */}
      <div className="text-xs text-subtle space-y-1 pt-2">
        <p>본 에스크로 서비스는 「전자상거래 등에서의 소비자보호에 관한 법률」 제24조에 따라 제공됩니다.</p>
        <p>에스크로 관련 문의: <span className="text-subtle">[고객센터 이메일]</span></p>
      </div>
    </div>
  )
}

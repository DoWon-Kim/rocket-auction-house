import type { Metadata } from 'next'
import Link from 'next/link'
import { ShieldCheck, AlertCircle } from 'lucide-react'

export const metadata: Metadata = {
  title: '환불 및 청약철회 정책 | Rocket Auction House',
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="space-y-3">
    <h2 className="text-base font-bold text-white border-l-2 border-[#d4a853] pl-3">{title}</h2>
    <div className="text-sm text-[#8a7055] leading-relaxed space-y-2 pl-3">{children}</div>
  </div>
)

export default function RefundPolicyPage() {
  return (
    <div className="max-w-3xl mx-auto py-12 space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">환불 및 청약철회 정책</h1>
        <p className="text-sm text-[#5a4830]">전자상거래 등에서의 소비자보호에 관한 법률 제17조에 따른 안내</p>
      </div>

      {/* 에스크로 안내 배너 */}
      <div className="flex items-start gap-3 bg-emerald-950/30 border border-emerald-800/40 rounded-2xl p-5">
        <ShieldCheck size={20} className="text-emerald-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-emerald-400 mb-1">에스크로 보호 거래</p>
          <p className="text-xs text-[#8a7055] leading-relaxed">
            Rocket Auction House의 모든 거래는 에스크로(구매안전서비스)로 보호됩니다.
            구매 확정 전까지 결제 금액은 회사가 보관하며, 구매자가 수령을 확인한 후 판매자에게 정산됩니다.
          </p>
        </div>
      </div>

      <div className="bg-[#1a1410] border border-[#2e2318] rounded-2xl p-6 space-y-8">

        <Section title="1. 청약철회 기간">
          <p>구매자는 다음 기간 내에 청약철회를 신청할 수 있습니다.</p>
          <div className="bg-[#1a1208] border border-[#2e2318] rounded-xl p-4 space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-[#9e8a6a]">판매자 미발송 상태</span>
              <span className="text-white font-semibold">결제일로부터 7일 이내</span>
            </div>
            <div className="h-px bg-[#2e2318]" />
            <div className="flex justify-between items-center text-sm">
              <span className="text-[#9e8a6a]">배송 완료 후 (물품 하자·오배송)</span>
              <span className="text-white font-semibold">수령일로부터 30일 이내</span>
            </div>
            <div className="h-px bg-[#2e2318]" />
            <div className="flex justify-between items-center text-sm">
              <span className="text-[#9e8a6a]">경매 낙찰</span>
              <span className="text-[#f87171] font-semibold">원칙적으로 철회 불가</span>
            </div>
          </div>
        </Section>

        <Section title="2. 청약철회 불가 사유">
          <p>다음의 경우 청약철회가 제한됩니다 (전자상거래법 제17조 제2항).</p>
          <p className="pl-4">
            1. 구매자의 귀책사유로 카드가 훼손된 경우<br />
            2. 포장을 개봉하여 카드 가치가 현저히 감소한 경우<br />
            3. 경매를 통해 낙찰된 경우 (단, 물품 하자 시 예외)<br />
            4. 구매 확정(수령 확인) 후 단순 변심인 경우
          </p>
        </Section>

        <Section title="3. 포인트 환불">
          <p>① <strong className="text-[#e8d5b0]">충전 포인트</strong>: 미사용 포인트에 한해 고객센터를 통해 환불 신청 가능합니다. 결제 수수료를 공제한 금액이 환불됩니다.</p>
          <p>② <strong className="text-[#e8d5b0]">거래 취소 반환 포인트</strong>: 정상적인 청약철회·취소의 경우 포인트로 즉시 반환됩니다.</p>
          <p>③ 포인트를 이미 사용하여 잔액이 부족한 경우 환불이 제한될 수 있습니다.</p>
        </Section>

        <Section title="4. 청약철회 신청 방법">
          <p>① 마이페이지 → 구매 내역 → 해당 거래 → 취소/반품 신청</p>
          <p>② 고객센터 이메일: <span className="text-[#d4a853]">[고객센터 이메일]</span></p>
          <p>③ 신청 후 회사에서 3영업일 이내에 처리 결과를 안내합니다.</p>
        </Section>

        <Section title="5. 분쟁 해결">
          <p>거래 분쟁이 원만히 해결되지 않을 경우 아래 기관에 도움을 요청하실 수 있습니다.</p>
          <p className="pl-4">
            • 한국소비자원: <span className="text-[#d4a853]">1372</span><br />
            • 공정거래위원회: <span className="text-[#d4a853]">www.ftc.go.kr</span><br />
            • 전자상거래 분쟁조정위원회: <span className="text-[#d4a853]">ecmc.kr</span>
          </p>
        </Section>

      </div>

      <div className="flex items-start gap-3 bg-[#2a1f08]/50 border border-[#3d2e0c] rounded-2xl p-5">
        <AlertCircle size={18} className="text-[#f0a832] shrink-0 mt-0.5" />
        <p className="text-xs text-[#9e8a6a] leading-relaxed">
          본 정책은 전자상거래법 및 소비자보호 관련 법령에 따라 작성되었습니다.
          법령 개정 시 정책이 변경될 수 있으며, 변경 사항은 서비스 내 공지를 통해 안내합니다.
          자세한 사항은 <Link href="/terms" className="text-[#d4a853] hover:underline">이용약관</Link>을 참조하세요.
        </p>
      </div>
    </div>
  )
}

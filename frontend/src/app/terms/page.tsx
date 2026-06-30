import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '이용약관 | Rocket Auction House',
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="space-y-3">
    <h2 className="text-base font-bold text-white border-l-2 border-[#d4a853] pl-3">{title}</h2>
    <div className="text-sm text-[#8a7055] leading-relaxed space-y-2 pl-3">{children}</div>
  </div>
)

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto py-12 space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">이용약관</h1>
        <p className="text-sm text-[#5a4830]">시행일: 2025년 1월 1일 &nbsp;|&nbsp; 최종 수정: 2025년 1월 1일</p>
      </div>

      <div className="bg-[#1a1410] border border-[#2e2318] rounded-2xl p-6 space-y-8">

        <Section title="제1조 (목적)">
          <p>이 약관은 로켓옥션하우스(이하 "회사")가 운영하는 Rocket Auction House 서비스(이하 "서비스")의 이용 조건 및 절차, 회사와 이용자 간의 권리·의무 및 책임사항 등을 규정함을 목적으로 합니다.</p>
        </Section>

        <Section title="제2조 (정의)">
          <p>① "서비스"란 회사가 제공하는 TCG 카드 경매·거래 플랫폼 및 관련 서비스 일체를 말합니다.</p>
          <p>② "이용자"란 본 약관에 동의하고 서비스에 접속하여 이용하는 자를 말합니다.</p>
          <p>③ "포인트"란 서비스 내에서 결제 수단으로 사용되는 가상 화폐로, 실제 화폐로 충전하여 사용합니다.</p>
          <p>④ "에스크로"란 거래 대금을 제3자(회사)가 보관하다가 거래가 완료된 후 판매자에게 지급하는 안전 결제 서비스를 말합니다.</p>
        </Section>

        <Section title="제3조 (약관의 효력 및 변경)">
          <p>① 본 약관은 서비스 화면에 게시하거나 이용자에게 통지함으로써 효력이 발생합니다.</p>
          <p>② 회사는 관련 법령을 위반하지 않는 범위에서 약관을 변경할 수 있으며, 변경 시 7일 전에 공지합니다. 다만 이용자에게 불리한 변경의 경우 30일 전에 공지합니다.</p>
        </Section>

        <Section title="제4조 (회원가입)">
          <p>① 이용자는 회사가 정한 양식에 따라 정보를 기입하고 본 약관에 동의함으로써 회원가입을 신청합니다.</p>
          <p>② 회사는 다음 각 호에 해당하는 경우 회원가입 신청을 거부할 수 있습니다.</p>
          <p className="pl-4">1. 타인의 명의를 도용한 경우<br />2. 허위 정보를 기재한 경우<br />3. 14세 미만인 경우<br />4. 기타 회사 정책에 위반되는 경우</p>
        </Section>

        <Section title="제5조 (서비스 이용)">
          <p>① 서비스 이용은 연중무휴 24시간을 원칙으로 합니다. 다만 시스템 점검 등의 사유로 일시 중단될 수 있습니다.</p>
          <p>② 포인트 충전은 토스페이먼츠를 통해 이루어지며, 충전된 포인트는 현금으로 환불되지 않습니다.</p>
          <p>③ 판매자는 등록한 상품에 대해 정확한 정보를 제공할 의무가 있습니다.</p>
        </Section>

        <Section title="제6조 (에스크로 서비스)">
          <p>① 본 서비스는 전자상거래 등에서의 소비자보호에 관한 법률 제24조에 따라 에스크로(구매안전서비스)를 제공합니다.</p>
          <p>② 구매자가 결제한 대금은 거래가 완료(구매 확정)될 때까지 회사가 보관하며, 판매자는 구매자의 수령 확인 후 정산을 받습니다.</p>
          <p>③ 분쟁 발생 시 회사는 에스크로 보관 금액을 관련 법령 및 규정에 따라 처리합니다.</p>
        </Section>

        <Section title="제7조 (청약철회 및 환불)">
          <p>① 구매자는 구매 확정 전까지 취소를 요청할 수 있습니다.</p>
          <p>② 판매자가 배송을 시작하지 않은 경우, 구매자는 결제일로부터 7일 이내에 청약철회를 할 수 있습니다.</p>
          <p>③ 다음의 경우 청약철회가 제한될 수 있습니다.</p>
          <p className="pl-4">1. 구매자의 귀책사유로 카드가 훼손된 경우<br />2. 포장을 개봉하여 가치가 현저히 감소한 경우<br />3. 경매로 낙찰된 경우</p>
          <p>④ 에스크로 보호 기간 내 반환된 금액은 포인트로 지급됩니다.</p>
        </Section>

        <Section title="제8조 (이용자의 의무)">
          <p>이용자는 다음 행위를 하여서는 안 됩니다.</p>
          <p className="pl-4">1. 타인의 정보 도용<br />2. 허위 상품 등록 및 허위 입찰<br />3. 서비스 운영 방해<br />4. 불법 카드 또는 위조품 거래<br />5. 기타 관련 법령 위반</p>
        </Section>

        <Section title="제9조 (회사의 면책)">
          <p>① 회사는 천재지변, 불가항력적 사유로 서비스를 제공하지 못한 경우 책임을 지지 않습니다.</p>
          <p>② 이용자 간 거래에서 발생한 분쟁에 대해 회사는 에스크로 서비스를 통해 조정하나, 직접적인 법적 책임을 지지는 않습니다.</p>
        </Section>

        <Section title="제10조 (분쟁 해결)">
          <p>① 서비스 이용과 관련한 분쟁은 한국 법률을 준거법으로 합니다.</p>
          <p>② 분쟁 발생 시 회사 고객센터를 통해 우선 해결을 시도하며, 해결되지 않을 경우 관할 법원은 회사 소재지를 관할하는 법원으로 합니다.</p>
        </Section>

      </div>

      <p className="text-xs text-[#4a3820] text-center">본 약관은 [20XX년 XX월 XX일]부터 시행됩니다.</p>
    </div>
  )
}

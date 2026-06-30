import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '개인정보 처리방침 | Rocket Auction House',
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="space-y-3">
    <h2 className="text-base font-bold text-white border-l-2 border-[#d4a853] pl-3">{title}</h2>
    <div className="text-sm text-[#8a7055] leading-relaxed space-y-2 pl-3">{children}</div>
  </div>
)

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto py-12 space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">개인정보 처리방침</h1>
        <p className="text-sm text-[#5a4830]">시행일: 2025년 1월 1일 &nbsp;|&nbsp; 최종 수정: 2025년 1월 1일</p>
      </div>

      <div className="bg-[#1a1410] border border-[#2e2318] rounded-2xl p-6 space-y-8">

        <p className="text-sm text-[#8a7055] leading-relaxed">
          로켓옥션하우스(이하 "회사")는 개인정보보호법 제30조에 따라 이용자의 개인정보 처리에 관한 사항을 아래와 같이 고지합니다.
        </p>

        <Section title="제1조 (수집하는 개인정보 항목)">
          <p><strong className="text-[#e8d5b0]">회원가입 시 필수 수집</strong></p>
          <p className="pl-4">이메일 주소, 닉네임, 비밀번호(암호화 저장)</p>
          <p><strong className="text-[#e8d5b0]">서비스 이용 중 자동 수집</strong></p>
          <p className="pl-4">접속 IP, 쿠키, 서비스 이용 기록, 결제 기록</p>
          <p><strong className="text-[#e8d5b0]">결제 시 수집</strong></p>
          <p className="pl-4">결제수단 정보 (토스페이먼츠를 통해 처리되며, 카드번호 등 민감 정보는 회사가 직접 저장하지 않습니다)</p>
          <p><strong className="text-[#e8d5b0]">배송 시 수집</strong></p>
          <p className="pl-4">수령인 이름, 주소, 연락처</p>
        </Section>

        <Section title="제2조 (개인정보의 수집 및 이용 목적)">
          <p>① 회원 관리: 본인 확인, 서비스 제공, 고지 사항 전달</p>
          <p>② 서비스 제공: 거래 처리, 에스크로 관리, 분쟁 조정</p>
          <p>③ 결제 처리: 포인트 충전, 정산</p>
          <p>④ 마케팅·광고: 이용자가 별도 동의한 경우에 한해 이벤트·혜택 안내</p>
          <p>⑤ 법적 의무 이행: 관계 법령에 따른 기록 보관</p>
        </Section>

        <Section title="제3조 (개인정보 보유 및 이용 기간)">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-[#5a4830] border-b border-[#2e2318]">
                <th className="text-left py-2 pr-4">항목</th>
                <th className="text-left py-2">보유 기간</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2e2318]">
              <tr><td className="py-2 pr-4">회원 정보</td><td className="py-2">탈퇴 후 30일 (단, 법령상 보관 의무가 있는 경우 해당 기간)</td></tr>
              <tr><td className="py-2 pr-4">계약·청약철회 기록</td><td className="py-2">5년 (전자상거래법)</td></tr>
              <tr><td className="py-2 pr-4">대금결제 및 재화 공급 기록</td><td className="py-2">5년 (전자상거래법)</td></tr>
              <tr><td className="py-2 pr-4">소비자 불만·분쟁처리 기록</td><td className="py-2">3년 (전자상거래법)</td></tr>
              <tr><td className="py-2 pr-4">접속 로그·접속 IP</td><td className="py-2">3개월 (통신비밀보호법)</td></tr>
            </tbody>
          </table>
        </Section>

        <Section title="제4조 (개인정보의 제3자 제공)">
          <p>회사는 이용자의 개인정보를 원칙적으로 제3자에게 제공하지 않습니다. 다만 다음의 경우 예외로 합니다.</p>
          <p className="pl-4">1. 이용자가 사전에 동의한 경우<br />2. 법령의 규정에 의거하거나 수사 목적으로 법령에 정해진 절차와 방법에 따라 수사기관의 요구가 있는 경우</p>
          <p><strong className="text-[#e8d5b0]">결제 처리 위탁</strong><br />수탁사: 토스페이먼츠(주) / 위탁 업무: 결제 처리 및 본인 인증</p>
        </Section>

        <Section title="제5조 (이용자의 권리)">
          <p>이용자는 언제든지 다음의 권리를 행사할 수 있습니다.</p>
          <p className="pl-4">1. 개인정보 열람 요구<br />2. 오류 등이 있을 경우 정정 요구<br />3. 삭제 요구<br />4. 처리 정지 요구</p>
          <p>위 권리 행사는 마이페이지 또는 개인정보보호 책임자에게 이메일로 요청하실 수 있으며, 10일 이내에 처리합니다.</p>
        </Section>

        <Section title="제6조 (개인정보의 안전성 확보 조치)">
          <p>① 비밀번호 암호화(bcrypt) 저장</p>
          <p>② 데이터베이스 접근 제한 및 권한 관리</p>
          <p>③ 개인정보 접근 기록 보관 및 위변조 방지</p>
          <p>④ HTTPS를 통한 데이터 전송 암호화</p>
        </Section>

        <Section title="제7조 (쿠키 사용)">
          <p>회사는 로그인 상태 유지 등을 위해 쿠키를 사용합니다. 브라우저 설정에서 쿠키 저장을 거부할 수 있으나, 일부 서비스 이용이 제한될 수 있습니다.</p>
        </Section>

        <Section title="제8조 (개인정보보호 책임자)">
          <div className="bg-[#1a1208] border border-[#2e2318] rounded-xl p-4 space-y-1">
            <p><strong className="text-[#e8d5b0]">개인정보보호 책임자</strong></p>
            <p>성명: <span className="text-[#e8d5b0]">[성명]</span></p>
            <p>직위: <span className="text-[#e8d5b0]">[직위]</span></p>
            <p>이메일: <span className="text-[#e8d5b0]">[이메일]</span></p>
          </div>
          <p>개인정보 침해에 대한 신고나 상담은 아래 기관에 문의하실 수 있습니다.</p>
          <p className="pl-4">
            • 개인정보보호위원회: <span className="text-[#d4a853]">privacy.go.kr</span><br />
            • 개인정보침해 신고센터: 118<br />
            • 대검찰청 사이버수사과: 1301<br />
            • 경찰청 사이버안전국: 182
          </p>
        </Section>

      </div>

      <p className="text-xs text-[#4a3820] text-center">본 방침은 [20XX년 XX월 XX일]부터 시행됩니다.</p>
    </div>
  )
}

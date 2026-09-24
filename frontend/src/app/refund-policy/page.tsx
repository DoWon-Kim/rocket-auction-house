import type { Metadata } from 'next'
import { RefundPolicyContent } from '@/components/policy/RefundPolicyContent'

export const metadata: Metadata = {
  title: '환불 및 청약철회 정책 | Rocket Auction House',
}

export default function RefundPolicyPage() {
  return (
    <div className="max-w-3xl mx-auto py-12 space-y-10">
      <div>
        <h1 className="text-[26px] sm:text-3xl font-bold tracking-tight text-fg mb-2">환불 및 청약철회 정책</h1>
        <p className="text-sm text-subtle">전자상거래 등에서의 소비자보호에 관한 법률 제17조에 따른 안내</p>
      </div>
      <RefundPolicyContent />
    </div>
  )
}

'use client'

import { useQuery } from '@tanstack/react-query'
import { MapPin } from 'lucide-react'
import { api } from '@/lib/api'

export const EMPTY_ADDRESS = { recipientName: '', recipientPhone: '', zipCode: '', address: '', addressDetail: '', shippingMemo: '' }
export type Address = typeof EMPTY_ADDRESS

const MEMOS = ['', '문 앞에 놓아주세요', '경비실에 맡겨주세요', '배송 전 연락 부탁드립니다', '파손 주의 부탁드립니다']

export const isAddressValid = (a: Address) =>
  !!(a.recipientName.trim() && /^[0-9-]{9,20}$/.test(a.recipientPhone.trim()) && a.zipCode.trim() && a.address.trim())

export const addressPayload = (a: Address) => ({
  recipientName: a.recipientName.trim(), recipientPhone: a.recipientPhone.trim(), zipCode: a.zipCode.trim(), address: a.address.trim(),
  addressDetail: a.addressDetail.trim() || undefined, shippingMemo: a.shippingMemo.trim() || undefined,
})

// 배송지 입력 — 최근 배송지(중고거래·샵 주문) 불러오기 지원
export function AddressForm({ value, onChange, compact }: { value: Address; onChange: (a: Address) => void; compact?: boolean }) {
  const { data: last } = useQuery<{ address: Partial<Record<keyof Address, string | null>> | null }>({
    queryKey: ['my-last-address'], queryFn: () => api.get('/my/last-address').then(r => r.data), staleTime: 60_000,
  })
  const set = (k: keyof Address) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange({ ...value, [k]: e.target.value })
  const field = `w-full ${compact ? 'h-10' : 'h-11'} bg-sunken border border-line focus:border-accent/60 rounded-xl px-3 text-sm text-fg placeholder:text-subtle focus:outline-none`

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-fg flex items-center gap-1.5"><MapPin size={15} />배송지</h2>
        {last?.address && (
          <button type="button" onClick={() => onChange({ ...EMPTY_ADDRESS, ...Object.fromEntries(Object.entries(last.address!).map(([k, v]) => [k, v ?? ''])) })}
            className="h-8 px-3 rounded-lg border border-line text-xs text-fg-2 hover:bg-surface-2">최근 배송지 불러오기</button>
        )}
      </div>
      <div className="grid sm:grid-cols-2 gap-2">
        <input className={field} placeholder="받는 분 이름" value={value.recipientName} onChange={set('recipientName')} aria-label="받는 분 이름" />
        <input className={field} placeholder="연락처 (010-0000-0000)" inputMode="tel" value={value.recipientPhone} onChange={set('recipientPhone')} aria-label="연락처" />
      </div>
      <div className="grid grid-cols-[110px_1fr] gap-2">
        <input className={field} placeholder="우편번호" inputMode="numeric" value={value.zipCode} onChange={set('zipCode')} aria-label="우편번호" />
        <input className={field} placeholder="기본 주소" value={value.address} onChange={set('address')} aria-label="기본 주소" />
      </div>
      <input className={field} placeholder="상세 주소 (동·호수)" value={value.addressDetail} onChange={set('addressDetail')} aria-label="상세 주소" />
      <select className={`${field} cursor-pointer`} value={MEMOS.includes(value.shippingMemo) ? value.shippingMemo : '__custom'}
        onChange={e => onChange({ ...value, shippingMemo: e.target.value === '__custom' ? ' ' : e.target.value })} aria-label="배송 메모">
        {MEMOS.map(m => <option key={m} value={m}>{m || '배송 메모 선택 (선택)'}</option>)}
        <option value="__custom">직접 입력</option>
      </select>
      {!MEMOS.includes(value.shippingMemo) && (
        <input className={field} placeholder="배송 메모 직접 입력" value={value.shippingMemo.trimStart()} onChange={set('shippingMemo')} />
      )}
    </div>
  )
}

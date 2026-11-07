import { redirect } from 'next/navigation'

// 1:1 메시지 목록은 채팅 메시지함의 '1:1 메시지' 탭으로 합쳐짐 (예전 링크 호환)
export default function DmListPage() {
  redirect('/chat?tab=dm')
}

import { redirect } from 'next/navigation'

// 관제실은 관리자 대시보드로 통합됨
export default function AdminOpsRedirect() {
  redirect('/admin')
}

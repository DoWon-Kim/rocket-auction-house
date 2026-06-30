import { redirect } from 'next/navigation'

export default function SellPage() {
  redirect('/listings?tab=sell')
}

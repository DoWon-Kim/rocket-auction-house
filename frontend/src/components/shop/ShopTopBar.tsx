'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Search, ShoppingCart, Receipt, Store } from 'lucide-react'
import { useAuthStore } from '@/lib/store'
import { useCart } from '@/lib/shop'

// 샵 공통 상단: 로고 · 검색 · 주문내역 · 장바구니
export function ShopTopBar({ initialQ = '' }: { initialQ?: string }) {
  const router = useRouter()
  const user = useAuthStore(s => s.user)
  const { data: cart } = useCart()
  const [q, setQ] = useState(initialQ)
  const count = cart?.items.length ?? 0

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Link href="/shop" className="flex items-center gap-2 mr-2">
        <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent to-sky-500 flex items-center justify-center"><Store size={18} className="text-white" /></span>
        <span className="text-xl font-extrabold tracking-tight text-fg">로켓 샵</span>
      </Link>
      <form onSubmit={e => { e.preventDefault(); router.push(q.trim() ? `/shop?q=${encodeURIComponent(q.trim())}#all` : '/shop#all') }} className="relative flex-1 min-w-[200px]">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-subtle" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="상품명으로 검색 (예: 부스터 박스)"
          className="w-full h-11 rounded-full bg-surface border border-line focus:border-accent/50 pl-11 pr-4 text-sm text-fg placeholder:text-subtle focus:outline-none" />
      </form>
      {user && (
        <Link href="/shop/orders" className="h-11 px-4 inline-flex items-center gap-1.5 rounded-full border border-line text-sm text-fg-2 hover:bg-surface-2">
          <Receipt size={16} /><span className="hidden sm:inline">주문내역</span>
        </Link>
      )}
      <Link href={user ? '/shop/cart' : '/login'} className="relative h-11 px-4 inline-flex items-center gap-1.5 rounded-full bg-surface-2 border border-line text-sm font-semibold text-fg hover:border-accent/40">
        <ShoppingCart size={16} /><span className="hidden sm:inline">장바구니</span>
        {count > 0 && <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-accent text-[11px] font-bold text-white flex items-center justify-center">{count}</span>}
      </Link>
    </div>
  )
}

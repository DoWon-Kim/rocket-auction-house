'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Package, ShoppingCart, Star, Check } from 'lucide-react'
import { useState } from 'react'
import { TCG_LABELS } from '@/lib/utils'
import { useAuthStore } from '@/lib/store'
import { CATEGORY_LABELS, P, useAddToCart, type ShopItemCard } from '@/lib/shop'

export function PriceBlock({ price, originalPrice, discountRate, size = 'md' }: { price: number; originalPrice: number | null; discountRate: number; size?: 'md' | 'lg' }) {
  return (
    <div className="space-y-0.5">
      {discountRate > 0 && originalPrice && (
        <p className={`${size === 'lg' ? 'text-sm' : 'text-[11px]'} text-subtle line-through tabular-nums`}>{P(originalPrice)}</p>
      )}
      <p className="flex items-baseline gap-1.5">
        {discountRate > 0 && <span className={`${size === 'lg' ? 'text-2xl' : 'text-sm'} font-extrabold text-rose-400 tabular-nums`}>{discountRate}%</span>}
        <span className={`${size === 'lg' ? 'text-3xl' : 'text-base'} font-extrabold text-fg tabular-nums`}>{P(price)}</span>
      </p>
    </div>
  )
}

export function Stars({ value, size = 12 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex" aria-label={`별점 ${value}점`}>
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} size={size} className={i <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-line-strong'} />
      ))}
    </span>
  )
}

export function ProductCard({ item }: { item: ShopItemCard }) {
  const user = useAuthStore(s => s.user)
  const router = useRouter()
  const add = useAddToCart()
  const [added, setAdded] = useState(false)
  const lowStock = !item.soldOut && item.stock <= 5

  function quickAdd(e: React.MouseEvent) {
    e.preventDefault()
    if (!user) { router.push(`/login?next=/shop/${item.id}`); return }
    add.mutate({ shopItemId: item.id, quantity: 1 }, { onSuccess: () => { setAdded(true); setTimeout(() => setAdded(false), 1500) } })
  }

  return (
    <Link href={`/shop/${item.id}`} className="group flex flex-col rounded-2xl border border-line bg-surface overflow-hidden hover:border-accent/40 transition-colors">
      <div className="relative aspect-square bg-sunken overflow-hidden">
        {item.imageUrl
          ? <Image src={item.imageUrl} alt={item.name} fill sizes="(max-width:640px) 50vw,(max-width:1024px) 33vw,20vw"
              className={`object-contain p-3 transition-transform duration-300 ${item.soldOut ? 'grayscale opacity-50' : 'group-hover:scale-105'}`} />
          : <div className="absolute inset-0 flex items-center justify-center text-subtle"><Package size={40} /></div>}
        <div className="absolute top-2 left-2 flex flex-col gap-1">
          {item.isNew && <span className="px-1.5 py-0.5 rounded-md bg-sky-500 text-[10px] font-bold text-white">NEW</span>}
          {item.soldCount >= 30 && <span className="px-1.5 py-0.5 rounded-md bg-accent text-[10px] font-bold text-white">BEST</span>}
          {lowStock && <span className="px-1.5 py-0.5 rounded-md bg-orange-500 text-[10px] font-bold text-white">잔여 {item.stock}</span>}
        </div>
        {item.soldOut && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <span className="px-3 py-1 rounded-full bg-bg/80 border border-line-strong text-sm font-bold text-fg">품절</span>
          </div>
        )}
        {!item.soldOut && (
          <button onClick={quickAdd} aria-label="장바구니 담기" disabled={add.isPending}
            className="absolute bottom-2 right-2 w-9 h-9 rounded-full bg-bg/85 border border-line backdrop-blur flex items-center justify-center text-fg-2 hover:text-white hover:bg-accent sm:opacity-0 group-hover:opacity-100 transition-all">
            {added ? <Check size={15} className="text-emerald-300" /> : <ShoppingCart size={15} />}
          </button>
        )}
      </div>
      <div className="flex-1 p-3 space-y-1.5">
        <p className="text-[10px] text-subtle">{TCG_LABELS[item.tcgType] ?? item.tcgType} · {CATEGORY_LABELS[item.category] ?? item.category}</p>
        <p className="text-sm font-medium text-fg leading-snug line-clamp-2 min-h-[2.5rem] group-hover:text-white">{item.name}</p>
        <PriceBlock price={item.price} originalPrice={item.originalPrice} discountRate={item.discountRate} />
        {item.reviewCount > 0 && item.rating != null && (
          <p className="flex items-center gap-1 text-[11px] text-muted"><Star size={11} className="fill-amber-400 text-amber-400" />{item.rating.toFixed(1)} <span className="text-subtle">({item.reviewCount})</span></p>
        )}
      </div>
    </Link>
  )
}

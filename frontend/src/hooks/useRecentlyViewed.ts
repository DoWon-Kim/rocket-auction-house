'use client'
import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'rocketAH_recentCards'
const MAX_CARDS = 12

export interface RecentCard {
  id: string
  name: string
  nameKo: string | null
  imageUrl: string | null
  tcgType: string
  setName: string
}

export function useRecentlyViewed() {
  const [cards, setCards] = useState<RecentCard[]>([])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setCards(JSON.parse(raw))
    } catch { /* ignore */ }
  }, [])

  const addCard = useCallback((card: RecentCard) => {
    setCards(prev => {
      const filtered = prev.filter(c => c.id !== card.id)
      const next = [card, ...filtered].slice(0, MAX_CARDS)
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }, [])

  const clearAll = useCallback(() => {
    setCards([])
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
  }, [])

  return { cards, addCard, clearAll }
}

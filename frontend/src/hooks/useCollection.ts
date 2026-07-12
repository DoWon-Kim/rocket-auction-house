'use client'

import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'rocket_collection'

export function useCollection() {
  const [collected, setCollected] = useState<Set<string>>(new Set())

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) setCollected(new Set(JSON.parse(stored) as string[]))
    } catch {}
  }, [])

  const toggle = useCallback((cardId: string) => {
    setCollected(prev => {
      const next = new Set(prev)
      if (next.has(cardId)) next.delete(cardId)
      else next.add(cardId)
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...next])) } catch {}
      return next
    })
  }, [])

  const isCollected = useCallback((cardId: string) => collected.has(cardId), [collected])

  return { collected, toggle, isCollected }
}

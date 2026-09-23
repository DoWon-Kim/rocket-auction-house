'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAuthStore, useAuthHydrated } from '@/lib/store'

export default function DmWithUserPage() {
  const { userId } = useParams<{ userId: string }>()
  const { user } = useAuthStore()
  const router = useRouter()

  const hydrated = useAuthHydrated()

  useEffect(() => {
    if (!hydrated) return
    if (!user) { router.replace('/login'); return }
    if (!userId) return
    api.get(`/dm/with/${userId}`)
      .then(r => router.replace(`/dm/${r.data.id}`))
      .catch(() => router.replace('/dm'))
  }, [hydrated, userId, user, router])

  return (
    <div className="flex items-center justify-center py-24">
      <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

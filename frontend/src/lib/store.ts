import { useSyncExternalStore } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: string
  email: string
  nickname: string
  avatarUrl?: string
  balance: number
  role: string
  emailNotifications?: boolean
  emailVerified?: boolean
}

interface AuthStore {
  user: User | null
  token: string | null
  refreshToken: string | null
  setAuth: (user: User, token: string, refreshToken?: string) => void
  setTokens: (token: string, refreshToken: string) => void
  clearAuth: () => void
  updateBalance: (balance: number) => void
  updateUser: (patch: Partial<User>) => void
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      refreshToken: null,
      setAuth: (user, token, refreshToken) => {
        set({ user, token, refreshToken: refreshToken ?? null })
      },
      setTokens: (token, refreshToken) => {
        set({ token, refreshToken })
      },
      clearAuth: () => {
        set({ user: null, token: null, refreshToken: null })
      },
      updateBalance: (balance) =>
        set((state) => ({ user: state.user ? { ...state.user, balance } : null })),
      updateUser: (patch) =>
        set((state) => ({ user: state.user ? { ...state.user, ...patch } : null })),
    }),
    { name: 'auth-storage' }
  )
)

// localStorage 복원이 끝났는지 여부. SSR/첫 렌더에서는 false라서
// 복원 전 user === null 을 "비로그인"으로 오판해 리다이렉트하지 않도록 사용
export function useAuthHydrated() {
  return useSyncExternalStore(
    (cb) => useAuthStore.persist.onFinishHydration(cb),
    () => useAuthStore.persist.hasHydrated(),
    () => false,
  )
}

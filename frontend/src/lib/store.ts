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
}

interface AuthStore {
  user: User | null
  token: string | null
  setAuth: (user: User, token: string) => void
  clearAuth: () => void
  updateBalance: (balance: number) => void
  updateUser: (patch: Partial<User>) => void
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      setAuth: (user, token) => {
        set({ user, token })
      },
      clearAuth: () => {
        set({ user: null, token: null })
      },
      updateBalance: (balance) =>
        set((state) => ({ user: state.user ? { ...state.user, balance } : null })),
      updateUser: (patch) =>
        set((state) => ({ user: state.user ? { ...state.user, ...patch } : null })),
    }),
    { name: 'auth-storage' }
  )
)

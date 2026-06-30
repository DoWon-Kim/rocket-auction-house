import axios from 'axios'
import { useAuthStore } from '@/lib/store'

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api',
  withCredentials: true,
  timeout: 10000,
})

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      const hadToken = !!useAuthStore.getState().token
      useAuthStore.getState().clearAuth()
      const path = window.location.pathname
      if (hadToken && path !== '/login' && path !== '/register') {
        window.location.href = '/login'
      }
    }
    return Promise.reject(err)
  }
)

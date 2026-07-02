import axios, { AxiosError } from 'axios'
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

// 동시 401 응답이 여러 개 와도 한 번만 리다이렉트하도록 플래그 관리
let isRedirecting = false

// 재시도 대상: 네트워크 오류 또는 5xx 서버 오류
function shouldRetry(err: AxiosError): boolean {
  if (!err.response) return true          // 네트워크 단절
  return err.response.status >= 500       // 5xx 서버 오류
}

api.interceptors.response.use(
  (res) => res,
  async (err: AxiosError) => {
    const config = err.config as typeof err.config & { _retryCount?: number }
    if (!config) return Promise.reject(err)

    if (shouldRetry(err)) {
      config._retryCount = (config._retryCount ?? 0) + 1
      if (config._retryCount <= 3) {
        const delay = Math.min(300 * 2 ** (config._retryCount - 1), 3000)
        await new Promise(r => setTimeout(r, delay))
        return api(config)
      }
    }

    if (err.response?.status === 401 && typeof window !== 'undefined') {
      const hadToken = !!useAuthStore.getState().token
      useAuthStore.getState().clearAuth()
      const path = window.location.pathname
      if (hadToken && path !== '/login' && path !== '/register' && !isRedirecting) {
        isRedirecting = true
        window.location.href = '/login'
        setTimeout(() => { isRedirecting = false }, 3000)
      }
    }
    return Promise.reject(err)
  }
)

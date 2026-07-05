import axios, { AxiosError } from 'axios'
import { useAuthStore } from '@/lib/store'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api'

export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  timeout: 10000,
})

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// 동시 refresh 요청 방지 플래그
let isRefreshing = false
let refreshQueue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = []

function drainQueue(token: string | null, err: unknown) {
  refreshQueue.forEach(p => (token ? p.resolve(token) : p.reject(err)))
  refreshQueue = []
}

// 동시 401 응답이 여러 개 와도 한 번만 리다이렉트하도록 플래그 관리
let isRedirecting = false

// 재시도 대상: 네트워크 오류 또는 5xx 서버 오류
function shouldRetry(err: AxiosError): boolean {
  if (!err.response) return true      // 네트워크 단절
  return err.response.status >= 500   // 5xx 서버 오류
}

api.interceptors.response.use(
  (res) => res,
  async (err: AxiosError) => {
    // _retryCount: 5xx 재시도 횟수 (refresh 여부와 무관하게 독립 동작)
    // _refreshed: 401 refresh를 이미 시도했는지 (무한 루프 방지)
    const config = err.config as typeof err.config & { _retryCount?: number; _refreshed?: boolean }
    if (!config) return Promise.reject(err)

    // 1) 5xx / 네트워크 — 지수 백오프 재시도 (최대 3회, refresh 여부와 무관)
    if (shouldRetry(err)) {
      config._retryCount = (config._retryCount ?? 0) + 1
      if (config._retryCount <= 3) {
        const delay = Math.min(300 * 2 ** (config._retryCount - 1), 3000)
        await new Promise(r => setTimeout(r, delay))
        return api(config)
      }
    }

    // 2) 401 — refresh token으로 재발급 시도 (한 번만)
    if (err.response?.status === 401 && !config._refreshed && typeof window !== 'undefined') {
      const { refreshToken, setTokens, clearAuth } = useAuthStore.getState()

      if (refreshToken) {
        config._refreshed = true

        if (isRefreshing) {
          // 다른 요청이 이미 refresh 중 — 완료될 때까지 대기
          return new Promise((resolve, reject) => {
            refreshQueue.push({
              resolve: (token) => {
                config.headers!.Authorization = `Bearer ${token}`
                resolve(api(config))
              },
              reject,
            })
          })
        }

        isRefreshing = true
        try {
          const res = await axios.post(`${API_BASE}/auth/refresh`, { refreshToken })
          const { token: newToken, refreshToken: newRefresh } = res.data as { token: string; refreshToken: string }
          setTokens(newToken, newRefresh)
          config.headers!.Authorization = `Bearer ${newToken}`
          drainQueue(newToken, null)
          return api(config)
        } catch (refreshErr) {
          drainQueue(null, refreshErr)
          // refresh 실패 시 DB의 refresh token 폐기 시도 (실패해도 무시)
          axios.post(`${API_BASE}/auth/logout`, { refreshToken }).catch(() => {})
          clearAuth()
          if (!isRedirecting && typeof window !== 'undefined') {
            isRedirecting = true
            window.location.href = '/login'
            setTimeout(() => { isRedirecting = false }, 3000)
          }
          return Promise.reject(refreshErr)
        } finally {
          isRefreshing = false
        }
      }

      // refreshToken 없는 상태에서 401 — 즉시 로그아웃
      const hadToken = !!useAuthStore.getState().token
      useAuthStore.getState().clearAuth()
      if (typeof window !== 'undefined') {
        const path = window.location.pathname
        if (hadToken && path !== '/login' && path !== '/register' && !isRedirecting) {
          isRedirecting = true
          window.location.href = '/login'
          setTimeout(() => { isRedirecting = false }, 3000)
        }
      }
    }

    return Promise.reject(err)
  }
)

import type { Socket } from 'socket.io-client'

let socket: Socket | null = null

export function getSocket(): Socket {
  if (typeof window === 'undefined') return null as unknown as Socket
  if (!socket) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { io } = require('socket.io-client') as typeof import('socket.io-client')
    const token = localStorage.getItem('token')
    socket = io(process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') ?? 'http://localhost:4000', {
      auth: { token },
      autoConnect: false,
    })
  }
  return socket!
}

export function connectSocket() {
  const s = getSocket()
  if (!s.connected) s.connect()
  return s
}

export function disconnectSocket() {
  socket?.disconnect()
}

// 토큰 변경 시 소켓 재연결 (로그인/로그아웃)
export function reconnectWithToken(token: string | null) {
  if (socket) {
    socket.disconnect()
    socket.auth = { token }
    if (token) socket.connect()
  }
}

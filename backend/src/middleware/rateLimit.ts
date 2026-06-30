import rateLimit from 'express-rate-limit'

// 로그인/회원가입: IP당 15분에 10회
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: '요청이 너무 많습니다. 15분 후 다시 시도해주세요.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// 결제: IP당 1시간에 10회
export const paymentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { message: '결제 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// 이미지 업로드: IP당 1분에 20회
export const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { message: '업로드 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// 일반 API: IP당 1분에 120회
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
  standardHeaders: true,
  legacyHeaders: false,
})

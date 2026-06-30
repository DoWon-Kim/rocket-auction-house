import crypto from 'crypto'

export async function sendSms(to: string, text: string): Promise<void> {
  const apiKey    = process.env.COOLSMS_API_KEY?.trim()
  const apiSecret = process.env.COOLSMS_API_SECRET?.trim()
  const from      = process.env.COOLSMS_FROM?.trim()

  if (!apiKey || !apiSecret || !from) {
    console.log(`[SMS] 미설정 — 개발 모드: ${to} → ${text}`)
    return
  }

  const date      = new Date().toISOString()
  const nonce     = crypto.randomBytes(8).toString('hex')
  const signature = crypto.createHmac('sha256', apiSecret).update(`${date}${nonce}`).digest('hex')

  const res = await fetch('https://api.coolsms.co.kr/messages/v4/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `HMAC-SHA256 ApiKey=${apiKey}, Date=${date}, Nonce=${nonce}, Signature=${signature}`,
    },
    body: JSON.stringify({ message: { to, from, text } }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`SMS 발송 실패: ${body}`)
  }
}

export function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

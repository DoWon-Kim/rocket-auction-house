import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.EMAIL_FROM ?? 'Rocket AH <noreply@rocketcard.co.kr>'
const FRONTEND = process.env.FRONTEND_URL ?? 'http://localhost:3000'

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

export async function sendPasswordResetEmail(email: string, nickname: string, token: string) {
  if (!process.env.RESEND_API_KEY) {
    console.log('[Mailer] RESEND_API_KEY 미설정')
    console.log(`  수신: ${email}`)
    console.log(`  링크: ${FRONTEND}/reset-password?token=${token}`)
    return
  }

  const link = `${FRONTEND}/reset-password?token=${token}`
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: '[Rocket AH] 비밀번호 재설정 안내',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0f172a;color:#e2e8f0;border-radius:12px">
        <h2 style="color:#d4a853;margin-top:0">Rocket Auction House</h2>
        <p>안녕하세요, <strong>${escapeHtml(nickname)}</strong>님!</p>
        <p>비밀번호 재설정을 요청하셨습니다.<br>아래 버튼을 클릭해 새 비밀번호를 설정해주세요.</p>
        <a href="${link}" style="display:inline-block;margin:20px 0;padding:12px 28px;background:#d4a853;color:#0f0b08;text-decoration:none;border-radius:8px;font-weight:700">비밀번호 재설정</a>
        <p style="font-size:12px;color:#94a3b8">이 링크는 <strong>1시간</strong> 후 만료됩니다.<br>본인이 요청하지 않았다면 이 메일을 무시하세요.</p>
      </div>
    `,
  })
}

export async function sendVerificationEmail(email: string, nickname: string, token: string) {
  if (!process.env.RESEND_API_KEY) {
    console.log('[Mailer] RESEND_API_KEY 미설정')
    console.log(`  수신: ${email}`)
    console.log(`  인증 링크: ${FRONTEND}/verify-email?token=${token}`)
    return
  }

  const link = `${FRONTEND}/verify-email?token=${token}`
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: '[Rocket AH] 이메일 인증 안내',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0f172a;color:#e2e8f0;border-radius:12px">
        <h2 style="color:#d4a853;margin-top:0">Rocket Auction House</h2>
        <p>안녕하세요, <strong>${escapeHtml(nickname)}</strong>님! 가입을 환영합니다.</p>
        <p>아래 버튼을 클릭해 이메일을 인증하고 모든 서비스를 이용하세요.</p>
        <a href="${link}" style="display:inline-block;margin:20px 0;padding:12px 28px;background:#d4a853;color:#0f0b08;text-decoration:none;border-radius:8px;font-weight:700">이메일 인증하기</a>
        <p style="font-size:12px;color:#94a3b8">이 링크는 <strong>24시간</strong> 후 만료됩니다.<br>본인이 가입하지 않았다면 이 메일을 무시하세요.</p>
      </div>
    `,
  })
}

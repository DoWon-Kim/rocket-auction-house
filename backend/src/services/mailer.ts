import nodemailer from 'nodemailer'

function createTransport() {
  const host = process.env.SMTP_HOST
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS

  // 설정 없으면 Ethereal 테스트 계정 (콘솔 출력)
  if (!host || !user || !pass) {
    return nodemailer.createTransport({ jsonTransport: true })
  }

  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_PORT === '465',
    auth: { user, pass },
  })
}

const transporter = createTransport()
const FROM = process.env.SMTP_FROM ?? 'Rocket AH <noreply@rocket-ah.com>'
const FRONTEND = process.env.FRONTEND_URL ?? 'http://localhost:3000'

export async function sendPasswordResetEmail(email: string, nickname: string, token: string) {
  const link = `${FRONTEND}/reset-password?token=${token}`
  const info = await transporter.sendMail({
    from: FROM,
    to: email,
    subject: '[Rocket AH] 비밀번호 재설정 안내',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0f172a;color:#e2e8f0;border-radius:12px">
        <h2 style="color:#818cf8;margin-top:0">Rocket Auction House</h2>
        <p>안녕하세요, <strong>${nickname}</strong>님!</p>
        <p>비밀번호 재설정을 요청하셨습니다.<br>아래 버튼을 클릭해 새 비밀번호를 설정해주세요.</p>
        <a href="${link}" style="display:inline-block;margin:20px 0;padding:12px 28px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">비밀번호 재설정</a>
        <p style="font-size:12px;color:#94a3b8">이 링크는 <strong>1시간</strong> 후 만료됩니다.<br>본인이 요청하지 않았다면 이 메일을 무시하세요.</p>
        <hr style="border-color:#334155;margin:24px 0">
        <p style="font-size:11px;color:#64748b">버튼이 작동하지 않으면 아래 링크를 복사해 브라우저에 붙여넣으세요:<br>${link}</p>
      </div>
    `,
  })

  // SMTP 미설정 시 콘솔 출력 (개발용)
  if (!process.env.SMTP_HOST) {
    console.log('[Mailer] 이메일 미설정 — 개발 모드 출력:')
    console.log(`  수신: ${email}`)
    console.log(`  링크: ${link}`)
  }

  return info
}

export async function sendVerificationEmail(email: string, nickname: string, token: string) {
  const link = `${FRONTEND}/verify-email?token=${token}`
  const info = await transporter.sendMail({
    from: FROM,
    to: email,
    subject: '[Rocket AH] 이메일 인증 안내',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0f172a;color:#e2e8f0;border-radius:12px">
        <h2 style="color:#d4a853;margin-top:0">Rocket Auction House</h2>
        <p>안녕하세요, <strong>${nickname}</strong>님! 가입을 환영합니다.</p>
        <p>아래 버튼을 클릭해 이메일을 인증하고 모든 서비스를 이용하세요.</p>
        <a href="${link}" style="display:inline-block;margin:20px 0;padding:12px 28px;background:#d4a853;color:#0f0b08;text-decoration:none;border-radius:8px;font-weight:700">이메일 인증하기</a>
        <p style="font-size:12px;color:#94a3b8">이 링크는 <strong>24시간</strong> 후 만료됩니다.<br>본인이 가입하지 않았다면 이 메일을 무시하세요.</p>
        <hr style="border-color:#334155;margin:24px 0">
        <p style="font-size:11px;color:#64748b">버튼이 작동하지 않으면 아래 링크를 복사해 브라우저에 붙여넣으세요:<br>${link}</p>
      </div>
    `,
  })

  if (!process.env.SMTP_HOST) {
    console.log('[Mailer] 이메일 미설정 — 개발 모드 출력:')
    console.log(`  수신: ${email}`)
    console.log(`  인증 링크: ${link}`)
  }

  return info
}

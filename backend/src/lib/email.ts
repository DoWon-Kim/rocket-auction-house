import { Resend } from 'resend'
import { NotificationType } from '@prisma/client'

const resend = new Resend(process.env.RESEND_API_KEY)

// ── HTML 템플릿 헬퍼 ──────────────────────────────────────────────────────────

const BRAND_COLOR = '#d4a853'
const DARK_BG = '#0e0a07'
const CARD_BG = '#1a1410'
const BORDER = '#2e2318'
const TEXT_MAIN = '#f5ead8'
const TEXT_SUB = '#7a6040'

// XSS 방어: 사용자 데이터를 HTML에 삽입하기 전 반드시 이스케이프
function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

// ctaHref는 반드시 내부 경로여야 함 (// 또는 http로 시작 시 / 로 대체)
function safeInternalPath(href: string): string {
  if (/^https?:\/\//i.test(href) || href.startsWith('//')) return '/'
  return href
}

function baseTemplate(title: string, bodyHtml: string, ctaHref?: string, ctaLabel?: string) {
  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000'
  const safeHref = ctaHref ? safeInternalPath(ctaHref) : undefined
  const safeTitle = esc(title)
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle}</title>
</head>
<body style="margin:0;padding:0;background:${DARK_BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${DARK_BG};padding:40px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:${CARD_BG};border-radius:16px;border:1px solid ${BORDER};overflow:hidden;">

        <!-- 헤더 -->
        <tr>
          <td style="padding:24px 32px;border-bottom:1px solid ${BORDER};">
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="font-size:22px;">🚀</span>
              <span style="font-size:17px;font-weight:700;color:${BRAND_COLOR};letter-spacing:-0.5px;">Rocket Auction House</span>
            </div>
          </td>
        </tr>

        <!-- 바디 -->
        <tr>
          <td style="padding:28px 32px;">
            <h2 style="margin:0 0 12px;font-size:18px;font-weight:700;color:${TEXT_MAIN};">${safeTitle}</h2>
            ${bodyHtml}
            ${safeHref ? `
            <div style="margin-top:28px;">
              <a href="${frontendUrl}${safeHref}"
                style="display:inline-block;background:${BRAND_COLOR};color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:10px;">
                ${esc(ctaLabel ?? '자세히 보기')}
              </a>
            </div>` : ''}
          </td>
        </tr>

        <!-- 푸터 -->
        <tr>
          <td style="padding:20px 32px;border-top:1px solid ${BORDER};">
            <p style="margin:0;font-size:11px;color:${TEXT_SUB};line-height:1.6;">
              이 이메일은 <a href="${frontendUrl}" style="color:${BRAND_COLOR};text-decoration:none;">Rocket Auction House</a> 서비스 알림입니다.<br>
              이메일 수신을 원하지 않으면
              <a href="${frontendUrl}/settings" style="color:${BRAND_COLOR};text-decoration:none;">설정에서 해제</a>하세요.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

// p(): raw HTML을 받아 래핑 (highlight() 등 HTML 임베딩용)
function p(html: string) {
  return `<p style="margin:0 0 10px;font-size:14px;color:${TEXT_MAIN};line-height:1.7;">${html}</p>`
}

// pText(): 사용자 데이터(DB 값)를 안전하게 래핑
function pText(text: string) {
  return p(esc(text))
}

function highlight(safeText: string) {
  return `<strong style="color:${BRAND_COLOR};">${safeText}</strong>`
}

// ── 알림 타입별 이메일 생성 ───────────────────────────────────────────────────

interface EmailPayload {
  subject: string
  html: string
}

export function buildEmailFromNotification(
  type: NotificationType,
  title: string,
  body: string | null | undefined,
  link: string | null | undefined,
): EmailPayload | null {
  const l = link ?? undefined  // null → undefined

  switch (type) {
    case 'BID_OUTBID':
      return {
        subject: `[입찰 초과] ${title}`,
        html: baseTemplate(title, pText(body ?? '') + p('다른 입찰자에게 추월당했습니다. 재입찰하여 경매를 이어가세요!'), l, '경매 보러 가기'),
      }
    case 'BID_WON':
      return {
        subject: `🎉 [낙찰] ${title}`,
        html: baseTemplate(title, pText(body ?? '') + p('축하합니다! 경매에 낙찰되었습니다. 판매자가 배송을 준비합니다.'), l, '거래 상세 보기'),
      }
    case 'OFFER_RECEIVED':
      return {
        subject: `[제안 도착] ${title}`,
        html: baseTemplate(title, pText(body ?? '') + p('새 제안이 도착했습니다. 수락하거나 거절해 주세요.'), l, '제안 확인하기'),
      }
    case 'OFFER_ACCEPTED':
      return {
        subject: `✅ [제안 수락] ${title}`,
        html: baseTemplate(title, pText(body ?? '') + p('제안이 수락되었습니다! 거래가 시작됩니다.'), l, '거래 확인하기'),
      }
    case 'OFFER_REJECTED':
      return {
        subject: `[제안 거절] ${title}`,
        html: baseTemplate(title, pText(body ?? '') + p('제안이 거절되었습니다. 다른 리스팅을 찾아보세요.'), l ?? '/listings', '마켓 둘러보기'),
      }
    case 'TRANSACTION_SHIPPED':
      return {
        subject: `🚚 [배송 시작] ${title}`,
        html: baseTemplate(title, pText(body ?? '') + p('판매자가 물품을 발송했습니다. 수령 후 구매 확정해 주세요.'), l, '배송 확인하기'),
      }
    case 'TRANSACTION_COMPLETED':
      return {
        subject: `✅ [거래 완료] ${title}`,
        html: baseTemplate(title, pText(body ?? '') + p('거래가 완료되었습니다. 에스크로 대금이 지급됩니다.'), l, '거래 확인하기'),
      }
    case 'REVIEW_RECEIVED':
      return {
        subject: `⭐ [리뷰 도착] ${title}`,
        html: baseTemplate(title, pText(body ?? '') + p('새 리뷰가 등록되었습니다.'), '/my?tab=reviews', '리뷰 확인하기'),
      }
    case 'WISHLIST_PRICE_ALERT':
      return {
        subject: `🎯 [가격 알림] ${title}`,
        html: baseTemplate(title, pText(body ?? '') + p(`위시리스트 카드의 ${highlight('목표가 이하 리스팅')}이 등록되었습니다!`), l, '리스팅 보러 가기'),
      }
    case 'FRIEND_REQUEST':
      return {
        subject: `[친구 요청] ${title}`,
        html: baseTemplate(title, pText(body ?? '') + p('새 친구 요청이 도착했습니다.'), '/friends', '확인하기'),
      }
    case 'FRIEND_ACCEPTED':
      return {
        subject: `[친구 수락] ${title}`,
        html: baseTemplate(title, pText(body ?? ''), '/friends', '친구 목록 보기'),
      }
    default:
      return null
  }
}

// ── 발송 함수 ─────────────────────────────────────────────────────────────────

export async function sendEmail({
  to, subject, html,
}: { to: string; subject: string; html: string }) {
  if (!process.env.RESEND_API_KEY) return

  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM ?? 'Rocket Auction House <noreply@rocketcard.co.kr>',
      to,
      subject,
      html,
    })
  } catch (err) {
    console.error('[sendEmail] failed:', err)
  }
}

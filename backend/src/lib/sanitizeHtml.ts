import sanitize from 'sanitize-html'

// 게시판 서식 에디터(TipTap) 출력용 허용 목록.
// 여기 없는 태그/속성/스타일/URL 스킴은 모두 제거된다.
const COLOR = /^(#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+))?\s*\)|inherit)$/i
const ALIGN = /^(left|center|right|justify)$/

const OPTIONS: sanitize.IOptions = {
  allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'h2', 'h3', 'blockquote', 'ul', 'ol', 'li', 'a', 'img', 'span', 'mark', 'hr'],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    img: ['src', 'alt'],
    span: ['style'],
    mark: ['style', 'data-color'],
    p: ['style'],
    h2: ['style'],
    h3: ['style'],
  },
  allowedStyles: {
    '*': { color: [COLOR], 'background-color': [COLOR], 'text-align': [ALIGN] },
  },
  allowedSchemes: ['http', 'https'],
  allowedSchemesAppliedToAttributes: ['href', 'src'],
  allowProtocolRelative: false,
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: { href: attribs.href ?? '', target: '_blank', rel: 'noopener noreferrer nofollow ugc' },
    }),
  },
  exclusiveFilter: frame => frame.tag === 'img' && !frame.attribs.src,
}

export function sanitizePostHtml(html: string): string {
  return sanitize(html, OPTIONS).trim()
}

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' }

// 검색/미리보기용 평문
export function htmlToText(html: string): string {
  const withBreaks = html.replace(/<(br|\/p|\/h[23]|\/li|\/blockquote)[^>]*>/gi, '$&\n')
  return sanitize(withBreaks, { allowedTags: [], allowedAttributes: {} })
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, m => ENTITIES[m] ?? m)
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// 본문 이미지 URL (등장 순서)
export function imagesInHtml(html: string): string[] {
  return [...html.matchAll(/<img[^>]*\ssrc="([^"]+)"/gi)].map(m => m[1])
}

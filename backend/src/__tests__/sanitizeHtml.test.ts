import { sanitizePostHtml, htmlToText, imagesInHtml } from '../lib/sanitizeHtml'

describe('sanitizePostHtml', () => {
  it('서식 태그와 허용 스타일은 유지', () => {
    const html = '<h2 style="text-align: center">제목</h2><p><strong>굵게</strong> <span style="color: #ff0000">빨강</span> <mark data-color="#fde68a" style="background-color: #fde68a; color: inherit">형광</mark></p>'
    const out = sanitizePostHtml(html)
    expect(out).toContain('<h2 style="text-align:center">제목</h2>')
    expect(out).toContain('<strong>굵게</strong>')
    expect(out).toContain('color:#ff0000')
    expect(out).toContain('background-color:#fde68a')
  })

  it('스크립트·이벤트 핸들러·iframe 제거', () => {
    const out = sanitizePostHtml('<p onclick="alert(1)">a</p><script>alert(1)</script><iframe src="https://x"></iframe><img src="https://a.com/x.png" onerror="alert(1)">')
    expect(out).not.toMatch(/script|onclick|onerror|iframe|alert/i)
    expect(out).toContain('<img src="https://a.com/x.png" />')
  })

  it('javascript:/data: URL 제거, 링크는 새 창 + nofollow', () => {
    const out = sanitizePostHtml('<a href="javascript:alert(1)">x</a><a href="https://ok.com">ok</a><img src="data:image/png;base64,AAAA">')
    expect(out).not.toMatch(/javascript:|data:/)
    expect(out).toContain('href="https://ok.com"')
    expect(out).toContain('rel="noopener noreferrer nofollow ugc"')
    expect(out).not.toContain('<img')
  })

  it('허용되지 않은 CSS(위치·배경 이미지 등) 제거', () => {
    const out = sanitizePostHtml('<p style="position: fixed; top: 0; background-image: url(https://x); color: red">x</p>')
    expect(out).not.toMatch(/position|background-image|url\(/)
  })
})

describe('htmlToText / imagesInHtml', () => {
  it('태그 제거 후 줄바꿈 유지, 엔티티 복원', () => {
    expect(htmlToText('<p>A &amp; B</p><p>C</p>')).toBe('A & B\nC')
  })
  it('이미지 URL 순서대로 추출', () => {
    expect(imagesInHtml('<p><img src="https://a/1.png" /></p><img src="https://a/2.png" />')).toEqual(['https://a/1.png', 'https://a/2.png'])
  })
})

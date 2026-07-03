/**
 * escapeHtml — HTML injection prevention test (bug #2 fix)
 */

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

describe('escapeHtml', () => {
  test('escapes < and >', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;')
  })

  test('escapes & first (avoids double-escaping)', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b')
  })

  test('escapes quotes', () => {
    expect(escapeHtml('"hello" \'world\'')).toBe('&quot;hello&quot; &#x27;world&#x27;')
  })

  test('passes through clean nicknames unchanged', () => {
    expect(escapeHtml('홍길동123')).toBe('홍길동123')
  })

  test('neutralises a full XSS payload', () => {
    const payload = '<img src=x onerror="alert(1)">'
    const escaped = escapeHtml(payload)
    expect(escaped).not.toContain('<')
    expect(escaped).not.toContain('>')
    expect(escaped).toContain('&lt;img')
  })
})

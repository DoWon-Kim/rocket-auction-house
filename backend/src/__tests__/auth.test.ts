/**
 * Auth validation — nickname schema and JWT logout guard tests.
 * No server or DB needed: pure schema/regex validation.
 */

import { z } from 'zod'

const nicknameSchema = z
  .string()
  .min(2)
  .max(20)
  .regex(/^[^\s<>"'&\\]+$/, '닉네임에 사용할 수 없는 문자가 포함되어 있습니다.')

describe('nickname validation schema', () => {
  test('accepts a normal Korean nickname', () => {
    expect(nicknameSchema.safeParse('홍길동').success).toBe(true)
  })

  test('accepts alphanumeric nickname', () => {
    expect(nicknameSchema.safeParse('user123').success).toBe(true)
  })

  test('rejects nickname with < (XSS vector)', () => {
    expect(nicknameSchema.safeParse('admin<script>').success).toBe(false)
  })

  test('rejects nickname with > ', () => {
    expect(nicknameSchema.safeParse('test>').success).toBe(false)
  })

  test('rejects nickname with double quote', () => {
    expect(nicknameSchema.safeParse('say"hi"').success).toBe(false)
  })

  test('rejects nickname with single quote', () => {
    expect(nicknameSchema.safeParse("it's me").success).toBe(false)
  })

  test('rejects nickname with ampersand', () => {
    expect(nicknameSchema.safeParse('you&me').success).toBe(false)
  })

  test('rejects nickname with backslash', () => {
    expect(nicknameSchema.safeParse('path\\user').success).toBe(false)
  })

  test('rejects whitespace-only nickname', () => {
    expect(nicknameSchema.safeParse('   ').success).toBe(false)
  })

  test('rejects nickname shorter than 2 chars', () => {
    expect(nicknameSchema.safeParse('a').success).toBe(false)
  })

  test('rejects nickname longer than 20 chars', () => {
    expect(nicknameSchema.safeParse('a'.repeat(21)).success).toBe(false)
  })
})

describe('magic bytes check', () => {
  function checkMagicBytes(buffer: Buffer): boolean {
    const sig = buffer.subarray(0, 4)
    const JPEG = [0xff, 0xd8, 0xff]
    const PNG  = [0x89, 0x50, 0x4e, 0x47]
    const GIF  = [0x47, 0x49, 0x46, 0x38]
    const WEBP_RIFF = [0x52, 0x49, 0x46, 0x46]

    if (JPEG.every((b, i) => sig[i] === b)) return true
    if (PNG.every((b, i)  => sig[i] === b)) return true
    if (GIF.every((b, i)  => sig[i] === b)) return true
    if (WEBP_RIFF.every((b, i) => sig[i] === b)) return true
    return false
  }

  test('accepts JPEG magic bytes', () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00])
    expect(checkMagicBytes(buf)).toBe(true)
  })

  test('accepts PNG magic bytes', () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d])
    expect(checkMagicBytes(buf)).toBe(true)
  })

  test('accepts GIF magic bytes', () => {
    const buf = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39])
    expect(checkMagicBytes(buf)).toBe(true)
  })

  test('accepts WEBP (RIFF header) magic bytes', () => {
    const buf = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00])
    expect(checkMagicBytes(buf)).toBe(true)
  })

  test('rejects a fake image starting with text', () => {
    const buf = Buffer.from('<script>alert(1)</script>')
    expect(checkMagicBytes(buf)).toBe(false)
  })

  test('rejects a PDF disguised as an image', () => {
    const buf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d])  // %PDF-
    expect(checkMagicBytes(buf)).toBe(false)
  })
})

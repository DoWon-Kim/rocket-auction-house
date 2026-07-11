import multer from 'multer'
import path from 'path'

// 허용 MIME + magic bytes (파일 첫 바이트로 실제 형식 확인)
type Sig = { bytes: number[]; offset?: number; extra?: { offset: number; bytes: number[] } }

const ALLOWED_SIGNATURES: Sig[] = [
  { bytes: [0xFF, 0xD8, 0xFF] },                          // JPEG
  { bytes: [0x89, 0x50, 0x4E, 0x47] },                    // PNG
  { bytes: [0x47, 0x49, 0x46] },                          // GIF
  {                                                         // WebP: RIFF at 0 + WEBP at 8
    bytes: [0x52, 0x49, 0x46, 0x46],
    extra: { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
  },
]

export function checkMagicBytes(buffer: Buffer): boolean {
  return ALLOWED_SIGNATURES.some(sig => {
    const offset = sig.offset ?? 0
    const headerMatch = sig.bytes.every((b, i) => buffer[offset + i] === b)
    if (!headerMatch) return false
    if (sig.extra) return sig.extra.bytes.every((b, i) => buffer[sig.extra!.offset + i] === b)
    return true
  })
}

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp'])

function fileFilter(_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  const ext = path.extname(file.originalname).toLowerCase()
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    cb(new Error('JPG, PNG, GIF, WEBP 형식만 업로드 가능합니다.'))
    return
  }
  // mimetype은 클라이언트가 조작 가능 — 기본 타입만 허용
  if (!file.mimetype.startsWith('image/')) {
    cb(new Error('이미지 파일만 업로드 가능합니다.'))
    return
  }
  cb(null, true)
}

// memoryStorage를 사용해 buffer를 받아 magic bytes 검증 후 컨트롤러에서 S3/디스크로 저장
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter,
})

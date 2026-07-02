import multer from 'multer'
import multerS3 from 'multer-s3'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { s3, S3_BUCKET } from '../lib/s3'

// 허용 MIME + magic bytes (파일 첫 바이트로 실제 형식 확인)
const ALLOWED_SIGNATURES: { mime: string; bytes: number[]; offset?: number }[] = [
  { mime: 'image/jpeg', bytes: [0xFF, 0xD8, 0xFF] },
  { mime: 'image/png',  bytes: [0x89, 0x50, 0x4E, 0x47] },
  { mime: 'image/gif',  bytes: [0x47, 0x49, 0x46] },
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 },
]

function checkMagicBytes(buffer: Buffer): boolean {
  return ALLOWED_SIGNATURES.some(sig => {
    const offset = sig.offset ?? 0
    return sig.bytes.every((b, i) => buffer[offset + i] === b)
  })
}

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp'])

function fileFilter(_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  const ext = path.extname(file.originalname).toLowerCase()
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    cb(new Error('JPG, PNG, GIF, WEBP 형식만 업로드 가능합니다.'))
    return
  }
  // mimetype은 클라이언트가 조작 가능 — 기본 타입만 허용 (magic bytes는 upload 후 검사)
  if (!file.mimetype.startsWith('image/')) {
    cb(new Error('이미지 파일만 업로드 가능합니다.'))
    return
  }
  cb(null, true)
}

// S3 설정이 있으면 S3, 없으면 로컬 디스크 (개발 환경)
function makeStorage() {
  if (process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID) {
    return multerS3({
      s3,
      bucket: S3_BUCKET,
      contentType: multerS3.AUTO_CONTENT_TYPE,
      key: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase()
        cb(null, `uploads/${uuidv4()}${ext}`)
      },
    })
  }

  // 개발용 로컬 디스크 fallback
  const diskStorage = multer.diskStorage({
    destination: path.join(process.cwd(), 'uploads'),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase()
      cb(null, `${uuidv4()}${ext}`)
    },
  })
  return diskStorage
}

export const upload = multer({
  storage: makeStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter,
})

// upload 이후 magic bytes 검증 미들웨어 (S3에 올라간 경우 버퍼가 없으므로 로컬만)
export function verifyMagicBytes(req: Express.Request, res: { status: (n: number) => { json: (o: unknown) => void } }, next: () => void) {
  const file = (req as unknown as { file?: Express.Multer.File & { buffer?: Buffer } }).file
  if (!file?.buffer) { next(); return }
  if (!checkMagicBytes(file.buffer)) {
    res.status(400).json({ message: '유효하지 않은 이미지 파일입니다.' })
    return
  }
  next()
}

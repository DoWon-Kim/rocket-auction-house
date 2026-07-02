import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { S3_PUBLIC_URL } from '../lib/s3'

export async function uploadImage(req: AuthRequest, res: Response) {
  if (!req.file) {
    res.status(400).json({ message: '파일이 없습니다.' })
    return
  }

  let url: string

  // S3 업로드된 경우 (multer-s3는 req.file.location에 URL을 저장)
  const s3File = req.file as typeof req.file & { location?: string; key?: string }
  if (s3File.location) {
    // S3_PUBLIC_URL이 설정되어 있으면 CDN URL로 변환 (CloudFront, R2 custom domain 등)
    url = S3_PUBLIC_URL
      ? `${S3_PUBLIC_URL.replace(/\/$/, '')}/${s3File.key}`
      : s3File.location
  } else {
    // 로컬 디스크 (개발 환경)
    const baseUrl = process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 4000}`
    url = `${baseUrl}/uploads/${req.file.filename}`
  }

  res.json({ url })
}

import { Response } from 'express'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import path from 'path'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { AuthRequest } from '../middleware/auth'
import { checkMagicBytes } from '../middleware/upload'
import { s3, S3_BUCKET, S3_PUBLIC_URL } from '../lib/s3'

export async function uploadImage(req: AuthRequest, res: Response) {
  if (!req.file) {
    res.status(400).json({ message: '파일이 없습니다.' })
    return
  }

  // magic bytes 검증 (memoryStorage이므로 buffer가 항상 존재)
  if (!checkMagicBytes(req.file.buffer)) {
    res.status(400).json({ message: '유효하지 않은 이미지 파일입니다.' })
    return
  }

  const ext = path.extname(req.file.originalname).toLowerCase()
  const filename = `${uuidv4()}${ext}`
  const key = `uploads/${filename}`

  let url: string

  if (process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID) {
    // S3 / Cloudflare R2: buffer를 직접 업로드
    await s3.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    }))
    url = S3_PUBLIC_URL
      ? `${S3_PUBLIC_URL.replace(/\/$/, '')}/${key}`
      : `https://${S3_BUCKET}.s3.amazonaws.com/${key}`
  } else {
    // 개발 환경: 로컬 디스크에 buffer 저장
    const uploadsDir = path.join(process.cwd(), 'uploads')
    await fs.promises.mkdir(uploadsDir, { recursive: true })
    await fs.promises.writeFile(path.join(uploadsDir, filename), req.file.buffer)
    const baseUrl = process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 4000}`
    url = `${baseUrl}/uploads/${filename}`
  }

  res.json({ url })
}

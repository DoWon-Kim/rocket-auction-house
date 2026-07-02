import { S3Client } from '@aws-sdk/client-s3'

// AWS S3 또는 Cloudflare R2 (S3-compatible) 모두 지원
// R2 사용 시: S3_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
export const s3 = new S3Client({
  region: process.env.S3_REGION ?? 'auto',
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId:     process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: !!process.env.S3_ENDPOINT, // R2/MinIO 호환
})

export const S3_BUCKET = process.env.S3_BUCKET ?? ''
export const S3_PUBLIC_URL = process.env.S3_PUBLIC_URL ?? ''

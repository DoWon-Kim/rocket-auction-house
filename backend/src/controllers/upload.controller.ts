import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'

export async function uploadImage(req: AuthRequest, res: Response) {
  if (!req.file) {
    res.status(400).json({ message: '파일이 없습니다.' })
    return
  }
  const baseUrl = process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 4000}`
  const url = `${baseUrl}/uploads/${req.file.filename}`
  res.json({ url })
}

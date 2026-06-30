FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# 업로드 파일 저장 디렉토리 (Railway Volume 마운트 경로와 맞출 것)
RUN mkdir -p /app/uploads

COPY --from=deps    /app/node_modules ./node_modules
COPY --from=builder /app/dist         ./dist
COPY --from=builder /app/prisma       ./prisma
COPY package*.json ./

EXPOSE 4000

# 배포 시 마이그레이션 적용 후 서버 시작
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]

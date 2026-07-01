import type { NextConfig } from "next";

// 프로덕션 백엔드 URL에서 호스트명 추출 (Vercel 빌드 시 env 주입됨)
// 예: https://api.my-app.up.railway.app/api → api.my-app.up.railway.app
function getApiHostname(): string | null {
  const url = process.env.NEXT_PUBLIC_API_URL
  if (!url || url.includes('localhost')) return null
  try { return new URL(url).hostname } catch { return null }
}

const apiHostname = getApiHostname()
const isDev = process.env.NODE_ENV !== 'production'

const nextConfig: NextConfig = {
  productionBrowserSourceMaps: false,
  images: {
    ...(isDev && { dangerouslyAllowLocalIP: true }),
    remotePatterns: [
      // 개발: 로컬 백엔드 업로드
      ...(isDev
        ? [{ protocol: 'http' as const, hostname: 'localhost', port: '4000', pathname: '/uploads/**' }]
        : []),
      // 프로덕션: 실제 백엔드 도메인 업로드 (NEXT_PUBLIC_API_URL 기반 자동 추출)
      ...(apiHostname
        ? [{ protocol: 'https' as const, hostname: apiHostname, pathname: '/uploads/**' }]
        : []),
      // 포켓몬 TCG API
      { protocol: 'https', hostname: 'images.pokemontcg.io' },
      // 유희왕 YGOProDeck
      { protocol: 'https', hostname: 'images.ygoprodeck.com' },
      // MTG Scryfall
      { protocol: 'https', hostname: 'cards.scryfall.io' },
      { protocol: 'https', hostname: 'c2.scryfall.com' },
      { protocol: 'https', hostname: '**.scryfall.com' },
      // TCGdex / Scrydex
      { protocol: 'https', hostname: 'images.scrydex.com' },
      // 디지몬
      { protocol: 'https', hostname: 'images.digimoncard.io' },
      { protocol: 'https', hostname: 'digimon-card.com' },
      // TCGdex 한국어/일본어 포켓몬
      { protocol: 'https', hostname: 'assets.tcgdex.net' },
      // 포켓몬 카드게임 공식 (일본판)
      { protocol: 'https', hostname: 'www.pokemon-card.com' },
      // Google 이미지 (썸네일 등 외부 임포트 데이터)
      { protocol: 'https', hostname: '**.gstatic.com' },
      { protocol: 'https', hostname: '**.googleusercontent.com' },
      // 기타 범용 CDN
      { protocol: 'https', hostname: '**.cloudinary.com' },
      { protocol: 'https', hostname: 'i.imgur.com' },
    ],
  },
};

export default nextConfig;

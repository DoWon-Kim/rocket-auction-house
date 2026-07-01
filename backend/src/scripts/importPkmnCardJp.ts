/**
 * pokemon-card.com 일본판 카드 DB 임포트
 *
 * 사전 준비: fetchAllJpCards.js 로 JSON 파일 수집 필요
 * 실행: npx ts-node src/scripts/importPkmnCardJp.ts
 */

import 'dotenv/config'
import * as fs from 'fs'
import { prisma } from '../lib/prisma'

const JSON_FILE = 'C:\\Users\\dowon\\AppData\\Local\\Temp\\pkmncard_ja_all.json'
const BASE_URL  = 'https://www.pokemon-card.com'

// 알려진 세트 이름 매핑 (주요 세트)
const SET_NAMES: Record<string, string> = {
  // SV era
  SV:    'スカーレット＆バイオレット',
  SV1V:  'バイオレットex',
  SV1S:  'スカーレットex',
  SV2:   '強化拡張パック 151',
  SV2P:  'ステラミラクル',
  SV2a:  'ポケモンカード151',
  SV3:   'レイジングサーフ',
  SV3a:  'シャイニートレジャーex',
  SV4:   'ワイルドフォース',
  SV4K:  'サイバージャッジ',
  SV4M:  'ナイトワンダラー',
  SV4a:  'テラスタルフェスex',
  SV5:   'ステラミラクル',
  SV5K:  'クリムゾンヘイズ',
  SV5M:  'ロストアビス',
  SV5a:  'スーパーエレクトリックブレーカー',
  SV6:   'マスターボール',
  SV6a:  '変幻の仮面',
  SV7:   '楽園ドラゴーナ',
  SV7a:  '熱風のアリーナ',
  SV8:   'ステラクラウン',
  SV8a:  'バトルパートナーズ',
  SV9:   '超電ブレイカー',
  SV9a:  'イベルタルex',
  SV10:  'ナイトワンダラー',
  SV11W: 'ブレイブドラゴーナ',
  // SWSH era
  S1H:   'シールド',
  S1W:   'ソード',
  S2:    '反逆クラッシュ',
  S2a:   '爆炎ウォーカー',
  S3:    '摩天パーフェクト',
  S3a:   '蒼空ストリーム',
  S4:    '漆黒のガイスト',
  S4a:   '白銀のランス',
  S5I:   'ふしぎなしずく',
  S5R:   'はじまりのワルツ',
  S6:    'フュージョンアーツ',
  S6a:   '25周年記念',
  S7:    'スペースジャグラー',
  S7D:   '蒼空ストリーム',
  S7R:   '摩天パーフェクト',
  S8:    'VSTARユニバース',
  S8a:   'LOST ABYSS',
  S8b:   'ポケモンGO',
  S9:    'ダークファンタズマ',
  S9a:   'バトルリージョン',
  S10:   'タイムゲイザー',
  S10D:  'スペースジャグラー',
  S10P:  'パラダイムトリガー',
  S11:   'パラダイムトリガー',
  S12:   'VSTARユニバース',
  // SM era
  SM1:   'コレクション サン',
  SM1M:  'コレクション ムーン',
  SM1S:  'コレクション サン',
  SM2:   'アローラの輝き',
  SM2L:  'アローラの輝き',
  SM2p:  'アローラの輝き',
  SM3:   '燃えあがるシャドー',
  SM3H:  '未来を守る者',
  SM3N:  '立ちはだかる強敵',
  SM4:   '超次元の暴獄',
  SM4A:  '超次元の暴獄',
  SM4S:  '超次元の暴獄',
  SM5:   '禁断の光',
  SM5M:  'ウルトラフォース',
  SM5S:  '禁断の光',
  SM6:   '電磁レーダー',
  SM6A:  'ドラゴンストーム',
  SM7:   'ウルトラシャイニー',
  SM7A:  'フェアリーライズ',
  SM8:   'ダークオーダー',
  SM8A:  'ダークオーダー',
  SM8B:  'ダークオーダー',
  SM9:   'タッグボルト',
  SM9A:  'ミラクルツイン',
  SM10:  'ミラクルツイン',
  SM10A: 'ミラクルツイン',
  SM11:  'ドリームリーグ',
  SM11A: 'アルティメットメガシャイニー',
  SM12:  'コスモッグ',
  SM12A: 'ハイクラスパック TAG TEAM GX',
  SMA:   'リミックスバウト',
  SMH:   '妖怪ガールズ',
  SMF:   '夢の島',
  // DP/Pt era
  DP1:   'ポケモンカードゲームDP エントリーパック',
  DP2:   '時の果ての戦い',
  DP3:   '星空の戦士',
  DP4:   '秘境の叫び',
  DP5:   '異次元の呼び声',
  DP6:   '混沌の嵐',
  DPt1:  '時空の覇者',
  DPt1B: '時空の覇者',
  DPt2:  'ギンガの覇者',
  DPt2B: 'ギンガの覇者',
  DPt3:  'アルセウス 光臨',
  DPt3B: 'アルセウス 光臨',
  // Other
  ENE:   'エネルギー',
  M5:    '強化拡張パック',
  PMCG1: '拡張パック',
  PMCG2: 'ポケモンジャングル',
  PMCG3: '化石の秘密',
  PMCG4: 'ロケット団',
}

function log(msg: string) {
  process.stdout.write(`[${new Date().toISOString().slice(11,19)}] ${msg}\n`)
}

function stripHtml(text: string | null | undefined): string | null {
  if (!text) return null
  return text.replace(/<[^>]+>/g, '').trim() || null
}

interface PkmnCard {
  cardID: string
  cardThumbFile: string
  cardNameViewText: string
  cardNameAltText?: string
}

function parseCard(raw: PkmnCard) {
  if (!raw.cardID || !raw.cardNameViewText) return null

  // 이미지 경로에서 세트 코드 추출: /assets/.../large/{SET_CODE}/{CARD_ID}_...
  const imgMatch = raw.cardThumbFile?.match(/\/large\/([^/]+)\//)
  const setCode = imgMatch?.[1] ?? 'UNKNOWN'

  // 카드 ID에서 카드 번호 추출 (0 패딩 제거)
  const cardNum = String(parseInt(raw.cardID, 10))

  const setName = SET_NAMES[setCode] ?? setCode

  const imageUrl = raw.cardThumbFile
    ? `${BASE_URL}${raw.cardThumbFile}`
    : null

  const cleanName = stripHtml(raw.cardNameViewText) ?? raw.cardNameViewText

  return {
    externalId:  `pkmncardgame_ja_${raw.cardID}`,
    name:        cleanName,
    nameJa:      cleanName,
    tcgType:     'POKEMON' as const,
    setCode,
    setName,
    cardNumber:  cardNum,
    rarity:      'Unknown',
    imageUrl,
  }
}

async function main() {
  if (!fs.existsSync(JSON_FILE)) {
    log(`ERROR: JSON 파일이 없습니다: ${JSON_FILE}`)
    log('fetchAllJpCards.js 를 먼저 실행해주세요.')
    process.exit(1)
  }

  const raw: PkmnCard[] = JSON.parse(fs.readFileSync(JSON_FILE, 'utf-8'))
  log(`JSON 파일 로드: ${raw.length}장`)

  // 중복 제거 (같은 cardID)
  const seen = new Set<string>()
  const unique = raw.filter(c => {
    if (!c.cardID || seen.has(c.cardID)) return false
    seen.add(c.cardID)
    return true
  })
  log(`중복 제거 후: ${unique.length}장`)

  // 이미 DB에 있는 pkmncardgame_ja_ 레코드 확인
  const existingCount = await prisma.card.count({
    where: { externalId: { startsWith: 'pkmncardgame_ja_' } }
  })
  log(`기존 DB pkmncardgame_ja_ 레코드: ${existingCount}장`)

  let created = 0, updated = 0, skipped = 0, errors = 0

  const CHUNK = 50
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK)
    const parsed = chunk.map(parseCard).filter(Boolean) as Exclude<ReturnType<typeof parseCard>, null>[]

    const results = await Promise.allSettled(
      parsed.map(card =>
        prisma.card.upsert({
          where:  { externalId: card.externalId },
          create: card,
          update: {
            name:     card.name,
            nameJa:   card.nameJa,
            setCode:  card.setCode,
            setName:  card.setName,
            imageUrl: card.imageUrl,
          },
        })
      )
    )

    for (const r of results) {
      if (r.status === 'fulfilled') created++
      else { errors++; if (errors <= 5) log(`Error: ${r.reason}`) }
    }

    if ((i / CHUNK) % 10 === 0) {
      log(`[${i+CHUNK}/${unique.length}] 처리 중... 성공: ${created}, 오류: ${errors}`)
    }
  }

  log(`\n✅ 완료 — 처리: ${created}, 오류: ${errors}`)

  // 최종 통계
  const jaTotal = await prisma.card.count({ where: { tcgType: 'POKEMON', nameJa: { not: null } } })
  const pkmnJa  = await prisma.card.count({ where: { externalId: { startsWith: 'pkmncardgame_ja_' } } })
  const tcgdexJa = await prisma.card.count({ where: { externalId: { startsWith: 'tcgdex_ja_' } } })
  log(`DB 현황: pkmncardgame_ja_ ${pkmnJa}장 | tcgdex_ja_ ${tcgdexJa}장 | nameJa 있음 ${jaTotal}장`)
}

main().catch(console.error).finally(() => prisma.$disconnect())

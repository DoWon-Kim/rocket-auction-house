import 'dotenv/config'

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
  'Referer': 'https://www.pokemon-card.com/',
}

async function main() {
  const searchUrl = 'https://www.pokemon-card.com/card-search/index.php/?keyword=&se[]=sv6a&pg=1'
  const res = await fetch(searchUrl, { headers: HEADERS })
  console.log('Status:', res.status, res.headers.get('content-type'))
  const html = await res.text()
  // 처음 5000자와 마지막 1000자 출력
  console.log('\n--- HEAD ---')
  console.log(html.slice(0, 5000))
  console.log('\n--- TAIL ---')
  console.log(html.slice(-1000))

  // API 엔드포인트 탐색
  console.log('\n=== API/AJAX 호출 패턴 ===')
  const apiMatches = [...html.matchAll(/(api|ajax|fetch|\.php\?|\.json)[^"']{0,100}/gi)]
  apiMatches.slice(0, 20).forEach(m => console.log(' ', m[0]))
}

main().catch(console.error)

import { parsePokehitList, classify, cleanName, suggestPrice, assertPokehitUrl } from '../lib/pokehitImport'

// 실제 페이지 구조를 흉내 낸 최소 HTML (imweb 상품 목록 위젯)
const item = (idx: number, name: string, price: number, original = price, soldOut = false) =>
  `<div class="shop-item _shop_item" data-product-properties='{&quot;idx&quot;:${idx},&quot;code&quot;:&quot;s1&quot;,&quot;name&quot;:&quot;${name}&quot;,&quot;original_price&quot;:${original},&quot;price&quot;:${price},&quot;image_url&quot;:&quot;https://cdn/x.png&quot;}'>
    <div class="item-wrap"><a href="/17/?idx=${idx}"><img src="https://cdn/x.png" /></a>
    <div class="ns-icon clearfix">${soldOut ? "<div class='prod_icon sold_out'>SOLDOUT</div>" : "<div class='prod_icon timesale' style='display: none'>TIME SALE</div>"}</div></div></div>`
const html = `<style>.shop-item .ns-icon .prod_icon.sold_out{}</style>` + [
  item(79, '(일판) 어비스 아이 메가 확장팩 박스', 109000),
  item(107, '(북미판) 스칼렛 &amp; 바이올렛 강화 확장팩 포켓몬카드 151 번들', 390000, 420000),
  item(188, '(북미판) Journey Together 부스터 1팩', 16500),
  item(218, '로스트어비스 일판 1박스 [팩 브레이크 30구] 모집 완료 후 개봉', 20000),
  item(197, '남자의 대결 **5픽** | 모집 완료 후 개봉', 0),
  item(172, '(일판) 소드&amp;실드 25주년 골든 박스', 3080000, 3080000, true),
  item(79, '(일판) 어비스 아이 메가 확장팩 박스', 109000), // 다른 위젯에 중복 노출
].join('\n')

describe('포케히트 목록 읽기', () => {
  const items = parsePokehitList(html, 'https://pokehit.co.kr/17')
  it('중복·가격 0 상품 제외', () => {
    expect(items.map(i => i.sourceId)).toEqual(['79', '107', '188', '218', '172'])
  })
  it('이름·가격·정가·주소', () => {
    const bundle = items.find(i => i.sourceId === '107')!
    expect(bundle.name).toBe('(북미판) 스칼렛 & 바이올렛 강화 확장팩 포켓몬카드 151 번들')
    expect(bundle.price).toBe(390000)
    expect(bundle.originalPrice).toBe(420000)
    expect(bundle.url).toBe('https://pokehit.co.kr/17/?idx=107')
  })
  it('품절 표시는 상품 블록 안의 아이콘으로만 판단 (스타일 시트 무시)', () => {
    expect(items.find(i => i.sourceId === '172')!.soldOut).toBe(true)
    expect(items.find(i => i.sourceId === '79')!.soldOut).toBe(false)
  })
})

describe('상품 종류 추정', () => {
  it('박스·번들·1팩·특별판', () => {
    expect(classify('(일판) 메가 확장팩 인페르노 X 박스').category).toBe('BOOSTER_BOX')
    expect(classify('(북미판) Journey Together 부스터 번들').category).toBe('GIFT_SET')
    expect(classify('(일판) 하이 클래스팩 샤이니 트레저 ex 1팩').category).toBe('SINGLE_PACK')
    expect(classify('(일판) 소드&실드 25주년 골든 박스').category).toBe('SPECIAL')
    expect(classify('(인도네시아) KFC 프로모 카드팩').category).toBe('SPECIAL')
  })
  it('팩 브레이크·픽 모집은 별도 표시', () => {
    expect(classify('151 일판 1박스 [팩 브레이크 2구] 모집 완료 후 개봉').isBreak).toBe(true)
    expect(classify('VSTAR 2픽 | 모집 완료 후 개봉').isBreak).toBe(true)
    expect(classify('(일판) 어비스 아이 메가 확장팩 박스').isBreak).toBe(false)
  })
  it('TCG 종류', () => {
    expect(classify('원피스 카드게임 OP-10 부스터 박스').tcgType).toBe('ONEPIECE')
    expect(classify('(일판) 어비스 아이 메가 확장팩 박스').tcgType).toBe('POKEMON')
  })
})

describe('기타', () => {
  it('상품명 강조 기호 제거', () => expect(cleanName('**(북미판) 퓨전 스트라이크**｜ 36구')).toBe('(북미판) 퓨전 스트라이크｜ 36구'))
  it('판매가 제안은 100P 단위', () => expect(suggestPrice(149750)).toBe(149800))
  it('포케히트 주소만 허용', () => {
    expect(assertPokehitUrl('https://pokehit.co.kr/17').hostname).toBe('pokehit.co.kr')
    expect(() => assertPokehitUrl('https://evil.com/17')).toThrow()
    expect(() => assertPokehitUrl('http://pokehit.co.kr/17')).toThrow()
  })
})

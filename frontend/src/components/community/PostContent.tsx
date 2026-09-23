import { IMAGE_LINE } from '@/lib/community'

// 본문 렌더러.
// - HTML: 서버가 저장 시 허용 목록으로 sanitize한 결과만 들어오므로 그대로 렌더
// - TEXT(구형): HTML을 해석하지 않고 텍스트 + 이미지 줄만 변환
export function PostContent({ content, format = 'TEXT' }: { content: string; format?: 'TEXT' | 'HTML' }) {
  if (format === 'HTML') {
    return <div className="post-html" dangerouslySetInnerHTML={{ __html: content }} />
  }

  const blocks: { type: 'text' | 'image'; value: string }[] = []
  for (const line of content.split('\n')) {
    const m = line.trim().match(IMAGE_LINE)
    if (m) { blocks.push({ type: 'image', value: m[1] }); continue }
    const last = blocks[blocks.length - 1]
    if (last?.type === 'text') last.value += '\n' + line
    else blocks.push({ type: 'text', value: line })
  }

  return (
    <div className="space-y-4 text-[15px] leading-[1.8] text-fg-2">
      {blocks.map((b, i) =>
        b.type === 'image' ? (
          // eslint-disable-next-line @next/next/no-img-element -- 업로드/외부 이미지 호스트가 다양해 next/image 대신 사용
          <img key={i} src={b.value} alt="" loading="lazy"
            className="max-w-full max-h-[720px] rounded-2xl border border-line mx-auto" />
        ) : b.value.trim() ? (
          <p key={i} className="whitespace-pre-wrap break-words">{b.value.replace(/^\n+|\n+$/g, '')}</p>
        ) : null
      )}
    </div>
  )
}

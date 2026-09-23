'use client'

import { useEffect, useRef, useState } from 'react'
import { useEditor, useEditorState, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { TextStyle, Color } from '@tiptap/extension-text-style'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import Image from '@tiptap/extension-image'
import { Placeholder, CharacterCount } from '@tiptap/extensions'
import {
  Bold, Italic, Underline, Strikethrough, Heading2, Heading3, List, ListOrdered, Quote, Minus,
  AlignLeft, AlignCenter, AlignRight, Link2, ImagePlus, Undo2, Redo2, Palette, Highlighter, Loader2,
} from 'lucide-react'
import { api } from '@/lib/api'

const MAX_CHARS = 20000
export const MAX_IMAGES = 20

const TEXT_COLORS = ['#f4f4f8', '#f87171', '#fb923c', '#facc15', '#4ade80', '#22d3ee', '#60a5fa', '#a78bfa', '#f472b6', '#9ca3af']
const HIGHLIGHTS = ['#fde68a', '#bbf7d0', '#bae6fd', '#ddd6fe', '#fbcfe8']

export function RichEditor({ initialHtml, onChange, onError }: {
  initialHtml: string
  onChange: (html: string) => void
  onError: (msg: string) => void
}) {
  const [uploading, setUploading] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  // useEditor 옵션의 핸들러는 첫 렌더에 고정되므로 최신 값은 ref로 참조
  const editorRef = useRef<Editor | null>(null)
  const cbRef = useRef({ onChange, onError })
  useEffect(() => { cbRef.current = { onChange, onError } }, [onChange, onError])

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        code: false,
        codeBlock: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https', protocols: ['http', 'https'] },
      }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Image.configure({ inline: false, allowBase64: false }),
      Placeholder.configure({ placeholder: '내용을 입력하세요. 사진은 툴바의 사진 버튼, 끌어다 놓기, 붙여넣기로 넣을 수 있어요.' }),
      CharacterCount.configure({ limit: MAX_CHARS }),
    ],
    content: initialHtml,
    editorProps: {
      attributes: { class: 'post-html rich-editor min-h-[420px] px-5 py-4 focus:outline-none' },
      handleDrop: (_view, event) => {
        const files = Array.from(event.dataTransfer?.files ?? []).filter(f => f.type.startsWith('image/'))
        if (!files.length) return false
        event.preventDefault()
        uploadFiles(files)
        return true
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []).filter(f => f.type.startsWith('image/'))
        if (!files.length) return false
        event.preventDefault()
        uploadFiles(files)
        return true
      },
    },
    onUpdate: ({ editor }) => cbRef.current.onChange(editor.getHTML()),
  })
  useEffect(() => { editorRef.current = editor }, [editor])

  async function uploadFiles(files: File[]) {
    const editor = editorRef.current
    const { onError } = cbRef.current
    if (!editor) return
    const current = editor.getJSON().content?.filter(n => n.type === 'image').length ?? 0
    const room = MAX_IMAGES - current
    if (files.length > room) onError(`이미지는 최대 ${MAX_IMAGES}장까지 첨부할 수 있습니다.`)
    for (const file of files.slice(0, Math.max(0, room))) {
      setUploading(n => n + 1)
      try {
        const fd = new FormData()
        fd.append('file', file)
        const { data } = await api.post('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
        editor.chain().focus().setImage({ src: data.url }).run()
      } catch {
        onError('이미지 업로드에 실패했습니다. (JPG·PNG·GIF·WEBP, 최대 20MB)')
      } finally {
        setUploading(n => n - 1)
      }
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-sunken/70 focus-within:border-accent/60 focus-within:ring-4 focus-within:ring-accent/15 transition-all overflow-hidden">
      {editor && <Toolbar editor={editor} uploading={uploading} onPickImage={() => fileRef.current?.click()} />}
      <input ref={fileRef} type="file" accept="image/*" multiple className="sr-only"
        onChange={e => { uploadFiles(Array.from(e.target.files ?? [])); e.target.value = '' }} />
      <EditorContent editor={editor} />
      {editor && <CharCounter editor={editor} />}
    </div>
  )
}

function Toolbar({ editor, uploading, onPickImage }: { editor: Editor; uploading: number; onPickImage: () => void }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'), italic: e.isActive('italic'), underline: e.isActive('underline'), strike: e.isActive('strike'),
      h2: e.isActive('heading', { level: 2 }), h3: e.isActive('heading', { level: 3 }),
      bullet: e.isActive('bulletList'), ordered: e.isActive('orderedList'), quote: e.isActive('blockquote'),
      left: e.isActive({ textAlign: 'left' }), center: e.isActive({ textAlign: 'center' }), right: e.isActive({ textAlign: 'right' }),
      link: e.isActive('link'), color: e.getAttributes('textStyle').color as string | undefined,
      canUndo: e.can().undo(), canRedo: e.can().redo(),
    }),
  })
  const [panel, setPanel] = useState<'color' | 'highlight' | null>(null)
  const chain = () => editor.chain().focus()

  function setLink() {
    const prev = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('링크 주소 (https://...)', prev ?? 'https://')
    if (url === null) return
    if (!url || url === 'https://') { chain().unsetLink().run(); return }
    if (!/^https?:\/\//i.test(url)) return
    chain().extendMarkRange('link').setLink({ href: url }).run()
  }

  return (
    <div className="relative border-b border-line">
      <div className="flex items-center gap-0.5 px-2 py-1.5 overflow-x-auto">
        <Btn label="굵게 (Ctrl+B)" active={s.bold} onClick={() => chain().toggleBold().run()}><Bold size={15} /></Btn>
        <Btn label="기울임 (Ctrl+I)" active={s.italic} onClick={() => chain().toggleItalic().run()}><Italic size={15} /></Btn>
        <Btn label="밑줄 (Ctrl+U)" active={s.underline} onClick={() => chain().toggleUnderline().run()}><Underline size={15} /></Btn>
        <Btn label="취소선" active={s.strike} onClick={() => chain().toggleStrike().run()}><Strikethrough size={15} /></Btn>
        <Btn label="글자색" active={panel === 'color'} onClick={() => setPanel(p => p === 'color' ? null : 'color')}>
          <Palette size={15} style={s.color ? { color: s.color } : undefined} />
        </Btn>
        <Btn label="형광펜" active={panel === 'highlight'} onClick={() => setPanel(p => p === 'highlight' ? null : 'highlight')}><Highlighter size={15} /></Btn>
        <Sep />
        <Btn label="큰 제목" active={s.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}><Heading2 size={15} /></Btn>
        <Btn label="작은 제목" active={s.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()}><Heading3 size={15} /></Btn>
        <Btn label="글머리 목록" active={s.bullet} onClick={() => chain().toggleBulletList().run()}><List size={15} /></Btn>
        <Btn label="번호 목록" active={s.ordered} onClick={() => chain().toggleOrderedList().run()}><ListOrdered size={15} /></Btn>
        <Btn label="인용" active={s.quote} onClick={() => chain().toggleBlockquote().run()}><Quote size={15} /></Btn>
        <Btn label="구분선" onClick={() => chain().setHorizontalRule().run()}><Minus size={15} /></Btn>
        <Sep />
        <Btn label="왼쪽 정렬" active={s.left} onClick={() => chain().setTextAlign('left').run()}><AlignLeft size={15} /></Btn>
        <Btn label="가운데 정렬" active={s.center} onClick={() => chain().setTextAlign('center').run()}><AlignCenter size={15} /></Btn>
        <Btn label="오른쪽 정렬" active={s.right} onClick={() => chain().setTextAlign('right').run()}><AlignRight size={15} /></Btn>
        <Sep />
        <Btn label="링크" active={s.link} onClick={setLink}><Link2 size={15} /></Btn>
        <button type="button" onClick={onPickImage} title="사진 넣기"
          className="shrink-0 h-8 px-2.5 ml-0.5 inline-flex items-center gap-1.5 rounded-lg text-xs text-fg-2 hover:bg-white/[0.06] transition-colors">
          {uploading > 0 ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />} 사진
        </button>
        <Sep />
        <Btn label="실행 취소 (Ctrl+Z)" disabled={!s.canUndo} onClick={() => chain().undo().run()}><Undo2 size={15} /></Btn>
        <Btn label="다시 실행 (Ctrl+Shift+Z)" disabled={!s.canRedo} onClick={() => chain().redo().run()}><Redo2 size={15} /></Btn>
      </div>

      {panel && (
        <div className="absolute left-2 top-full mt-1 z-20 glass border border-white/10 rounded-2xl p-2 flex items-center gap-1.5 shadow-2xl">
          {(panel === 'color' ? TEXT_COLORS : HIGHLIGHTS).map(c => (
            <button key={c} type="button" aria-label={c} title={c}
              onClick={() => {
                if (panel === 'color') chain().setColor(c).run()
                else chain().toggleHighlight({ color: c }).run()
                setPanel(null)
              }}
              className="w-6 h-6 rounded-full ring-1 ring-white/20 hover:scale-110 transition-transform" style={{ background: c }} />
          ))}
          <button type="button" onClick={() => {
            if (panel === 'color') chain().unsetColor().run()
            else chain().unsetHighlight().run()
            setPanel(null)
          }}
            className="h-6 px-2 rounded-full text-[11px] text-muted hover:text-fg border border-line">없음</button>
        </div>
      )}
    </div>
  )
}

function Btn({ label, active, disabled, onClick, children }: {
  label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button type="button" title={label} aria-label={label} aria-pressed={active} disabled={disabled}
      onMouseDown={e => e.preventDefault()} onClick={onClick}
      className={`shrink-0 w-8 h-8 inline-flex items-center justify-center rounded-lg transition-colors disabled:opacity-30 ${
        active ? 'bg-white/[0.1] text-fg' : 'text-muted hover:text-fg hover:bg-white/[0.05]'
      }`}>
      {children}
    </button>
  )
}

function CharCounter({ editor }: { editor: Editor }) {
  const chars = useEditorState({ editor, selector: ({ editor: e }) => e.storage.characterCount.characters() as number })
  return (
    <div className="flex justify-end px-4 py-2 border-t border-line text-[11px] text-subtle tabular-nums">
      {chars.toLocaleString()} / {MAX_CHARS.toLocaleString()}자
    </div>
  )
}

const Sep = () => <span className="shrink-0 w-px h-5 bg-line mx-1" />

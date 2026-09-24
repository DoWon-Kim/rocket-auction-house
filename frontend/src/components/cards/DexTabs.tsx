import Link from 'next/link'

// 카드 도감 상단 탭: 카드 | 세트 도감 | 포켓몬 도감
const TABS = [
  { key: 'cards', href: '/cards', label: '카드' },
  { key: 'sets', href: '/sets', label: '세트 도감' },
  { key: 'pokedex', href: '/pokedex', label: '포켓몬 도감' },
] as const

export function DexTabs({ active }: { active: (typeof TABS)[number]['key'] }) {
  return (
    <div className="flex gap-1 rounded-xl bg-surface border border-line p-1 text-sm">
      {TABS.map(t => t.key === active
        ? <span key={t.key} className="h-8 px-3 inline-flex items-center rounded-lg bg-surface-2 text-fg font-semibold">{t.label}</span>
        : <Link key={t.key} href={t.href} className="h-8 px-3 inline-flex items-center rounded-lg text-muted hover:text-fg">{t.label}</Link>)}
    </div>
  )
}

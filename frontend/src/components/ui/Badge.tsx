import { cn } from '@/lib/utils'

const variants = {
  default: 'bg-[#221a12] text-[#9e8060] border border-[#3a2510]',
  indigo:  'bg-[#2a1c08] text-[#e0b878] border border-[#3d2a0c]',
  green:   'bg-[#0d2820] text-[#4ade80] border border-[#1a4030]',
  yellow:  'bg-[#2a1f08] text-[#f0a832] border border-[#3d2e0c]',
  red:     'bg-[#2a0e0e] text-[#f87171] border border-[#3d1616]',
  orange:  'bg-[#2a1808] text-[#fb923c] border border-[#3d2510]',
}

interface BadgeProps {
  children: React.ReactNode
  variant?: keyof typeof variants
  className?: string
}

export default function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold tracking-wide',
      variants[variant],
      className
    )}>
      {children}
    </span>
  )
}

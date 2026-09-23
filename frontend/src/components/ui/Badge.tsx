import { cn } from '@/lib/utils'

const variants = {
  default: 'bg-white/[0.04] text-fg-3 border border-line-strong',
  indigo:  'bg-violet-500/10 text-violet-200 border border-violet-400/25',
  green:   'bg-emerald-500/10 text-emerald-300 border border-emerald-400/25',
  yellow:  'bg-cyan-400/10 text-cyan-200 border border-cyan-300/25',
  red:     'bg-rose-500/10 text-rose-300 border border-rose-400/25',
  orange:  'bg-orange-500/10 text-orange-300 border border-orange-400/25',
}

interface BadgeProps {
  children: React.ReactNode
  variant?: keyof typeof variants
  className?: string
}

export default function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 h-7 px-3 rounded-full text-xs font-semibold',
      variants[variant],
      className
    )}>
      {children}
    </span>
  )
}

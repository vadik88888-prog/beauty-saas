'use client'
import { Clock, Heart, Lock, Shield } from 'lucide-react'
import { type LucideIcon } from 'lucide-react'

type TrustItem = {
  icon: LucideIcon
  title: string
}

const DEFAULT_ITEMS: TrustItem[] = [
  { icon: Shield, title: 'Гарантия' },
  { icon: Clock, title: 'Быстрая запись' },
  { icon: Heart, title: 'Забота' },
  { icon: Lock, title: 'Данные' },
]

type TrustStripProps = {
  items?: TrustItem[]
  className?: string
}

/**
 * Compact footer trust strip — always 4-in-a-row, small vertical cells
 * (icon on top, label below). Lives at the bottom of booking pages.
 */
export function TrustStrip({ items = DEFAULT_ITEMS, className = '' }: TrustStripProps) {
  return (
    <div
      className={`grid grid-cols-4 gap-1 rounded-2xl bg-cream border border-line-soft px-1.5 py-2.5 ${className}`}
    >
      {items.map((item) => {
        const Icon = item.icon
        return (
          <div
            key={item.title}
            className="flex flex-col items-center justify-start gap-1 min-w-0 text-center px-0.5"
          >
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-sage-tint text-sage">
              <Icon className="w-3 h-3" strokeWidth={1.8} />
            </span>
            <span className="text-[9px] font-medium text-ink-2 leading-[1.15] line-clamp-2 w-full">
              {item.title}
            </span>
          </div>
        )
      })}
    </div>
  )
}

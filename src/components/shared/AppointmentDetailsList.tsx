'use client'
import { type LucideIcon } from 'lucide-react'
import { type ReactNode } from 'react'

export type DetailRow = {
  id: string
  icon: LucideIcon
  label: string
  value: ReactNode
  /** When true, value is rendered bold + larger (e.g. price total) */
  emphasis?: boolean
}

type AppointmentDetailsListProps = {
  rows: DetailRow[]
  /** Optional caption shown under the emphasized row (e.g. «Оплата в салоне») */
  footnote?: ReactNode
  className?: string
}

/**
 * Cream card with rows of (icon, label, value) — booking summary on
 * confirm/success screens.
 */
export function AppointmentDetailsList({
  rows,
  footnote,
  className = '',
}: AppointmentDetailsListProps) {
  return (
    <div
      className={`bg-cream border border-line rounded-2xl divide-y divide-line-soft ${className}`}
    >
      {rows.map(row => {
        const Icon = row.icon
        return (
          <div
            key={row.id}
            className="flex items-center gap-3 px-4 py-3"
          >
            <span className="flex-shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-lg bg-sage-tint text-sage">
              <Icon className="w-3.5 h-3.5" strokeWidth={1.8} />
            </span>
            <span className="text-[12px] text-muted-foreground flex-1 min-w-0">
              {row.label}
            </span>
            <span
              className={`text-right ${
                row.emphasis
                  ? 'text-[16px] font-semibold text-ink'
                  : 'text-[13px] font-medium text-ink'
              }`}
            >
              {row.value}
            </span>
          </div>
        )
      })}
      {footnote && (
        <div className="px-4 py-2">
          <p className="text-[11px] text-muted-2 text-right">{footnote}</p>
        </div>
      )}
    </div>
  )
}

'use client'
import { type ReactNode } from 'react'

type ChipProps = {
  selected?: boolean
  onClick?: () => void
  children: ReactNode
  className?: string
}

export function Chip({
  selected = false,
  onClick,
  children,
  className = '',
}: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm transition-colors border ${
        selected
          ? 'bg-ink text-page border-ink'
          : 'bg-cream text-ink-2 border-line hover:bg-cream-2'
      } ${className}`}
    >
      {children}
    </button>
  )
}

type ChipItem = {
  id: string
  label: ReactNode
}

type ChipRowProps = {
  items: ChipItem[]
  selectedId?: string | null
  onSelect: (id: string) => void
  className?: string
  /** Use horizontal scroll instead of wrap */
  scroll?: boolean
}

export function ChipRow({
  items,
  selectedId,
  onSelect,
  className = '',
  scroll = true,
}: ChipRowProps) {
  return (
    <div
      className={`${
        scroll
          ? 'flex gap-2 overflow-x-auto scrollbar-hide'
          : 'flex flex-wrap gap-2'
      } ${className}`}
    >
      {items.map((item) => (
        <Chip
          key={item.id}
          selected={item.id === selectedId}
          onClick={() => onSelect(item.id)}
        >
          {item.label}
        </Chip>
      ))}
    </div>
  )
}

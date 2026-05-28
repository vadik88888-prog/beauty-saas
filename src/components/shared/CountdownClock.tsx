'use client'
import { useEffect, useState } from 'react'

type CountdownClockProps = {
  targetDate: string | Date
  className?: string
  /** Show "Уже прошло" instead of negative values */
  collapseAfter?: boolean
}

function formatDelta(ms: number): string {
  const totalMin = Math.round(ms / 60000)
  if (totalMin < 60) return `через ${totalMin} мин`
  const totalHours = Math.round(totalMin / 60)
  if (totalHours < 48) return `через ${totalHours} ч`
  const days = Math.round(totalHours / 24)
  return `через ${days} ${days === 1 ? 'день' : days < 5 ? 'дня' : 'дней'}`
}

export function CountdownClock({
  targetDate,
  className = '',
  collapseAfter = true,
}: CountdownClockProps) {
  const target =
    typeof targetDate === 'string'
      ? new Date(targetDate).getTime()
      : targetDate.getTime()

  const [now, setNow] = useState<number>(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  const delta = target - now

  if (delta <= 0) {
    if (collapseAfter) return null
    return <span className={`text-xs text-muted-2 ${className}`}>уже прошло</span>
  }

  return (
    <span className={`text-xs font-medium text-sage ${className}`}>
      {formatDelta(delta)}
    </span>
  )
}

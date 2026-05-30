'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const RU_MONTHS = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря']
const RU_DAYS   = ['вс','пн','вт','ср','чт','пт','сб']

export function DateNav({ dateStr }: { dateStr: string }) {
  const router  = useRouter()
  const today   = new Date().toISOString().slice(0, 10)
  const isToday = dateStr === today

  const d  = new Date(dateStr + 'T12:00:00')
  const label = isToday
    ? `Сегодня, ${d.getDate()} ${RU_MONTHS[d.getMonth()]}`
    : `${d.getDate()} ${RU_MONTHS[d.getMonth()]}, ${RU_DAYS[d.getDay()]}`

  function go(offset: number) {
    const nd = new Date(d)
    nd.setDate(nd.getDate() + offset)
    const next = nd.toISOString().slice(0, 10)
    if (next > today) return
    if (next === today) router.push('/dashboard')
    else router.push(`/dashboard?date=${next}`)
  }

  return (
    <div className="flex items-center gap-0.5 rounded-xl bg-cream border border-line px-1 py-1 text-xs font-medium text-ink-2">
      <button
        onClick={() => go(-1)}
        className="w-7 h-7 rounded-lg hover:bg-cream-2 flex items-center justify-center text-ink-2 transition-colors"
        aria-label="Предыдущий день"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
      </button>

      <span className="px-2 py-1 cursor-default select-none min-w-[130px] text-center text-ink">
        {label}
      </span>

      <button
        onClick={() => go(1)}
        disabled={isToday}
        className="w-7 h-7 rounded-lg hover:bg-cream-2 flex items-center justify-center text-ink-2 transition-colors disabled:opacity-25 disabled:cursor-default"
        aria-label="Следующий день"
      >
        <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

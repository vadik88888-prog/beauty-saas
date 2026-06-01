'use client'

import { useRouter, usePathname } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { localIsoDate } from '@/lib/utils/date'

const RU_MONTHS = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря']
const RU_DAYS   = ['вс','пн','вт','ср','чт','пт','сб']

// isDefaultDate=true when no ?date= param — means server passed UTC "today" which may differ
// from client local date. In that case we use the browser's local date as the anchor.
export function DateNav({ dateStr, isDefaultDate = false }: { dateStr: string; isDefaultDate?: boolean }) {
  const router   = useRouter()
  const pathname = usePathname()
  const basePath = pathname.split('?')[0]
  const today    = localIsoDate(new Date())   // always browser-local

  // When no ?date= param the server may have sent yesterday's UTC date.
  // Treat the current local date as "today" in that case.
  const effectiveDateStr = isDefaultDate ? today : dateStr
  const isToday          = effectiveDateStr === today

  const d     = new Date(effectiveDateStr + 'T12:00:00')
  const label = isToday
    ? `Сегодня, ${d.getDate()} ${RU_MONTHS[d.getMonth()]}`
    : `${d.getDate()} ${RU_MONTHS[d.getMonth()]}, ${RU_DAYS[d.getDay()]}`

  function go(offset: number) {
    const nd = new Date(effectiveDateStr + 'T12:00:00')
    nd.setDate(nd.getDate() + offset)
    const next = localIsoDate(nd)
    if (next > today) return
    if (next === today) router.push(basePath)
    else router.push(`${basePath}?date=${next}`)
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

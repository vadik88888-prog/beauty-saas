'use client'

import { useEffect, useState, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

type Appointment = {
  id: string
  starts_at: string
  ends_at: string
  status: string
  price: number | null
  client: { first_name: string | null; last_name: string | null } | null
  master: { id: string; name: string } | null
  service: { name: string; duration_min: number } | null
}

type Master = { id: string; name: string }

// Working hours range to display
const HOUR_START = 8
const HOUR_END = 21
const HOURS = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i)

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 border-yellow-400 text-yellow-800',
  confirmed: 'bg-blue-100 border-blue-400 text-blue-800',
  completed: 'bg-green-100 border-green-400 text-green-800',
  no_show: 'bg-red-100 border-red-400 text-red-800',
}

function getMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' })
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export default function CalendarPage() {
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()))
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [masters, setMasters] = useState<Master[]>([])
  const [selectedMasterId, setSelectedMasterId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const from = `${isoDate(weekStart)}T00:00:00Z`
  const to = `${isoDate(addDays(weekStart, 6))}T23:59:59Z`

  const load = useCallback(async () => {
    setIsLoading(true)
    const res = await fetch(`/api/admin/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
    const { appointments: appts, masters: ms } = await res.json()
    setAppointments(appts ?? [])
    setMasters(ms ?? [])
    if (!selectedMasterId && ms?.length > 0) setSelectedMasterId(ms[0].id)
    setIsLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to])

  useEffect(() => { load() }, [load])

  const filteredAppts = selectedMasterId
    ? appointments.filter(a => a.master?.id === selectedMasterId)
    : appointments

  // Map: dateStr -> appointment[]
  const apptsByDay: Record<string, Appointment[]> = {}
  for (const a of filteredAppts) {
    const day = a.starts_at.slice(0, 10)
    if (!apptsByDay[day]) apptsByDay[day] = []
    apptsByDay[day].push(a)
  }

  function getApptStyle(appt: Appointment) {
    const start = new Date(appt.starts_at)
    const end = new Date(appt.ends_at)
    const startH = start.getHours() + start.getMinutes() / 60
    const endH = end.getHours() + end.getMinutes() / 60
    const top = (startH - HOUR_START) * 60 // px (1hr = 60px)
    const height = Math.max((endH - startH) * 60, 30)
    return { top, height }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-background">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold">Расписание</h1>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={() => setWeekStart(d => addDays(d, -7))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setWeekStart(getMonday(new Date()))}>
              <Calendar className="w-4 h-4 mr-1.5" />
              Сегодня
            </Button>
            <Button variant="outline" size="icon" onClick={() => setWeekStart(d => addDays(d, 7))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          <span className="text-sm text-muted-foreground">
            {weekDays[0].toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })} –{' '}
            {weekDays[6].toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
        </div>

        {/* Master filter */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Мастер:</span>
          <div className="flex gap-1 flex-wrap">
            <button
              onClick={() => setSelectedMasterId(null)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                selectedMasterId === null ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'
              }`}
            >
              Все
            </button>
            {masters.map(m => (
              <button
                key={m.id}
                onClick={() => setSelectedMasterId(m.id)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  selectedMasterId === m.id ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'
                }`}
              >
                {m.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Загрузка...</div>
        ) : (
          <div className="flex min-w-[800px]">
            {/* Time column */}
            <div className="w-14 shrink-0 border-r">
              <div className="h-10 border-b" /> {/* header spacer */}
              {HOURS.map(h => (
                <div key={h} className="h-[60px] border-b flex items-start pt-1 pl-2">
                  <span className="text-xs text-muted-foreground">{String(h).padStart(2, '0')}:00</span>
                </div>
              ))}
            </div>

            {/* Day columns */}
            {weekDays.map(day => {
              const dateStr = isoDate(day)
              const dayAppts = apptsByDay[dateStr] ?? []
              const isToday = isoDate(new Date()) === dateStr

              return (
                <div key={dateStr} className="flex-1 min-w-0 border-r last:border-r-0">
                  {/* Day header */}
                  <div className={`h-10 border-b flex items-center justify-center text-xs font-medium ${isToday ? 'bg-primary/10' : ''}`}>
                    <span className={isToday ? 'text-primary font-bold' : 'text-muted-foreground'}>
                      {formatShortDate(day)}
                    </span>
                  </div>

                  {/* Time slots */}
                  <div className="relative" style={{ height: `${HOURS.length * 60}px` }}>
                    {/* Hour lines */}
                    {HOURS.map(h => (
                      <div
                        key={h}
                        className="absolute w-full border-b border-border/40"
                        style={{ top: (h - HOUR_START) * 60 }}
                      />
                    ))}

                    {/* Appointments */}
                    {dayAppts.map(appt => {
                      const { top, height } = getApptStyle(appt)
                      const colorClass = STATUS_COLORS[appt.status] ?? STATUS_COLORS.pending
                      const clientName = [appt.client?.first_name, appt.client?.last_name].filter(Boolean).join(' ') || 'Клиент'
                      const startTime = new Date(appt.starts_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })

                      return (
                        <div
                          key={appt.id}
                          className={`absolute left-0.5 right-0.5 rounded border-l-4 px-1.5 py-0.5 overflow-hidden cursor-pointer hover:opacity-90 transition-opacity ${colorClass}`}
                          style={{ top, height }}
                        >
                          <p className="text-xs font-bold leading-tight truncate">{startTime} {clientName}</p>
                          {height > 40 && appt.service && (
                            <p className="text-xs leading-tight truncate opacity-80">{appt.service.name}</p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="px-6 py-3 border-t flex items-center gap-4 text-xs text-muted-foreground">
        <span>Статусы:</span>
        {Object.entries(STATUS_COLORS).map(([status, cls]) => (
          <span key={status} className={`px-2 py-0.5 rounded border-l-4 ${cls}`}>
            {status === 'pending' ? 'Ожидает' : status === 'confirmed' ? 'Подтверждена' : status === 'completed' ? 'Завершена' : 'No-show'}
          </span>
        ))}
        <span className="ml-auto">Всего на неделе: <b>{appointments.length}</b></span>
      </div>
    </div>
  )
}

// Re-export Badge to avoid unused import warning
export { Badge }

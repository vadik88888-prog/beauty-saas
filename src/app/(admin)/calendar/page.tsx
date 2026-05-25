'use client'

import { useEffect, useState, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Calendar, X, Phone, MessageCircle, CheckCircle, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

type Appointment = {
  id: string
  starts_at: string
  ends_at: string
  status: string
  price: number | null
  notes: string | null
  client: {
    first_name: string | null
    last_name: string | null
    phone: string | null
    telegram_id: number | null
    telegram_username: string | null
  } | null
  master: { id: string; name: string } | null
  service: { name: string; duration_min: number } | null
}

type Master = { id: string; name: string }

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

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export default function CalendarPage() {
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()))
  const [selectedDay, setSelectedDay] = useState<Date>(() => new Date())
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [masters, setMasters] = useState<Master[]>([])
  const [selectedMasterId, setSelectedMasterId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const from = isMobile
    ? `${isoDate(selectedDay)}T00:00:00Z`
    : `${isoDate(weekStart)}T00:00:00Z`
  const to = isMobile
    ? `${isoDate(selectedDay)}T23:59:59Z`
    : `${isoDate(addDays(weekStart, 6))}T23:59:59Z`

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
    const top = (startH - HOUR_START) * 60
    const height = Math.max((endH - startH) * 60, 30)
    return { top, height }
  }

  async function handleApptAction(apptId: string, status: 'confirmed' | 'cancelled' | 'completed') {
    const res = await fetch(`/api/admin/appointments/${apptId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (res.ok) {
      setAppointments(prev => prev.map(a => a.id === apptId ? { ...a, status } : a))
      setSelectedAppt(prev => prev?.id === apptId ? { ...prev, status } : prev)
      toast.success(
        status === 'confirmed' ? 'Запись подтверждена' :
        status === 'completed' ? 'Запись завершена' :
        'Запись отменена'
      )
    } else {
      toast.error('Ошибка обновления')
    }
  }

  function DayColumn({ day }: { day: Date }) {
    const dateStr = isoDate(day)
    const dayAppts = apptsByDay[dateStr] ?? []
    const isToday = isoDate(new Date()) === dateStr
    return (
      <div className="flex-1 min-w-0 border-r last:border-r-0">
        <div className={`h-10 border-b flex items-center justify-center text-xs font-medium ${isToday ? 'bg-primary/10' : ''}`}>
          <span className={isToday ? 'text-primary font-bold' : 'text-muted-foreground'}>
            {day.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' })}
          </span>
        </div>
        <div className="relative" style={{ height: `${HOURS.length * 60}px` }}>
          {HOURS.map(h => (
            <div key={h} className="absolute w-full border-b border-border/40" style={{ top: (h - HOUR_START) * 60 }} />
          ))}
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
                onClick={() => setSelectedAppt(appt)}
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
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex flex-col gap-2 px-4 md:px-6 py-3 border-b bg-background">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-lg md:text-xl font-bold">Расписание</h1>
            {/* Desktop: week nav */}
            <div className="hidden md:flex items-center gap-1">
              <Button variant="outline" size="icon" onClick={() => setWeekStart(d => addDays(d, -7))}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setWeekStart(getMonday(new Date())); setSelectedDay(new Date()) }}>
                <Calendar className="w-4 h-4 mr-1.5" />
                Сегодня
              </Button>
              <Button variant="outline" size="icon" onClick={() => setWeekStart(d => addDays(d, 7))}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            {/* Mobile: day nav */}
            <div className="flex md:hidden items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setSelectedDay(d => addDays(d, -1))}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setSelectedDay(new Date())}>
                Сегодня
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setSelectedDay(d => addDays(d, 1))}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Date range label */}
          <span className="text-xs md:text-sm text-muted-foreground hidden md:block">
            {weekDays[0].toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })} –{' '}
            {weekDays[6].toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
          <span className="text-xs text-muted-foreground md:hidden">
            {selectedDay.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
          </span>
        </div>

        {/* Week day tabs on mobile */}
        <div className="flex md:hidden gap-1 overflow-x-auto pb-1">
          {Array.from({ length: 7 }, (_, i) => {
            const day = addDays(getMonday(selectedDay), i)
            const isSelected = isoDate(day) === isoDate(selectedDay)
            const isToday = isoDate(day) === isoDate(new Date())
            return (
              <button
                key={i}
                onClick={() => setSelectedDay(day)}
                className={`flex flex-col items-center px-2.5 py-1 rounded-lg text-xs shrink-0 transition-colors ${
                  isSelected ? 'bg-primary text-primary-foreground' : isToday ? 'bg-primary/10 text-primary' : 'hover:bg-muted'
                }`}
              >
                <span className="font-medium">{day.toLocaleDateString('ru-RU', { weekday: 'short' })}</span>
                <span>{day.getDate()}</span>
              </button>
            )
          })}
        </div>

        {/* Master filter */}
        <div className="flex items-center gap-2 overflow-x-auto">
          <span className="text-xs text-muted-foreground shrink-0">Мастер:</span>
          <div className="flex gap-1 flex-nowrap">
            <button
              onClick={() => setSelectedMasterId(null)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors shrink-0 ${
                selectedMasterId === null ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'
              }`}
            >
              Все
            </button>
            {masters.map(m => (
              <button
                key={m.id}
                onClick={() => setSelectedMasterId(m.id)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors shrink-0 ${
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
        ) : isMobile ? (
          /* Mobile: single day view */
          <div className="flex">
            <div className="w-12 shrink-0 border-r">
              <div className="h-10 border-b" />
              {HOURS.map(h => (
                <div key={h} className="h-[60px] border-b flex items-start pt-1 pl-1">
                  <span className="text-[10px] text-muted-foreground">{String(h).padStart(2, '0')}:00</span>
                </div>
              ))}
            </div>
            <DayColumn day={selectedDay} />
          </div>
        ) : (
          /* Desktop: week view with horizontal scroll */
          <div className="overflow-x-auto">
            <div className="flex min-w-[700px]">
              <div className="w-14 shrink-0 border-r">
                <div className="h-10 border-b" />
                {HOURS.map(h => (
                  <div key={h} className="h-[60px] border-b flex items-start pt-1 pl-2">
                    <span className="text-xs text-muted-foreground">{String(h).padStart(2, '0')}:00</span>
                  </div>
                ))}
              </div>
              {weekDays.map(day => <DayColumn key={isoDate(day)} day={day} />)}
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="px-4 md:px-6 py-3 border-t flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
        {Object.entries(STATUS_COLORS).map(([status, cls]) => (
          <span key={status} className={`px-2 py-0.5 rounded border-l-4 ${cls}`}>
            {status === 'pending' ? 'Ожидает' : status === 'confirmed' ? 'Подтверждена' : status === 'completed' ? 'Завершена' : 'No-show'}
          </span>
        ))}
        <span className="ml-auto">Всего: <b>{appointments.length}</b></span>
      </div>

      {/* Appointment detail modal */}
      {selectedAppt && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSelectedAppt(null)} />
          <div className="relative bg-background rounded-t-2xl md:rounded-2xl shadow-xl w-full md:max-w-md p-5 z-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-base">Детали записи</h2>
              <button onClick={() => setSelectedAppt(null)} className="p-1 rounded-lg hover:bg-muted">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col gap-2.5 text-sm">
              <Row label="Клиент" value={[selectedAppt.client?.first_name, selectedAppt.client?.last_name].filter(Boolean).join(' ') || 'Клиент'} />
              {selectedAppt.client?.phone && (
                <a href={`tel:${selectedAppt.client.phone}`} className="flex items-center gap-2 text-primary">
                  <Phone className="w-4 h-4" />
                  {selectedAppt.client.phone}
                </a>
              )}
              {selectedAppt.client?.telegram_username && (
                <a href={`https://t.me/${selectedAppt.client.telegram_username}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-primary">
                  <MessageCircle className="w-4 h-4" />
                  @{selectedAppt.client.telegram_username}
                </a>
              )}
              <div className="border-t my-1" />
              <Row label="Услуга" value={selectedAppt.service?.name ?? '—'} />
              <Row label="Мастер" value={selectedAppt.master?.name ?? '—'} />
              <Row label="Начало" value={new Date(selectedAppt.starts_at).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })} />
              <Row label="Конец" value={new Date(selectedAppt.ends_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })} />
              <Row label="Статус" value={
                selectedAppt.status === 'pending' ? 'Ожидает' :
                selectedAppt.status === 'confirmed' ? 'Подтверждена' :
                selectedAppt.status === 'completed' ? 'Завершена' :
                selectedAppt.status === 'cancelled' ? 'Отменена' : selectedAppt.status
              } />
              {selectedAppt.price != null && <Row label="Стоимость" value={`${selectedAppt.price} руб.`} />}
              {selectedAppt.notes && <Row label="Заметки" value={selectedAppt.notes} />}
            </div>

            {selectedAppt.status !== 'cancelled' && selectedAppt.status !== 'completed' && (
              <div className="flex flex-wrap gap-2 mt-4">
                {selectedAppt.status === 'pending' && (
                  <Button size="sm" className="flex-1 min-w-[120px]" onClick={() => handleApptAction(selectedAppt.id, 'confirmed')}>
                    <CheckCircle className="w-4 h-4 mr-1.5" />
                    Подтвердить
                  </Button>
                )}
                <Button size="sm" variant="default" className="flex-1 min-w-[120px] bg-green-600 hover:bg-green-700" onClick={() => handleApptAction(selectedAppt.id, 'completed')}>
                  <CheckCircle className="w-4 h-4 mr-1.5" />
                  Завершить
                </Button>
                <Button size="sm" variant="outline" className="flex-1 min-w-[120px] text-destructive border-destructive/30" onClick={() => handleApptAction(selectedAppt.id, 'cancelled')}>
                  <XCircle className="w-4 h-4 mr-1.5" />
                  Отменить
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-muted-foreground w-20 shrink-0">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

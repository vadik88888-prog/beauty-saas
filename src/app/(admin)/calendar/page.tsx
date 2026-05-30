'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  ChevronLeft, ChevronRight, Calendar, X, Phone, MessageCircle,
  CheckCircle, XCircle, Sparkles, UserPlus, Bell, MoreHorizontal,
} from 'lucide-react'
import { toast } from 'sonner'
import { AiBadge } from '@/components/shared/AiBadge'
import { cn } from '@/lib/utils'
import Link from 'next/link'

type Appointment = {
  id: string
  starts_at: string
  ends_at: string
  status: string
  price: number | null
  notes: string | null
  source: string | null
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

const STATUS_CARD: Record<string, string> = {
  pending:   'bg-[#fef4ed] border-l-[#c47a4f]',
  confirmed: 'bg-[#eef4ec] border-l-[#5e7d5d]',
  completed: 'bg-[#f5f3ef] border-l-[#9b9b8e]',
  no_show:   'bg-[#fef2f2] border-l-[#e05252]',
  cancelled: 'bg-[#f8f6f4] border-l-[#c5c0b8] opacity-60',
}

const STATUS_DOT: Record<string, string> = {
  pending:   'bg-[#c47a4f]',
  confirmed: 'bg-[#5e7d5d]',
  completed: 'bg-[#9b9b8e]',
  no_show:   'bg-[#e05252]',
  cancelled: 'bg-[#c5c0b8]',
}

const STATUS_LABELS: Record<string, string> = {
  pending:   'Ожидает',
  confirmed: 'Подтверждена',
  completed: 'Завершена',
  no_show:   'No-show',
  cancelled: 'Отменена',
}

const ZONES = [
  { id: 'all',  label: 'Все залы' },
  { id: 'mani', label: 'Маникюрный зал' },
  { id: 'cosm', label: 'Косметология' },
  { id: 'hair', label: 'Парикмахерский зал' },
]
const ZONE_KEYWORDS: Record<string, string> = { mani: 'маникюр', cosm: 'косметолог', hair: 'парикмахер' }

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

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

function pl(n: number, f: [string, string, string]): string {
  const abs = Math.abs(n) % 100, last = abs % 10
  if (abs > 10 && abs < 20) return f[2]
  if (last > 1 && last < 5) return f[1]
  if (last === 1) return f[0]
  return f[2]
}

export default function CalendarPage() {
  const [weekStart, setWeekStart]           = useState<Date>(() => getMonday(new Date()))
  const [selectedDay, setSelectedDay]       = useState<Date>(() => new Date())
  const [appointments, setAppointments]     = useState<Appointment[]>([])
  const [masters, setMasters]               = useState<Master[]>([])
  const [selectedMasterId, setSelectedMasterId] = useState<string | null>(null)
  const [isLoading, setIsLoading]           = useState(true)
  const [isMobile, setIsMobile]             = useState(false)
  const [selectedAppt, setSelectedAppt]     = useState<Appointment | null>(null)
  const [selectedZone, setSelectedZone]     = useState('all')

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const from = isMobile ? `${isoDate(selectedDay)}T00:00:00Z` : `${isoDate(weekStart)}T00:00:00Z`
  const to   = isMobile ? `${isoDate(selectedDay)}T23:59:59Z` : `${isoDate(addDays(weekStart, 6))}T23:59:59Z`

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

  const displayAppts = selectedZone === 'all'
    ? filteredAppts
    : filteredAppts.filter(a => a.service?.name?.toLowerCase().includes(ZONE_KEYWORDS[selectedZone] ?? ''))

  const apptsByDay: Record<string, Appointment[]> = {}
  for (const a of displayAppts) {
    const day = a.starts_at.slice(0, 10)
    if (!apptsByDay[day]) apptsByDay[day] = []
    apptsByDay[day].push(a)
  }

  // Right panel stats (today)
  const todayStr   = isoDate(new Date())
  const todayAppts = appointments.filter(a => a.starts_at.startsWith(todayStr))
  const busyMin    = todayAppts.reduce((acc, a) =>
    acc + (new Date(a.ends_at).getTime() - new Date(a.starts_at).getTime()) / 60000, 0)
  const workDayMin = 10 * 60
  const loadPct    = Math.min(100, Math.round((busyMin / workDayMin) * 100))
  const busyH      = Math.floor(busyMin / 60)
  const busyM      = Math.round(busyMin % 60)
  const freeWin    = Math.max(0, Math.floor((workDayMin - busyMin) / 60))

  const nowIso = new Date().toISOString()
  const upcomingToday = [...todayAppts]
    .filter(a => a.starts_at > nowIso && a.status !== 'cancelled')
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .slice(0, 4)

  function getApptStyle(appt: Appointment) {
    const start  = new Date(appt.starts_at)
    const end    = new Date(appt.ends_at)
    const startH = start.getHours() + start.getMinutes() / 60
    const endH   = end.getHours() + end.getMinutes() / 60
    return { top: (startH - HOUR_START) * 60, height: Math.max((endH - startH) * 60, 30) }
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
      toast.success(status === 'confirmed' ? 'Запись подтверждена' : status === 'completed' ? 'Запись завершена' : 'Запись отменена')
    } else {
      toast.error('Ошибка обновления')
    }
  }

  function DayColumn({ day }: { day: Date }) {
    const dateStr = isoDate(day)
    const dayAppts = apptsByDay[dateStr] ?? []
    const isToday  = isoDate(new Date()) === dateStr
    return (
      <div className={cn('flex-1 min-w-0 border-r border-line last:border-r-0', isToday && 'bg-[#eef4ec]/25')}>
        <div className={cn('h-10 border-b border-line flex items-center justify-center gap-1', isToday && 'bg-[#eef4ec]/40')}>
          <span className={cn('text-[0.625rem] font-semibold uppercase tracking-wider', isToday ? 'text-[#5e7d5d]' : 'text-[#7b7d72]')}>
            {day.toLocaleDateString('ru-RU', { weekday: 'short' })}
          </span>
          <span className={cn('text-sm font-bold', isToday ? 'text-[#5e7d5d]' : 'text-[#1b2a22]')}>
            {day.getDate()} {day.toLocaleDateString('ru-RU', { month: 'short' })}
          </span>
        </div>
        <div className="relative" style={{ height: `${HOURS.length * 60}px` }}>
          {HOURS.map(h => (
            <div key={h} className="absolute w-full border-b border-[#e3dccb]/50" style={{ top: (h - HOUR_START) * 60 }} />
          ))}
          {dayAppts.map(appt => {
            const { top, height } = getApptStyle(appt)
            const cardCls = STATUS_CARD[appt.status] ?? STATUS_CARD.pending
            const clientName = [appt.client?.first_name, appt.client?.last_name].filter(Boolean).join(' ') || 'Клиент'
            const isAi = appt.source === 'ai'
            return (
              <div
                key={appt.id}
                className={cn('absolute left-0.5 right-0.5 rounded-r-lg border-l-4 px-1.5 py-1 overflow-hidden cursor-pointer hover:brightness-95 transition-all select-none', cardCls)}
                style={{ top, height }}
                onClick={() => setSelectedAppt(appt)}
              >
                <p className="text-[0.5625rem] font-mono text-[#7b7d72] leading-none mb-0.5 tabular-nums">
                  {fmtTime(appt.starts_at)} – {fmtTime(appt.ends_at)}
                </p>
                <p className="text-xs font-bold text-[#1b2a22] leading-tight truncate">{clientName}</p>
                {height > 52 && appt.service && (
                  <p className="text-[0.5625rem] text-[#7b7d72] leading-tight truncate mt-0.5">{appt.service.name}</p>
                )}
                {height > 76 && appt.master && (
                  <div className="flex items-center gap-1 mt-1">
                    <div className="w-4 h-4 rounded-full bg-[#c9d8c5] flex items-center justify-center text-[0.5rem] font-bold text-[#5e7d5d] shrink-0">
                      {appt.master.name.charAt(0)}
                    </div>
                    <span className="text-[0.5rem] text-[#7b7d72] truncate flex-1">{appt.master.name}</span>
                    {isAi && <Sparkles className="w-2.5 h-2.5 text-[#e6a83a] shrink-0 ml-auto" strokeWidth={2.2} />}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--page, #efe9dd)' }}>

      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div className="px-4 md:px-5 py-3 border-b border-[#e3dccb] bg-[#faf6ec] flex flex-col gap-2.5">

        {/* Row 1: title + nav + CTAs */}
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="font-serif text-xl font-bold text-[#1b2a22] flex items-center gap-1.5 shrink-0">
            Расписание
            <Sparkles className="w-4 h-4 text-[#e6a83a]" strokeWidth={2} />
          </h1>

          {/* Navigation */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => isMobile ? setSelectedDay(d => addDays(d, -1)) : setWeekStart(d => addDays(d, -7))}
              className="w-8 h-8 rounded-xl border border-[#e3dccb] bg-[#ece5d3] hover:bg-[#e3dccb] flex items-center justify-center transition-colors"
            >
              <ChevronLeft className="w-4 h-4 text-[#1b2a22]" />
            </button>
            <button
              onClick={() => { setWeekStart(getMonday(new Date())); setSelectedDay(new Date()) }}
              className="px-3 h-8 rounded-xl border border-[#e3dccb] bg-[#ece5d3] hover:bg-[#e3dccb] text-xs font-semibold text-[#1b2a22] transition-colors flex items-center gap-1.5"
            >
              <Calendar className="w-3.5 h-3.5" /> Сегодня
            </button>
            <button
              onClick={() => isMobile ? setSelectedDay(d => addDays(d, 1)) : setWeekStart(d => addDays(d, 7))}
              className="w-8 h-8 rounded-xl border border-[#e3dccb] bg-[#ece5d3] hover:bg-[#e3dccb] flex items-center justify-center transition-colors"
            >
              <ChevronRight className="w-4 h-4 text-[#1b2a22]" />
            </button>
          </div>

          {/* Date range (desktop) */}
          <span className="hidden md:inline-flex items-center gap-1.5 text-sm font-medium text-[#2f3b32] bg-[#ece5d3] border border-[#e3dccb] rounded-xl px-3 h-8">
            {weekDays[0].toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })} – {weekDays[6].toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
          <span className="md:hidden text-xs text-[#7b7d72]">
            {selectedDay.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
          </span>

          <div className="flex-1" />

          {/* CTA buttons */}
          <div className="flex items-center gap-2">
            <button className="hidden sm:flex items-center gap-1.5 px-3 h-9 rounded-xl bg-[#5e7d5d] text-white text-xs font-semibold hover:bg-[#7d9a78] transition-colors">
              <Calendar className="w-3.5 h-3.5" /> Создать запись
            </button>
            <button className="hidden sm:flex items-center gap-1.5 px-3 h-9 rounded-xl border border-[#e3dccb] bg-[#ece5d3] text-[#1b2a22] text-xs font-semibold hover:bg-[#e3dccb] transition-colors">
              <UserPlus className="w-3.5 h-3.5" /> Записать клиента
            </button>
            <Link
              href="/chats"
              className="w-9 h-9 rounded-xl border border-[#e3dccb] bg-[#ece5d3] hover:bg-[#e3dccb] flex items-center justify-center transition-colors"
              aria-label="Чаты"
            >
              <Bell className="w-4 h-4 text-[#1b2a22]" strokeWidth={1.8} />
            </Link>
          </div>
        </div>

        {/* Row 2: zone tabs + master filter */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Zone filter */}
          <div className="flex items-center gap-1 overflow-x-auto">
            {ZONES.map(z => (
              <button
                key={z.id}
                onClick={() => setSelectedZone(z.id)}
                className={cn(
                  'px-3.5 h-8 rounded-xl text-xs font-semibold transition-colors shrink-0',
                  selectedZone === z.id
                    ? 'bg-[#1b2a22] text-white'
                    : 'bg-[#ece5d3] border border-[#e3dccb] text-[#7b7d72] hover:text-[#1b2a22] hover:bg-[#e3dccb]'
                )}
              >
                {z.label}
              </button>
            ))}
          </div>

          <div className="flex-1 hidden md:block" />

          {/* Master filter */}
          <div className="flex items-center gap-1 overflow-x-auto">
            <button
              onClick={() => setSelectedMasterId(null)}
              className={cn(
                'px-3 h-7 rounded-lg text-[0.6875rem] font-semibold transition-colors shrink-0',
                selectedMasterId === null ? 'bg-[#5e7d5d] text-white' : 'bg-[#ece5d3] border border-[#e3dccb] text-[#7b7d72] hover:text-[#1b2a22]'
              )}
            >
              Все мастера
            </button>
            {masters.map(m => (
              <button
                key={m.id}
                onClick={() => setSelectedMasterId(m.id)}
                className={cn(
                  'px-3 h-7 rounded-lg text-[0.6875rem] font-semibold transition-colors shrink-0',
                  selectedMasterId === m.id ? 'bg-[#5e7d5d] text-white' : 'bg-[#ece5d3] border border-[#e3dccb] text-[#7b7d72] hover:text-[#1b2a22]'
                )}
              >
                {m.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Content: grid + right sidebar ──────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Calendar grid */}
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="p-8 text-center text-[#a3a698] text-sm">Загрузка расписания...</div>
          ) : isMobile ? (
            /* Mobile: single day */
            <div className="flex">
              <div className="w-12 shrink-0 border-r border-[#e3dccb] bg-[#faf6ec]">
                <div className="h-10 border-b border-[#e3dccb]" />
                {HOURS.map(h => (
                  <div key={h} className="h-[60px] border-b border-[#e3dccb]/50 flex items-start pt-1 pl-1">
                    <span className="text-[10px] text-[#a3a698] font-mono">{String(h).padStart(2, '0')}:00</span>
                  </div>
                ))}
              </div>
              <DayColumn day={selectedDay} />
            </div>
          ) : (
            /* Desktop: week */
            <div className="overflow-x-auto">
              <div className="flex min-w-[580px]">
                <div className="w-14 shrink-0 border-r border-[#e3dccb] bg-[#faf6ec]">
                  <div className="h-10 border-b border-[#e3dccb]" />
                  {HOURS.map(h => (
                    <div key={h} className="h-[60px] border-b border-[#e3dccb]/50 flex items-start pt-1 pl-2">
                      <span className="text-xs text-[#a3a698] font-mono">{String(h).padStart(2, '0')}:00</span>
                    </div>
                  ))}
                </div>
                {weekDays.map(day => <DayColumn key={isoDate(day)} day={day} />)}
              </div>
            </div>
          )}
        </div>

        {/* ── Right sidebar (desktop only) ─────────────────────────── */}
        <aside className="hidden lg:flex flex-col w-[272px] shrink-0 border-l border-[#e3dccb] bg-[#faf6ec] overflow-y-auto">

          {/* Алина рекомендует */}
          <div className="p-4 border-b border-[#e3dccb]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-[#e6a83a]" strokeWidth={2.2} />
                <span className="text-sm font-bold text-[#1b2a22]">Алина рекомендует</span>
              </div>
              <button className="w-6 h-6 rounded-lg hover:bg-[#ece5d3] flex items-center justify-center transition-colors">
                <MoreHorizontal className="w-4 h-4 text-[#a3a698]" />
              </button>
            </div>
            {freeWin > 0 ? (
              <>
                <p className="text-xs text-[#2f3b32] leading-relaxed">
                  Сегодня есть <span className="font-semibold text-[#1b2a22]">{freeWin} свободных {pl(freeWin, ['окно', 'окна', 'окон'])}</span> после 15:00.
                </p>
                <p className="text-xs text-[#7b7d72] mt-1 leading-relaxed">
                  Рекомендуем запустить акцию и заполнить расписание
                </p>
              </>
            ) : (
              <p className="text-xs text-[#2f3b32] leading-relaxed">
                Расписание заполнено отлично! Продолжайте в том же духе.
              </p>
            )}
            <Link
              href="/promo"
              className="mt-3 flex items-center justify-center w-full rounded-xl bg-[#1b2a22] text-white text-xs font-semibold px-4 py-2.5 hover:bg-[#2f3b32] transition-colors"
            >
              Создать акцию
            </Link>
          </div>

          {/* Сегодня */}
          <div className="p-4 border-b border-[#e3dccb]">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-4 h-4 text-[#5e7d5d]" strokeWidth={1.8} />
              <span className="text-sm font-bold text-[#1b2a22]">Сегодня</span>
            </div>

            <div className="grid grid-cols-2 gap-x-3 mb-3">
              <div>
                <div className="text-[2.25rem] font-black text-[#1b2a22] leading-none tabular-nums">
                  {todayAppts.length}
                </div>
                <div className="text-[0.6875rem] text-[#7b7d72] mt-0.5">записей</div>
              </div>
              <div className="flex flex-col justify-center gap-0.5">
                <div className="text-sm font-bold text-[#5e7d5d]">
                  {freeWin} {pl(freeWin, ['свободное окно', 'свободных окна', 'свободных окон'])}
                </div>
                <div className="text-xs text-[#7b7d72]">{busyH}ч {busyM}м занято</div>
              </div>
            </div>

            <div className="h-2 rounded-full bg-[#e3dccb] overflow-hidden mb-1">
              <div
                className="h-full rounded-full bg-[#5e7d5d] transition-all duration-700"
                style={{ width: `${loadPct}%` }}
              />
            </div>
            <div className="flex justify-between">
              <span className="text-[0.625rem] text-[#a3a698]">Свободно</span>
              <span className="text-[0.625rem] font-semibold text-[#2f3b32]">{loadPct}% занято</span>
              <span className="text-[0.625rem] text-[#a3a698]">Занято</span>
            </div>
          </div>

          {/* Ближайшие записи */}
          <div className="p-4 flex-1">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold text-[#1b2a22]">Ближайшие записи</span>
              <button
                onClick={() => setSelectedDay(new Date())}
                className="text-xs text-[#5e7d5d] font-semibold hover:text-[#7d9a78] transition-colors"
              >
                Смотреть все →
              </button>
            </div>

            {upcomingToday.length === 0 ? (
              <div className="text-center py-6">
                <Calendar className="w-7 h-7 text-[#a3a698] mx-auto mb-2 opacity-50" strokeWidth={1.6} />
                <p className="text-xs text-[#a3a698]">Нет предстоящих записей</p>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {upcomingToday.map(appt => {
                  const clientName = [appt.client?.first_name, appt.client?.last_name].filter(Boolean).join(' ') || 'Клиент'
                  const dotCls = STATUS_DOT[appt.status] ?? STATUS_DOT.pending
                  return (
                    <button
                      key={appt.id}
                      onClick={() => setSelectedAppt(appt)}
                      className="flex items-center gap-2.5 text-left rounded-xl p-2 hover:bg-[#ece5d3] transition-colors -mx-1"
                    >
                      <div className="w-8 h-8 rounded-full bg-[#e7eee2] border border-[#c9d8c5] flex items-center justify-center shrink-0 text-xs font-bold text-[#5e7d5d]">
                        {clientName.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-[#1b2a22] truncate">{clientName}</p>
                        <p className="text-[0.625rem] text-[#7b7d72] truncate">{appt.service?.name ?? appt.master?.name ?? '—'}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={cn('w-1.5 h-1.5 rounded-full', dotCls)} />
                        <span className="text-[0.6875rem] font-mono font-medium text-[#7b7d72]">{fmtTime(appt.starts_at)}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            <Link
              href="/calendar"
              className="mt-4 flex items-center justify-center gap-1.5 w-full rounded-xl border border-[#e3dccb] bg-[#ece5d3] hover:bg-[#e3dccb] text-xs font-semibold text-[#1b2a22] py-2.5 transition-colors"
            >
              <Calendar className="w-3.5 h-3.5" /> Открыть календарь
            </Link>
          </div>
        </aside>
      </div>

      {/* ── Legend ──────────────────────────────────────────────────── */}
      <div className="px-4 md:px-5 py-2 border-t border-[#e3dccb] bg-[#faf6ec] flex items-center gap-3 text-[0.6875rem] flex-wrap">
        {Object.entries(STATUS_LABELS).map(([status, label]) => (
          <span key={status} className="flex items-center gap-1.5">
            <span className={cn('w-2 h-2 rounded-full shrink-0', STATUS_DOT[status])} />
            <span className="text-[#7b7d72]">{label}</span>
          </span>
        ))}
        <span className="flex items-center gap-1 text-[#e6a83a]">
          <Sparkles className="w-2.5 h-2.5" strokeWidth={2.2} />
          <span>через AI</span>
        </span>
        <span className="ml-auto text-[#7b7d72]">Всего: <b className="text-[#1b2a22]">{appointments.length}</b></span>
      </div>

      {/* ── Appointment detail modal ─────────────────────────────────── */}
      {selectedAppt && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
          <div className="absolute inset-0 bg-[#1b2a22]/40 backdrop-blur-sm" onClick={() => setSelectedAppt(null)} />
          <div className="relative bg-[#faf6ec] rounded-t-2xl md:rounded-2xl w-full md:max-w-md p-5 z-10 border border-[#e3dccb] shadow-xl">

            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h2 className="font-serif text-lg font-bold text-[#1b2a22]">Детали записи</h2>
                {selectedAppt.source === 'ai' && <AiBadge />}
              </div>
              <button
                onClick={() => setSelectedAppt(null)}
                className="w-8 h-8 rounded-xl hover:bg-[#ece5d3] flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4 text-[#1b2a22]" />
              </button>
            </div>

            {/* Status badge */}
            <div className="mb-4">
              <span className={cn('inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border-l-4', STATUS_CARD[selectedAppt.status] ?? STATUS_CARD.pending)}>
                <span className={cn('w-1.5 h-1.5 rounded-full', STATUS_DOT[selectedAppt.status])} />
                {STATUS_LABELS[selectedAppt.status] ?? selectedAppt.status}
              </span>
            </div>

            <div className="flex flex-col gap-2.5">
              <Row label="Клиент" value={[selectedAppt.client?.first_name, selectedAppt.client?.last_name].filter(Boolean).join(' ') || 'Клиент'} />
              {selectedAppt.client?.phone && (
                <a href={`tel:${selectedAppt.client.phone}`} className="flex items-center gap-2 text-[#5e7d5d] font-medium text-sm">
                  <Phone className="w-4 h-4" /> {selectedAppt.client.phone}
                </a>
              )}
              {selectedAppt.client?.telegram_username && (
                <a href={`https://t.me/${selectedAppt.client.telegram_username}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-[#5e7d5d] font-medium text-sm">
                  <MessageCircle className="w-4 h-4" /> @{selectedAppt.client.telegram_username}
                </a>
              )}
              <div className="h-px bg-[#e3dccb] my-0.5" />
              <Row label="Услуга"  value={selectedAppt.service?.name ?? '—'} />
              <Row label="Мастер"  value={selectedAppt.master?.name ?? '—'} />
              <Row label="Начало"  value={new Date(selectedAppt.starts_at).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })} />
              <Row label="Конец"   value={new Date(selectedAppt.ends_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })} />
              {selectedAppt.price != null && <Row label="Стоимость" value={`${selectedAppt.price} руб.`} />}
              {selectedAppt.notes && <Row label="Заметки" value={selectedAppt.notes} />}
            </div>

            {selectedAppt.status !== 'cancelled' && selectedAppt.status !== 'completed' && (
              <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t border-[#e3dccb]">
                {selectedAppt.status === 'pending' && (
                  <button
                    onClick={() => handleApptAction(selectedAppt.id, 'confirmed')}
                    className="flex-1 min-w-[120px] flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#5e7d5d] text-white text-sm font-semibold hover:bg-[#7d9a78] transition-colors"
                  >
                    <CheckCircle className="w-4 h-4" /> Подтвердить
                  </button>
                )}
                <button
                  onClick={() => handleApptAction(selectedAppt.id, 'completed')}
                  className="flex-1 min-w-[120px] flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#16a34a] text-white text-sm font-semibold hover:bg-[#15803d] transition-colors"
                >
                  <CheckCircle className="w-4 h-4" /> Завершить
                </button>
                <button
                  onClick={() => handleApptAction(selectedAppt.id, 'cancelled')}
                  className="flex-1 min-w-[120px] flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-[#e05252]/40 text-[#e05252] text-sm font-semibold hover:bg-[#fef2f2] transition-colors"
                >
                  <XCircle className="w-4 h-4" /> Отменить
                </button>
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
      <span className="text-[#7b7d72] w-20 shrink-0 text-xs">{label}</span>
      <span className="font-medium text-[#1b2a22] text-sm">{value}</span>
    </div>
  )
}

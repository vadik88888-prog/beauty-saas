'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  ChevronLeft, ChevronRight, X, Phone,
  MessageCircle, CheckCircle, XCircle, Sparkles, Plus,
} from 'lucide-react'
import { toast } from 'sonner'
import { AiBadge } from '@/components/shared/AiBadge'
import { SeraOrb } from '@/components/sera'
import { formatPrice } from '@/lib/utils/format'

// ── Types ─────────────────────────────────────────────────────────────────────

type Appointment = {
  id: string
  starts_at: string
  ends_at: string
  status: string
  price: number | null
  notes: string | null
  source: string | null
  client: { first_name: string | null; last_name: string | null; phone: string | null; telegram_username: string | null } | null
  master: { id: string; name: string } | null
  service: { name: string; duration_min: number; category_id?: string | null } | null
}
type Master      = { id: string; name: string }
type Category    = { id: string; name: string; icon: string | null; sort_order: number }
type WorkingHour = { master_id: string; day_of_week: number; start_time: string; end_time: string; is_working: boolean }

// ── Constants ─────────────────────────────────────────────────────────────────

const HOUR_START = 9
const HOUR_END   = 21
const HOURS      = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i)
const SLOT_H     = 60  // px per hour — enough height to read labels

const STATUS: Record<string, { bg: string; accent: string; dot: string; label: string }> = {
  pending:   { bg: 'var(--gold-soft)',   accent: 'var(--gold)',  dot: 'var(--gold)',  label: 'Ожидает'      },
  confirmed: { bg: 'var(--sage-tint)',   accent: 'var(--sage)',  dot: 'var(--sage)',  label: 'Подтверждена' },
  completed: { bg: '#f0efed',            accent: 'var(--ink-2)', dot: 'var(--ink-2)', label: 'Завершена'    },
  no_show:   { bg: 'var(--error-soft)', accent: 'var(--error)', dot: 'var(--error)', label: 'No-show'      },
  cancelled: { bg: 'var(--error-soft)', accent: 'var(--error)', dot: 'var(--error)', label: 'Отменена'     },
}

const DAYS_RU   = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб']
const MONTHS_RU = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']
const MONTHS_GEN= ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря']

// ── Helpers ───────────────────────────────────────────────────────────────────

function getMonday(d: Date): Date {
  const r = new Date(d)
  const day = r.getDay()
  r.setDate(r.getDate() - day + (day === 0 ? -6 : 1))
  r.setHours(0, 0, 0, 0)
  return r
}
function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function isoDate(d: Date): string { return d.toISOString().slice(0, 10) }
// LOCAL date string — fixes UTC-day mismatch for salons in UTC+
function localIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function localDateOf(iso: string): string { return localIsoDate(new Date(iso)) }
function localDayStart(d: Date): string {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).toISOString()
}
function localDayEnd(d: Date): string {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).toISOString()
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}
function fmtHM(h: number): string {
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60)
  return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`
}
function fmtDateLabel(d: Date): string { return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}` }
function timeToMin(t: string): number { const [h,m] = t.split(':').map(Number); return h*60+m }

function pluralOkno(n: number): string {
  const a = Math.abs(n) % 100, l = a % 10
  if (a > 10 && a < 20) return 'окон'
  if (l > 1 && l < 5)   return 'окна'
  if (l === 1)           return 'окно'
  return 'окон'
}

function getWorkMin(wh: WorkingHour[], masterId: string | null, d: Date): number {
  const dow = d.getDay()
  const rows = masterId
    ? wh.filter(w => w.master_id === masterId && w.day_of_week === dow && w.is_working)
    : wh.filter(w => w.day_of_week === dow && w.is_working)
  if (rows.length === 0) return 9 * 60
  return rows.reduce((s,w) => s + timeToMin(w.end_time) - timeToMin(w.start_time), 0)
}

// Compute free time slots between appointments
function getFreeSlots(appts: Appointment[], workStartH = HOUR_START, workEndH = HOUR_END): Array<{startH: number; endH: number}> {
  const sorted = [...appts].sort((a,b) => a.starts_at.localeCompare(b.starts_at))
  const slots: Array<{startH:number; endH:number}> = []
  let cursor = workStartH
  for (const a of sorted) {
    const sh = new Date(a.starts_at).getHours() + new Date(a.starts_at).getMinutes() / 60
    const eh = new Date(a.ends_at).getHours()   + new Date(a.ends_at).getMinutes()   / 60
    const gap = sh - cursor
    if (gap >= 0.5) slots.push({ startH: cursor, endH: sh })
    if (eh > cursor) cursor = eh
  }
  if (workEndH - cursor >= 0.5) slots.push({ startH: cursor, endH: workEndH })
  return slots
}

function apptPos(a: Appointment): { top: number; height: number } {
  const s = new Date(a.starts_at), e = new Date(a.ends_at)
  const sh = s.getHours() + s.getMinutes() / 60
  const eh = e.getHours() + e.getMinutes() / 60
  return { top: (sh - HOUR_START) * SLOT_H, height: Math.max((eh - sh) * SLOT_H, 32) }
}

function calendarMonth(year: number, month: number): (number|null)[][] {
  const first = new Date(year, month, 1)
  let dow = first.getDay() - 1; if (dow < 0) dow = 6
  const days = new Date(year, month + 1, 0).getDate()
  const cells: (number|null)[] = [...Array(dow).fill(null)]
  for (let i = 1; i <= days; i++) cells.push(i)
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks: (number|null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

// ── Grid primitives ───────────────────────────────────────────────────────────

const GRID_H = HOURS.length * SLOT_H

// Vertical time labels — left column
function TimeLabels() {
  return (
    <div style={{ width: 52, flexShrink: 0, position: 'relative', height: GRID_H }}>
      {HOURS.map(h => (
        <div key={h} style={{ position: 'absolute', top: (h - HOUR_START) * SLOT_H - 7, right: 6, textAlign: 'right' }}>
          <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink-2)', fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
            {String(h).padStart(2,'0')}:00
          </span>
        </div>
      ))}
    </div>
  )
}

// Horizontal hour lines inside a column
function HourLines() {
  return (
    <>
      {HOURS.map(h => (
        <div key={h} style={{
          position: 'absolute', left: 0, right: 0,
          top: (h - HOUR_START) * SLOT_H,
          borderTop: `1px solid var(--line-soft)`,
          pointerEvents: 'none',
        }} />
      ))}
    </>
  )
}

// Current time indicator — only rendered for today's column
function NowLine() {
  const [top, setTop] = useState<number | null>(null)
  useEffect(() => {
    function update() {
      const now = new Date()
      const h = now.getHours() + now.getMinutes() / 60
      setTop(h >= HOUR_START && h <= HOUR_END ? (h - HOUR_START) * SLOT_H : null)
    }
    update()
    const t = setInterval(update, 60000)
    return () => clearInterval(t)
  }, [])
  if (top === null) return null
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top, zIndex: 20, pointerEvents: 'none', display: 'flex', alignItems: 'center' }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--error)', flexShrink: 0, marginLeft: -4 }} />
      <div style={{ flex: 1, height: 2, background: 'var(--error)', opacity: 0.6 }} />
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const [view, setView]               = useState<'day' | 'week'>('week')  // default: week
  const [selectedDay, setSelectedDay] = useState<Date>(() => new Date())
  const [weekStart, setWeekStart]     = useState<Date>(() => getMonday(new Date()))
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [masters, setMasters]         = useState<Master[]>([])
  const [categories, setCategories]   = useState<Category[]>([])
  const [workingHours, setWorkingHours] = useState<WorkingHour[]>([])
  const [selectedMasterId, setSelectedMasterId]     = useState<string | null>(null)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [isLoading, setIsLoading]     = useState(true)
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null)
  const [miniYear, setMiniYear]       = useState(() => new Date().getFullYear())
  const [miniMonth, setMiniMonth]     = useState(() => new Date().getMonth())

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const todayStr = localIsoDate(new Date())

  // Use local-midnight UTC strings so the API covers the full local day
  const from = view === 'day' ? localDayStart(selectedDay) : localDayStart(weekStart)
  const to   = view === 'day' ? localDayEnd(selectedDay)   : localDayEnd(addDays(weekStart, 6))

  const load = useCallback(async () => {
    setIsLoading(true)
    const res  = await fetch(`/api/admin/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
    const json = await res.json()
    setAppointments(json.appointments ?? [])
    setMasters(json.masters ?? [])
    setCategories(json.categories ?? [])
    setWorkingHours(json.working_hours ?? [])
    setIsLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to])

  useEffect(() => { load() }, [load])

  const filtered = appointments
    .filter(a => selectedMasterId   ? a.master?.id          === selectedMasterId   : true)
    .filter(a => selectedCategoryId ? a.service?.category_id === selectedCategoryId : true)

  const byDay: Record<string, Appointment[]> = {}
  for (const a of filtered) {
    const k = localDateOf(a.starts_at)   // group by LOCAL date, not UTC
    if (!byDay[k]) byDay[k] = []
    byDay[k].push(a)
  }

  // Right-rail: load for selectedDay
  const displayStr  = localIsoDate(selectedDay)
  const dayAppts    = appointments.filter(a => a.starts_at.startsWith(displayStr))
  const busyMin     = dayAppts.reduce((s,a) => s + (new Date(a.ends_at).getTime() - new Date(a.starts_at).getTime()) / 60000, 0)
  const workMin     = getWorkMin(workingHours, selectedMasterId, selectedDay)
  const loadPct     = Math.min(100, Math.round(busyMin / workMin * 100))
  const freeH       = Math.max(0, Math.floor((workMin - busyMin) / 60))
  const freeMin2    = Math.max(0, Math.round((workMin - busyMin) % 60))
  const freeWinDay  = getFreeSlots(dayAppts).length

  // PATCH status
  async function handleAction(id: string, status: 'confirmed' | 'cancelled' | 'completed') {
    const res = await fetch(`/api/admin/appointments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (res.ok) {
      setAppointments(prev => prev.map(a => a.id === id ? { ...a, status } : a))
      setSelectedAppt(prev => prev?.id === id ? { ...prev, status } : prev)
      toast.success(status === 'confirmed' ? 'Запись подтверждена' : status === 'completed' ? 'Запись завершена' : 'Запись отменена')
    } else {
      toast.error('Ошибка обновления')
    }
  }

  function prev()    { view === 'day' ? setSelectedDay(d => addDays(d,-1)) : setWeekStart(d => addDays(d,-7)) }
  function next()    { view === 'day' ? setSelectedDay(d => addDays(d, 1)) : setWeekStart(d => addDays(d, 7)) }
  function goToday() { const t = new Date(); setSelectedDay(t); setWeekStart(getMonday(t)) }
  function goToDay(y: number, mo: number, d: number) {
    const dt = new Date(y, mo, d)
    setSelectedDay(dt); setWeekStart(getMonday(dt)); setView('day')
  }

  const rangeLabel = view === 'day'
    ? `${selectedDay.getDate()} ${MONTHS_GEN[selectedDay.getMonth()]} ${selectedDay.getFullYear()}`
    : `${fmtDateLabel(weekDays[0])} – ${fmtDateLabel(weekDays[6])}`

  // ── Appointment card ──
  function ApptCard({ appt, compact = false }: { appt: Appointment; compact?: boolean }) {
    const st   = STATUS[appt.status] ?? STATUS.pending
    const name = [appt.client?.first_name, appt.client?.last_name].filter(Boolean).join(' ') || 'Клиент'
    const { top, height } = apptPos(appt)
    return (
      <div
        onClick={() => setSelectedAppt(appt)}
        onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(0.95)')}
        onMouseLeave={e => (e.currentTarget.style.filter = '')}
        style={{
          position: 'absolute', left: 3, right: 3, top, height,
          background: st.bg,
          borderLeft: `3px solid ${st.accent}`,
          borderRadius: '0 7px 7px 0',
          padding: compact ? '3px 5px' : '5px 8px',
          overflow: 'hidden', cursor: 'pointer',
          boxSizing: 'border-box', transition: 'filter 0.1s',
          boxShadow: '0 1px 4px rgba(27,42,34,0.06)',
        }}
      >
        {/* Time range */}
        <p style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--muted)', lineHeight: 1, marginBottom: 2 }}>
          {fmtTime(appt.starts_at)}–{fmtTime(appt.ends_at)}
        </p>
        {/* Client name */}
        <p style={{ fontSize: compact ? 10 : 12, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 1 }}>
          {name}
        </p>
        {/* Service */}
        {height > 48 && appt.service && (
          <p style={{ fontSize: 10, color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
            {appt.service.name}
          </p>
        )}
        {/* Master */}
        {height > 70 && appt.master && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 15, height: 15, borderRadius: '50%', background: 'var(--sage-tint)', color: 'var(--sage)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, flexShrink: 0 }}>
              {appt.master.name.charAt(0)}
            </div>
            <span style={{ fontSize: 10, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{appt.master.name}</span>
            {appt.source === 'ai' && <Sparkles size={9} style={{ color: 'var(--gold)', flexShrink: 0 }} />}
          </div>
        )}
      </div>
    )
  }

  // ── Free slot card ──
  function FreeSlotCard({ startH, endH, compact = false }: { startH: number; endH: number; compact?: boolean }) {
    const top    = (startH - HOUR_START) * SLOT_H
    const height = Math.max((endH - startH) * SLOT_H - 4, 24)
    const label  = `${fmtHM(startH)}–${fmtHM(endH)}`
    return (
      <div
        onClick={() => toast.info('Создание записи — в разработке')}
        onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
        onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        style={{
          position: 'absolute', left: 3, right: 3, top, height,
          background: 'var(--sage-tint)',
          border: '1.5px dashed var(--sage-soft)',
          borderRadius: 7,
          padding: compact ? '3px 5px' : '5px 8px',
          overflow: 'hidden', cursor: 'pointer',
          boxSizing: 'border-box', transition: 'opacity 0.15s',
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
        }}
      >
        {compact ? (
          <p style={{ fontSize: 9, color: 'var(--sage)', fontWeight: 600, lineHeight: 1 }}>Свободно</p>
        ) : (
          <>
            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--sage)', lineHeight: 1.2, marginBottom: 1 }}>
              Свободное окно · {label}
            </p>
            {height > 44 && (
              <p style={{ fontSize: 10, color: 'var(--sage-2)', lineHeight: 1.3 }}>Заполнить через SERA</p>
            )}
          </>
        )}
      </div>
    )
  }

  // ── Day column content (lines + appointments + free slots + now line) ──
  function DayContent({ day, appts, compact = false }: { day: Date; appts: Appointment[]; compact?: boolean }) {
    const isToday = isoDate(day) === todayStr
    const freeSlots = getFreeSlots(appts)
    return (
      <div style={{ position: 'relative', height: GRID_H, background: isToday ? 'rgba(231,238,226,0.18)' : 'transparent' }}>
        <HourLines />
        {freeSlots.map((s, i) => <FreeSlotCard key={i} startH={s.startH} endH={s.endH} compact={compact} />)}
        {appts.map(a => <ApptCard key={a.id} appt={a} compact={compact} />)}
        {isToday && <NowLine />}
      </div>
    )
  }

  // ── Day view ──
  function DayView() {
    const appts = byDay[localIsoDate(selectedDay)] ?? []
    return (
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <TimeLabels />
        <div style={{ flex: 1, minWidth: 0 }}>
          <DayContent day={selectedDay} appts={appts} />
        </div>
      </div>
    )
  }

  // ── Week view ──
  function WeekView() {
    return (
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {/* Time axis */}
        <div style={{ width: 52, flexShrink: 0 }}>
          <div style={{ height: 40 }} />{/* spacer for day headers */}
          <TimeLabels />
        </div>
        {/* Day columns */}
        {weekDays.map(day => {
          const ds      = localIsoDate(day)
          const isToday = ds === todayStr
          const appts   = byDay[ds] ?? []
          return (
            <div key={ds} style={{ flex: 1, minWidth: 0, borderLeft: '1px solid var(--line-soft)' }}>
              {/* Day header — click → day view */}
              <div
                onClick={() => { setSelectedDay(day); setView('day') }}
                style={{
                  height: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
                  cursor: 'pointer', background: isToday ? 'var(--sage-tint)' : 'transparent',
                  borderBottom: '1px solid var(--line)', flexShrink: 0,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { if (!isToday) (e.currentTarget as HTMLElement).style.background = 'var(--page-alt)' }}
                onMouseLeave={e => { if (!isToday) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                <span style={{ fontSize: 9, fontWeight: 700, color: isToday ? 'var(--sage)' : 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {DAYS_RU[day.getDay()]}
                </span>
                <span style={{ fontSize: 15, fontWeight: 700, color: isToday ? 'var(--sage)' : 'var(--ink)', lineHeight: 1 }}>
                  {day.getDate()}
                </span>
              </div>
              <DayContent day={day} appts={appts} compact />
            </div>
          )
        })}
      </div>
    )
  }

  // ── Mini calendar ──
  const weeks = calendarMonth(miniYear, miniMonth)

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', overflow: 'hidden', minHeight: 0, display: 'flex', flexDirection: 'column', background: 'var(--page)', boxSizing: 'border-box' }}>

      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, padding: '10px 16px', borderBottom: '1px solid var(--line)', background: 'var(--page-alt)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>

        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600, color: 'var(--ink)', margin: 0, lineHeight: 1.1, whiteSpace: 'nowrap' }}>
          Расписание
        </h1>

        {/* Nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={prev} className="sera-btn-icon" aria-label="Назад"><ChevronLeft size={15} /></button>
          <button onClick={goToday} className="sera-btn sera-btn--secondary sera-btn--sm">Сегодня</button>
          <button onClick={next} className="sera-btn-icon" aria-label="Вперёд"><ChevronRight size={15} /></button>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-2)', marginLeft: 4, whiteSpace: 'nowrap' }}>{rangeLabel}</span>
        </div>

        {/* View toggle */}
        <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--line)', flexShrink: 0 }}>
          {(['day','week'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: '5px 12px', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
              background: view === v ? 'var(--ink)' : 'transparent',
              color:      view === v ? 'var(--page)' : 'var(--ink-2)',
              transition: 'all 0.15s',
            }}>
              {v === 'day' ? 'День' : 'Неделя'}
            </button>
          ))}
        </div>

        {/* Master chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          {[{ id: null, name: 'Все мастера' }, ...masters].map(m => (
            <button key={m.id ?? '__all'} onClick={() => setSelectedMasterId(m.id ?? null)} style={{
              padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer',
              background: selectedMasterId === (m.id ?? null) ? 'var(--sage)' : 'var(--sage-tint)',
              color:      selectedMasterId === (m.id ?? null) ? '#fff' : 'var(--sage)',
            }}>
              {m.name}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        <button onClick={() => toast.info('Создание записи — в разработке')} className="sera-btn sera-btn--sera" style={{ gap: 6 }}>
          <Plus size={14} /> Новая запись
        </button>
      </div>

      {/* ── Category filter ──────────────────────────────────────────── */}
      {categories.length > 0 && (
        <div style={{ flexShrink: 0, padding: '6px 16px', borderBottom: '1px solid var(--line-soft)', background: 'var(--page-alt)', display: 'flex', alignItems: 'center', gap: 4, overflowX: 'auto' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0, marginRight: 4 }}>Категория:</span>
          {[{ id: null, name: 'Все' }, ...categories].map(c => (
            <button key={c.id ?? '__all'} onClick={() => setSelectedCategoryId(c.id ?? null)} style={{
              padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
              background: selectedCategoryId === (c.id ?? null) ? 'var(--ink)' : 'var(--card)',
              color:      selectedCategoryId === (c.id ?? null) ? 'var(--page)' : 'var(--muted)',
              border:     `1px solid ${selectedCategoryId === (c.id ?? null) ? 'transparent' : 'var(--line)'}`,
            }}>
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* ── Main content ─────────────────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden', gap: 8, padding: '8px 8px 8px 0' }}>

        {/* ── Calendar grid ─── */}
        <div style={{ flex: 1, minWidth: 0, background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column', marginLeft: 8 }}>

          {/* Legend */}
          <div style={{ flexShrink: 0, padding: '7px 14px', borderBottom: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {Object.entries(STATUS).map(([key, s]) => (
              <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--ink-2)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.dot, flexShrink: 0 }} /> {s.label}
              </span>
            ))}
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--sage)' }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--sage-tint)', border: '1.5px dashed var(--sage-soft)', flexShrink: 0 }} /> Свободное окно
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--gold)' }}>
              <Sparkles size={10} /> Через SERA
            </span>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink-2)' }}>
              Записей: <strong style={{ color: 'var(--ink)' }}>{appointments.length}</strong>
            </span>
          </div>

          {isLoading ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 13 }}>
              Загрузка расписания...
            </div>
          ) : view === 'day' ? (
            <DayView />
          ) : (
            <WeekView />
          )}
        </div>

        {/* ── Right rail ─── */}
        <div style={{ width: 248, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', paddingRight: 8 }}>

          {/* Load % */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: 14, padding: '12px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Загрузка дня</span>
              <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{loadPct}%</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: 'var(--line)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${loadPct}%`, background: loadPct > 80 ? 'var(--sage)' : 'var(--sage-2)', borderRadius: 3, transition: 'width 0.5s' }} />
            </div>
            <p style={{ fontSize: 11, color: 'var(--ink-2)', marginTop: 6 }}>
              {Math.floor(busyMin / 60)}ч {Math.round(busyMin % 60)}м занято · {freeH}ч {freeMin2}м свободно
            </p>
          </div>

          {/* SERA insight — only if free windows */}
          {freeWinDay > 0 && (
            <div style={{ background: 'var(--sage-tint)', border: '1px solid var(--sage-soft)', borderRadius: 14, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <SeraOrb state="online" size={32} />
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>Совет от SERA</p>
                  <p style={{ fontSize: 11, color: 'var(--sage)', margin: 0 }}>
                    {freeWinDay} свободных {pluralOkno(freeWinDay)}
                  </p>
                </div>
              </div>
              <p style={{ fontSize: 12, color: 'var(--ink2)', lineHeight: 1.5, marginBottom: 8 }}>
                Есть свободное время — хороший момент запустить акцию и заполнить расписание.
              </p>
              <button onClick={() => toast.info('Функция в разработке')} className="sera-btn sera-btn--secondary sera-btn--sm" style={{ width: '100%' }}>
                Предложить добор
              </button>
            </div>
          )}

          {/* Mini calendar */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: 14, padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <button onClick={() => { if (miniMonth===0){setMiniMonth(11);setMiniYear(y=>y-1)}else setMiniMonth(m=>m-1) }} className="sera-btn-icon" style={{ width:24,height:24 }}><ChevronLeft size={12}/></button>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>{MONTHS_RU[miniMonth]} {miniYear}</span>
              <button onClick={() => { if (miniMonth===11){setMiniMonth(0);setMiniYear(y=>y+1)}else setMiniMonth(m=>m+1) }} className="sera-btn-icon" style={{ width:24,height:24 }}><ChevronRight size={12}/></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', marginBottom: 2 }}>
              {['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(d => (
                <span key={d} style={{ textAlign: 'center', fontSize: 9, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>{d}</span>
              ))}
            </div>
            {weeks.map((week, wi) => (
              <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
                {week.map((day, di) => {
                  if (!day) return <div key={di} />
                  const d   = new Date(miniYear, miniMonth, day)
                  const ds  = localIsoDate(d)
                  const isT = ds === todayStr
                  const isSel = ds === localIsoDate(selectedDay)
                  const hasDots = appointments.some(a => localDateOf(a.starts_at) === ds)
                  return (
                    <button key={di} onClick={() => goToDay(miniYear, miniMonth, day)} style={{
                      width: '100%', aspectRatio: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: isSel || isT ? 700 : 400,
                      background: isSel ? 'var(--ink)' : isT ? 'var(--sage-tint)' : 'transparent',
                      color: isSel ? 'var(--page)' : isT ? 'var(--sage)' : 'var(--ink)',
                      position: 'relative',
                    }}>
                      {day}
                      {hasDots && !isSel && <span style={{ position:'absolute',bottom:2,width:4,height:4,borderRadius:'50%',background:'var(--sage)' }} />}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>

          {/* Upcoming today */}
          {(() => {
            const nowIso  = new Date().toISOString()
            const upcoming = [...dayAppts]
              .filter(a => a.starts_at > nowIso && a.status !== 'cancelled')
              .sort((a,b) => a.starts_at.localeCompare(b.starts_at))
              .slice(0, 4)
            if (!upcoming.length) return null
            return (
              <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: 14, overflow: 'hidden' }}>
                <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid var(--line-soft)' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Ближайшие</span>
                </div>
                {upcoming.map((a, i) => {
                  const name = [a.client?.first_name, a.client?.last_name].filter(Boolean).join(' ') || 'Клиент'
                  const st   = STATUS[a.status] ?? STATUS.pending
                  return (
                    <button key={a.id} onClick={() => setSelectedAppt(a)} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
                      width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
                      background: 'transparent', borderBottom: i < upcoming.length - 1 ? '1px solid var(--line-soft)' : 'none',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--sage-tint)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <div style={{ width:28,height:28,borderRadius:'50%',background:'var(--sage-tint)',color:'var(--sage)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,flexShrink:0 }}>
                        {name.charAt(0)}
                      </div>
                      <div style={{ flex:1,minWidth:0 }}>
                        <p style={{ fontSize:12,fontWeight:600,color:'var(--ink)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',margin:0 }}>{name}</p>
                        <p style={{ fontSize:10,color:'var(--muted)',margin:0 }}>{a.service?.name ?? '—'}</p>
                      </div>
                      <div style={{ display:'flex',alignItems:'center',gap:4,flexShrink:0 }}>
                        <span style={{ width:6,height:6,borderRadius:'50%',background:st.dot }} />
                        <span style={{ fontSize:11,fontFamily:'var(--font-mono)',color:'var(--muted)',fontWeight:600 }}>{fmtTime(a.starts_at)}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )
          })()}
        </div>
      </div>

      {/* ── Appointment detail modal ─────────────────────────────────── */}
      {selectedAppt && (
        <div
          style={{ position:'fixed',inset:0,zIndex:100,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(27,42,34,0.45)',backdropFilter:'blur(4px)',padding:16 }}
          onClick={e => { if (e.target===e.currentTarget) setSelectedAppt(null) }}
          onKeyDown={e => { if (e.key==='Escape') setSelectedAppt(null) }}
          tabIndex={-1}
        >
          <div style={{ background:'var(--page-alt)',borderRadius:20,width:'100%',maxWidth:480,padding:'22px',maxHeight:'85dvh',overflowY:'auto',boxShadow:'var(--shadow-hero)',border:'1px solid var(--card-border)' }}>
            <div style={{ display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:14 }}>
              <div style={{ display:'flex',alignItems:'center',gap:8 }}>
                <h2 style={{ fontFamily:'var(--font-display)',fontSize:20,fontWeight:600,color:'var(--ink)',margin:0 }}>Детали записи</h2>
                {selectedAppt.source === 'ai' && <AiBadge />}
              </div>
              <button onClick={() => setSelectedAppt(null)} className="sera-btn-icon"><X size={15}/></button>
            </div>

            {(() => {
              const st = STATUS[selectedAppt.status] ?? STATUS.pending
              return (
                <span className="sera-pill" style={{ background:st.bg,color:st.accent,marginBottom:12,display:'inline-flex',gap:5 }}>
                  <span style={{ width:6,height:6,borderRadius:'50%',background:st.accent,flexShrink:0,alignSelf:'center' }}/>{st.label}
                </span>
              )
            })()}

            <div style={{ display:'flex',flexDirection:'column',gap:10,marginBottom:14 }}>
              {[
                { label:'Клиент',    value:[selectedAppt.client?.first_name,selectedAppt.client?.last_name].filter(Boolean).join(' ')||'Клиент' },
                { label:'Услуга',    value:selectedAppt.service?.name??'—' },
                { label:'Мастер',    value:selectedAppt.master?.name??'—' },
                { label:'Начало',    value:new Date(selectedAppt.starts_at).toLocaleString('ru-RU',{dateStyle:'short',timeStyle:'short'}) },
                { label:'Конец',     value:fmtTime(selectedAppt.ends_at) },
                ...(selectedAppt.price!=null?[{label:'Стоимость',value:formatPrice(selectedAppt.price,'BYN')}]:[]),
                ...(selectedAppt.notes?[{label:'Заметки',value:selectedAppt.notes}]:[]),
              ].map(({label,value})=>(
                <div key={label} style={{ display:'flex',gap:10 }}>
                  <span style={{ fontSize:12,color:'var(--ink-2)',width:80,flexShrink:0 }}>{label}</span>
                  <span style={{ fontSize:13,fontWeight:600,color:'var(--ink)' }}>{value}</span>
                </div>
              ))}
            </div>

            <div style={{ display:'flex',flexDirection:'column',gap:6,marginBottom:14 }}>
              {selectedAppt.client?.phone && (
                <a href={`tel:${selectedAppt.client.phone}`} style={{ display:'flex',alignItems:'center',gap:6,fontSize:13,color:'var(--sage)',textDecoration:'none',fontWeight:500 }}>
                  <Phone size={14}/>{selectedAppt.client.phone}
                </a>
              )}
              {selectedAppt.client?.telegram_username && (
                <a href={`https://t.me/${selectedAppt.client.telegram_username}`} target="_blank" rel="noreferrer" style={{ display:'flex',alignItems:'center',gap:6,fontSize:13,color:'var(--sage)',textDecoration:'none',fontWeight:500 }}>
                  <MessageCircle size={14}/>@{selectedAppt.client.telegram_username}
                </a>
              )}
            </div>

            {selectedAppt.status !== 'cancelled' && selectedAppt.status !== 'completed' && (
              <div style={{ display:'flex',gap:8,flexWrap:'wrap',borderTop:'1px solid var(--line)',paddingTop:14 }}>
                {selectedAppt.status === 'pending' && (
                  <button onClick={()=>handleAction(selectedAppt.id,'confirmed')} className="sera-btn sera-btn--secondary" style={{ flex:1,gap:6 }}>
                    <CheckCircle size={14}/> Подтвердить
                  </button>
                )}
                <button onClick={()=>handleAction(selectedAppt.id,'completed')} className="sera-btn" style={{ flex:1,gap:6,background:'var(--success)',color:'#fff' }}>
                  <CheckCircle size={14}/> Завершить
                </button>
                <button onClick={()=>handleAction(selectedAppt.id,'cancelled')} className="sera-btn sera-btn--danger" style={{ flex:1,gap:6 }}>
                  <XCircle size={14}/> Отменить
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

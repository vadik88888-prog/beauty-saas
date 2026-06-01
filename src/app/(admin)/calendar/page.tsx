'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  ChevronLeft, ChevronRight, Calendar, X, Phone,
  MessageCircle, CheckCircle, XCircle, Sparkles, Plus,
} from 'lucide-react'
import { toast } from 'sonner'
import { AiBadge } from '@/components/shared/AiBadge'
import { SeraOrb } from '@/components/sera'

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
type Master        = { id: string; name: string }
type Category      = { id: string; name: string; icon: string | null; sort_order: number }
type WorkingHour   = { master_id: string; day_of_week: number; start_time: string; end_time: string; is_working: boolean }

// ── Constants ─────────────────────────────────────────────────────────────────

const HOUR_START = 9
const HOUR_END   = 21
const HOURS      = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i)
const SLOT_H     = 56  // px per hour

const STATUS: Record<string, { bg: string; accent: string; dot: string; label: string }> = {
  pending:   { bg: 'var(--gold-soft)',    accent: 'var(--gold)',    dot: 'var(--gold)',    label: 'Ожидает'       },
  confirmed: { bg: 'var(--sage-tint)',    accent: 'var(--sage)',    dot: 'var(--sage)',    label: 'Подтверждена'  },
  completed: { bg: 'var(--card-sunken)', accent: 'var(--muted-2)', dot: 'var(--muted-2)', label: 'Завершена'     },
  no_show:   { bg: 'var(--error-soft)',  accent: 'var(--error)',   dot: 'var(--error)',   label: 'No-show'       },
  cancelled: { bg: 'var(--error-soft)',  accent: 'var(--error)',   dot: 'var(--error)',   label: 'Отменена'      },
}

const DAYS_RU = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб']
const MONTHS_RU = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']
const MONTHS_GEN = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря']

// ── Helpers ───────────────────────────────────────────────────────────────────

function getMonday(d: Date): Date {
  const r = new Date(d)
  const day = r.getDay()
  r.setDate(r.getDate() - day + (day === 0 ? -6 : 1))
  r.setHours(0, 0, 0, 0)
  return r
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}

function isoDate(d: Date): string { return d.toISOString().slice(0, 10) }

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

function fmtDateLabel(d: Date): string {
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`
}

function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function getWorkMin(wh: WorkingHour[], masterId: string | null, d: Date): number {
  const dow = d.getDay()
  const rows = masterId
    ? wh.filter(w => w.master_id === masterId && w.day_of_week === dow && w.is_working)
    : wh.filter(w => w.day_of_week === dow && w.is_working)
  if (rows.length === 0) return 9 * 60  // fallback 9h
  return rows.reduce((s, w) => s + timeToMin(w.end_time) - timeToMin(w.start_time), 0)
}

// Apt position in the time grid
function apptStyle(a: Appointment): { top: number; height: number } {
  const s = new Date(a.starts_at), e = new Date(a.ends_at)
  const sh = s.getHours() + s.getMinutes() / 60
  const eh = e.getHours() + e.getMinutes() / 60
  return { top: (sh - HOUR_START) * SLOT_H, height: Math.max((eh - sh) * SLOT_H, 28) }
}

// Mini-calendar helpers
function calendarMonth(year: number, month: number): (number | null)[][] {
  const first = new Date(year, month, 1)
  let dow = first.getDay() - 1   // Mon=0
  if (dow < 0) dow = 6
  const days = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [...Array(dow).fill(null)]
  for (let i = 1; i <= days; i++) cells.push(i)
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks: (number | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const [view, setView]         = useState<'day' | 'week'>('day')
  const [selectedDay, setSelectedDay] = useState<Date>(() => new Date())
  const [weekStart, setWeekStart]     = useState<Date>(() => getMonday(new Date()))
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [masters, setMasters]     = useState<Master[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [workingHours, setWorkingHours] = useState<WorkingHour[]>([])
  const [selectedMasterId, setSelectedMasterId] = useState<string | null>(null)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null)
  const [miniYear, setMiniYear]   = useState(() => new Date().getFullYear())
  const [miniMonth, setMiniMonth] = useState(() => new Date().getMonth())

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const from = view === 'day'
    ? `${isoDate(selectedDay)}T00:00:00Z`
    : `${isoDate(weekStart)}T00:00:00Z`
  const to = view === 'day'
    ? `${isoDate(selectedDay)}T23:59:59Z`
    : `${isoDate(addDays(weekStart, 6))}T23:59:59Z`

  const load = useCallback(async () => {
    setIsLoading(true)
    const res = await fetch(`/api/admin/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
    const json = await res.json()
    setAppointments(json.appointments ?? [])
    setMasters(json.masters ?? [])
    setCategories(json.categories ?? [])
    setWorkingHours(json.working_hours ?? [])
    setIsLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to])

  useEffect(() => { load() }, [load])

  // Filtered appointments
  const filtered = appointments
    .filter(a => selectedMasterId     ? a.master?.id         === selectedMasterId     : true)
    .filter(a => selectedCategoryId   ? a.service?.category_id === selectedCategoryId : true)

  const byDay: Record<string, Appointment[]> = {}
  for (const a of filtered) {
    const k = a.starts_at.slice(0, 10)
    if (!byDay[k]) byDay[k] = []
    byDay[k].push(a)
  }

  // Right-rail stats for selectedDay
  const displayStr = isoDate(selectedDay)
  const dayAppts   = appointments.filter(a => a.starts_at.startsWith(displayStr))
  const busyMin    = dayAppts.reduce((s, a) =>
    s + (new Date(a.ends_at).getTime() - new Date(a.starts_at).getTime()) / 60000, 0)
  const workMin    = getWorkMin(workingHours, selectedMasterId, selectedDay)
  const loadPct    = Math.min(100, Math.round(busyMin / workMin * 100))
  const freeH      = Math.max(0, Math.floor((workMin - busyMin) / 60))
  const freeMin2   = Math.max(0, Math.round((workMin - busyMin) % 60))

  // PATCH appointment status
  async function handleAction(id: string, status: 'confirmed' | 'cancelled' | 'completed') {
    const res = await fetch(`/api/admin/appointments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (res.ok) {
      setAppointments(prev => prev.map(a => a.id === id ? { ...a, status } : a))
      setSelectedAppt(prev => prev?.id === id ? { ...prev, status } : prev)
      const msg = status === 'confirmed' ? 'Подтверждена' : status === 'completed' ? 'Завершена' : 'Отменена'
      toast.success(`Запись ${msg.toLowerCase()}`)
    } else {
      toast.error('Ошибка обновления')
    }
  }

  // Navigate
  function prev() {
    if (view === 'day') setSelectedDay(d => addDays(d, -1))
    else setWeekStart(d => addDays(d, -7))
  }
  function next() {
    if (view === 'day') setSelectedDay(d => addDays(d, 1))
    else setWeekStart(d => addDays(d, 7))
  }
  function goToday() {
    const t = new Date()
    setSelectedDay(t)
    setWeekStart(getMonday(t))
  }
  function goToDay(year: number, month: number, day: number) {
    const d = new Date(year, month, day)
    setSelectedDay(d)
    setWeekStart(getMonday(d))
    setView('day')
  }

  // Date range label
  const rangeLabel = view === 'day'
    ? `${selectedDay.getDate()} ${MONTHS_GEN[selectedDay.getMonth()]} ${selectedDay.getFullYear()}`
    : `${fmtDateLabel(weekDays[0])} – ${fmtDateLabel(weekDays[6])}`

  const todayStr = isoDate(new Date())

  // ── Appointment card in grid ──
  function ApptCard({ appt, compact = false }: { appt: Appointment; compact?: boolean }) {
    const st    = STATUS[appt.status] ?? STATUS.pending
    const name  = [appt.client?.first_name, appt.client?.last_name].filter(Boolean).join(' ') || 'Клиент'
    const { top, height } = apptStyle(appt)
    return (
      <div
        onClick={() => setSelectedAppt(appt)}
        style={{
          position: 'absolute',
          left: 2, right: 2,
          top, height,
          background: st.bg,
          borderLeft: `3px solid ${st.accent}`,
          borderRadius: '0 6px 6px 0',
          padding: compact ? '2px 5px' : '4px 7px',
          overflow: 'hidden',
          cursor: 'pointer',
          boxSizing: 'border-box',
          transition: 'filter 0.1s',
        }}
        onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(0.96)')}
        onMouseLeave={e => (e.currentTarget.style.filter = '')}
      >
        <p style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--muted)', lineHeight: 1, marginBottom: 2, tabularNums: true } as React.CSSProperties}>
          {fmtTime(appt.starts_at)}–{fmtTime(appt.ends_at)}
        </p>
        <p style={{ fontSize: compact ? 10 : 11, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {name}
        </p>
        {height > 44 && appt.service && (
          <p style={{ fontSize: 10, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
            {appt.service.name}
          </p>
        )}
        {height > 64 && appt.master && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
            <div style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--sage-tint)', color: 'var(--sage)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, flexShrink: 0 }}>
              {appt.master.name.charAt(0)}
            </div>
            <span style={{ fontSize: 9, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{appt.master.name}</span>
            {appt.source === 'ai' && <Sparkles size={9} style={{ color: 'var(--gold)', flexShrink: 0 }} />}
          </div>
        )}
      </div>
    )
  }

  // ── Time axis + content column ──
  function TimeGrid({ day, dayAppts, compact }: { day: Date; dayAppts: Appointment[]; compact?: boolean }) {
    return (
      <div style={{ position: 'relative', height: HOURS.length * SLOT_H }}>
        {HOURS.map(h => (
          <div key={h} style={{ position: 'absolute', width: '100%', top: (h - HOUR_START) * SLOT_H, borderTop: '1px solid var(--line-soft)', pointerEvents: 'none' }}>
            {!compact && <span style={{ position: 'absolute', left: -38, fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-mono)', lineHeight: 1, top: -6 }}>{String(h).padStart(2,'0')}:00</span>}
          </div>
        ))}
        {dayAppts.map(a => <ApptCard key={a.id} appt={a} compact={compact} />)}
      </div>
    )
  }

  // ── Day view ──
  function DayView() {
    const dayStr   = isoDate(selectedDay)
    const dayAppts = byDay[dayStr] ?? []
    return (
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {/* Time labels */}
        <div style={{ width: 48, flexShrink: 0, paddingTop: 8 }}>
          <TimeGrid day={selectedDay} dayAppts={[]} />
        </div>
        {/* Column */}
        <div style={{ flex: 1, paddingTop: 8, paddingLeft: 4, minWidth: 0 }}>
          <TimeGrid day={selectedDay} dayAppts={dayAppts} />
        </div>
      </div>
    )
  }

  // ── Week view ──
  function WeekView() {
    return (
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {/* Time labels */}
        <div style={{ width: 44, flexShrink: 0 }}>
          <div style={{ height: 36 }} />
          <div style={{ paddingTop: 8 }}>
            {HOURS.map(h => (
              <div key={h} style={{ height: SLOT_H, display: 'flex', alignItems: 'flex-start', paddingTop: 2 }}>
                <span style={{ fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>{String(h).padStart(2,'0')}:00</span>
              </div>
            ))}
          </div>
        </div>
        {/* Day columns */}
        {weekDays.map(day => {
          const ds      = isoDate(day)
          const isToday = ds === todayStr
          const appts   = byDay[ds] ?? []
          return (
            <div key={ds} style={{ flex: 1, minWidth: 0, borderLeft: '1px solid var(--line-soft)' }}>
              {/* Day header */}
              <div
                onClick={() => { setSelectedDay(day); setView('day') }}
                style={{
                  height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                  cursor: 'pointer', background: isToday ? 'var(--sage-tint)' : 'transparent',
                  borderBottom: '1px solid var(--line)', flexShrink: 0,
                }}
              >
                <span style={{ fontSize: 10, fontWeight: 700, color: isToday ? 'var(--sage)' : 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {DAYS_RU[day.getDay()]}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: isToday ? 'var(--sage)' : 'var(--ink)' }}>
                  {day.getDate()}
                </span>
              </div>
              <div style={{ position: 'relative', paddingTop: 8 }}>
                <TimeGrid day={day} dayAppts={appts} compact />
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // ── Mini calendar ──
  const weeks = calendarMonth(miniYear, miniMonth)
  const today = new Date()

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        height: '100%', overflow: 'hidden', minHeight: 0,
        display: 'flex', flexDirection: 'column',
        background: 'var(--page)', boxSizing: 'border-box',
      }}
    >

      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0, padding: '10px 16px',
        borderBottom: '1px solid var(--line)',
        background: 'var(--page-alt)',
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      }}>

        {/* Title */}
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600, color: 'var(--ink)', margin: 0, lineHeight: 1.1, whiteSpace: 'nowrap' }}>
          Расписание
        </h1>

        {/* Nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={prev} className="sera-btn-icon" aria-label="Назад"><ChevronLeft size={15} /></button>
          <button onClick={goToday} className="sera-btn sera-btn--secondary sera-btn--sm">Сегодня</button>
          <button onClick={next} className="sera-btn-icon" aria-label="Вперёд"><ChevronRight size={15} /></button>
          <span style={{ fontSize: 13, color: 'var(--muted)', marginLeft: 4, whiteSpace: 'nowrap' }}>{rangeLabel}</span>
        </div>

        {/* View toggle */}
        <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--line)', flexShrink: 0 }}>
          {(['day','week'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: '5px 12px', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
                background: view === v ? 'var(--ink)' : 'transparent',
                color:      view === v ? 'var(--page)' : 'var(--muted)',
                transition: 'all 0.15s',
              }}
            >
              {v === 'day' ? 'День' : 'Неделя'}
            </button>
          ))}
        </div>

        {/* Master filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          <button
            onClick={() => setSelectedMasterId(null)}
            style={{
              padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer',
              background: selectedMasterId === null ? 'var(--sage)' : 'var(--sage-tint)',
              color:      selectedMasterId === null ? '#fff' : 'var(--sage)',
            }}
          >
            Все мастера
          </button>
          {masters.map(m => (
            <button
              key={m.id}
              onClick={() => setSelectedMasterId(m.id)}
              style={{
                padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer',
                background: selectedMasterId === m.id ? 'var(--sage)' : 'var(--sage-tint)',
                color:      selectedMasterId === m.id ? '#fff' : 'var(--sage)',
              }}
            >
              {m.name}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {/* Primary action */}
        <button
          onClick={() => toast.info('Создание записи — в разработке')}
          className="sera-btn sera-btn--sera"
          style={{ gap: 6 }}
        >
          <Plus size={14} /> Новая запись
        </button>
      </div>

      {/* ── Category filter (only if categories exist) ──────────────── */}
      {categories.length > 0 && (
        <div style={{
          flexShrink: 0, padding: '6px 16px',
          borderBottom: '1px solid var(--line-soft)',
          background: 'var(--page-alt)',
          display: 'flex', alignItems: 'center', gap: 4, overflowX: 'auto',
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0, marginRight: 4 }}>Категория:</span>
          <button
            onClick={() => setSelectedCategoryId(null)}
            style={{
              padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
              background: selectedCategoryId === null ? 'var(--ink)' : 'var(--card)',
              color:      selectedCategoryId === null ? 'var(--page)' : 'var(--muted)',
              border: `1px solid ${selectedCategoryId === null ? 'transparent' : 'var(--line)'}`,
            }}
          >
            Все
          </button>
          {categories.map(c => (
            <button
              key={c.id}
              onClick={() => setSelectedCategoryId(c.id === selectedCategoryId ? null : c.id)}
              style={{
                padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
                background: selectedCategoryId === c.id ? 'var(--ink)' : 'var(--card)',
                color:      selectedCategoryId === c.id ? 'var(--page)' : 'var(--muted)',
                border: `1px solid ${selectedCategoryId === c.id ? 'transparent' : 'var(--line)'}`,
              }}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* ── Main content ─────────────────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden', gap: 8, padding: '8px 0 8px 8px' }}>

        {/* ── Calendar grid ─── */}
        <div style={{ flex: 1, minWidth: 0, background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

          {/* Status legend */}
          <div style={{ flexShrink: 0, padding: '7px 14px', borderBottom: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {Object.entries(STATUS).map(([key, s]) => (
              <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--muted)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
                {s.label}
              </span>
            ))}
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--gold)' }}>
              <Sparkles size={10} /> Через SERA
            </span>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>
              Записей: <strong style={{ color: 'var(--ink)' }}>{appointments.length}</strong>
            </span>
          </div>

          {isLoading ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 13 }}>
              Загрузка...
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
              <div style={{ height: '100%', width: `${loadPct}%`, background: loadPct > 80 ? 'var(--sage)' : 'var(--sage-2)', borderRadius: 3, transition: 'width 0.4s' }} />
            </div>
            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
              {Math.floor(busyMin / 60)}ч {Math.round(busyMin % 60)}м занято · {freeH}ч {freeMin2}м свободно
            </p>
          </div>

          {/* SERA insight — only when free slots */}
          {freeH > 0 && (
            <div style={{ background: 'var(--sage-tint)', border: '1px solid var(--sage-soft)', borderRadius: 14, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <SeraOrb state="online" size={32} />
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>Совет от SERA</p>
                  <p style={{ fontSize: 11, color: 'var(--sage)', margin: 0 }}>
                    {freeH} {freeH === 1 ? 'свободное окно' : 'свободных окна'}
                  </p>
                </div>
              </div>
              <p style={{ fontSize: 12, color: 'var(--ink2)', lineHeight: 1.5, marginBottom: 8 }}>
                Есть свободное время — хороший момент запустить акцию и заполнить расписание.
              </p>
              <button
                onClick={() => toast.info('Функция в разработке')}
                className="sera-btn sera-btn--secondary sera-btn--sm"
                style={{ width: '100%' }}
              >
                Предложить добор
              </button>
            </div>
          )}

          {/* Mini calendar */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: 14, padding: '12px 14px' }}>
            {/* Month nav */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <button
                onClick={() => {
                  if (miniMonth === 0) { setMiniMonth(11); setMiniYear(y => y - 1) }
                  else setMiniMonth(m => m - 1)
                }}
                className="sera-btn-icon" style={{ width: 24, height: 24 }}
              ><ChevronLeft size={12} /></button>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>
                {MONTHS_RU[miniMonth]} {miniYear}
              </span>
              <button
                onClick={() => {
                  if (miniMonth === 11) { setMiniMonth(0); setMiniYear(y => y + 1) }
                  else setMiniMonth(m => m + 1)
                }}
                className="sera-btn-icon" style={{ width: 24, height: 24 }}
              ><ChevronRight size={12} /></button>
            </div>

            {/* Day-of-week header */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 2 }}>
              {['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(d => (
                <span key={d} style={{ textAlign: 'center', fontSize: 9, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>{d}</span>
              ))}
            </div>

            {/* Days grid */}
            {weeks.map((week, wi) => (
              <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                {week.map((day, di) => {
                  if (!day) return <div key={di} />
                  const d = new Date(miniYear, miniMonth, day)
                  const ds = isoDate(d)
                  const isT = ds === todayStr
                  const isSel = ds === isoDate(selectedDay)
                  const hasAppts = appointments.some(a => a.starts_at.startsWith(ds))
                  return (
                    <button
                      key={di}
                      onClick={() => goToDay(miniYear, miniMonth, day)}
                      style={{
                        width: '100%', aspectRatio: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: isSel || isT ? 700 : 400,
                        background: isSel ? 'var(--ink)' : isT ? 'var(--sage-tint)' : 'transparent',
                        color: isSel ? 'var(--page)' : isT ? 'var(--sage)' : 'var(--ink)',
                        position: 'relative',
                      }}
                    >
                      {day}
                      {hasAppts && !isSel && (
                        <span style={{ position: 'absolute', bottom: 2, width: 4, height: 4, borderRadius: '50%', background: 'var(--sage)' }} />
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>

          {/* Upcoming today */}
          {view === 'day' && (() => {
            const nowIso = new Date().toISOString()
            const upcoming = [...dayAppts]
              .filter(a => a.starts_at > nowIso && a.status !== 'cancelled')
              .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
              .slice(0, 4)
            if (upcoming.length === 0) return null
            return (
              <div style={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: 14, overflow: 'hidden' }}>
                <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid var(--line-soft)' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Ближайшие</span>
                </div>
                {upcoming.map((a, i) => {
                  const name = [a.client?.first_name, a.client?.last_name].filter(Boolean).join(' ') || 'Клиент'
                  const st   = STATUS[a.status] ?? STATUS.pending
                  return (
                    <button
                      key={a.id}
                      onClick={() => setSelectedAppt(a)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
                        width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
                        background: 'transparent', borderBottom: i < upcoming.length - 1 ? '1px solid var(--line-soft)' : 'none',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--sage-tint)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--sage-tint)', color: 'var(--sage)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                        {name.charAt(0)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{name}</p>
                        <p style={{ fontSize: 10, color: 'var(--muted)', margin: 0 }}>{a.service?.name ?? '—'}</p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.dot }} />
                        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--muted)', fontWeight: 600 }}>{fmtTime(a.starts_at)}</span>
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
          style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(27,42,34,0.4)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setSelectedAppt(null) }}
        >
          <div style={{ background: 'var(--page-alt)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, padding: '20px', maxHeight: '85dvh', overflowY: 'auto', boxShadow: 'var(--shadow-hero)', border: '1px solid var(--card-border)' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>Детали записи</h2>
                {selectedAppt.source === 'ai' && <AiBadge />}
              </div>
              <button onClick={() => setSelectedAppt(null)} className="sera-btn-icon"><X size={15} /></button>
            </div>

            {/* Status */}
            {(() => {
              const st = STATUS[selectedAppt.status] ?? STATUS.pending
              return (
                <span className="sera-pill" style={{ background: st.bg, color: st.accent, marginBottom: 12, display: 'inline-flex' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.accent }} />{st.label}
                </span>
              )
            })()}

            {/* Details */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
              {[
                { label: 'Клиент',   value: [selectedAppt.client?.first_name, selectedAppt.client?.last_name].filter(Boolean).join(' ') || 'Клиент' },
                { label: 'Услуга',   value: selectedAppt.service?.name ?? '—' },
                { label: 'Мастер',   value: selectedAppt.master?.name ?? '—' },
                { label: 'Начало',   value: new Date(selectedAppt.starts_at).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) },
                { label: 'Конец',    value: fmtTime(selectedAppt.ends_at) },
                ...(selectedAppt.price != null ? [{ label: 'Стоимость', value: `${selectedAppt.price} руб.` }] : []),
                ...(selectedAppt.notes ? [{ label: 'Заметки', value: selectedAppt.notes }] : []),
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', gap: 10 }}>
                  <span style={{ fontSize: 12, color: 'var(--muted)', width: 80, flexShrink: 0 }}>{label}</span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{value}</span>
                </div>
              ))}
            </div>

            {/* Contacts */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
              {selectedAppt.client?.phone && (
                <a href={`tel:${selectedAppt.client.phone}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--sage)', textDecoration: 'none', fontWeight: 500 }}>
                  <Phone size={14} /> {selectedAppt.client.phone}
                </a>
              )}
              {selectedAppt.client?.telegram_username && (
                <a href={`https://t.me/${selectedAppt.client.telegram_username}`} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--sage)', textDecoration: 'none', fontWeight: 500 }}>
                  <MessageCircle size={14} /> @{selectedAppt.client.telegram_username}
                </a>
              )}
            </div>

            {/* Actions */}
            {selectedAppt.status !== 'cancelled' && selectedAppt.status !== 'completed' && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: '1px solid var(--line)', paddingTop: 14 }}>
                {selectedAppt.status === 'pending' && (
                  <button onClick={() => handleAction(selectedAppt.id, 'confirmed')} className="sera-btn sera-btn--secondary" style={{ flex: 1, gap: 6 }}>
                    <CheckCircle size={14} /> Подтвердить
                  </button>
                )}
                <button onClick={() => handleAction(selectedAppt.id, 'completed')} className="sera-btn" style={{ flex: 1, gap: 6, background: 'var(--success)', color: '#fff' }}>
                  <CheckCircle size={14} /> Завершить
                </button>
                <button onClick={() => handleAction(selectedAppt.id, 'cancelled')} className="sera-btn sera-btn--danger" style={{ flex: 1, gap: 6 }}>
                  <XCircle size={14} /> Отменить
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

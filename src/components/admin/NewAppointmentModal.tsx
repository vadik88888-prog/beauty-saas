'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Search, UserPlus, ChevronDown, AlertCircle, CheckCircle2 } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

type Service = {
  id: string
  name: string
  duration_min: number
  price: number | null
  currency: string
  buffer_after_min: number | null
  is_active: boolean
}

type MasterItem = { id: string; name: string }

type ClientResult = {
  id: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  telegram_username: string | null
}

type WorkingHour = {
  master_id: string
  day_of_week: number
  start_time: string
  end_time: string
  is_working: boolean
}

export type NewApptDefaults = {
  date: Date
  time?: string          // 'HH:MM'
  masterId?: string
  focusClient?: boolean
}

type Props = {
  isOpen: boolean
  onClose: () => void
  onCreated: (appt: unknown) => void
  defaultDate: Date
  defaultTime?: string
  defaultMasterId?: string
  allMasters: MasterItem[]
  workingHours: WorkingHour[]
  focusClient?: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeToMin(t: string): number { const [h, m] = t.split(':').map(Number); return h * 60 + m }

function localIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addMinToTime(time: string, mins: number): string {
  const total = Math.min(timeToMin(time) + mins, 23 * 60 + 59)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const INPUT: React.CSSProperties = {
  width: '100%', padding: '8px 10px',
  border: '1px solid var(--line)', borderRadius: 8,
  fontSize: 13, color: 'var(--ink)', background: 'var(--card)',
  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
}

const LABEL: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: 'var(--ink-2)',
  textTransform: 'uppercase', letterSpacing: '0.06em',
  marginBottom: 5, display: 'block',
}

// ── Component ─────────────────────────────────────────────────────────────────

export function NewAppointmentModal({
  isOpen, onClose, onCreated,
  defaultDate, defaultTime, defaultMasterId,
  allMasters, workingHours, focusClient,
}: Props) {

  // Client
  const [clientSearch,      setClientSearch]      = useState('')
  const [clientResults,     setClientResults]     = useState<ClientResult[]>([])
  const [showDropdown,      setShowDropdown]      = useState(false)
  const [selectedClient,    setSelectedClient]    = useState<ClientResult | null>(null)
  const [showNewClient,     setShowNewClient]     = useState(false)
  const [newFirst,          setNewFirst]          = useState('')
  const [newLast,           setNewLast]           = useState('')
  const [newPhone,          setNewPhone]          = useState('')
  const [newTg,             setNewTg]             = useState('')

  // Service / master
  const [services,          setServices]          = useState<Service[]>([])
  const [serviceId,         setServiceId]         = useState('')
  const [masterId,          setMasterId]          = useState('')
  const [filteredMasters,   setFilteredMasters]   = useState<MasterItem[]>([])

  // Date / time
  const [date,              setDate]              = useState('')
  const [startTime,         setStartTime]         = useState('')
  const [endTime,           setEndTime]           = useState('')

  // UX
  const [notes,             setNotes]             = useState('')
  const [conflictMsg,       setConflictMsg]       = useState('')
  const [validationError,   setValidationError]   = useState('')
  const [isSubmitting,      setIsSubmitting]      = useState(false)

  const clientInputRef = useRef<HTMLInputElement>(null)
  const searchTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Reset + fetch services on open ──
  useEffect(() => {
    if (!isOpen) return
    setClientSearch(''); setClientResults([]); setShowDropdown(false)
    setSelectedClient(null); setShowNewClient(false)
    setNewFirst(''); setNewLast(''); setNewPhone(''); setNewTg('')
    setServiceId(''); setMasterId(defaultMasterId ?? ''); setFilteredMasters(allMasters)
    setDate(localIsoDate(defaultDate)); setStartTime(defaultTime ?? ''); setEndTime('')
    setNotes(''); setConflictMsg(''); setValidationError('')
    fetch('/api/admin/services')
      .then(r => r.json())
      .then(j => setServices((j.data ?? []).filter((s: Service) => s.is_active !== false)))
    if (focusClient) setTimeout(() => clientInputRef.current?.focus(), 150)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // ── ESC ──
  useEffect(() => {
    if (!isOpen) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [isOpen, onClose])

  // ── Client search (debounced) ──
  function onClientSearchChange(val: string) {
    setClientSearch(val)
    setSelectedClient(null)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (!val.trim()) { setClientResults([]); setShowDropdown(false); return }
    searchTimer.current = setTimeout(async () => {
      const r = await fetch(`/api/admin/clients?search=${encodeURIComponent(val)}&limit=6`)
      const j = await r.json()
      setClientResults(j.data ?? [])
      setShowDropdown(true)
    }, 300)
  }

  function pickClient(c: ClientResult) {
    setSelectedClient(c)
    setClientSearch([c.first_name, c.last_name].filter(Boolean).join(' '))
    setShowDropdown(false); setClientResults([])
  }

  // ── Service change: recompute endTime + filter masters ──
  async function onServiceChange(sid: string) {
    setServiceId(sid)
    const svc = services.find(s => s.id === sid)
    if (svc && startTime) setEndTime(addMinToTime(startTime, svc.duration_min))
    else if (!svc) setEndTime('')

    if (!sid) { setFilteredMasters(allMasters); return }
    const r = await fetch(`/api/admin/masters?serviceId=${sid}`)
    const j = await r.json()
    const filtered = (j.data ?? []) as MasterItem[]
    const list = filtered.length > 0 ? filtered : allMasters
    setFilteredMasters(list)
    if (masterId && !list.find(m => m.id === masterId)) setMasterId('')
  }

  function onStartTimeChange(val: string) {
    setStartTime(val)
    const svc = services.find(s => s.id === serviceId)
    if (svc && val) setEndTime(addMinToTime(val, svc.duration_min))
  }

  // ── Working hours validation ──
  function workingHoursError(): string | null {
    if (!startTime || !endTime || !date) return null
    const dow = new Date(date + 'T12:00:00').getDay()
    const wh = masterId
      ? workingHours.filter(w => w.master_id === masterId && w.day_of_week === dow && w.is_working)
      : workingHours.filter(w => w.day_of_week === dow && w.is_working)
    const sMin = timeToMin(startTime), eMin = timeToMin(endTime)
    if (wh.length === 0) {
      if (dow === 0) return 'Воскресенье — выходной (по умолчанию)'
      if (sMin < 9 * 60 || eMin > 18 * 60) return 'Вне рабочих часов по умолчанию: 09:00–18:00'
      return null
    }
    const fits = wh.some(w => sMin >= timeToMin(w.start_time) && eMin <= timeToMin(w.end_time))
    if (!fits) return `Вне рабочего времени мастера: ${wh.map(w => `${w.start_time}–${w.end_time}`).join(', ')}`
    return null
  }

  // ── Submit ──
  async function handleSubmit() {
    setConflictMsg(''); setValidationError('')

    const hasClient = selectedClient || (showNewClient && newFirst.trim() && newPhone.trim())
    if (!hasClient)                              { setValidationError('Выберите или создайте клиента'); return }
    if (!serviceId)                              { setValidationError('Выберите услугу'); return }
    if (!masterId)                               { setValidationError('Выберите мастера'); return }
    if (!date || !startTime || !endTime)         { setValidationError('Укажите дату и время'); return }
    if (timeToMin(endTime) <= timeToMin(startTime)) { setValidationError('Конец должен быть позже начала'); return }
    const whErr = workingHoursError()
    if (whErr) { setValidationError(whErr); return }

    setIsSubmitting(true)
    let clientId = selectedClient?.id ?? null

    if (!clientId && showNewClient) {
      const cr = await fetch('/api/admin/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ first_name: newFirst.trim(), last_name: newLast.trim() || null, phone: newPhone.trim(), telegram_username: newTg.trim() || null }),
      })
      const cj = await cr.json()
      if (!cr.ok) { setValidationError(cj.error ?? 'Ошибка создания клиента'); setIsSubmitting(false); return }
      clientId = cj.data.id
    }

    const [y, mo, d] = date.split('-').map(Number)
    const [sh, sm]   = startTime.split(':').map(Number)
    const [eh, em]   = endTime.split(':').map(Number)
    const startsAt   = new Date(y, mo - 1, d, sh, sm).toISOString()
    const endsAt     = new Date(y, mo - 1, d, eh, em).toISOString()

    const ar = await fetch('/api/admin/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, serviceId, masterId, startsAt, endsAt, notes: notes.trim() || undefined }),
    })
    const aj = await ar.json()
    setIsSubmitting(false)

    if (!ar.ok) {
      if (ar.status === 409) setConflictMsg(aj.error ?? 'Время занято у мастера')
      else setValidationError(aj.error ?? 'Ошибка')
      return
    }

    onCreated(aj.data)
    onClose()
  }

  if (!isOpen) return null

  const svc = services.find(s => s.id === serviceId)

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(27,42,34,0.45)', backdropFilter: 'blur(4px)', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'var(--page-alt)', borderRadius: 20, width: '100%', maxWidth: 540, padding: '22px', maxHeight: '90dvh', overflowY: 'auto', boxShadow: 'var(--shadow-hero)', border: '1px solid var(--card-border)' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>Новая запись</h2>
          <button onClick={onClose} className="sera-btn-icon"><X size={15} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* ── Client ── */}
          <div>
            <label style={LABEL}>Клиент <span style={{ color: 'var(--error)' }}>*</span></label>

            {!showNewClient ? (
              <div style={{ position: 'relative' }}>
                {/* Search input */}
                <div style={{ position: 'relative' }}>
                  <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
                  <input
                    ref={clientInputRef}
                    value={clientSearch}
                    onChange={e => onClientSearchChange(e.target.value)}
                    onFocus={() => { if (clientResults.length) setShowDropdown(true) }}
                    onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                    placeholder="Поиск по имени или телефону..."
                    style={{ ...INPUT, paddingLeft: 30, borderColor: selectedClient ? 'var(--sage)' : 'var(--line)' }}
                  />
                </div>

                {/* Dropdown */}
                {showDropdown && clientResults.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10, boxShadow: 'var(--shadow-md)', zIndex: 10, marginTop: 2, maxHeight: 200, overflowY: 'auto' }}>
                    {clientResults.map(c => (
                      <button
                        key={c.id}
                        onMouseDown={() => pickClient(c)}
                        style={{ display: 'flex', flexDirection: 'column', width: '100%', padding: '9px 12px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid var(--line-soft)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--sage-tint)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                          {[c.first_name, c.last_name].filter(Boolean).join(' ')}
                        </span>
                        {c.phone && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{c.phone}</span>}
                      </button>
                    ))}
                  </div>
                )}

                {/* Selected badge */}
                {selectedClient && (
                  <div style={{ marginTop: 6, padding: '7px 10px', background: 'var(--sage-tint)', borderRadius: 8, border: '1px solid var(--sage-soft)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--sage)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                      {(selectedClient.first_name ?? '?').charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{[selectedClient.first_name, selectedClient.last_name].filter(Boolean).join(' ')}</p>
                      {selectedClient.phone && <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)' }}>{selectedClient.phone}</p>}
                    </div>
                    <button onClick={() => { setSelectedClient(null); setClientSearch('') }} className="sera-btn-icon" style={{ width: 22, height: 22 }}><X size={11} /></button>
                  </div>
                )}

                <button onClick={() => setShowNewClient(true)} style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 7, fontSize: 12, color: 'var(--sage)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                  <UserPlus size={13} /> Новый клиент
                </button>
              </div>
            ) : (
              /* New client mini-form */
              <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10, padding: '12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>Новый клиент</span>
                  <button onClick={() => setShowNewClient(false)} style={{ fontSize: 11, color: 'var(--sage)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>← Найти существующего</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <input value={newFirst} onChange={e => setNewFirst(e.target.value)} placeholder="Имя *" style={INPUT} />
                  <input value={newLast}  onChange={e => setNewLast(e.target.value)}  placeholder="Фамилия"     style={INPUT} />
                </div>
                <input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="Телефон *" style={INPUT} />
                <input value={newTg}    onChange={e => setNewTg(e.target.value)}    placeholder="Telegram (без @, необязательно)" style={INPUT} />
              </div>
            )}
          </div>

          {/* ── Service ── */}
          <div>
            <label style={LABEL}>Услуга <span style={{ color: 'var(--error)' }}>*</span></label>
            <div style={{ position: 'relative' }}>
              <select value={serviceId} onChange={e => onServiceChange(e.target.value)} style={{ ...INPUT, appearance: 'none', paddingRight: 28 }}>
                <option value="">Выберите услугу...</option>
                {services.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.duration_min ? ` · ${s.duration_min} мин` : ''}
                    {s.price != null ? ` · ${s.price} ${s.currency}` : ''}
                  </option>
                ))}
              </select>
              <ChevronDown size={13} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
            </div>
            {svc && (
              <p style={{ fontSize: 11, color: 'var(--sage)', marginTop: 4 }}>
                {svc.duration_min} мин{svc.price != null ? ` · ${svc.price} ${svc.currency}` : ''}
              </p>
            )}
          </div>

          {/* ── Master ── */}
          <div>
            <label style={LABEL}>Мастер <span style={{ color: 'var(--error)' }}>*</span></label>
            <div style={{ position: 'relative' }}>
              <select value={masterId} onChange={e => setMasterId(e.target.value)} style={{ ...INPUT, appearance: 'none', paddingRight: 28 }}>
                <option value="">Выберите мастера...</option>
                {filteredMasters.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <ChevronDown size={13} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
            </div>
          </div>

          {/* ── Date + time ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 10 }}>
            <div>
              <label style={LABEL}>Дата <span style={{ color: 'var(--error)' }}>*</span></label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={INPUT} />
            </div>
            <div>
              <label style={LABEL}>Начало <span style={{ color: 'var(--error)' }}>*</span></label>
              <input type="time" value={startTime} onChange={e => onStartTimeChange(e.target.value)} style={INPUT} />
            </div>
            <div>
              <label style={LABEL}>Конец</label>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} style={{ ...INPUT, color: endTime ? 'var(--ink)' : 'var(--muted-2)' }} />
            </div>
          </div>

          {/* Status note */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px', background: 'var(--sage-tint)', borderRadius: 8, border: '1px solid var(--sage-soft)' }}>
            <CheckCircle2 size={14} style={{ color: 'var(--sage)', flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: 'var(--sage)' }}>Статус <strong>«Подтверждена»</strong> — клиент приглашён, SERA не отмечается</span>
          </div>

          {/* Notes */}
          <div>
            <label style={LABEL}>Комментарий</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Пожелания клиента или особые требования..."
              style={{ ...INPUT, resize: 'none', lineHeight: 1.5 }}
            />
          </div>

          {/* Error banner */}
          {(conflictMsg || validationError) && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', background: 'var(--error-soft)', border: '1px solid var(--error)', borderRadius: 10 }}>
              <AlertCircle size={15} style={{ color: 'var(--error)', flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 13, color: 'var(--error)', lineHeight: 1.4 }}>{conflictMsg || validationError}</span>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, paddingTop: 2 }}>
            <button onClick={onClose} className="sera-btn sera-btn--secondary" style={{ flex: 1 }}>Отмена</button>
            <button onClick={handleSubmit} disabled={isSubmitting} className="sera-btn sera-btn--sera" style={{ flex: 2, opacity: isSubmitting ? 0.7 : 1 }}>
              {isSubmitting ? 'Создаём...' : 'Создать запись'}
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}

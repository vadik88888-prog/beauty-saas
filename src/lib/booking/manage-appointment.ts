/**
 * Shared library for cancel/reschedule operations.
 * Used by both:
 *   - API endpoint /api/appointments/[id] (для UI кнопок в TMA)
 *   - AI tools cancel_appointment / reschedule_appointment
 *
 * Centralizes:
 *   - min_cancel_hours threshold check
 *   - slot conflict detection (with buffer_after_min)
 *   - tenant_id + client_id authorization
 *   - returns structured error codes
 */

import { createAdminClient } from '@/lib/supabase/admin'

export type ManageResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; code: ManageErrorCode; hint?: string }

export type ManageErrorCode =
  | 'not_found'
  | 'forbidden'
  | 'too_late'
  | 'wrong_status'
  | 'slot_taken'
  | 'invalid_date'
  | 'server_error'

interface ApptRow {
  id: string
  tenant_id: string
  client_id: string
  master_id: string
  service_id: string
  starts_at: string
  ends_at: string
  status: string
  price: number | null
  notes: string | null
  services: { duration_min: number; buffer_after_min: number | null } | { duration_min: number; buffer_after_min: number | null }[] | null
  master: { name: string } | { name: string }[] | null
}

async function loadAppointment(apptId: string, tenantId: string): Promise<ApptRow | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('appointments')
    .select(`
      id, tenant_id, client_id, master_id, service_id, starts_at, ends_at, status, price, notes,
      services(duration_min, buffer_after_min),
      master:masters(name)
    `)
    .eq('id', apptId)
    .eq('tenant_id', tenantId)
    .single()
  return (data as ApptRow | null) ?? null
}

async function getMinCancelHours(tenantId: string): Promise<number> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('tenant_ai_settings')
    .select('min_cancel_hours')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  return (data as { min_cancel_hours?: number } | null)?.min_cancel_hours ?? 1
}

function isAppointmentEditable(startsAt: string, minHours: number): { ok: true } | { ok: false; hoursLeft: number } {
  const startsMs = new Date(startsAt).getTime()
  const nowMs = Date.now()
  const hoursLeft = (startsMs - nowMs) / 3_600_000
  if (hoursLeft < minHours) return { ok: false, hoursLeft }
  return { ok: true }
}

// ──────────── CANCEL ────────────

export async function cancelAppointment(opts: {
  appointmentId: string
  tenantId: string
  clientId?: string  // omit для admin/staff scope
  reason?: string
  bypassTimeCheck?: boolean  // admin может отменить любое время
}): Promise<ManageResult<{ cancelled_at: string }>> {
  const { appointmentId, tenantId, clientId, reason, bypassTimeCheck } = opts
  const supabase = createAdminClient()

  const appt = await loadAppointment(appointmentId, tenantId)
  if (!appt) return { success: false, error: 'Запись не найдена', code: 'not_found' }
  if (clientId && appt.client_id !== clientId) {
    return { success: false, error: 'Это не ваша запись', code: 'forbidden' }
  }
  if (!['pending', 'confirmed'].includes(appt.status)) {
    return { success: false, error: `Запись в статусе «${appt.status}» — нельзя отменить`, code: 'wrong_status' }
  }

  if (!bypassTimeCheck) {
    const minHours = await getMinCancelHours(tenantId)
    const editable = isAppointmentEditable(appt.starts_at, minHours)
    if (!editable.ok) {
      return {
        success: false,
        error: `Отменить можно минимум за ${minHours} ч до записи. До неё осталось ${Math.max(0, Math.round(editable.hoursLeft * 10) / 10)} ч`,
        code: 'too_late',
        hint: `Свяжитесь с администратором`,
      }
    }
  }

  const cancelledAt = new Date().toISOString()
  const { error } = await supabase
    .from('appointments')
    .update({
      status: 'cancelled',
      cancelled_at: cancelledAt,
      cancel_reason: reason ?? 'Отменено клиентом',
    })
    .eq('id', appointmentId)

  if (error) return { success: false, error: 'Не удалось отменить', code: 'server_error' }
  return { success: true, data: { cancelled_at: cancelledAt } }
}

// ──────────── RESCHEDULE ────────────

export async function rescheduleAppointment(opts: {
  appointmentId: string
  tenantId: string
  clientId?: string
  newStartsAt: string  // ISO datetime UTC
  note?: string  // optional client message to the master, appended to notes
  bypassTimeCheck?: boolean
}): Promise<ManageResult<{ starts_at: string; ends_at: string }>> {
  const { appointmentId, tenantId, clientId, newStartsAt, note, bypassTimeCheck } = opts
  const supabase = createAdminClient()

  const appt = await loadAppointment(appointmentId, tenantId)
  if (!appt) return { success: false, error: 'Запись не найдена', code: 'not_found' }
  if (clientId && appt.client_id !== clientId) {
    return { success: false, error: 'Это не ваша запись', code: 'forbidden' }
  }
  if (!['pending', 'confirmed'].includes(appt.status)) {
    return { success: false, error: `Запись в статусе «${appt.status}» — нельзя перенести`, code: 'wrong_status' }
  }

  if (!bypassTimeCheck) {
    const minHours = await getMinCancelHours(tenantId)
    const editable = isAppointmentEditable(appt.starts_at, minHours)
    if (!editable.ok) {
      return {
        success: false,
        error: `Перенести можно минимум за ${minHours} ч до записи`,
        code: 'too_late',
        hint: 'Свяжитесь с администратором',
      }
    }
  }

  const newStart = new Date(newStartsAt)
  if (isNaN(newStart.getTime())) {
    return { success: false, error: 'Неверная дата', code: 'invalid_date' }
  }
  if (newStart.getTime() < Date.now() + 30 * 60_000) {
    return { success: false, error: 'Нельзя перенести в прошлое или менее чем за 30 минут', code: 'invalid_date' }
  }

  // Service params
  const svc = Array.isArray(appt.services) ? appt.services[0] : appt.services
  const durationMin = svc?.duration_min ?? 60
  const bufferMin = svc?.buffer_after_min ?? 0

  const newEnd = new Date(newStart.getTime() + durationMin * 60_000)
  const newEndWithBuffer = new Date(newStart.getTime() + (durationMin + bufferMin) * 60_000)

  // Check overlap with other appointments of the same master (excluding self)
  const { data: overlapping } = await supabase
    .from('appointments')
    .select('id, starts_at, ends_at')
    .eq('master_id', appt.master_id)
    .eq('tenant_id', tenantId)
    .neq('id', appointmentId)
    .in('status', ['pending', 'confirmed'])
    .lt('starts_at', newEndWithBuffer.toISOString())
    .gt('ends_at', newStart.toISOString())
    .limit(1)

  if (overlapping && overlapping.length > 0) {
    return {
      success: false,
      error: 'Это время уже занято',
      code: 'slot_taken',
      hint: 'Выберите другое время',
    }
  }

  // Append the client's optional message to the master onto the notes field,
  // preserving the original booking note.
  const trimmedNote = note?.trim()
  const mergedNotes = trimmedNote
    ? [appt.notes?.trim(), `↻ Перенос: ${trimmedNote}`].filter(Boolean).join('\n')
    : undefined

  const { error } = await supabase
    .from('appointments')
    .update({
      starts_at: newStart.toISOString(),
      ends_at: newEnd.toISOString(),
      updated_at: new Date().toISOString(),
      ...(mergedNotes !== undefined ? { notes: mergedNotes } : {}),
    })
    .eq('id', appointmentId)

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: 'Это время уже занято', code: 'slot_taken' }
    }
    return { success: false, error: 'Не удалось перенести', code: 'server_error' }
  }

  return { success: true, data: { starts_at: newStart.toISOString(), ends_at: newEnd.toISOString() } }
}

// ──────────── FUZZY RESOLVE ────────────

/**
 * Find a client's appointment by free-form hint ("на пятницу", "маникюр на завтра").
 * Returns nearest upcoming match if id not provided.
 * Used by AI tools when user says "отмени запись" without specifying which.
 */
export async function resolveClientAppointment(opts: {
  tenantId: string
  clientId: string
  hint?: string  // optional: date / service / master keywords
}): Promise<{ id: string; starts_at: string; service_name: string; master_name: string } | null> {
  const supabase = createAdminClient()
  const nowIso = new Date().toISOString()

  const { data } = await supabase
    .from('appointments')
    .select(`
      id, starts_at, status,
      service:services(name),
      master:masters(name)
    `)
    .eq('tenant_id', opts.tenantId)
    .eq('client_id', opts.clientId)
    .in('status', ['pending', 'confirmed'])
    .gte('starts_at', nowIso)
    .order('starts_at', { ascending: true })
    .limit(20)

  type Row = {
    id: string; starts_at: string; status: string
    service: { name: string } | { name: string }[] | null
    master: { name: string } | { name: string }[] | null
  }
  const rows = (data ?? []) as Row[]
  if (rows.length === 0) return null

  function asName(v: { name: string } | { name: string }[] | null): string {
    if (!v) return ''
    if (Array.isArray(v)) return v[0]?.name ?? ''
    return v.name
  }

  // If hint provided — try keyword match by service/master/date
  if (opts.hint) {
    const hintLower = opts.hint.toLowerCase()
    const matched = rows.find(r => {
      const svc = asName(r.service).toLowerCase()
      const m = asName(r.master).toLowerCase()
      return svc.includes(hintLower) || m.includes(hintLower) || hintLower.includes(svc) || hintLower.includes(m)
    })
    if (matched) {
      return {
        id: matched.id,
        starts_at: matched.starts_at,
        service_name: asName(matched.service),
        master_name: asName(matched.master),
      }
    }
  }

  // Fallback: nearest upcoming
  const first = rows[0]
  return {
    id: first.id,
    starts_at: first.starts_at,
    service_name: asName(first.service),
    master_name: asName(first.master),
  }
}

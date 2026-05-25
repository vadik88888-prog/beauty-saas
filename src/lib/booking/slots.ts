import { addMinutes, getDayOfWeek } from '@/lib/utils/date'
import type { WorkingHours, TimeOff } from '@/types/database'

export interface TimeSlot {
  datetime: Date
  masterId: string
  masterName: string
  masterPhotoUrl: string | null
}

interface Appointment {
  starts_at: string
  ends_at: string
}

interface Master {
  id: string
  name: string
  photo_url: string | null
}

interface SlotInput {
  master: Master
  workingHours: WorkingHours[]
  timeOff: TimeOff[]
  existingAppointments: Appointment[]
  serviceDurationMin: number
  date: Date
  slotStepMin?: number
  timezoneOffsetHours?: number
}

/**
 * Calculate available time slots for a master on a given date.
 * All times are in UTC — conversion happens on client via tenant.timezone.
 */
export function calculateAvailableSlots({
  master,
  workingHours,
  timeOff,
  existingAppointments,
  serviceDurationMin,
  date,
  slotStepMin = 30,
  timezoneOffsetHours = 0,
}: SlotInput): TimeSlot[] {
  const dayOfWeek = getDayOfWeek(date)

  // 1. Find working hours for this day
  const masterHours = workingHours.filter(wh => wh.master_id === master.id)
  let todayHours = masterHours.find(wh => wh.day_of_week === dayOfWeek)

  // Fallback: if no working hours configured at all, use default Mon-Sat 9:00-18:00
  if (!todayHours && masterHours.length === 0 && dayOfWeek <= 5) {
    todayHours = {
      master_id: master.id,
      day_of_week: dayOfWeek,
      start_time: '09:00',
      end_time: '18:00',
      is_working: true,
    } as WorkingHours
  }

  if (!todayHours || !todayHours.is_working) return []

  // 2. Check full-day time off
  const fullDayOff = timeOff.find(
    t =>
      t.date === date.toISOString().slice(0, 10) &&
      (t.master_id === master.id || t.master_id === null) &&
      t.start_time === null
  )
  if (fullDayOff) return []

  // 3. Generate slot candidates
  const [startH, startM] = todayHours.start_time.split(':').map(Number)
  const [endH, endM] = todayHours.end_time.split(':').map(Number)

  const off = Math.round(timezoneOffsetHours)
  const dayStart = new Date(date)
  dayStart.setUTCHours(startH - off, startM, 0, 0)

  const dayEnd = new Date(date)
  dayEnd.setUTCHours(endH - off, endM, 0, 0)

  const minimumBookingTime = new Date(Date.now() + 60 * 60 * 1000) // 1 hour from now
  const slots: TimeSlot[] = []

  let current = new Date(dayStart)

  while (current < dayEnd) {
    const slotEnd = addMinutes(current, serviceDurationMin)

    // Slot must fit within working hours
    if (slotEnd > dayEnd) break

    // Must be at least 1 hour in the future
    if (current < minimumBookingTime) {
      current = addMinutes(current, slotStepMin)
      continue
    }

    // Check overlap with existing appointments
    const hasConflict = existingAppointments.some(appt => {
      const apptStart = new Date(appt.starts_at)
      const apptEnd = new Date(appt.ends_at)
      return current < apptEnd && slotEnd > apptStart
    })

    // Check partial time-off
    const hasTimeOff = timeOff.some(t => {
      if (t.date !== date.toISOString().slice(0, 10)) return false
      if (t.master_id !== master.id && t.master_id !== null) return false
      if (!t.start_time || !t.end_time) return false

      const [offStartH, offStartM] = t.start_time.split(':').map(Number)
      const [offEndH, offEndM] = t.end_time.split(':').map(Number)
      const offStart = new Date(date)
      offStart.setHours(offStartH, offStartM, 0, 0)
      const offEnd = new Date(date)
      offEnd.setHours(offEndH, offEndM, 0, 0)

      return current < offEnd && slotEnd > offStart
    })

    if (!hasConflict && !hasTimeOff) {
      slots.push({
        datetime: new Date(current),
        masterId: master.id,
        masterName: master.name,
        masterPhotoUrl: master.photo_url,
      })
    }

    current = addMinutes(current, slotStepMin)
  }

  return slots
}

/** Group slots by date string for display */
export function groupSlotsByDate(slots: TimeSlot[]): Map<string, TimeSlot[]> {
  const grouped = new Map<string, TimeSlot[]>()
  for (const slot of slots) {
    const key = slot.datetime.toISOString().slice(0, 10)
    const existing = grouped.get(key) ?? []
    existing.push(slot)
    grouped.set(key, existing)
  }
  return grouped
}

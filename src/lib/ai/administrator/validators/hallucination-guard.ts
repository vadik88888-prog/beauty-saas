import type { ToolResult, SalonSnapshot } from '@/lib/ai/administrator/types'
import { getUTCOffsetHours } from '@/lib/utils/date'

// Tracks which data was actually retrieved via tools in this turn (or seeded from snapshot).
export class HallucinationGuard {
  private retrievedServiceIds = new Set<string>()
  private retrievedMasterIds = new Set<string>()
  private retrievedSlots = new Set<string>()
  // Plain-text facts for response validation
  private knownServiceNames = new Set<string>()
  private knownMasterNames = new Set<string>()
  private knownSlotTimes = new Set<string>() // "HH:MM" in tenant's local time
  private tzOffsetHours: number

  constructor(opts?: { timezone?: string; snapshot?: SalonSnapshot }) {
    this.tzOffsetHours = opts?.timezone
      ? getUTCOffsetHours(opts.timezone)
      : 3  // fallback Europe/Minsk

    // Seed snapshot: services/masters from snapshot are AUTOMATICALLY known to AI,
    // so AI mentioning them is NOT hallucination
    if (opts?.snapshot) {
      for (const s of opts.snapshot.services) {
        this.retrievedServiceIds.add(s.id)
        this.knownServiceNames.add(s.name.toLowerCase().trim())
      }
      for (const m of opts.snapshot.masters) {
        this.retrievedMasterIds.add(m.id)
        this.knownMasterNames.add(m.name.toLowerCase().trim())
      }
    }
  }

  // Feed tool results into the guard after each tool call
  ingest(toolResults: ToolResult[]): void {
    for (const result of toolResults) {
      if (!result.success || !result.data) continue

      const data = result.data as Record<string, unknown>

      // Track service IDs and names
      if (Array.isArray(data.services)) {
        for (const s of data.services as Array<{ id?: string; name?: string }>) {
          if (s.id) this.retrievedServiceIds.add(s.id)
          if (s.name) this.knownServiceNames.add(s.name.toLowerCase().trim())
        }
      }

      // Track single service name (e.g. from get_available_slots response)
      if (typeof data.service_name === 'string') {
        this.knownServiceNames.add((data.service_name as string).toLowerCase().trim())
      }

      // Track master IDs and names
      if (Array.isArray(data.masters)) {
        for (const m of data.masters as Array<{ id?: string; name?: string }>) {
          if (m.id) this.retrievedMasterIds.add(m.id)
          if (m.name) this.knownMasterNames.add(m.name.toLowerCase().trim())
        }
      }

      // Track masters_checked array (from get_available_slots fallback)
      if (Array.isArray(data.masters_checked)) {
        for (const name of data.masters_checked as string[]) {
          if (typeof name === 'string') this.knownMasterNames.add(name.toLowerCase().trim())
        }
      }

      // Track available slot datetimes and HH:MM forms.
      // Supports both old format { datetime } and new format { time, starts_at_utc }.
      if (Array.isArray(data.slots)) {
        for (const s of data.slots as Array<{ datetime?: string; starts_at_utc?: string; time?: string; master_name?: string }>) {
          // New format: time is already local "HH:MM"
          if (s.time && /^\d{1,2}:\d{2}$/.test(s.time)) {
            const [h, m] = s.time.split(':')
            this.knownSlotTimes.add(`${h.padStart(2, '0')}:${m}`)
          }
          // UTC datetime (old field or new starts_at_utc) → extract both UTC and local HH:MM
          const utcStr = s.datetime ?? s.starts_at_utc
          if (utcStr) {
            this.retrievedSlots.add(utcStr)
            try {
              const d = new Date(utcStr)
              const hh = String(d.getUTCHours()).padStart(2, '0')
              const mm = String(d.getUTCMinutes()).padStart(2, '0')
              this.knownSlotTimes.add(`${hh}:${mm}`)
              const localD = new Date(d.getTime() + this.tzOffsetHours * 3600_000)
              const lh = String(localD.getUTCHours()).padStart(2, '0')
              const lm = String(localD.getUTCMinutes()).padStart(2, '0')
              this.knownSlotTimes.add(`${lh}:${lm}`)
            } catch { /* ignore */ }
          }
          if (s.master_name) this.knownMasterNames.add(s.master_name.toLowerCase().trim())
        }
      }
    }
  }

  getKnownServiceNames(): Set<string> { return this.knownServiceNames }
  getKnownMasterNames(): Set<string> { return this.knownMasterNames }
  getKnownSlotTimes(): Set<string> { return this.knownSlotTimes }

  // Verify that a service ID was actually retrieved this turn
  isServiceKnown(serviceId: string): boolean {
    return this.retrievedServiceIds.has(serviceId)
  }

  // Verify that a master ID was actually retrieved this turn
  isMasterKnown(masterId: string): boolean {
    return this.retrievedMasterIds.has(masterId)
  }

  // Verify that a slot datetime was actually retrieved this turn
  isSlotKnown(datetime: string): boolean {
    return this.retrievedSlots.has(datetime)
  }

  hasAnyData(): boolean {
    return (
      this.retrievedServiceIds.size > 0 ||
      this.retrievedMasterIds.size > 0 ||
      this.retrievedSlots.size > 0
    )
  }
}

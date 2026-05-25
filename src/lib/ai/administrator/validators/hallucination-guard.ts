import type { ToolResult } from '@/lib/ai/administrator/types'

// Tracks which data was actually retrieved via tools in this turn
export class HallucinationGuard {
  private retrievedServiceIds = new Set<string>()
  private retrievedMasterIds = new Set<string>()
  private retrievedSlots = new Set<string>()
  // Plain-text facts for response validation
  private knownServiceNames = new Set<string>()
  private knownMasterNames = new Set<string>()
  private knownSlotTimes = new Set<string>() // "HH:MM" in local tenant time

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

      // Track available slot datetimes and HH:MM forms
      if (Array.isArray(data.slots)) {
        for (const s of data.slots as Array<{ datetime?: string; master_name?: string }>) {
          if (s.datetime) {
            this.retrievedSlots.add(s.datetime)
            // Extract HH:MM in UTC — frontend will display in local tz, but matching by HH:MM
            // is a soft heuristic: we extract both UTC and what server local would render
            try {
              const d = new Date(s.datetime)
              const hh = String(d.getUTCHours()).padStart(2, '0')
              const mm = String(d.getUTCMinutes()).padStart(2, '0')
              this.knownSlotTimes.add(`${hh}:${mm}`)
              // Also add Europe/Minsk view (UTC+3)
              const localD = new Date(d.getTime() + 3 * 3600_000)
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

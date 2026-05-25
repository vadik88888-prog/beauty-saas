import type { ToolResult } from '@/lib/ai/administrator/types'

// Tracks which data was actually retrieved via tools in this turn
export class HallucinationGuard {
  private retrievedServiceIds = new Set<string>()
  private retrievedMasterIds = new Set<string>()
  private retrievedSlots = new Set<string>()

  // Feed tool results into the guard after each tool call
  ingest(toolResults: ToolResult[]): void {
    for (const result of toolResults) {
      if (!result.success || !result.data) continue

      const data = result.data as Record<string, unknown>

      // Track service IDs
      if (Array.isArray(data.services)) {
        for (const s of data.services as Array<{ id?: string }>) {
          if (s.id) this.retrievedServiceIds.add(s.id)
        }
      }

      // Track master IDs
      if (Array.isArray(data.masters)) {
        for (const m of data.masters as Array<{ id?: string }>) {
          if (m.id) this.retrievedMasterIds.add(m.id)
        }
      }

      // Track available slot datetimes
      if (Array.isArray(data.slots)) {
        for (const s of data.slots as Array<{ datetime?: string }>) {
          if (s.datetime) this.retrievedSlots.add(s.datetime)
        }
      }
    }
  }

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

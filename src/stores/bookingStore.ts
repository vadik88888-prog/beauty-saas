import { create } from 'zustand'
import type { Service, Master } from '@/types/database'

export interface BookingState {
  service: Service | null
  master: Master | null
  selectedSlot: { datetime: string; masterId: string; masterName: string } | null

  setService: (service: Service) => void
  setMaster: (master: Master | null) => void
  setSlot: (slot: { datetime: string; masterId: string; masterName: string }) => void
  reset: () => void
}

export const useBookingStore = create<BookingState>(set => ({
  service: null,
  master: null,
  selectedSlot: null,

  setService: service => set({ service, master: null, selectedSlot: null }),
  setMaster: master => set({ master }),
  setSlot: slot => set({ selectedSlot: slot }),
  reset: () => set({ service: null, master: null, selectedSlot: null }),
}))

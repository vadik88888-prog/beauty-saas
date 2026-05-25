const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

export function formatDate(isoString: string): string {
  const d = new Date(isoString)
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  if (isSameDay(d, today)) return 'Сегодня'
  if (isSameDay(d, tomorrow)) return 'Завтра'

  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

export function formatTime(isoString: string): string {
  const d = new Date(isoString)
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

export function formatDateLong(isoString: string): string {
  const d = new Date(isoString)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000)
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function getDayOfWeek(date: Date): number {
  // Returns 0=Mon, 6=Sun (matches DB schema)
  return (date.getDay() + 6) % 7
}

export function generateDateRange(from: Date, days: number): Date[] {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(from)
    d.setDate(d.getDate() + i)
    return d
  })
}

export function toUTCString(date: Date): string {
  return date.toISOString()
}

export function getUTCOffsetHours(timezone: string): number {
  const now = new Date()
  const utc = now.toLocaleString('en-US', { timeZone: 'UTC' })
  const local = now.toLocaleString('en-US', { timeZone: timezone })
  return (new Date(local).getTime() - new Date(utc).getTime()) / 3_600_000
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} мин`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} ч ${m} мин` : `${h} ч`
}

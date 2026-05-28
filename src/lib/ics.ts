/**
 * Client-side .ics (iCalendar) file generation + download.
 * Used by the booking Success screen «Добавить в календарь» button.
 *
 * No backend, no third-party dep — just RFC 5545-ish text + a Blob link.
 */

export type IcsEvent = {
  /** Event title (e.g. "Классический массаж спины") */
  title: string
  /** Start ISO 8601 string */
  startsAt: string
  /** Duration in minutes — used to derive end */
  durationMin: number
  /** Optional description / notes */
  description?: string
  /** Optional location (salon address) */
  location?: string
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function toIcsLocal(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(
    d.getHours()
  )}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

function toIcsUtc(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(
    d.getUTCDate()
  )}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(
    d.getUTCSeconds()
  )}Z`
}

/** Escape characters per RFC 5545 (commas, semicolons, line breaks). */
function escape(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

export function buildIcs(event: IcsEvent, prodId = 'BeautySaaS'): string {
  const start = new Date(event.startsAt)
  const end = new Date(start.getTime() + event.durationMin * 60_000)
  const now = new Date()

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${prodId}//RU`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${crypto.randomUUID()}@beauty-saas`,
    `DTSTAMP:${toIcsUtc(now)}`,
    `DTSTART:${toIcsLocal(start)}`,
    `DTEND:${toIcsLocal(end)}`,
    `SUMMARY:${escape(event.title)}`,
    event.description ? `DESCRIPTION:${escape(event.description)}` : '',
    event.location ? `LOCATION:${escape(event.location)}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean)

  return lines.join('\r\n')
}

/** Download an .ics file with the given event. Works inside Telegram WebApp. */
export function downloadIcs(event: IcsEvent, filename = 'appointment.ics'): void {
  const blob = new Blob([buildIcs(event)], {
    type: 'text/calendar;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Defer revoke to allow Telegram WebView to grab the link
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

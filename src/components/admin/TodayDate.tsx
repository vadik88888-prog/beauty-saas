'use client'

// Renders today's date using the BROWSER's local timezone.
// Dashboard header previously used server-side new Date() which returns UTC,
// causing "1 июня" on server while calendar showed "2 июня" client-side.
export function TodayDate({ style }: { style?: React.CSSProperties }) {
  const label = new Date().toLocaleDateString('ru-RU', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
  return <span style={style}>{label}</span>
}

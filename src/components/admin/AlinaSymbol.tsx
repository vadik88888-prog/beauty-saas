/**
 * Фирменный AI-символ Алины.
 * Используется везде кроме чата, онбординга и настроек Алины.
 * Файл с финальным символом заменит этот SVG — структура сохранится.
 */
export function AlinaSymbol({
  size = 48,
  className = '',
  animate = false,
}: {
  size?: number
  className?: string
  animate?: boolean
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={[animate ? 'animate-breathe animate-glow-pulse' : '', className].filter(Boolean).join(' ')}
      aria-hidden="true"
    >
      {/* Background circle */}
      <circle cx="40" cy="40" r="38" fill="#e7eee2" />

      {/* Outer dashed ring */}
      <circle cx="40" cy="40" r="34" stroke="#c9d8c5" strokeWidth="0.8" strokeDasharray="4 3.5" />

      {/* 4 organic petals forming a cross / bloom */}
      <ellipse cx="40" cy="21" rx="5.5" ry="19" fill="#5e7d5d" opacity="0.22" />
      <ellipse cx="59" cy="40" rx="19"  ry="5.5" fill="#5e7d5d" opacity="0.22" />
      <ellipse cx="40" cy="59" rx="5.5" ry="19"  fill="#5e7d5d" opacity="0.22" />
      <ellipse cx="21" cy="40" rx="19"  ry="5.5"  fill="#5e7d5d" opacity="0.22" />

      {/* Diagonal accent petals (softer) */}
      <ellipse cx="40" cy="40" rx="4" ry="15" fill="#5e7d5d" opacity="0.10"
        transform="rotate(45 40 40)" />
      <ellipse cx="40" cy="40" rx="4" ry="15" fill="#5e7d5d" opacity="0.10"
        transform="rotate(-45 40 40)" />

      {/* Inner ring */}
      <circle cx="40" cy="40" r="17" fill="white" opacity="0.55" />
      <circle cx="40" cy="40" r="17" stroke="#a5c0a1" strokeWidth="0.75" opacity="0.7" />

      {/* Center orb */}
      <circle cx="40" cy="40" r="10" fill="#5e7d5d" opacity="0.9" />

      {/* Highlight */}
      <circle cx="36.5" cy="36.5" r="3.5" fill="white" opacity="0.65" />

      {/* Tiny center spark */}
      <circle cx="40" cy="40" r="2" fill="white" opacity="0.45" />
    </svg>
  )
}

'use client'
import Image from 'next/image'
import { BreathingGlow } from '@/components/motion/BreathingGlow'

type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

const SIZE_MAP: Record<Size, number> = {
  xs: 28,
  sm: 36,
  md: 42,
  lg: 64,
  xl: 130,
}

type PortraitAvatarProps = {
  name: string
  src?: string | null
  size?: Size
  /** Wrap in BreathingGlow (for hero AI avatar) */
  breathing?: boolean
  className?: string
}

/**
 * CSS portrait avatar — sage gradient background with first initial.
 * Used for SERA (AI) and masters when no photo is set.
 * For low-level avatar primitive use shadcn `<Avatar>` from `ui/avatar`.
 */
export function PortraitAvatar({
  name,
  src,
  size = 'md',
  breathing = false,
  className = '',
}: PortraitAvatarProps) {
  const px = SIZE_MAP[size]
  const initial = (name?.trim().charAt(0) || '·').toUpperCase()

  const inner = src ? (
    <Image
      src={src}
      alt={name}
      width={px}
      height={px}
      className="rounded-full object-cover"
      style={{ width: px, height: px }}
    />
  ) : (
    <span
      className="inline-flex items-center justify-center rounded-full font-serif font-medium text-page select-none"
      style={{
        width: px,
        height: px,
        fontSize: px * 0.4,
        background:
          'linear-gradient(135deg, var(--sage-2) 0%, var(--sage) 100%)',
      }}
    >
      {initial}
    </span>
  )

  if (breathing) {
    return (
      <span className={`inline-flex ${className}`}>
        <BreathingGlow size={px + 24}>{inner}</BreathingGlow>
      </span>
    )
  }
  return <span className={`inline-flex ${className}`}>{inner}</span>
}

'use client'

// Stable API: props (state, size) must not change — internals will be replaced
// with an animated orb later without touching call sites.

export type OrbState =
  | 'idle'
  | 'online'
  | 'thinking'
  | 'responding'
  | 'booking'
  | 'success'
  | 'reminder'
  | 'followUp'
  | 'handover'
  | 'learning'
  | 'celebrating'
  | 'resting'
  | 'alert'

export interface SeraOrbProps {
  state?: OrbState
  size?: number
  className?: string
}

export function SeraOrb({ state = 'online', size = 80, className }: SeraOrbProps) {
  return (
    <div
      className={`sera-orb${className ? ` ${className}` : ''}`}
      data-state={state}
      style={{ '--orb-size': `${size}px` } as React.CSSProperties}
      aria-hidden="true"
    />
  )
}

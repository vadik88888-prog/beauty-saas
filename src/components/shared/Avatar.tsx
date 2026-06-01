'use client'

import { useState } from 'react'

// ── Palette (6 token-based colors, stable across the app) ──────────────────────
const PALETTE = [
  { bg: 'var(--sage-soft)',  text: 'var(--sage-deep)'  },
  { bg: 'var(--gold-pearl)', text: '#7A5A1E'            },
  { bg: 'var(--info-soft)',  text: 'var(--info)'        },
  { bg: 'var(--rose)',       text: '#8A3A3A'            },
  { bg: 'var(--lilac)',      text: '#5A4A7A'            },
  { bg: 'var(--peach)',      text: '#6B3A1E'            },
]

export function hashColor(seed: string): { bg: string; text: string } {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0xfffffff
  return PALETTE[h % PALETTE.length]
}

// ── Size presets ───────────────────────────────────────────────────────────────
const PRESETS = { sm: 24, md: 32, lg: 48 } as const
type SizePreset = keyof typeof PRESETS

function px(size: SizePreset | number): number {
  return typeof size === 'number' ? size : PRESETS[size]
}

function initials(name: string, avatarPx: number): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  // tiny avatars: 1 char only
  if (avatarPx < 20) return words[0][0].toUpperCase()
  return words.slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

// ── Component ──────────────────────────────────────────────────────────────────

export interface AvatarProps {
  name: string
  id?: string           // used for deterministic color; falls back to name
  photo_url?: string | null
  size?: SizePreset | number
  className?: string
}

export function Avatar({ name, id, photo_url, size = 'md', className }: AvatarProps) {
  const [imgFailed, setImgFailed] = useState(false)

  const sizePx   = px(size)
  const col      = hashColor(id || name)
  const abbr     = initials(name, sizePx)
  const fontSize = Math.max(Math.round(sizePx * 0.42), 8)

  const base: React.CSSProperties = {
    width: sizePx, height: sizePx,
    borderRadius: '50%', flexShrink: 0,
    overflow: 'hidden', display: 'inline-flex',
    alignItems: 'center', justifyContent: 'center',
  }

  if (photo_url && !imgFailed) {
    return (
      <div style={base} className={className}>
        <img
          src={photo_url}
          alt={name}
          width={sizePx}
          height={sizePx}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={() => setImgFailed(true)}
        />
      </div>
    )
  }

  return (
    <div
      style={{ ...base, background: col.bg, color: col.text, fontSize, fontWeight: 700, lineHeight: 1 }}
      className={className}
    >
      {abbr}
    </div>
  )
}

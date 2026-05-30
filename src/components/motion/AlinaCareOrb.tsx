'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { useMemo, useId } from 'react'

// ─── Public types ──────────────────────────────────────────────────────────────

export type CareOrbState =
  | 'idle'        // спокойствие — не активна
  | 'online'      // активна, готова к диалогу
  | 'thinking'    // анализирует запрос
  | 'responding'  // формирует ответ
  | 'booking'     // создаёт запись
  | 'success'     // успех / запись создана
  | 'reminder'    // отправляет напоминание
  | 'followUp'    // возвращает клиента
  | 'handover'    // передаёт сотруднику
  | 'learning'    // обучается на данных

export interface AlinaCareOrbProps {
  state?: CareOrbState
  size?: number
  className?: string
}

// ─── Per-state visual config ───────────────────────────────────────────────────

interface OrbCfg {
  stroke: string        // petal stroke color
  fill: string          // petal fill (rgba)
  center: string        // bright center color
  glow: string          // ambient glow color
  particle: string      // orbiting dot color
  glowBase: number      // base opacity for glow layer (0-1)
  pulseHz: number       // breathing cycle duration (s)
  pulseScale: [number, number]  // [minScale, maxScale]
  orbitHz: number       // orbit period for fastest particle (s)
  particleN: number     // number of orbiting particles
}

const CFGS: Record<CareOrbState, OrbCfg> = {
  idle:       { stroke:'#c4aa80', fill:'rgba(196,170,128,0.06)', center:'#f0e0b8', glow:'#d4b87a', particle:'#e0cc98', glowBase:0.55, pulseHz:5.5, pulseScale:[0.97,1.00], orbitHz:20, particleN:3 },
  online:     { stroke:'#88aa84', fill:'rgba(136,170,132,0.07)', center:'#bcd8b8', glow:'#7d9a78', particle:'#a8c8a4', glowBase:0.80, pulseHz:3.5, pulseScale:[0.98,1.02], orbitHz:14, particleN:4 },
  thinking:   { stroke:'#a898c8', fill:'rgba(168,152,200,0.08)', center:'#d0c0f0', glow:'#9880c0', particle:'#c0b0e0', glowBase:0.90, pulseHz:2.0, pulseScale:[0.94,1.07], orbitHz:6,  particleN:5 },
  responding: { stroke:'#cc98a8', fill:'rgba(204,152,168,0.08)', center:'#f0b8c8', glow:'#c08090', particle:'#e0a8c0', glowBase:0.85, pulseHz:2.2, pulseScale:[0.97,1.04], orbitHz:8,  particleN:4 },
  booking:    { stroke:'#80a880', fill:'rgba(128,168,128,0.07)', center:'#b8d8b0', glow:'#5e8a5e', particle:'#90c090', glowBase:0.82, pulseHz:2.8, pulseScale:[0.98,1.03], orbitHz:7,  particleN:6 },
  success:    { stroke:'#c8a038', fill:'rgba(200,160,56,0.10)', center:'#f0cc68', glow:'#d09820', particle:'#e8c050', glowBase:1.00, pulseHz:1.8, pulseScale:[1.00,1.12], orbitHz:5,  particleN:6 },
  reminder:   { stroke:'#80aaa8', fill:'rgba(128,170,168,0.07)', center:'#b8d8d0', glow:'#609898', particle:'#90c0bc', glowBase:0.62, pulseHz:4.5, pulseScale:[0.97,1.01], orbitHz:18, particleN:3 },
  followUp:   { stroke:'#c890a8', fill:'rgba(200,144,168,0.08)', center:'#f0b8cc', glow:'#b07888', particle:'#e0a0bc', glowBase:0.75, pulseHz:3.8, pulseScale:[0.97,1.03], orbitHz:12, particleN:4 },
  handover:   { stroke:'#9090b0', fill:'rgba(144,144,176,0.07)', center:'#b8c0e0', glow:'#7070a0', particle:'#a8b0d0', glowBase:0.58, pulseHz:5.0, pulseScale:[0.98,1.01], orbitHz:22, particleN:3 },
  learning:   { stroke:'#c0a84c', fill:'rgba(192,168,76,0.08)', center:'#e8ca6c', glow:'#a08828', particle:'#d4b848', glowBase:0.76, pulseHz:3.2, pulseScale:[0.97,1.03], orbitHz:11, particleN:5 },
}

// 5 outer petals (0°, 36°, 72°, 108°, 144°) + 5 inner rotated 18° offset
const OUTER_A = [0, 36, 72, 108, 144]
const INNER_A = [18, 54, 90, 126, 162]

// ─── Component ────────────────────────────────────────────────────────────────

export function AlinaCareOrb({ state = 'idle', size = 120, className }: AlinaCareOrbProps) {
  const reduced = useReducedMotion()
  // unique IDs to avoid SVG filter collisions when multiple orbs on screen
  const uid = useId().replace(/:/g, 'x')
  const fGlow  = `cg${uid}`   // center glow filter
  const fOuter = `og${uid}`   // outer ambient filter
  const gRad   = `rg${uid}`   // radial gradient

  const cfg = CFGS[state]

  // color transition shared by all state-driven animations
  const ct = { duration: 1.5, ease: [0.4, 0, 0.2, 1] as const }

  // orbit particles — evenly spaced, varying sizes
  const particles = useMemo(
    () =>
      Array.from({ length: cfg.particleN }, (_, i) => ({
        id: i,
        angle0: (360 / cfg.particleN) * i,
        r: [2.8, 2.2, 1.6][i % 3],
        orbit: 44 + (i % 2) * 2,
      })),
    [cfg.particleN],
  )

  return (
    <div
      className={className}
      style={{ width: size, height: size, display: 'inline-block', flexShrink: 0 }}
    >
      <svg
        viewBox="0 0 120 120"
        width={size}
        height={size}
        style={{ overflow: 'visible' }}
        aria-label="Ядро заботы Алины"
        role="img"
      >
        <defs>
          {/* Soft bloom on the center core */}
          <filter id={fGlow} x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Wide ambient haze behind the orb */}
          <filter id={fOuter} x="-120%" y="-120%" width="340%" height="340%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="10" />
          </filter>

          {/* Center fill gradient — fades outward */}
          <radialGradient id={gRad} cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor={cfg.center} stopOpacity="1" />
            <stop offset="45%"  stopColor={cfg.glow}   stopOpacity="0.5" />
            <stop offset="100%" stopColor={cfg.glow}   stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* ── 1. Ambient outer haze (behind everything) ── */}
        <motion.circle
          cx="60" cy="60" r="54"
          fill={cfg.glow}
          filter={`url(#${fOuter})`}
          animate={{
            fill: cfg.glow,
            opacity: [cfg.glowBase * 0.18, cfg.glowBase * 0.38, cfg.glowBase * 0.18],
          }}
          transition={{
            fill: ct,
            opacity: { duration: cfg.pulseHz, repeat: Infinity, ease: 'easeInOut' },
          }}
        />

        {/* ── 2. Background fill disc ── */}
        <motion.circle
          cx="60" cy="60" r="47"
          fill={cfg.fill}
          animate={{
            fill: cfg.fill,
            opacity: [0.45, 0.85, 0.45],
          }}
          transition={{
            fill: ct,
            opacity: { duration: cfg.pulseHz * 1.1, repeat: Infinity, ease: 'easeInOut' },
          }}
        />

        {/* ── 3. Breathing scale wrapper (whole orb expands/contracts) ── */}
        <motion.g
          style={{ transformOrigin: '60px 60px' }}
          animate={reduced ? {} : { scale: cfg.pulseScale }}
          transition={{
            duration: cfg.pulseHz,
            repeat: Infinity,
            repeatType: 'reverse',
            ease: 'easeInOut',
          }}
        >
          {/* ── 3a. Outer petal ring — slow clockwise ── */}
          <motion.g
            style={{ transformOrigin: '60px 60px' }}
            animate={reduced ? {} : { rotate: [0, 360] }}
            transition={{ duration: 36, repeat: Infinity, ease: 'linear' }}
          >
            {OUTER_A.map(a => (
              <motion.ellipse
                key={a}
                cx="60" cy="60"
                rx="30" ry="11.5"
                fill={cfg.fill}
                stroke={cfg.stroke}
                strokeWidth="0.7"
                transform={`rotate(${a}, 60, 60)`}
                animate={{
                  fill: cfg.fill,
                  stroke: cfg.stroke,
                  opacity: [0.45, 0.82, 0.45],
                }}
                transition={{
                  fill: ct, stroke: ct,
                  opacity: {
                    duration: cfg.pulseHz * 1.15,
                    repeat: Infinity,
                    ease: 'easeInOut',
                    delay: a * 0.008,
                  },
                }}
              />
            ))}
          </motion.g>

          {/* ── 3b. Inner petal ring — slow counter-clockwise ── */}
          <motion.g
            style={{ transformOrigin: '60px 60px' }}
            animate={reduced ? {} : { rotate: [0, -360] }}
            transition={{ duration: 58, repeat: Infinity, ease: 'linear' }}
          >
            {INNER_A.map(a => (
              <motion.ellipse
                key={a}
                cx="60" cy="60"
                rx="19" ry="7"
                fill={cfg.fill}
                stroke={cfg.stroke}
                strokeWidth="0.45"
                transform={`rotate(${a}, 60, 60)`}
                animate={{
                  fill: cfg.fill,
                  stroke: cfg.stroke,
                  opacity: [0.28, 0.58, 0.28],
                }}
                transition={{
                  fill: ct, stroke: ct,
                  opacity: {
                    duration: cfg.pulseHz * 1.4,
                    repeat: Infinity,
                    ease: 'easeInOut',
                    delay: a * 0.008,
                  },
                }}
              />
            ))}
          </motion.g>

          {/* ── 3c. Center radial fill (static, blended with gradient) ── */}
          <circle cx="60" cy="60" r="22" fill={`url(#${gRad})`} />

          {/* ── 3d. Orbiting particles ── */}
          {particles.map(p => (
            <motion.g
              key={p.id}
              style={{ transformOrigin: '60px 60px' }}
              animate={reduced ? {} : { rotate: [p.angle0, p.angle0 + 360] }}
              transition={{
                duration: cfg.orbitHz * (1 + p.id * 0.22),
                repeat: Infinity,
                ease: 'linear',
              }}
            >
              <motion.circle
                cx={60 + p.orbit}
                cy="60"
                r={p.r}
                fill={cfg.particle}
                animate={{
                  fill: cfg.particle,
                  r: [p.r * 0.6, p.r, p.r * 0.6],
                  opacity: [0.28, 0.88, 0.28],
                }}
                transition={{
                  fill: ct,
                  r: {
                    duration: cfg.pulseHz * 0.9,
                    repeat: Infinity,
                    ease: 'easeInOut',
                    delay: p.id * 0.45,
                  },
                  opacity: {
                    duration: cfg.pulseHz * 0.9,
                    repeat: Infinity,
                    ease: 'easeInOut',
                    delay: p.id * 0.45,
                  },
                }}
              />
            </motion.g>
          ))}

          {/* ── 3e. Center glow core (blurred bright spot) ── */}
          <motion.circle
            cx="60" cy="60"
            r="6"
            fill={cfg.center}
            filter={`url(#${fGlow})`}
            animate={{
              fill: cfg.center,
              r: reduced ? 6 : [5.5, 7.5, 5.5],
              opacity: [0.72, 1, 0.72],
            }}
            transition={{
              fill: ct,
              r: { duration: cfg.pulseHz * 0.72, repeat: Infinity, ease: 'easeInOut' },
              opacity: { duration: cfg.pulseHz * 0.72, repeat: Infinity, ease: 'easeInOut' },
            }}
          />

          {/* ── 3f. Bright white spark at exact center ── */}
          <motion.circle
            cx="60" cy="60"
            r="2.2"
            fill="white"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: cfg.pulseHz * 0.5, repeat: Infinity, ease: 'easeInOut' }}
          />
        </motion.g>
      </svg>
    </div>
  )
}

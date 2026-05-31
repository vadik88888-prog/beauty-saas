'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { useMemo, useId } from 'react'

// ─── Public types ──────────────────────────────────────────────────────────────

export type CareOrbState =
  | 'idle'        // спокойствие — ждёт
  | 'online'      // активна, готова к диалогу
  | 'thinking'    // анализирует запрос (пинк-маджента)
  | 'responding'  // формирует ответ
  | 'booking'     // создаёт запись
  | 'success'     // успех / запись создана (золото)
  | 'reminder'    // отправляет напоминание
  | 'followUp'    // возвращает клиента
  | 'handover'    // передаёт сотруднику (синий-индиго)
  | 'learning'    // обучается на данных
  | 'celebrating' // празднует (ярче success, 8 частиц)
  | 'resting'     // отдыхает ночью (тёмный + полумесяц)

export interface AlinaCareOrbProps {
  state?: CareOrbState
  size?: number
  className?: string
}

// ─── Per-state visual config ───────────────────────────────────────────────────

interface OrbCfg {
  stroke: string
  fill: string
  center: string
  glow: string
  particle: string
  glowBase: number
  pulseHz: number
  pulseScale: [number, number]
  outerRotHz: number   // outer petal ring rotation (seconds / full turn)
  innerRotHz: number   // inner petal ring rotation
  orbitHz: number      // fastest particle orbit period (s)
  particleN: number
}

const CFGS: Record<CareOrbState, OrbCfg> = {
  // Тёплый оливково-золотой — очень медленно, спокойствие
  idle: {
    stroke: '#b0aa7c', fill: 'rgba(176,170,124,0.07)',
    center: '#f2e8c0', glow: '#c8b060', particle: '#dcc880',
    glowBase: 0.55, pulseHz: 6.0, pulseScale: [0.97, 1.00],
    outerRotHz: 45, innerRotHz: 72, orbitHz: 22, particleN: 3,
  },
  // Шалфей-зелёный — умеренно активна
  online: {
    stroke: '#80a87c', fill: 'rgba(128,168,124,0.08)',
    center: '#c4e0b4', glow: '#68a868', particle: '#98c890',
    glowBase: 0.80, pulseHz: 3.8, pulseScale: [0.98, 1.02],
    outerRotHz: 28, innerRotHz: 46, orbitHz: 15, particleN: 4,
  },
  // ПИНК-МАДЖЕНТА — быстро, яркий пульс
  thinking: {
    stroke: '#e080b0', fill: 'rgba(224,128,176,0.09)',
    center: '#fff0f8', glow: '#d04888', particle: '#e8a0c8',
    glowBase: 0.92, pulseHz: 1.8, pulseScale: [0.92, 1.08],
    outerRotHz: 10, innerRotHz: 16, orbitHz: 5, particleN: 5,
  },
  // Тёплый розовый — среднебыстро
  responding: {
    stroke: '#d898b0', fill: 'rgba(216,152,176,0.08)',
    center: '#ffd8e4', glow: '#b86880', particle: '#e8b0c8',
    glowBase: 0.85, pulseHz: 2.2, pulseScale: [0.97, 1.04],
    outerRotHz: 16, innerRotHz: 26, orbitHz: 8, particleN: 4,
  },
  // Шалфей + активные частицы
  booking: {
    stroke: '#78a870', fill: 'rgba(120,168,112,0.08)',
    center: '#b8e0a8', glow: '#508050', particle: '#88c078',
    glowBase: 0.82, pulseHz: 2.8, pulseScale: [0.98, 1.03],
    outerRotHz: 14, innerRotHz: 22, orbitHz: 7, particleN: 6,
  },
  // ЗОЛОТОЙ-МЕДНЫЙ — расширяется, быстрые частицы
  success: {
    stroke: '#c09028', fill: 'rgba(192,144,40,0.10)',
    center: '#f8e060', glow: '#d09810', particle: '#e8c040',
    glowBase: 1.00, pulseHz: 1.8, pulseScale: [1.00, 1.12],
    outerRotHz: 12, innerRotHz: 20, orbitHz: 5, particleN: 6,
  },
  // Холодный тиль-зелёный — медленно, настойчивый
  reminder: {
    stroke: '#6ca8a0', fill: 'rgba(108,168,160,0.07)',
    center: '#a8d8d0', glow: '#407878', particle: '#80c0b8',
    glowBase: 0.62, pulseHz: 4.8, pulseScale: [0.97, 1.01],
    outerRotHz: 36, innerRotHz: 58, orbitHz: 20, particleN: 3,
  },
  // Тёплый роз-персик — плавно, с заботой
  followUp: {
    stroke: '#c88898', fill: 'rgba(200,136,152,0.08)',
    center: '#fcc8d4', glow: '#a05868', particle: '#e0a0b8',
    glowBase: 0.75, pulseHz: 4.0, pulseScale: [0.97, 1.03],
    outerRotHz: 24, innerRotHz: 38, orbitHz: 13, particleN: 4,
  },
  // СИНИЙ-ИНДИГО — явно синий, очень медленно
  handover: {
    stroke: '#6878c8', fill: 'rgba(104,120,200,0.08)',
    center: '#b8c4e8', glow: '#4858a8', particle: '#8898d8',
    glowBase: 0.60, pulseHz: 5.5, pulseScale: [0.98, 1.01],
    outerRotHz: 38, innerRotHz: 62, orbitHz: 24, particleN: 3,
  },
  // Янтарно-золотой — размеренно, созерцательно
  learning: {
    stroke: '#b89820', fill: 'rgba(184,152,32,0.08)',
    center: '#e8c840', glow: '#987810', particle: '#d0a830',
    glowBase: 0.76, pulseHz: 3.5, pulseScale: [0.97, 1.03],
    outerRotHz: 28, innerRotHz: 44, orbitHz: 12, particleN: 5,
  },
  // Ярко-золотой — ещё ярче success, 8 частиц, быстро
  celebrating: {
    stroke: '#d4a020', fill: 'rgba(212,160,32,0.12)',
    center: '#fff4a0', glow: '#e0b010', particle: '#f0c830',
    glowBase: 1.00, pulseHz: 1.5, pulseScale: [1.00, 1.15],
    outerRotHz: 10, innerRotHz: 16, orbitHz: 4, particleN: 8,
  },
  // ТЁМНЫЙ — почти статика, специальный рендер с полумесяцем
  resting: {
    stroke: '#2a2e48', fill: 'rgba(30,32,52,0.15)',
    center: '#a0a8c4', glow: '#181c2e', particle: '#404460',
    glowBase: 0.20, pulseHz: 9.0, pulseScale: [0.98, 1.00],
    outerRotHz: 999, innerRotHz: 999, orbitHz: 999, particleN: 0,
  },
}

// 5 outer petals (0°, 36°, 72°, 108°, 144°) + 5 inner offset 18°
const OUTER_A = [0, 36, 72, 108, 144]
const INNER_A = [18, 54, 90, 126, 162]

// ─── Component ────────────────────────────────────────────────────────────────

export function AlinaCareOrb({ state = 'idle', size = 120, className }: AlinaCareOrbProps) {
  const reduced = useReducedMotion()
  const uid = useId().replace(/:/g, 'x')

  // SVG filter/gradient IDs — unique per instance
  const fGlow  = `cg${uid}`
  const fOuter = `og${uid}`
  const gRad   = `rg${uid}`
  const mMoon  = `mm${uid}`   // moon mask (resting only)

  const cfg = CFGS[state]
  const isResting = state === 'resting'

  // Color transition for state changes
  const ct = { duration: 1.4, ease: [0.4, 0, 0.2, 1] as const }

  const particles = useMemo(
    () =>
      Array.from({ length: cfg.particleN }, (_, i) => ({
        id: i,
        angle0: (360 / cfg.particleN) * i,
        r: [2.8, 2.2, 1.6, 2.4, 1.8][i % 5],
        orbit: 44 + (i % 3) * 1.5,
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
        aria-label="SERA — AI-администратор"
        role="img"
      >
        <defs>
          {/* Center bloom filter */}
          <filter id={fGlow} x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4.5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Wide ambient haze */}
          <filter id={fOuter} x="-120%" y="-120%" width="340%" height="340%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="10" />
          </filter>

          {/* Center radial gradient */}
          <radialGradient id={gRad} cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor={cfg.center} stopOpacity="1" />
            <stop offset="42%"  stopColor={cfg.glow}   stopOpacity="0.55" />
            <stop offset="100%" stopColor={cfg.glow}   stopOpacity="0" />
          </radialGradient>

          {/* Crescent moon mask — used only for resting state */}
          <mask id={mMoon}>
            <rect x="0" y="0" width="120" height="120" fill="white" />
            {/* Offset dark circle bites into the lit circle → crescent */}
            <circle cx="65" cy="57" r="9.5" fill="black" />
          </mask>
        </defs>

        {/* ── 1. Ambient outer haze ── */}
        <motion.circle
          cx="60" cy="60" r="54"
          fill={cfg.glow}
          filter={`url(#${fOuter})`}
          animate={{
            fill: cfg.glow,
            opacity: [cfg.glowBase * 0.18, cfg.glowBase * 0.40, cfg.glowBase * 0.18],
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
          animate={{ fill: cfg.fill, opacity: [0.45, 0.88, 0.45] }}
          transition={{
            fill: ct,
            opacity: { duration: cfg.pulseHz * 1.1, repeat: Infinity, ease: 'easeInOut' },
          }}
        />

        {/* ── 3. Breathing scale wrapper ── */}
        <motion.g
          style={{ transformOrigin: '60px 60px' }}
          animate={reduced ? {} : {
            scale: isResting ? 1 : cfg.pulseScale,
            opacity: isResting ? 0.22 : 1,
          }}
          transition={{
            scale: { duration: cfg.pulseHz, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' },
            opacity: { duration: ct.duration, ease: ct.ease },
          }}
        >
          {/* ── 3a. Outer petal ring — clockwise ── */}
          <motion.g
            style={{ transformOrigin: '60px 60px' }}
            animate={reduced ? {} : { rotate: [0, 360] }}
            transition={{ duration: cfg.outerRotHz, repeat: Infinity, ease: 'linear' }}
          >
            {OUTER_A.map(a => (
              <motion.ellipse
                key={a}
                cx="60" cy="60"
                rx="32" ry="13"
                fill={cfg.fill}
                stroke={cfg.stroke}
                strokeWidth="0.75"
                transform={`rotate(${a}, 60, 60)`}
                animate={{
                  fill: cfg.fill,
                  stroke: cfg.stroke,
                  opacity: [0.45, 0.85, 0.45],
                }}
                transition={{
                  fill: ct, stroke: ct,
                  opacity: {
                    duration: cfg.pulseHz * 1.15,
                    repeat: Infinity,
                    ease: 'easeInOut',
                    delay: a * 0.007,
                  },
                }}
              />
            ))}
          </motion.g>

          {/* ── 3b. Inner petal ring — counter-clockwise ── */}
          <motion.g
            style={{ transformOrigin: '60px 60px' }}
            animate={reduced ? {} : { rotate: [0, -360] }}
            transition={{ duration: cfg.innerRotHz, repeat: Infinity, ease: 'linear' }}
          >
            {INNER_A.map(a => (
              <motion.ellipse
                key={a}
                cx="60" cy="60"
                rx="20" ry="8"
                fill={cfg.fill}
                stroke={cfg.stroke}
                strokeWidth="0.5"
                transform={`rotate(${a}, 60, 60)`}
                animate={{
                  fill: cfg.fill,
                  stroke: cfg.stroke,
                  opacity: [0.28, 0.60, 0.28],
                }}
                transition={{
                  fill: ct, stroke: ct,
                  opacity: {
                    duration: cfg.pulseHz * 1.4,
                    repeat: Infinity,
                    ease: 'easeInOut',
                    delay: a * 0.007,
                  },
                }}
              />
            ))}
          </motion.g>

          {/* ── 3c. Center radial fill ── */}
          <circle cx="60" cy="60" r="23" fill={`url(#${gRad})`} />

          {/* ── 3d. Orbiting particles ── */}
          {particles.map(p => (
            <motion.g
              key={p.id}
              style={{ transformOrigin: '60px 60px' }}
              animate={reduced ? {} : { rotate: [p.angle0, p.angle0 + 360] }}
              transition={{
                duration: cfg.orbitHz * (1 + p.id * 0.2),
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
                  r: [p.r * 0.55, p.r, p.r * 0.55],
                  opacity: [0.25, 0.92, 0.25],
                }}
                transition={{
                  fill: ct,
                  r: { duration: cfg.pulseHz * 0.9, repeat: Infinity, ease: 'easeInOut', delay: p.id * 0.4 },
                  opacity: { duration: cfg.pulseHz * 0.9, repeat: Infinity, ease: 'easeInOut', delay: p.id * 0.4 },
                }}
              />
            </motion.g>
          ))}

          {/* ── 3e. Center core — normal states ── */}
          {!isResting && (
            <>
              <motion.circle
                cx="60" cy="60" r="6.5"
                fill={cfg.center}
                filter={`url(#${fGlow})`}
                animate={{
                  fill: cfg.center,
                  r: reduced ? 6.5 : [5.8, 8, 5.8],
                  opacity: [0.72, 1, 0.72],
                }}
                transition={{
                  fill: ct,
                  r: { duration: cfg.pulseHz * 0.7, repeat: Infinity, ease: 'easeInOut' },
                  opacity: { duration: cfg.pulseHz * 0.7, repeat: Infinity, ease: 'easeInOut' },
                }}
              />
              <motion.circle
                cx="60" cy="60" r="2.4"
                fill="white"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: cfg.pulseHz * 0.5, repeat: Infinity, ease: 'easeInOut' }}
              />
            </>
          )}

          {/* ── 3f. Crescent moon — resting state only ── */}
          {isResting && (
            <motion.circle
              cx="60" cy="60" r="11.5"
              fill="#a0a8c4"
              mask={`url(#${mMoon})`}
              animate={{ opacity: [0.45, 0.72, 0.45] }}
              transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}
        </motion.g>
      </svg>
    </div>
  )
}

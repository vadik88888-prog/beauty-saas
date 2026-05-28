'use client'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Loader2, Check } from 'lucide-react'
import { type ReactNode } from 'react'

type MorphingButtonProps = {
  state?: 'idle' | 'loading' | 'success'
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  className?: string
}

/**
 * Three-state CTA button. Caller controls `state` externally.
 * - idle: shows children
 * - loading: spinner
 * - success: check icon (auto-clear handled by caller)
 */
export function MorphingButton({
  state = 'idle',
  children,
  onClick,
  disabled,
  className = '',
}: MorphingButtonProps) {
  const reduce = useReducedMotion()

  const baseCls =
    'inline-flex items-center justify-center gap-2 min-h-12 px-6 rounded-2xl font-medium text-page bg-ink transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99]'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || state !== 'idle'}
      className={`${baseCls} ${className}`}
    >
      <AnimatePresence mode="wait" initial={false}>
        {state === 'idle' && (
          <motion.span
            key="idle"
            initial={reduce ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="inline-flex items-center gap-2"
          >
            {children}
          </motion.span>
        )}
        {state === 'loading' && (
          <motion.span
            key="loading"
            initial={reduce ? false : { opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduce ? undefined : { opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.2 }}
            className="inline-flex"
          >
            <Loader2 className="w-5 h-5 animate-spin" />
          </motion.span>
        )}
        {state === 'success' && (
          <motion.span
            key="success"
            initial={reduce ? false : { opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduce ? undefined : { opacity: 0, scale: 0.6 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="inline-flex"
          >
            <Check className="w-5 h-5" />
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  )
}

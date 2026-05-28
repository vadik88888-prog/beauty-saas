'use client'
import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion'
import { type ReactNode } from 'react'

type FadeInProps = HTMLMotionProps<'div'> & {
  children: ReactNode
  delay?: number
  duration?: number
}

export function FadeIn({
  children,
  delay = 0,
  duration = 0.6,
  ...rest
}: FadeInProps) {
  const reduce = useReducedMotion()
  if (reduce) return <div {...(rest as any)}>{children}</div>

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration, delay, ease: [0.16, 1, 0.3, 1] }}
      {...rest}
    >
      {children}
    </motion.div>
  )
}

'use client'
import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion'
import { type ReactNode } from 'react'

type FadeInDownProps = HTMLMotionProps<'div'> & {
  children: ReactNode
  delay?: number
  duration?: number
  distance?: number
}

export function FadeInDown({
  children,
  delay = 0,
  duration = 0.6,
  distance = 20,
  ...rest
}: FadeInDownProps) {
  const reduce = useReducedMotion()
  if (reduce) return <div {...(rest as any)}>{children}</div>

  return (
    <motion.div
      initial={{ opacity: 0, y: -distance }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration, delay, ease: [0.16, 1, 0.3, 1] }}
      {...rest}
    >
      {children}
    </motion.div>
  )
}

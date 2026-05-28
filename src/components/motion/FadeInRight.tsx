'use client'
import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion'
import { type ReactNode } from 'react'

type FadeInRightProps = HTMLMotionProps<'div'> & {
  children: ReactNode
  delay?: number
  duration?: number
  distance?: number
}

export function FadeInRight({
  children,
  delay = 0,
  duration = 0.6,
  distance = 20,
  ...rest
}: FadeInRightProps) {
  const reduce = useReducedMotion()
  if (reduce) return <div {...(rest as any)}>{children}</div>

  return (
    <motion.div
      initial={{ opacity: 0, x: distance }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration, delay, ease: [0.16, 1, 0.3, 1] }}
      {...rest}
    >
      {children}
    </motion.div>
  )
}

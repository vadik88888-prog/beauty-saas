'use client'
import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion'
import { type ReactNode } from 'react'

type PopProps = HTMLMotionProps<'div'> & {
  children: ReactNode
  delay?: number
}

export function Pop({ children, delay = 0, ...rest }: PopProps) {
  const reduce = useReducedMotion()
  if (reduce) return <div {...(rest as any)}>{children}</div>

  return (
    <motion.div
      initial={{ scale: 0.6, rotate: -12, opacity: 0 }}
      animate={{ scale: [0.6, 1.05, 1], rotate: [-12, 2, 0], opacity: 1 }}
      transition={{ duration: 0.7, delay, times: [0, 0.7, 1], ease: [0.16, 1, 0.3, 1] }}
      {...rest}
    >
      {children}
    </motion.div>
  )
}

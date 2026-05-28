'use client'
import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion'
import { type ReactNode } from 'react'

type StaggerProps = HTMLMotionProps<'div'> & {
  children: ReactNode
  staggerChildren?: number
  delayChildren?: number
}

export function Stagger({
  children,
  staggerChildren = 0.08,
  delayChildren = 0,
  ...rest
}: StaggerProps) {
  const reduce = useReducedMotion()
  if (reduce) return <div {...(rest as any)}>{children}</div>

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{
        hidden: { opacity: 1 },
        visible: { opacity: 1, transition: { staggerChildren, delayChildren } },
      }}
      {...rest}
    >
      {children}
    </motion.div>
  )
}

type StaggerItemProps = HTMLMotionProps<'div'> & { children: ReactNode }

export function StaggerItem({ children, ...rest }: StaggerItemProps) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 16 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
        },
      }}
      {...rest}
    >
      {children}
    </motion.div>
  )
}

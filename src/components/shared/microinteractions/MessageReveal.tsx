'use client'
import { motion, useReducedMotion } from 'framer-motion'

type MessageRevealProps = {
  text: string
  className?: string
  /** Time between each word reveal in seconds */
  staggerWords?: number
  /** Initial blur amount in px */
  blurFrom?: number
}

/**
 * Reveals text word-by-word with blur-clear effect. For AI bubbles.
 * Static fallback when reduce-motion is on.
 */
export function MessageReveal({
  text,
  className = '',
  staggerWords = 0.04,
  blurFrom = 8,
}: MessageRevealProps) {
  const reduce = useReducedMotion()

  if (reduce) {
    return <span className={className}>{text}</span>
  }

  const words = text.split(/(\s+)/)

  return (
    <span className={className}>
      {words.map((word, i) =>
        word.trim() === '' ? (
          <span key={i}>{word}</span>
        ) : (
          <motion.span
            key={i}
            initial={{ opacity: 0, filter: `blur(${blurFrom}px)` }}
            animate={{ opacity: 1, filter: 'blur(0px)' }}
            transition={{
              duration: 0.35,
              ease: [0.16, 1, 0.3, 1],
              delay: i * staggerWords,
            }}
            style={{ display: 'inline-block' }}
          >
            {word}
          </motion.span>
        )
      )}
    </span>
  )
}

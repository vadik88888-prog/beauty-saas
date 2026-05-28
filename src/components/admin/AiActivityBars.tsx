'use client'
import { motion, useReducedMotion } from 'framer-motion'

type Bar = { label: string; value: number }

type AiActivityBarsProps = {
  data: Bar[]
  height?: number
  className?: string
}

export function AiActivityBars({
  data,
  height = 140,
  className = '',
}: AiActivityBarsProps) {
  const reduce = useReducedMotion()
  const max = Math.max(...data.map((d) => d.value), 1)

  return (
    <div className={className}>
      <div
        className="flex items-end gap-1.5"
        style={{ height }}
      >
        {data.map((d, i) => {
          const h = (d.value / max) * 100
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full bg-line-soft rounded-t-md relative overflow-hidden"
                style={{ height: '100%' }}
              >
                <motion.div
                  className="absolute bottom-0 left-0 right-0 rounded-t-md"
                  style={{ background: 'var(--sage)' }}
                  initial={reduce ? { height: `${h}%` } : { height: 0 }}
                  animate={{ height: `${h}%` }}
                  transition={
                    reduce
                      ? { duration: 0 }
                      : {
                          duration: 0.7,
                          ease: [0.16, 1, 0.3, 1],
                          delay: i * 0.04,
                        }
                  }
                />
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex items-center gap-1.5 mt-2">
        {data.map((d, i) => (
          <div
            key={i}
            className="flex-1 text-[10px] text-muted-2 text-center truncate"
          >
            {d.label}
          </div>
        ))}
      </div>
    </div>
  )
}

import type { ReactNode } from 'react'
import { SeraOrb } from './SeraOrb'
import type { OrbState } from './SeraOrb'

interface EmptyStateProps {
  orbState?: OrbState
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({
  orbState = 'idle',
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: 'var(--space-12)',
        gap: 'var(--space-5)',
      }}
    >
      <SeraOrb state={orbState} size={80} />
      <div style={{ maxWidth: 320 }}>
        <p
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '20px',
            fontWeight: 600,
            color: 'var(--ink)',
            margin: '0 0 var(--space-2)',
          }}
        >
          {title}
        </p>
        {description && (
          <p
            style={{
              fontSize: '14px',
              color: 'var(--muted)',
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  )
}

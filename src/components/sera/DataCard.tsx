import type { ReactNode } from 'react'

interface DataCardProps {
  label?: string
  action?: ReactNode
  children: ReactNode
}

export function DataCard({ label, action, children }: DataCardProps) {
  const hasHeader = label || action

  return (
    <div className="sera-card" style={{ overflow: 'hidden' }}>
      {hasHeader && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--space-4) var(--space-5)',
            borderBottom: '1px solid var(--card-border)',
            gap: 'var(--space-4)',
          }}
        >
          {label && <span className="sera-label">{label}</span>}
          {action && (
            <span
              style={{
                fontSize: '13px',
                color: 'var(--sage)',
                fontWeight: 500,
              }}
            >
              {action}
            </span>
          )}
        </div>
      )}
      <div style={{ padding: 'var(--space-5)' }}>{children}</div>
    </div>
  )
}

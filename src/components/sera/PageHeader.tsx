import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  subtitle?: string
  action?: ReactNode
}

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 'var(--space-5)',
        flexWrap: 'wrap',
        marginBottom: 'var(--space-8)',
      }}
    >
      <div>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '32px',
            fontWeight: 600,
            lineHeight: 1.15,
            color: 'var(--ink)',
            margin: 0,
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p
            style={{
              marginTop: 'var(--space-2)',
              fontSize: '14px',
              color: 'var(--text-muted)',
              lineHeight: 1.5,
            }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {action && (
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
          {action}
        </div>
      )}
    </div>
  )
}

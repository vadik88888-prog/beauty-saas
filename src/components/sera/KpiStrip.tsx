import Link from 'next/link'
import type { ReactNode } from 'react'

export interface KpiItem {
  icon?: ReactNode
  label: string
  value: string | number
  delta?: string
  deltaType?: 'up' | 'down' | 'neutral'
  href?: string
}

interface KpiStripProps {
  items: KpiItem[]
}

function DeltaBadge({ delta, type }: { delta: string; type?: 'up' | 'down' | 'neutral' }) {
  const pillClass =
    type === 'up'
      ? 'sera-pill sera-pill--success'
      : type === 'down'
        ? 'sera-pill sera-pill--error'
        : 'sera-pill'

  const prefix = type === 'up' ? '↑ ' : type === 'down' ? '↓ ' : ''

  return (
    <span className={pillClass} style={{ marginTop: 'var(--space-2)' }}>
      {prefix}{delta}
    </span>
  )
}

function KpiCard({ item }: { item: KpiItem }) {
  const inner = (
    <div
      className="sera-card"
      style={{
        padding: 'var(--space-5)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        height: '100%',
        boxSizing: 'border-box',
        transition: 'transform var(--dur-fast), box-shadow var(--dur-fast)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          color: 'var(--sage)',
        }}
      >
        {item.icon && <span style={{ display: 'flex', flexShrink: 0 }}>{item.icon}</span>}
        <span className="sera-label">{item.label}</span>
      </div>
      <div className="sera-kpi">{item.value}</div>
      {item.delta && <DeltaBadge delta={item.delta} type={item.deltaType} />}
    </div>
  )

  if (item.href) {
    return (
      <Link
        href={item.href}
        style={{ textDecoration: 'none', display: 'block' }}
        className="kpi-card-link"
      >
        {inner}
      </Link>
    )
  }

  return <div>{inner}</div>
}

export function KpiStrip({ items }: KpiStripProps) {
  return (
    <>
      <style>{`
        .kpi-card-link .sera-card {
          cursor: pointer;
        }
        .kpi-card-link:hover .sera-card {
          transform: translateY(-2px);
          box-shadow: var(--shadow-md);
        }
        .kpi-strip {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: var(--space-3);
          margin-bottom: var(--space-8);
        }
        @media (max-width: 768px) {
          .kpi-strip {
            grid-template-columns: repeat(2, 1fr);
          }
        }
      `}</style>
      <div className="kpi-strip">
        {items.map((item, i) => (
          <KpiCard key={i} item={item} />
        ))}
      </div>
    </>
  )
}

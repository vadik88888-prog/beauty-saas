export type AppointmentStatus =
  | 'confirmed'
  | 'active'
  | 'pending'
  | 'completed'
  | 'cancelled'
  | 'no_show'
  | 'handed_off'

const STATUS_CLASS: Record<AppointmentStatus, string> = {
  confirmed:  'sera-pill sera-pill--sage',
  active:     'sera-pill sera-pill--sage',
  pending:    'sera-pill sera-pill--warning',
  completed:  'sera-pill sera-pill--success',
  cancelled:  'sera-pill sera-pill--error',
  no_show:    'sera-pill sera-pill--error',
  handed_off: 'sera-pill',   // info — handled via inline style below
}

interface StatusPillProps {
  status: AppointmentStatus
  label: string
}

export function StatusPill({ status, label }: StatusPillProps) {
  const isInfo = status === 'handed_off'

  return (
    <span
      className={STATUS_CLASS[status]}
      style={
        isInfo
          ? {
              background: 'var(--info-soft)',
              color: 'var(--info)',
            }
          : undefined
      }
    >
      {label}
    </span>
  )
}

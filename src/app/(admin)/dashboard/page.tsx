import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { Calendar, AlertCircle, CheckCircle2, Clock } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatTime, formatDate } from '@/lib/utils/date'
import { formatPrice } from '@/lib/utils/format'

async function getTenantId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const adminClient = createAdminClient()
  const { data } = await adminClient
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()
  if (!data) redirect('/login')
  return (data as { tenant_id: string }).tenant_id
}

export default async function DashboardPage() {
  const tenantId = await getTenantId()
  const supabase = createAdminClient()

  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)

  type ApptRow = {
    id: string
    starts_at: string
    ends_at: string
    status: string
    price: number | null
    client: { first_name: string | null; last_name: string | null } | null
    master: { name: string } | null
    service: { name: string; price: number; currency: string } | null
  }

  // Load today's appointments with relations
  const { data: appointments } = await supabase
    .from('appointments')
    .select(`
      id, starts_at, ends_at, status, price,
      client:clients(first_name, last_name),
      master:masters(name),
      service:services(name, price, currency)
    `)
    .eq('tenant_id', tenantId)
    .gte('starts_at', `${todayStr}T00:00:00Z`)
    .lte('starts_at', `${todayStr}T23:59:59Z`)
    .order('starts_at')

  const appts = (appointments as unknown as ApptRow[]) ?? []

  const totalCount = appts.length
  const confirmedCount = appts.filter(a => a.status === 'confirmed').length
  const pendingCount = appts.filter(a => a.status === 'pending').length
  const completedCount = appts.filter(a => a.status === 'completed').length
  const noShowCount = appts.filter(a => a.status === 'no_show').length
  const cancelledCount = appts.filter(a => a.status === 'cancelled').length

  const estimatedRevenue = appts
    .filter(a => ['confirmed', 'completed', 'pending'].includes(a.status))
    .reduce((sum, a) => sum + (a.price ?? 0), 0)

  const noShowRate = totalCount > 0 ? Math.round((noShowCount / totalCount) * 100) : 0

  return (
    <div className="p-6 flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Сводка дня</h1>
        <p className="text-muted-foreground text-sm mt-1">{formatDate(`${todayStr}T12:00:00`)}</p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          icon={<Calendar className="w-5 h-5 text-blue-500" />}
          label="Всего записей"
          value={totalCount}
          sub={`${confirmedCount} подтверждено`}
          color="blue"
        />
        <MetricCard
          icon={<CheckCircle2 className="w-5 h-5 text-green-500" />}
          label="Выручка (план)"
          value={formatPrice(estimatedRevenue, 'BYN')}
          sub={`${completedCount} завершено`}
          color="green"
        />
        <MetricCard
          icon={<Clock className="w-5 h-5 text-yellow-500" />}
          label="Ожидают"
          value={pendingCount}
          sub="Нужно подтвердить"
          color="yellow"
        />
        <MetricCard
          icon={<AlertCircle className="w-5 h-5 text-red-500" />}
          label="No-show"
          value={`${noShowRate}%`}
          sub={`${noShowCount} из ${totalCount}`}
          color="red"
        />
      </div>

      {/* Today's appointments */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Записи на сегодня</h2>
        {appts.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            <p>Сегодня записей нет</p>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {appts.map(appt => {
              const client = appt.client
              const master = appt.master
              const service = appt.service
              const clientName = [client?.first_name, client?.last_name].filter(Boolean).join(' ') || 'Клиент'

              return (
                <Card key={appt.id} className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="text-center w-12 shrink-0">
                      <p className="font-bold text-lg leading-none">{formatTime(appt.starts_at)}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{clientName}</p>
                      <p className="text-xs text-muted-foreground">{service?.name} · {master?.name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {service && (
                      <p className="font-semibold text-sm hidden sm:block">
                        {formatPrice(service.price, service.currency)}
                      </p>
                    )}
                    <StatusBadge status={appt.status} />
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function MetricCard({
  icon, label, value, sub, color,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  sub: string
  color: string
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">{icon}<span className="text-sm text-muted-foreground">{label}</span></div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{sub}</p>
    </Card>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    pending: { label: 'Ожидает', variant: 'outline' },
    confirmed: { label: 'Подтверждена', variant: 'default' },
    completed: { label: 'Завершена', variant: 'secondary' },
    cancelled: { label: 'Отменена', variant: 'destructive' },
    no_show: { label: 'No-show', variant: 'destructive' },
  }
  const s = map[status] ?? { label: status, variant: 'outline' as const }
  return <Badge variant={s.variant}>{s.label}</Badge>
}

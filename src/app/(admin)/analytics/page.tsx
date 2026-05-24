'use client'

import { useEffect, useState } from 'react'
import { TrendingUp, Users, DollarSign, AlertCircle, Bot, BarChart2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { formatPrice } from '@/lib/utils/format'

type Summary = {
  totalRevenue: number
  totalBookings: number
  completedCount: number
  noShowRate: number
  aiCost: number
  aiTokens: number
}

type DailyRow = {
  date: string
  revenue: number
  bookings: number
  completed: number
  noShow: number
}

type ServiceRow = { name: string; count: number; revenue: number }
type MasterRow = { name: string; count: number; noShow: number }

type AnalyticsData = {
  summary: Summary
  daily: DailyRow[]
  byService: ServiceRow[]
  byMaster: MasterRow[]
  period: number
}

const PERIODS = [
  { label: '7 дней', value: '7' },
  { label: '30 дней', value: '30' },
  { label: '90 дней', value: '90' },
]

export default function AnalyticsPage() {
  const [period, setPeriod] = useState('30')
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    setIsLoading(true)
    fetch(`/api/admin/analytics?period=${period}`)
      .then(r => r.json())
      .then(({ data }) => setData(data))
      .finally(() => setIsLoading(false))
  }, [period])

  const maxRevenue = data ? Math.max(...data.daily.map(d => d.revenue), 1) : 1

  return (
    <div className="p-6 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Аналитика</h1>
        <div className="flex gap-1">
          {PERIODS.map(p => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${period === p.value ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground text-sm">Загрузка...</div>
      ) : data && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <SummaryCard icon={<DollarSign className="w-5 h-5 text-green-500" />} label="Выручка" value={formatPrice(data.summary.totalRevenue, 'BYN')} sub={`${data.summary.completedCount} завершённых`} />
            <SummaryCard icon={<Users className="w-5 h-5 text-blue-500" />} label="Записей" value={data.summary.totalBookings} sub={`за ${data.period} дней`} />
            <SummaryCard icon={<AlertCircle className="w-5 h-5 text-red-500" />} label="No-show" value={`${data.summary.noShowRate}%`} sub="Процент неявок" />
            <SummaryCard icon={<TrendingUp className="w-5 h-5 text-purple-500" />} label="Конверсия" value={data.summary.totalBookings > 0 ? `${Math.round((data.summary.completedCount / data.summary.totalBookings) * 100)}%` : '0%'} sub="Завершено из всех" />
            <SummaryCard icon={<Bot className="w-5 h-5 text-orange-500" />} label="AI расходы" value={`$${data.summary.aiCost.toFixed(3)}`} sub={`${(data.summary.aiTokens / 1000).toFixed(1)}k токенов`} />
            <SummaryCard icon={<BarChart2 className="w-5 h-5 text-cyan-500" />} label="Средний чек" value={data.summary.completedCount > 0 ? formatPrice(data.summary.totalRevenue / data.summary.completedCount, 'BYN') : '—'} sub="За завершённую запись" />
          </div>

          {/* Revenue chart (CSS bars) */}
          <Card className="p-5">
            <h2 className="text-sm font-semibold mb-4">Выручка по дням</h2>
            {data.daily.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Нет данных за период</p>
            ) : (
              <div className="flex items-end gap-1 h-32 overflow-x-auto pb-2">
                {data.daily.map(day => {
                  const height = maxRevenue > 0 ? Math.max((day.revenue / maxRevenue) * 100, day.bookings > 0 ? 4 : 0) : 0
                  return (
                    <div key={day.date} className="flex flex-col items-center gap-1 min-w-[24px] group relative">
                      <div
                        className="w-5 rounded-t-sm bg-primary/70 hover:bg-primary transition-colors cursor-default"
                        style={{ height: `${height}%`, minHeight: day.bookings > 0 ? '4px' : '0' }}
                      />
                      {/* Tooltip */}
                      <div className="absolute bottom-full mb-1 hidden group-hover:block bg-foreground text-background text-xs rounded px-2 py-1 whitespace-nowrap z-10">
                        {new Date(day.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}<br />
                        {formatPrice(day.revenue, 'BYN')} · {day.bookings} записей
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* By service */}
            <Card className="p-5">
              <h2 className="text-sm font-semibold mb-4">Топ услуг</h2>
              {data.byService.length === 0 ? (
                <p className="text-sm text-muted-foreground">Нет данных</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {data.byService.map(s => (
                    <div key={s.name} className="flex items-center justify-between text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{s.name}</p>
                        <p className="text-xs text-muted-foreground">{s.count} записей</p>
                      </div>
                      <p className="font-semibold ml-3 shrink-0">{formatPrice(s.revenue, 'BYN')}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* By master */}
            <Card className="p-5">
              <h2 className="text-sm font-semibold mb-4">Мастера</h2>
              {data.byMaster.length === 0 ? (
                <p className="text-sm text-muted-foreground">Нет данных</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {data.byMaster.map(m => {
                    const rate = m.count > 0 ? Math.round((m.noShow / m.count) * 100) : 0
                    return (
                      <div key={m.name} className="flex items-center justify-between text-sm">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{m.name}</p>
                          <p className="text-xs text-muted-foreground">{m.count} записей</p>
                        </div>
                        <div className="text-right ml-3 shrink-0">
                          <p className={`text-xs font-medium ${rate > 20 ? 'text-red-500' : 'text-muted-foreground'}`}>
                            no-show: {rate}%
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

function SummaryCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string | number; sub: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-2">{icon}<span className="text-sm text-muted-foreground">{label}</span></div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{sub}</p>
    </Card>
  )
}

'use client'

import { useEffect, useState } from 'react'
import {
  TrendingUp, Users, Wallet, AlertCircle, Sparkles, BarChart3,
  Clock, MessageSquare, Target, Receipt, Tag,
} from 'lucide-react'
import { formatPrice } from '@/lib/utils/format'
import { PageHeader } from '@/components/shared/PageHeader'
import { SectionTitle } from '@/components/shared/SectionTitle'
import { MetricCard } from '@/components/shared/MetricCard'
import { EmptyState } from '@/components/shared/EmptyState'
import { cn } from '@/lib/utils'

type Summary = {
  totalRevenue: number
  totalBookings: number
  completedCount: number
  noShowRate: number
  aiCost: number
  aiTokens: number
}

type AiSection = {
  bookings: number
  revenue: number
  conversations: number
  messages: number
  savedHours: number
  conversionRate: number
}

type DailyRow = {
  date: string
  revenue: number
  bookings: number
  completed: number
  noShow: number
}

type ServiceRow = { name: string; count: number; revenue: number }
type MasterRow = { name: string; count: number; closed: number; noShow: number }

type PromoSection = {
  bookings: number
  eligible: number
  activationRate: number
  discountTotal: number
}

type AnalyticsData = {
  summary: Summary
  ai: AiSection
  promo: PromoSection
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
    <div className="p-5 md:p-8 max-w-5xl mx-auto flex flex-col gap-8">
      <PageHeader
        title="Аналитика"
        description="Бизнес-показатели и эффективность AI"
        actions={
          <div className="flex gap-1 bg-surface-sunken rounded-xl p-1">
            {PERIODS.map(p => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={cn(
                  'px-3 h-8 rounded-lg text-[12px] font-medium transition-colors',
                  period === p.value
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        }
      />

      {isLoading ? (
        <div className="text-muted-foreground text-sm">Загрузка...</div>
      ) : data && (
        <>
          {/* AI ROI section */}
          <section>
            <SectionTitle
              title="Эффективность AI"
              description={`За ${data.period} ${pluralize(data.period, ['день', 'дня', 'дней'])}`}
            />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <MetricCard
                isAi
                label="Записей через AI"
                value={data.ai.bookings}
                icon={Sparkles}
                hint={data.ai.bookings > 0 ? `${formatPrice(data.ai.revenue, 'BYN')} выручки` : 'пока 0'}
              />
              <MetricCard
                isAi
                label="Диалоги"
                value={data.ai.conversations}
                icon={MessageSquare}
                hint={`${data.ai.messages} сообщений`}
              />
              <MetricCard
                isAi
                label="Сэкономлено"
                value={data.ai.savedHours > 0 ? `~${data.ai.savedHours}ч` : '0ч'}
                icon={Clock}
                hint="вашего времени"
              />
              <MetricCard
                isAi
                label="Конверсия AI"
                value={`${data.ai.conversionRate}%`}
                icon={Target}
                hint="диалогов → запись"
              />
            </div>

            {/* AI ROI summary card */}
            {data.ai.revenue > 0 && data.summary.aiCost > 0 && (
              <div className="mt-4 p-5 rounded-2xl border border-ai-border bg-ai-soft flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-ai flex items-center justify-center shrink-0">
                  <TrendingUp className="w-4 h-4 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-ai-foreground">
                    AI принесла {formatPrice(data.ai.revenue, 'BYN')} выручки и стоила ${data.summary.aiCost.toFixed(2)}
                  </p>
                  <p className="text-[11px] text-ai-foreground/70 mt-0.5">
                    ROI ≈ {Math.round((data.ai.revenue / Math.max(data.summary.aiCost * 3, 0.01))).toLocaleString('ru-RU')}× · окупает себя в десятки раз
                  </p>
                </div>
              </div>
            )}
          </section>

          {/* Business summary */}
          <section>
            <SectionTitle title="Бизнес-показатели" />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <MetricCard
                label="Выручка"
                value={formatPrice(data.summary.totalRevenue, 'BYN')}
                icon={Wallet}
                hint={`${data.summary.completedCount} завершено`}
              />
              <MetricCard
                label="Всего записей"
                value={data.summary.totalBookings}
                icon={Users}
              />
              <MetricCard
                label="No-show"
                value={`${data.summary.noShowRate}%`}
                icon={AlertCircle}
                hint="процент неявок"
              />
              <MetricCard
                label="Средний чек"
                value={data.summary.completedCount > 0 ? formatPrice(data.summary.totalRevenue / data.summary.completedCount, 'BYN') : '—'}
                icon={Receipt}
              />
            </div>
          </section>

          {/* Promo activation */}
          <section>
            <SectionTitle
              title="Активация акций"
              description="Сколько записей создано с применённой скидкой"
            />
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <MetricCard
                label="Записей с акцией"
                value={`${data.promo.activationRate}%`}
                icon={Tag}
                hint={data.promo.eligible > 0
                  ? `${data.promo.bookings} из ${data.promo.eligible}`
                  : 'нет активных записей'}
              />
              <MetricCard
                label="Скидок на сумму"
                value={data.promo.discountTotal > 0 ? formatPrice(data.promo.discountTotal, 'BYN') : '—'}
                icon={Receipt}
                hint="суммарно за период"
              />
            </div>
          </section>

          {/* Revenue chart */}
          <section>
            <SectionTitle title="Выручка по дням" />
            <div className="card-elevated p-5">
              {data.daily.length === 0 ? (
                <EmptyState
                  icon={BarChart3}
                  title="Нет данных за период"
                  description="Когда появятся завершённые записи, здесь появится график"
                />
              ) : (
                <div className="flex items-end gap-1.5 h-40 overflow-x-auto pb-2">
                  {data.daily.map(day => {
                    const height = maxRevenue > 0 ? Math.max((day.revenue / maxRevenue) * 100, day.bookings > 0 ? 4 : 0) : 0
                    const hasAi = day.bookings > 0
                    return (
                      <div key={day.date} className="flex flex-col items-center gap-1 min-w-[28px] group relative">
                        <div
                          className={cn(
                            'w-full rounded-t-lg transition-all',
                            hasAi ? 'bg-ai/80 hover:bg-ai' : 'bg-muted'
                          )}
                          style={{ height: `${height}%`, minHeight: day.bookings > 0 ? '4px' : '2px' }}
                        />
                        {/* Tooltip */}
                        <div className="absolute bottom-full mb-1 hidden group-hover:block bg-foreground text-background text-[11px] rounded-lg px-2 py-1 whitespace-nowrap z-10 shadow-md">
                          <div className="font-semibold">{new Date(day.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</div>
                          <div>{formatPrice(day.revenue, 'BYN')} · {day.bookings} {pluralize(day.bookings, ['запись', 'записи', 'записей'])}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* By service */}
            <section>
              <SectionTitle title="Топ услуг" />
              <div className="card-elevated p-5">
                {data.byService.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground text-center py-2">Нет данных</p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {data.byService.map(s => (
                      <div key={s.name} className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-medium text-foreground truncate">{s.name}</p>
                          <p className="text-[11px] text-muted-foreground">{s.count} {pluralize(s.count, ['запись', 'записи', 'записей'])}</p>
                        </div>
                        <p className="text-[13px] font-semibold text-foreground shrink-0">{formatPrice(s.revenue, 'BYN')}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* By master */}
            <section>
              <SectionTitle title="Мастера" />
              <div className="card-elevated p-5">
                {data.byMaster.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground text-center py-2">Нет данных</p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {data.byMaster.map(m => {
                      // % неявок считаем только от закончившихся записей (completed+no_show),
                      // иначе будущие confirmed разбавляют процент.
                      const rate = m.closed > 0 ? Math.round((m.noShow / m.closed) * 100) : 0
                      return (
                        <div key={m.name} className="flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-medium text-foreground truncate">{m.name}</p>
                            <p className="text-[11px] text-muted-foreground">{m.count} {pluralize(m.count, ['запись', 'записи', 'записей'])}</p>
                          </div>
                          <span className={cn(
                            'text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0',
                            rate > 20 ? 'bg-destructive-soft text-destructive' : 'bg-muted text-muted-foreground'
                          )}>
                            no-show {rate}%
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* AI cost footer */}
          {data.summary.aiCost > 0 && (
            <p className="text-[11px] text-muted-foreground text-center">
              Расход на AI: ${data.summary.aiCost.toFixed(3)} · {(data.summary.aiTokens / 1000).toFixed(1)}k токенов
            </p>
          )}
        </>
      )}
    </div>
  )
}

function pluralize(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100
  const last = abs % 10
  if (abs > 10 && abs < 20) return forms[2]
  if (last > 1 && last < 5) return forms[1]
  if (last === 1) return forms[0]
  return forms[2]
}

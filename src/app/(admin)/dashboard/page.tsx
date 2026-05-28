import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Sparkles, MessageSquare, Calendar, Clock, Repeat,
  BookOpen, Wallet, TrendingDown, Users, BarChart3,
  ArrowRight, AlertCircle,
} from 'lucide-react'
import { MetricCard } from '@/components/shared/MetricCard'
import { SectionTitle } from '@/components/shared/SectionTitle'
import { GradientCard } from '@/components/shared/GradientCard'
import { AiBadge } from '@/components/shared/AiBadge'
import { AiActivityDot } from '@/components/shared/AiActivityDot'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatPrice } from '@/lib/utils/format'
import { formatTime } from '@/lib/utils/date'
import { getAiStats } from '@/lib/admin/get-ai-stats'

async function getTenantContext(): Promise<{ tenantId: string; userFirstName: string }> {
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
  const userFirstName = (user.user_metadata?.first_name as string | undefined) ?? user.email?.split('@')[0] ?? ''
  return { tenantId: (data as { tenant_id: string }).tenant_id, userFirstName }
}

async function getAiName(tenantId: string): Promise<string> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('tenant_ai_settings')
    .select('admin_name')
    .eq('tenant_id', tenantId)
    .single()
  return (data as { admin_name?: string } | null)?.admin_name ?? 'Алина'
}

async function getUpcomingAppointments(tenantId: string) {
  const supabase = createAdminClient()
  const nowIso = new Date().toISOString()
  const todayEnd = `${new Date().toISOString().slice(0, 10)}T23:59:59Z`

  type Row = {
    id: string
    starts_at: string
    status: string
    source: string | null
    client: { first_name: string | null; last_name: string | null } | null
    master: { name: string } | null
    service: { name: string; price: number | null; currency: string } | null
  }

  const { data } = await supabase
    .from('appointments')
    .select(`
      id, starts_at, status, source,
      client:clients(first_name, last_name),
      master:masters(name),
      service:services(name, price, currency)
    `)
    .eq('tenant_id', tenantId)
    .gte('starts_at', nowIso)
    .lte('starts_at', todayEnd)
    .in('status', ['pending', 'confirmed'])
    .order('starts_at')
    .limit(5)

  return (data as unknown as Row[]) ?? []
}

export default async function DashboardPage() {
  const { tenantId, userFirstName } = await getTenantContext()
  const [stats, aiName, upcoming] = await Promise.all([
    getAiStats(tenantId),
    getAiName(tenantId),
    getUpcomingAppointments(tenantId),
  ])

  const greeting = getGreeting()
  const ai = stats.ai
  const business = stats.business

  const heroStory = buildHeroStory(aiName, ai)

  return (
    <div className="p-5 md:p-8 max-w-6xl mx-auto flex flex-col gap-8">
      {/* Hero */}
      <section className="flex flex-col gap-1">
        <p className="text-[13px] text-muted-foreground">{greeting}{userFirstName ? `, ${userFirstName}` : ''}</p>
        <div className="flex items-start gap-3 flex-wrap">
          <h1 className="text-display text-foreground">
            {ai.messages_today > 0
              ? `${aiName} сегодня работала за вас`
              : `${aiName} готова работать`}
            <Sparkles className="inline w-6 h-6 ml-2 text-ai-foreground" strokeWidth={1.8} />
          </h1>
        </div>
        <p className="text-body text-muted-foreground max-w-2xl mt-1">{heroStory}</p>
      </section>

      {/* AI Metrics */}
      <section>
        <SectionTitle
          title="Что сделала AI"
          description="За сегодня"
        />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard
            isAi
            label="Диалоги"
            value={ai.conversations_today}
            icon={MessageSquare}
            hint="клиентов написали"
          />
          <MetricCard
            isAi
            label="Записи через AI"
            value={ai.bookings_today}
            icon={Calendar}
            hint="без участия админа"
          />
          <MetricCard
            isAi
            label="Сэкономлено"
            value={ai.saved_hours > 0 ? `~${ai.saved_hours}ч` : '0ч'}
            icon={Clock}
            hint="вашего времени"
          />
          <MetricCard
            isAi
            label="Использовано знаний"
            value={ai.knowledge_hits_today}
            icon={BookOpen}
            hint="из базы салона"
          />
        </div>
      </section>

      {/* Handoff alert */}
      {stats.handed_off_count > 0 && (
        <GradientCard variant="champagne" className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-accent/30 flex items-center justify-center shrink-0">
            <AlertCircle className="w-5 h-5 text-accent-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-h2 text-foreground">
              {stats.handed_off_count} {pluralize(stats.handed_off_count, ['диалог', 'диалога', 'диалогов'])} ждёт вашего ответа
            </p>
            <p className="text-caption mt-0.5">{aiName} передала эти диалоги вам</p>
          </div>
          <Link
            href="/chats"
            className="px-4 py-2 rounded-xl bg-foreground text-background text-[13px] font-medium hover:opacity-90 transition-opacity shrink-0"
          >
            Ответить
          </Link>
        </GradientCard>
      )}

      {/* Business Metrics */}
      <section>
        <SectionTitle title="Бизнес сегодня" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard
            label="Выручка"
            value={formatPrice(business.revenue_today, 'BYN')}
            icon={Wallet}
          />
          <MetricCard
            label="Всего записей"
            value={business.appointments_today}
            icon={Calendar}
          />
          <MetricCard
            label="No-show"
            value={business.no_shows_today}
            icon={TrendingDown}
          />
          <MetricCard
            label="Средний чек"
            value={business.avg_ticket > 0 ? formatPrice(business.avg_ticket, 'BYN') : '—'}
            icon={Users}
          />
        </div>
      </section>

      {/* AI Activity Feed */}
      <section>
        <SectionTitle
          title={`Что делает ${aiName}`}
          description="Последние действия"
          action={
            <Link
              href="/chats"
              className="text-[12px] text-ai-foreground hover:underline inline-flex items-center gap-1"
            >
              Все диалоги
              <ArrowRight className="w-3 h-3" />
            </Link>
          }
        />
        {stats.recent_activity.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title={`${aiName} пока ничего не сделала`}
            description="Когда клиенты начнут писать боту, здесь появится активность"
          />
        ) : (
          <div className="card-elevated divide-y divide-border">
            {stats.recent_activity.map((act, i) => (
              <ActivityRow key={i} item={act} aiName={aiName} />
            ))}
          </div>
        )}
      </section>

      {/* Upcoming appointments */}
      <section>
        <SectionTitle
          title="Ближайшие записи"
          action={
            <Link href="/calendar" className="text-[12px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              Расписание <ArrowRight className="w-3 h-3" />
            </Link>
          }
        />
        {upcoming.length === 0 ? (
          <EmptyState
            icon={Calendar}
            title="На сегодня записей больше нет"
          />
        ) : (
          <div className="card-elevated divide-y divide-border">
            {upcoming.map(appt => {
              const client = appt.client
              const clientName = [client?.first_name, client?.last_name].filter(Boolean).join(' ') || 'Клиент'
              const isAi = appt.source === 'ai'
              return (
                <div key={appt.id} className="flex items-center gap-4 px-4 py-3">
                  <div className="text-center w-12 shrink-0">
                    <p className="text-[15px] font-semibold leading-none">{formatTime(appt.starts_at)}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-[14px] truncate">{clientName}</p>
                      {isAi && <AiBadge />}
                    </div>
                    <p className="text-[12px] text-muted-foreground truncate">
                      {appt.service?.name} · {appt.master?.name}
                    </p>
                  </div>
                  {appt.service?.price && (
                    <p className="text-[13px] text-muted-foreground shrink-0 hidden sm:block">
                      {formatPrice(appt.service.price, appt.service.currency)}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function ActivityRow({ item, aiName }: { item: { type: string; text: string; time: string }; aiName: string }) {
  const icon = item.type === 'booking'
    ? <Calendar className="w-3.5 h-3.5" />
    : item.type === 'handoff'
      ? <Repeat className="w-3.5 h-3.5" />
      : <BookOpen className="w-3.5 h-3.5" />

  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="w-7 h-7 rounded-lg bg-ai-soft text-ai-foreground flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-foreground">
          <span className="font-medium">{aiName}</span> · {item.text}
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{formatRelative(item.time)}</p>
      </div>
    </div>
  )
}

function buildHeroStory(aiName: string, ai: { messages_today: number; bookings_today: number; saved_hours: number; conversations_today: number }): string {
  if (ai.messages_today === 0) {
    return `Поделитесь ссылкой на бота с клиентами — ${aiName} начнёт отвечать, записывать и сэкономит вам часы работы.`
  }
  const parts: string[] = []
  if (ai.messages_today > 0) parts.push(`обработала ${ai.messages_today} ${pluralize(ai.messages_today, ['сообщение', 'сообщения', 'сообщений'])}`)
  if (ai.bookings_today > 0) parts.push(`записала ${ai.bookings_today} ${pluralize(ai.bookings_today, ['клиента', 'клиентов', 'клиентов'])}`)
  if (ai.saved_hours >= 0.5) parts.push(`сэкономила ~${ai.saved_hours} ч`)
  return parts.length > 0 ? parts.join(', ') + '.' : 'AI готова к работе.'
}

function pluralize(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100
  const last = abs % 10
  if (abs > 10 && abs < 20) return forms[2]
  if (last > 1 && last < 5) return forms[1]
  if (last === 1) return forms[0]
  return forms[2]
}

function formatRelative(iso: string): string {
  const date = new Date(iso)
  const now = Date.now()
  const diffMin = Math.round((now - date.getTime()) / 60000)
  if (diffMin < 1) return 'только что'
  if (diffMin < 60) return `${diffMin} мин назад`
  if (diffMin < 1440) {
    const h = Math.floor(diffMin / 60)
    return `${h} ${pluralize(h, ['час', 'часа', 'часов'])} назад`
  }
  return date.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Доброе утро'
  if (h < 17) return 'Добрый день'
  if (h < 22) return 'Добрый вечер'
  return 'Доброй ночи'
}

// AiActivityDot is imported but currently unused in this file — keep for future hero status badge
void AiActivityDot
void BarChart3

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Bot, MessageSquare, Calendar, Clock, Wallet,
  Users, ArrowRight, AlertCircle, Repeat, BookOpen, Bell,
  UserCheck, Sparkles,
} from 'lucide-react'
import { formatPrice } from '@/lib/utils/format'
import { formatTime } from '@/lib/utils/date'
import { getAiStats } from '@/lib/admin/get-ai-stats'
import { TipBar } from './_components/TipBar'

async function getTenantContext(): Promise<{ tenantId: string; userFirstName: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const adminClient = createAdminClient()
  const { data } = await adminClient
    .from('tenant_users').select('tenant_id')
    .eq('user_id', user.id).eq('is_active', true).single()
  if (!data) redirect('/login')
  const userFirstName = (user.user_metadata?.first_name as string | undefined) ?? user.email?.split('@')[0] ?? ''
  return { tenantId: (data as { tenant_id: string }).tenant_id, userFirstName }
}

async function getAiName(tenantId: string): Promise<string> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('tenant_ai_settings').select('admin_name').eq('tenant_id', tenantId).single()
  return (data as { admin_name?: string } | null)?.admin_name ?? 'Алина'
}

type UpcomingRow = {
  id: string; starts_at: string; source: string | null
  client: { first_name: string | null; last_name: string | null } | null
  master: { name: string } | null
  service: { name: string; price: number | null; currency: string } | null
}

async function getUpcomingAppointments(tenantId: string): Promise<UpcomingRow[]> {
  const supabase = createAdminClient()
  const nowIso = new Date().toISOString()
  const todayEnd = `${new Date().toISOString().slice(0, 10)}T23:59:59Z`
  const { data } = await supabase
    .from('appointments')
    .select('id, starts_at, source, client:clients(first_name, last_name), master:masters(name), service:services(name, price, currency)')
    .eq('tenant_id', tenantId).gte('starts_at', nowIso).lte('starts_at', todayEnd)
    .in('status', ['pending', 'confirmed']).order('starts_at').limit(5)
  return (data as unknown as UpcomingRow[]) ?? []
}

function trendPct(today: number, yesterday: number): number | null {
  if (yesterday === 0 && today === 0) return null
  if (yesterday === 0) return 100
  return Math.round(((today - yesterday) / yesterday) * 100)
}

export default async function DashboardPage() {
  const { tenantId, userFirstName } = await getTenantContext()
  const [stats, aiName, upcoming] = await Promise.all([
    getAiStats(tenantId), getAiName(tenantId), getUpcomingAppointments(tenantId),
  ])

  const { ai, business } = stats
  const greeting = getGreeting()

  // Hero right-side processing items
  const processingItems = [
    { icon: MessageSquare, value: ai.conversations_today, label: `${pl(ai.conversations_today, ['диалог', 'диалога', 'диалогов'])} в чате`, sub: 'Отвечает клиентам' },
    { icon: Calendar,      value: ai.bookings_today,      label: `${pl(ai.bookings_today, ['запись', 'записи', 'записей'])} сегодня`, sub: 'Создано AI' },
    { icon: BookOpen,      value: ai.knowledge_hits_today, label: `${pl(ai.knowledge_hits_today, ['ответ', 'ответа', 'ответов'])} из базы`, sub: 'Из базы знаний' },
  ]

  // 5 KPI cards
  const kpis = [
    {
      icon: MessageSquare, label: 'Диалогов обработано',
      value: String(ai.conversations_today),
      trend: trendPct(ai.conversations_today, ai.conversations_yesterday),
    },
    {
      icon: Calendar, label: 'Записей создано',
      value: String(ai.bookings_today),
      trend: trendPct(ai.bookings_today, ai.bookings_yesterday),
    },
    {
      icon: UserCheck, label: 'Клиентов возвращено',
      value: String(ai.returning_today),
      trend: null,
    },
    {
      icon: Clock, label: 'Время сэкономлено',
      value: ai.saved_hours > 0 ? `${ai.saved_hours}ч` : '0ч',
      trend: trendPct(Math.round(ai.saved_hours * 10), Math.round(ai.saved_hours_yesterday * 10)),
    },
    {
      icon: Sparkles, label: 'Предложений услуги',
      value: String(ai.knowledge_hits_today),
      trend: null,
    },
  ]

  const nextAppt = upcoming[0] ?? null

  return (
    <div className="p-5 md:p-6 flex flex-col gap-4 pb-24">

      {/* Header */}
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-serif-h2 text-ink">
            {greeting}{userFirstName ? `, ${userFirstName}` : ''}!{' '}
            <span className="inline-block">{getGreetingEmoji()}</span>
          </h1>
          <p className="text-xs text-ink-2 mt-0.5">
            AI {aiName} {ai.conversations_today > 0 ? 'уже работает и помогает вашему салону расти' : 'готова работать с вашими клиентами'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-cream border border-line px-3 py-2 text-xs text-ink-2 font-medium">
            {formatTodayLong()}
          </span>
          <Link
            href="/chats"
            className="relative w-9 h-9 inline-flex items-center justify-center rounded-xl bg-cream border border-line text-ink hover:bg-cream-2 transition-colors"
            aria-label="Чаты"
          >
            <Bell className="w-4 h-4" strokeWidth={1.8} />
            {stats.handed_off_count > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[1rem] h-4 px-1 rounded-full bg-[#ef4444] text-white text-[0.625rem] font-semibold inline-flex items-center justify-center">
                {stats.handed_off_count}
              </span>
            )}
          </Link>
        </div>
      </header>

      {/* Handoff alert */}
      {stats.handed_off_count > 0 && (
        <Link
          href="/chats"
          className="flex items-center gap-3 rounded-2xl bg-peach/25 border border-peach/50 p-3.5 hover:bg-peach/35 transition-colors"
        >
          <span className="w-9 h-9 rounded-xl bg-cream flex items-center justify-center shrink-0">
            <AlertCircle className="w-4.5 h-4.5 text-ink-2" strokeWidth={1.8} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-ink">
              {stats.handed_off_count} {pl(stats.handed_off_count, ['диалог ждёт', 'диалога ждут', 'диалогов ждут'])} вашего ответа
            </p>
            <p className="text-xs text-ink-2 mt-0.5">{aiName} передала их вам</p>
          </div>
          <span className="shrink-0 rounded-xl bg-ink text-page text-xs font-medium px-4 py-2">Ответить</span>
        </Link>
      )}

      {/* AI Hero */}
      <section
        className="rounded-2xl border border-sage-soft grid grid-cols-1 md:grid-cols-2 gap-0 overflow-hidden"
        style={{ background: 'linear-gradient(135deg, var(--sage-tint) 0%, var(--cream-2) 200%)' }}
      >
        {/* Left: AI status */}
        <div className="p-5 flex items-start gap-4 border-b md:border-b-0 md:border-r border-sage-soft/60">
          <span className="w-12 h-12 rounded-2xl bg-cream border border-sage-soft flex items-center justify-center shrink-0">
            <Bot className="w-6 h-6 text-sage" strokeWidth={1.7} />
          </span>
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="font-serif text-lg text-ink leading-tight">{aiName}</span>
              <span className="inline-flex items-center gap-1 text-[0.6875rem] font-medium text-sage bg-cream border border-sage-soft rounded-full px-2 py-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-sage" /> Онлайн
              </span>
            </div>
            <p className="text-xs text-ink-2">AI-администратор</p>
            <p className="text-xs text-ink-2 mt-0.5">Готова помочь вашим клиентам</p>
            <span className="mt-2.5 inline-flex items-center gap-1.5 text-[0.6875rem] font-medium bg-cream border border-sage-soft text-sage rounded-full px-2.5 py-1">
              <Sparkles className="w-3 h-3" strokeWidth={1.8} />
              AI активна 24/7
            </span>
          </div>
        </div>

        {/* Right: processing stats */}
        <div className="p-5">
          <p className="text-xs font-semibold text-ink-2 mb-3 uppercase tracking-wide">Сейчас AI обрабатывает</p>
          <div className="flex flex-col gap-2">
            {processingItems.map((item, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl bg-cream/60 border border-sage-soft/50 px-3 py-2.5">
                <item.icon className="w-4 h-4 text-sage shrink-0" strokeWidth={1.8} />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold text-ink">{item.value} </span>
                  <span className="text-xs text-ink-2">{item.label}</span>
                </div>
                <span className="text-[0.6875rem] text-ink-2 shrink-0">{item.sub}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5 KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {kpis.map(kpi => (
          <KpiCard key={kpi.label} icon={kpi.icon} value={kpi.value} label={kpi.label} trend={kpi.trend} />
        ))}
      </div>

      {/* Bottom: activity + next appointment */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Activity feed — 2/3 */}
        <section className="md:col-span-2">
          <div className="flex items-center justify-between mb-2.5">
            <h3 className="text-sm font-semibold text-ink">AI активность в реальном времени</h3>
            <Link href="/chats" className="text-xs text-sage font-medium hover:text-sage-2 inline-flex items-center gap-1">
              Смотреть все <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {stats.recent_activity.length === 0 ? (
            <div className="rounded-2xl bg-cream border border-line p-8 text-center">
              <Bot className="w-7 h-7 text-sage mx-auto mb-2" strokeWidth={1.6} />
              <p className="text-sm font-medium text-ink">{aiName} пока ничего не сделала</p>
              <p className="text-xs text-ink-2 mt-1">Когда клиенты начнут писать боту, здесь появится активность</p>
            </div>
          ) : (
            <div className="rounded-2xl bg-cream border border-line divide-y divide-line">
              {stats.recent_activity.map((act, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <span className="w-7 h-7 rounded-lg bg-sage-tint text-sage flex items-center justify-center shrink-0">
                    {act.type === 'booking' ? <Calendar className="w-3.5 h-3.5" /> : act.type === 'handoff' ? <Repeat className="w-3.5 h-3.5" /> : <BookOpen className="w-3.5 h-3.5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.8125rem] text-ink truncate">{act.text}</p>
                  </div>
                  <span className="text-[0.6875rem] text-ink-2 shrink-0">{formatRelative(act.time)}</span>
                </div>
              ))}
              <div className="px-4 py-3">
                <Link href="/chats" className="text-xs text-sage font-medium hover:text-sage-2 flex items-center gap-1">
                  Смотреть все действия <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          )}
        </section>

        {/* Next appointment — 1/3 */}
        <section className="rounded-2xl bg-cream border border-line overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5 border-b border-line">
            <span className="text-sm font-semibold text-ink">Следующая запись</span>
            <Link href="/calendar" className="text-xs text-sage font-medium hover:text-sage-2 inline-flex items-center gap-1">
              Расписание <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {nextAppt == null ? (
            <div className="p-5 text-center">
              <Calendar className="w-7 h-7 text-sage mx-auto mb-2" strokeWidth={1.6} />
              <p className="text-xs text-ink-2">На сегодня записей больше нет</p>
              <Link href="/calendar" className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-line bg-cream-2 hover:bg-cream px-4 py-2 text-xs font-medium text-ink transition-colors">
                Открыть календарь <Calendar className="w-3.5 h-3.5" />
              </Link>
            </div>
          ) : (
            <div className="p-4 flex flex-col gap-3">
              <div className="text-center py-2">
                <div className="text-[2.25rem] font-bold text-ink leading-none">{formatTime(nextAppt.starts_at)}</div>
              </div>
              <div className="rounded-xl bg-cream-2 border border-line p-3">
                <p className="text-sm font-semibold text-ink truncate">
                  {[nextAppt.client?.first_name, nextAppt.client?.last_name].filter(Boolean).join(' ') || 'Клиент'}
                </p>
                <p className="text-xs text-ink-2 truncate mt-0.5">{nextAppt.service?.name}</p>
                {nextAppt.master?.name && (
                  <p className="text-xs text-ink-2 truncate mt-0.5">Мастер: {nextAppt.master.name}</p>
                )}
                {nextAppt.service?.price != null && (
                  <p className="text-xs font-medium text-sage mt-1">{formatPrice(nextAppt.service.price, nextAppt.service.currency)}</p>
                )}
              </div>
              {upcoming.length > 1 && (
                <div className="divide-y divide-line">
                  {upcoming.slice(1, 3).map(appt => (
                    <div key={appt.id} className="flex items-center gap-2 py-2">
                      <span className="text-xs font-semibold text-ink w-10 shrink-0">{formatTime(appt.starts_at)}</span>
                      <p className="text-xs text-ink-2 truncate flex-1">{[appt.client?.first_name, appt.client?.last_name].filter(Boolean).join(' ') || 'Клиент'}</p>
                    </div>
                  ))}
                </div>
              )}
              <Link href="/calendar" className="flex items-center justify-center gap-1.5 rounded-xl border border-line bg-cream-2 hover:bg-cream px-4 py-2.5 text-xs font-medium text-ink transition-colors">
                Открыть календарь <Calendar className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}
        </section>
      </div>

      {/* Smart tip — fixed bottom bar */}
      {stats.smart_tip && <TipBar tip={stats.smart_tip} aiName={aiName} />}

    </div>
  )
}

function KpiCard({ icon: Icon, value, label, trend }: { icon: typeof Wallet; value: string; label: string; trend: number | null }) {
  const trendEl = (() => {
    if (trend === null) return null
    const pos = trend > 2, neg = trend < -2
    return (
      <span className={`text-[0.6875rem] font-medium ${pos ? 'text-sage' : neg ? 'text-[#ef4444]' : 'text-ink-2'}`}>
        {pos ? `+${trend}%` : neg ? `${trend}%` : '0%'}
        <span className="text-ink-2 font-normal"> vs вчера</span>
      </span>
    )
  })()

  return (
    <div className="rounded-2xl bg-cream border border-line p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[0.75rem] text-ink-2 leading-tight">{label}</span>
        <Icon className="w-4 h-4 text-sage shrink-0" strokeWidth={1.8} />
      </div>
      <div className="text-[1.75rem] font-bold text-ink leading-none">{value}</div>
      {trendEl ?? <span className="text-[0.6875rem] text-ink-2">—</span>}
    </div>
  )
}

function pl(n: number, f: [string, string, string]): string {
  const abs = Math.abs(n) % 100, last = abs % 10
  if (abs > 10 && abs < 20) return f[2]
  if (last > 1 && last < 5) return f[1]
  if (last === 1) return f[0]
  return f[2]
}

function formatRelative(iso: string): string {
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (diffMin < 1) return 'сейчас'
  if (diffMin < 60) return `${diffMin}м`
  const h = Math.floor(diffMin / 60)
  return `${h}ч`
}

const RU_MONTHS_GEN = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря']
const RU_WEEKDAYS   = ['воскресенье','понедельник','вторник','среда','четверг','пятница','суббота']
function formatTodayLong(): string {
  const d = new Date()
  return `${d.getDate()} ${RU_MONTHS_GEN[d.getMonth()]}, ${RU_WEEKDAYS[d.getDay()]}`
}

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Доброе утро'
  if (h < 17) return 'Добрый день'
  if (h < 22) return 'Добрый вечер'
  return 'Доброй ночи'
}

function getGreetingEmoji(): string {
  const h = new Date().getHours()
  if (h < 12) return '☀️'
  if (h < 17) return '👋'
  if (h < 22) return '🌙'
  return '✨'
}

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Bot, MessageSquare, Calendar, Clock, BookOpen, Wallet,
  TrendingDown, Users, ArrowRight, AlertCircle, Repeat, Bell, Lightbulb,
} from 'lucide-react'
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

type UpcomingRow = {
  id: string
  starts_at: string
  source: string | null
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
    .select(`
      id, starts_at, source,
      client:clients(first_name, last_name),
      master:masters(name),
      service:services(name, price, currency)
    `)
    .eq('tenant_id', tenantId)
    .gte('starts_at', nowIso)
    .lte('starts_at', todayEnd)
    .in('status', ['pending', 'confirmed'])
    .order('starts_at')
    .limit(4)

  return (data as unknown as UpcomingRow[]) ?? []
}

export default async function DashboardPage() {
  const { tenantId, userFirstName } = await getTenantContext()
  const [stats, aiName, upcoming] = await Promise.all([
    getAiStats(tenantId),
    getAiName(tenantId),
    getUpcomingAppointments(tenantId),
  ])

  const ai = stats.ai
  const business = stats.business
  const greeting = getGreeting()
  const tip = buildTip(aiName, stats)

  const heroStats = [
    { icon: MessageSquare, value: ai.conversations_today, label: 'диалогов обработано' },
    { icon: Calendar, value: ai.bookings_today, label: 'клиентов записано' },
    { icon: Clock, value: ai.saved_hours > 0 ? `${ai.saved_hours}ч` : '0ч', label: 'сэкономлено времени' },
    { icon: BookOpen, value: ai.knowledge_hits_today, label: 'ответов из базы знаний' },
  ]

  return (
    <div className="p-6 md:p-8 flex flex-col gap-5">
      {/* Header */}
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-serif-h2 text-ink">
            {greeting}{userFirstName ? `, ${userFirstName}` : ''}! <span className="inline-block">👋</span>
          </h1>
          <p className="text-[13px] text-ink-2 mt-0.5">
            {aiName} {ai.conversations_today > 0 ? 'уже работает и помогает вашему салону' : 'готова работать с вашими клиентами'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-cream border border-line px-3 py-2 text-[12px] text-ink-2">
            <Calendar className="w-3.5 h-3.5 text-sage" strokeWidth={1.8} />
            {formatTodayLong()}
          </span>
          <Link
            href="/chats"
            className="relative w-9 h-9 inline-flex items-center justify-center rounded-xl bg-cream border border-line text-ink hover:bg-cream-2 transition-colors"
            aria-label="Чаты"
          >
            <Bell className="w-4 h-4" strokeWidth={1.8} />
            {stats.handed_off_count > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#ef4444] text-white text-[10px] font-semibold inline-flex items-center justify-center">
                {stats.handed_off_count}
              </span>
            )}
          </Link>
        </div>
      </header>

      {/* AI hero */}
      <section
        className="rounded-3xl p-5 border border-sage-soft"
        style={{ background: 'linear-gradient(135deg, var(--sage-tint) 0%, var(--cream-2) 220%)' }}
      >
        <div className="flex items-center gap-3 mb-4">
          <span className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-cream border border-sage-soft">
            <Bot className="w-6 h-6 text-sage" strokeWidth={1.7} />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-serif text-xl text-ink leading-tight">{aiName} работает</h2>
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-sage bg-cream border border-sage-soft rounded-full px-2 py-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-sage" /> Онлайн сейчас
              </span>
            </div>
            <p className="text-[12px] text-ink-2 mt-0.5">Сегодня:</p>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {heroStats.map((s, i) => (
            <div key={i} className="rounded-2xl bg-cream/70 border border-sage-soft/60 p-3.5 flex items-center gap-3">
              <s.icon className="w-5 h-5 text-sage shrink-0" strokeWidth={1.8} />
              <div className="min-w-0">
                <div className="text-[22px] font-semibold text-ink leading-none">{s.value}</div>
                <div className="text-[11px] text-ink-2 leading-tight mt-1">{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Handoff alert */}
      {stats.handed_off_count > 0 && (
        <Link
          href="/chats"
          className="flex items-center gap-3 rounded-2xl bg-peach/25 border border-peach/50 p-4 hover:bg-peach/35 transition-colors"
        >
          <span className="w-10 h-10 rounded-xl bg-cream flex items-center justify-center shrink-0">
            <AlertCircle className="w-5 h-5 text-ink-2" strokeWidth={1.8} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[15px] text-ink">
              {stats.handed_off_count} {pluralize(stats.handed_off_count, ['диалог ждёт', 'диалога ждут', 'диалогов ждут'])} вашего ответа
            </p>
            <p className="text-[12px] text-ink-2 mt-0.5">{aiName} передала их вам</p>
          </div>
          <span className="shrink-0 rounded-xl bg-ink text-page text-[13px] font-medium px-4 py-2">Ответить</span>
        </Link>
      )}

      {/* Business KPI */}
      <section>
        <h3 className="text-[16px] font-semibold text-ink mb-3">Бизнес сегодня</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard icon={Wallet} value={formatPrice(business.revenue_today, 'BYN')} label="Выручка" />
          <KpiCard icon={Calendar} value={String(business.appointments_today)} label="Всего записей" />
          <KpiCard icon={TrendingDown} value={String(business.no_shows_today)} label="No-show" />
          <KpiCard icon={Users} value={business.avg_ticket > 0 ? formatPrice(business.avg_ticket, 'BYN') : '—'} label="Средний чек" />
        </div>
      </section>

      {/* Bottom: activity feed (wide) + right rail (tip + upcoming) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Activity feed — 2/3 */}
        <section className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[16px] font-semibold text-ink">Что сделала {aiName}</h3>
            <Link href="/chats" className="text-[12px] text-sage font-medium hover:text-sage-2 inline-flex items-center gap-1">
              Все действия <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {stats.recent_activity.length === 0 ? (
            <div className="rounded-2xl bg-cream border border-line p-8 text-center">
              <Bot className="w-8 h-8 text-sage mx-auto mb-2.5" strokeWidth={1.6} />
              <p className="text-[14px] font-medium text-ink">{aiName} пока ничего не сделала</p>
              <p className="text-[13px] text-ink-2 mt-1">Когда клиенты начнут писать боту, здесь появится активность</p>
            </div>
          ) : (
            <div className="rounded-2xl bg-cream border border-line divide-y divide-line">
              {stats.recent_activity.map((act, i) => (
                <div key={i} className="flex items-start gap-3 px-4 py-3.5">
                  <span className="w-8 h-8 rounded-xl bg-sage-tint text-sage flex items-center justify-center shrink-0 mt-0.5">
                    {act.type === 'booking' ? <Calendar className="w-4 h-4" /> : act.type === 'handoff' ? <Repeat className="w-4 h-4" /> : <BookOpen className="w-4 h-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-ink"><span className="font-medium">{aiName}</span> · {act.text}</p>
                    <p className="text-[12px] text-ink-2 mt-0.5">{formatRelative(act.time)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Right rail — 1/3 */}
        <div className="flex flex-col gap-4">
          {/* Tip */}
          <div
            className="rounded-2xl p-4 border border-sage-soft"
            style={{ background: 'linear-gradient(135deg, var(--sage-tint) 0%, var(--cream-2) 240%)' }}
          >
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb className="w-4 h-4 text-sage" strokeWidth={1.8} />
              <span className="text-[14px] font-semibold text-ink">Совет от {aiName}</span>
            </div>
            <p className="font-serif italic text-[15px] text-ink-2 leading-snug">{tip}</p>
          </div>

          {/* Upcoming */}
          <div className="rounded-2xl bg-cream border border-line overflow-hidden flex-1">
            <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5">
              <span className="text-[14px] font-semibold text-ink">Ближайшие записи</span>
              <Link href="/calendar" className="text-[12px] text-sage font-medium hover:text-sage-2 inline-flex items-center gap-1">
                Расписание <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            {upcoming.length === 0 ? (
              <p className="px-4 pb-4 text-[13px] text-ink-2">На сегодня записей больше нет.</p>
            ) : (
              <div className="divide-y divide-line">
                {upcoming.map(appt => {
                  const clientName = [appt.client?.first_name, appt.client?.last_name].filter(Boolean).join(' ') || 'Клиент'
                  return (
                    <div key={appt.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="text-[14px] font-semibold text-ink w-12 shrink-0">{formatTime(appt.starts_at)}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-ink truncate">{clientName}</p>
                        <p className="text-[12px] text-ink-2 truncate">{appt.service?.name} · {appt.master?.name}</p>
                      </div>
                      {appt.service?.price != null && (
                        <span className="text-[13px] text-ink-2 font-medium shrink-0">{formatPrice(appt.service.price, appt.service.currency)}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function KpiCard({ icon: Icon, value, label }: { icon: typeof Wallet; value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-cream border border-line p-4">
      <Icon className="w-4 h-4 text-sage mb-2.5" strokeWidth={1.8} />
      <div className="text-[22px] font-semibold text-ink leading-none">{value}</div>
      <div className="text-[13px] text-ink-2 mt-1.5">{label}</div>
    </div>
  )
}

function buildTip(aiName: string, stats: { ai: { conversations_today: number; bookings_today: number }; handed_off_count: number }): string {
  if (stats.handed_off_count > 0) {
    return `Вас ждут ${stats.handed_off_count} ${pluralize(stats.handed_off_count, ['диалог', 'диалога', 'диалогов'])} — клиенты охотнее возвращаются, когда им отвечают в тот же день.`
  }
  if (stats.ai.bookings_today > 0) {
    return `Сегодня ${aiName} уже записала ${stats.ai.bookings_today} ${pluralize(stats.ai.bookings_today, ['клиента', 'клиентов', 'клиентов'])}. Так держать!`
  }
  if (stats.ai.conversations_today > 0) {
    return `${aiName} уже общается с клиентами. Запустите акцию, чтобы превратить диалоги в записи.`
  }
  return `Поделитесь ссылкой на бота с клиентами — ${aiName} начнёт отвечать, записывать и сэкономит вам часы работы.`
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
  const diffMin = Math.round((Date.now() - date.getTime()) / 60000)
  if (diffMin < 1) return 'только что'
  if (diffMin < 60) return `${diffMin} мин назад`
  if (diffMin < 1440) {
    const h = Math.floor(diffMin / 60)
    return `${h} ${pluralize(h, ['час', 'часа', 'часов'])} назад`
  }
  return date.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

const RU_MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const RU_WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота']
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

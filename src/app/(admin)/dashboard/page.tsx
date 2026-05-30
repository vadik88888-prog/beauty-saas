import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Calendar, Clock, Users, AlertCircle,
  Repeat, BookOpen, Bell, ChevronRight, Sparkles, MessageSquare,
} from 'lucide-react'
import { formatPrice } from '@/lib/utils/format'
import { formatTime } from '@/lib/utils/date'
import { getAiStats } from '@/lib/admin/get-ai-stats'
import { AlinaSymbol } from '@/components/admin/AlinaSymbol'
import { DateNav } from './_components/DateNav'
import { AdviceCard } from './_components/AdviceCard'

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
  id: string; starts_at: string
  client: { first_name: string | null; last_name: string | null } | null
  master: { name: string } | null
  service: { name: string; price: number | null; currency: string } | null
}

async function getNextAppointment(tenantId: string): Promise<UpcomingRow | null> {
  const supabase = createAdminClient()
  const nowIso = new Date().toISOString()
  const in48h  = new Date(Date.now() + 48 * 3600000).toISOString()
  const { data } = await supabase
    .from('appointments')
    .select('id, starts_at, client:clients(first_name, last_name), master:masters(name), service:services(name, price, currency)')
    .eq('tenant_id', tenantId)
    .gte('starts_at', nowIso).lte('starts_at', in48h)
    .in('status', ['pending', 'confirmed'])
    .order('starts_at').limit(1)
  return (data as unknown as UpcomingRow[])?.[0] ?? null
}

function trendPct(today: number, yesterday: number): number | null {
  if (yesterday === 0 && today === 0) return null
  if (yesterday === 0) return 100
  return Math.round(((today - yesterday) / yesterday) * 100)
}

function fmtApptDate(iso: string): string {
  const d        = new Date(iso)
  const today    = new Date()
  const tomorrow = new Date(Date.now() + 86400000)
  const months   = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря']
  if (d.toDateString() === today.toDateString())    return 'Сегодня'
  if (d.toDateString() === tomorrow.toDateString()) return `Завтра, ${d.getDate()} ${months[d.getMonth()]}`
  return `${d.getDate()} ${months[d.getMonth()]}`
}

function fmtHHMM(iso: string): string {
  const d = new Date(iso)
  return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`
}

function pl(n: number, f: [string, string, string]): string {
  const abs = Math.abs(n) % 100, last = abs % 10
  if (abs > 10 && abs < 20) return f[2]
  if (last > 1 && last < 5) return f[1]
  if (last === 1) return f[0]
  return f[2]
}

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Доброе утро'
  if (h < 17) return 'Добрый день'
  if (h < 22) return 'Добрый вечер'
  return 'Доброй ночи'
}

function greetEmoji(): string {
  const h = new Date().getHours()
  if (h < 12) return '☀️'
  if (h < 17) return '👋'
  if (h < 22) return '🌙'
  return '✨'
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const { date: dateParam } = await searchParams
  const today   = new Date().toISOString().slice(0, 10)
  const dateStr = dateParam ?? today
  const isToday = dateStr === today

  const { tenantId, userFirstName } = await getTenantContext()
  const [stats, aiName, nextAppt] = await Promise.all([
    getAiStats(tenantId, dateStr),
    getAiName(tenantId),
    isToday ? getNextAppointment(tenantId) : Promise.resolve(null),
  ])

  const { ai, business } = stats
  const greeting = isToday ? getGreeting() : 'Данные за'
  const greetSuffix = isToday ? (userFirstName ? `, ${userFirstName}` : '') : ''

  // Hero: "СЕЙЧАС АЛИНА" items
  const nowItems = [
    { icon: MessageSquare, label: 'Отвечает клиентам',        value: ai.conversations_today,  unit: pl(ai.conversations_today,  ['диалог', 'диалога', 'диалогов']) + ' в чате' },
    { icon: Calendar,      label: 'Записала клиентов',        value: ai.bookings_today,       unit: pl(ai.bookings_today,       ['запись', 'записи',  'записей'])  + ' сегодня' },
    { icon: BookOpen,      label: 'Ответов из базы знаний',   value: ai.knowledge_hits_today, unit: pl(ai.knowledge_hits_today, ['ответ', 'ответа',   'ответов']) },
  ]

  // 3 KPI
  const kpis = [
    { label: 'Записей через AI',     value: String(ai.bookings_today),
      trend: trendPct(ai.bookings_today, ai.bookings_yesterday) },
    { label: 'Времени сэкономлено',  value: ai.saved_hours > 0 ? `${ai.saved_hours}ч` : '0ч',
      trend: trendPct(Math.round(ai.saved_hours * 10), Math.round(ai.saved_hours_yesterday * 10)) },
    { label: 'Клиентов возвращено',  value: String(ai.returning_today), trend: null as number | null },
  ]

  // Activity icon / bg config
  const iconConf = {
    booking: { icon: Calendar, bg: 'bg-sage text-page' },
    handoff: { icon: Repeat,   bg: 'bg-[#f0d8d4] text-[#8b3a2a]' },
    message: { icon: BookOpen, bg: 'bg-[#e0ecff] text-[#3b6cb5]' },
  }

  return (
    <div className="p-5 md:p-6 flex flex-col gap-4 pb-8">

      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-serif-h2 text-ink">
            {greeting}{greetSuffix}
            {isToday && <> <span className="inline-block">{greetEmoji()}</span></>}
            {!isToday && <> <span className="font-sans text-base font-normal text-ink-2">{new Date(dateStr + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</span></>}
          </h1>
          <p className="text-xs text-ink-2 mt-0.5">
            {ai.bookings_today > 0
              ? `${aiName} ${isToday ? 'уже пообщалась' : 'пообщалась'} с клиентами и помогла вашему салону.`
              : `${aiName} ${isToday ? 'готова работать' : 'работала'} с клиентами вашего салона.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DateNav dateStr={dateStr} />
          <Link
            href="/chats"
            className="relative w-9 h-9 inline-flex items-center justify-center rounded-xl bg-cream border border-line text-ink hover:bg-cream-2 transition-colors"
            aria-label="Сообщения"
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

      {/* ── Handoff alert ────────────────────────────────────────── */}
      {stats.handed_off_count > 0 && (
        <Link
          href="/chats"
          className="flex items-center gap-3 rounded-2xl bg-[#fdf0ec] border border-[#e8b4a2] p-3.5 hover:bg-[#fae6de] transition-colors"
        >
          <span className="w-9 h-9 rounded-xl bg-white flex items-center justify-center shrink-0">
            <AlertCircle className="w-5 h-5 text-[#c05c3c]" strokeWidth={1.8} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm text-ink">
              {stats.handed_off_count} {pl(stats.handed_off_count, ['диалог ждёт', 'диалога ждут', 'диалогов ждут'])} вашего ответа
            </p>
            <p className="text-xs text-ink-2 mt-0.5">{aiName} передала их вам — клиенты ждут</p>
          </div>
          <span className="shrink-0 rounded-xl bg-[#c05c3c] text-white text-xs font-semibold px-4 py-2">Ответить</span>
        </Link>
      )}

      {/* ── Hero ────────────────────────────────────────────────── */}
      <section
        className="rounded-2xl border border-[#a8c8a0]/50 overflow-hidden grid grid-cols-1 md:grid-cols-2"
        style={{ background: 'linear-gradient(135deg, #b8d4b2 0%, #f0ebe0 65%)' }}
      >
        {/* Left */}
        <div className="flex flex-col items-start justify-center gap-4 p-6 border-b md:border-b-0 md:border-r border-[#a8c8a0]/40">
          <div className="relative">
            <AlinaSymbol size={92} animate />
            <span className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-[#16a34a] border-2 border-white animate-online-pulse shadow-sm" />
          </div>
          <div>
            <h2 className="font-serif text-[1.4rem] font-bold text-ink leading-tight">
              Алина работает для вас
            </h2>
            <p className="text-xs text-[#4a6644] mt-1">AI-администратор салона</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-[0.6875rem] font-bold text-[#166534] bg-[#dcfce7] border border-[#86efac] rounded-full px-3 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#16a34a]" /> Онлайн
            </span>
            <span className="inline-flex items-center gap-1.5 text-[0.6875rem] font-semibold text-[#4a6644] bg-white/60 border border-[#a8c8a0] rounded-full px-3 py-1">
              <Sparkles className="w-3 h-3" strokeWidth={2} /> Активна 24/7
            </span>
          </div>
        </div>

        {/* Right: СЕЙЧАС */}
        <div className="p-5 flex flex-col justify-center">
          <p className="text-[0.625rem] font-black text-[#4a6644] uppercase tracking-[0.15em] mb-4">
            Сейчас {aiName}
          </p>
          <div className="flex flex-col gap-0">
            {nowItems.map((item, i) => (
              <div key={i} className={`flex items-center justify-between py-3 ${i < nowItems.length - 1 ? 'border-b border-[#a8c8a0]/40' : ''}`}>
                <div className="flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-lg bg-white/50 border border-[#a8c8a0]/60 flex items-center justify-center">
                    <item.icon className="w-3.5 h-3.5 text-[#4a6644]" strokeWidth={1.8} />
                  </span>
                  <span className="text-xs text-[#4a6644] font-medium">{item.label}</span>
                </div>
                <span className="text-sm font-black text-ink">
                  {item.value} <span className="text-xs font-normal text-[#4a6644]">{item.unit}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 3 KPI ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {kpis.map((kpi, i) => {
          const pos = (kpi.trend ?? 0) > 2
          const neg = (kpi.trend ?? 0) < -2
          const bigColor = pos ? 'text-[#16a34a]' : 'text-ink'
          return (
            <div
              key={i}
              className="rounded-2xl bg-white border border-line p-4 flex flex-col gap-1.5 shadow-sm hover:shadow-md transition-shadow"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <span className="text-[0.6875rem] font-semibold text-ink-2 uppercase tracking-wide">{kpi.label}</span>
              <div className={`text-[2.75rem] font-black leading-none ${bigColor}`}>{kpi.value}</div>
              {kpi.trend != null ? (
                <span className={`text-xs font-semibold ${pos ? 'text-[#16a34a]' : neg ? 'text-[#ef4444]' : 'text-ink-2'}`}>
                  {pos ? `↑ +${kpi.trend}%` : neg ? `↓ ${kpi.trend}%` : '— 0%'}
                  <span className="text-ink-2 font-normal"> vs вчера</span>
                </span>
              ) : (
                <span className="text-[0.6875rem] text-ink-2">постоянные клиенты</span>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Activity + right column ──────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Activity feed — 2/3 */}
        <section className="md:col-span-2 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-ink">Что сделала {aiName}</h3>
            <Link
              href={`/activity${dateStr !== today ? `?date=${dateStr}` : ''}`}
              className="text-xs text-sage font-semibold hover:text-sage-2 inline-flex items-center gap-1 transition-colors"
            >
              Подробнее <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {stats.recent_activity.length === 0 ? (
            <div className="rounded-2xl bg-white border border-line p-10 text-center shadow-sm">
              <AlinaSymbol size={44} className="mx-auto mb-3 opacity-50" />
              <p className="text-sm font-semibold text-ink">{aiName} пока ничего не сделала</p>
              <p className="text-xs text-ink-2 mt-1">Когда клиенты напишут боту, здесь появится активность</p>
            </div>
          ) : (
            <div className="rounded-2xl bg-white border border-line overflow-hidden shadow-sm">
              {stats.recent_activity.map((act, i) => {
                const conf = iconConf[act.type]
                const Icon = conf.icon
                return (
                  <div
                    key={i}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-cream-2/70 transition-colors cursor-default border-b border-line last:border-0"
                  >
                    <span className="text-xs font-mono font-bold text-ink w-11 shrink-0 tabular-nums">{fmtHHMM(act.time)}</span>
                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${conf.bg}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink truncate">{act.text}</p>
                      {act.subtitle && <p className="text-xs text-ink-2 truncate mt-0.5">{act.subtitle}</p>}
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-ink-2/30 shrink-0" />
                  </div>
                )
              })}
              <Link
                href={`/activity${dateStr !== today ? `?date=${dateStr}` : ''}`}
                className="flex items-center justify-center gap-1.5 px-4 py-3 text-xs font-semibold text-sage hover:bg-sage-tint transition-colors"
              >
                Все действия {aiName} <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
          )}
        </section>

        {/* Right column */}
        <div className="flex flex-col gap-4">

          {/* Совет от Алины */}
          <AdviceCard tips={stats.smart_tips} aiName={aiName} />

          {/* Следующая запись */}
          <div className="rounded-2xl bg-white border border-line overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5 border-b border-line">
              <span className="text-sm font-bold text-ink">Следующая запись</span>
              <Link href="/calendar" className="text-xs text-sage font-semibold hover:text-sage-2 inline-flex items-center gap-1 transition-colors">
                Открыть <ChevronRight className="w-3 h-3" />
              </Link>
            </div>

            {nextAppt == null ? (
              <div className="p-5 text-center flex flex-col items-center gap-2">
                <Calendar className="w-7 h-7 text-sage opacity-40" strokeWidth={1.6} />
                <p className="text-xs text-ink-2">Ближайших записей нет</p>
              </div>
            ) : (
              <div className="p-4 flex flex-col gap-2.5">
                <p className="text-[0.6875rem] font-bold text-ink-2 uppercase tracking-wide">{fmtApptDate(nextAppt.starts_at)}</p>
                <div className="text-[2.75rem] font-black text-sage leading-none tabular-nums">
                  {formatTime(nextAppt.starts_at)}
                </div>
                <div className="rounded-xl bg-cream-2 border border-line p-3">
                  <p className="text-sm font-bold text-ink truncate">{nextAppt.service?.name ?? 'Услуга'}</p>
                  <p className="text-xs text-ink-2 truncate mt-0.5">
                    {[nextAppt.client?.first_name, nextAppt.client?.last_name].filter(Boolean).join(' ') || 'Клиент'}
                    {nextAppt.master?.name ? ` · ${nextAppt.master.name}` : ''}
                  </p>
                  {nextAppt.service?.price != null && (
                    <p className="text-xs font-bold text-sage mt-1.5">{formatPrice(nextAppt.service.price, nextAppt.service.currency)}</p>
                  )}
                </div>
                <Link href="/calendar" className="flex items-center justify-center gap-1.5 rounded-xl border border-line bg-cream-2 hover:bg-cream px-4 py-2.5 text-xs font-semibold text-ink transition-colors">
                  <Calendar className="w-3.5 h-3.5" /> Открыть календарь
                </Link>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}

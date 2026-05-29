import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Calendar, Clock, Users, ArrowRight, AlertCircle,
  Repeat, BookOpen, Bell, ChevronRight, Sparkles,
  MessageSquare,
} from 'lucide-react'
import { formatPrice } from '@/lib/utils/format'
import { formatTime } from '@/lib/utils/date'
import { getAiStats } from '@/lib/admin/get-ai-stats'
import { AlinaSymbol } from '@/components/admin/AlinaSymbol'

async function getTenantContext(): Promise<{ tenantId: string; userFirstName: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const adminClient = createAdminClient()
  const { data } = await adminClient
    .from('tenant_users').select('tenant_id')
    .eq('user_id', user.id).eq('is_active', true).single()
  if (!data) redirect('/login')
  const userFirstName =
    (user.user_metadata?.first_name as string | undefined) ?? user.email?.split('@')[0] ?? ''
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

function formatApptDate(iso: string): string {
  const d = new Date(iso)
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

export default async function DashboardPage() {
  const { tenantId, userFirstName } = await getTenantContext()
  const [stats, aiName, nextAppt] = await Promise.all([
    getAiStats(tenantId),
    getAiName(tenantId),
    getNextAppointment(tenantId),
  ])

  const { ai, business } = stats
  const greeting = getGreeting()

  // Dynamic subtitle
  const subtitle = ai.bookings_today > 0
    ? `${aiName} уже пообщалась с клиентами и продолжает помогать.`
    : `${aiName} готова работать с вашими клиентами — всё под контролем.`

  // Hero right side — "СЕЙЧАС АЛИНА" items
  const nowItems = [
    { icon: MessageSquare, label: 'Отвечает клиентам',        value: ai.conversations_today,  unit: pl(ai.conversations_today, ['диалог в чате', 'диалога в чате', 'диалогов в чате']) },
    { icon: Calendar,      label: 'Записала клиента',          value: ai.bookings_today,       unit: pl(ai.bookings_today, ['запись сегодня', 'записи сегодня', 'записей сегодня']) },
    { icon: BookOpen,      label: 'Обучается на новых данных', value: ai.knowledge_hits_today, unit: pl(ai.knowledge_hits_today, ['новое знание', 'новых знания', 'новых знаний']) },
  ]

  // 3 KPI cards
  const kpis = [
    {
      label: 'Записей через AI',
      value: String(ai.bookings_today),
      trend: trendPct(ai.bookings_today, ai.bookings_yesterday),
    },
    {
      label: 'Времени сэкономлено',
      value: ai.saved_hours > 0 ? `${ai.saved_hours}ч` : '0ч',
      trend: trendPct(Math.round(ai.saved_hours * 10), Math.round(ai.saved_hours_yesterday * 10)),
    },
    {
      label: 'Клиентов возвращено',
      value: String(ai.returning_today),
      trend: null as number | null,
    },
  ]

  return (
    <div className="p-5 md:p-6 flex flex-col gap-4 pb-8">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-serif-h2 text-ink">
            {greeting}{userFirstName ? `, ${userFirstName}` : ''}!{' '}
            <span className="inline-block">{greetEmoji()}</span>
          </h1>
          <p className="text-xs text-ink-2 mt-0.5">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-cream border border-line px-3 py-2 text-xs text-ink-2 font-medium">
            {formatTodayLong()}
          </span>
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

      {/* ── Handoff alert ───────────────────────────────────────────── */}
      {stats.handed_off_count > 0 && (
        <Link
          href="/chats"
          className="flex items-center gap-3 rounded-2xl bg-peach/25 border border-peach/50 p-3.5 hover:bg-peach/35 transition-colors animate-card-in"
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

      {/* ── Hero ────────────────────────────────────────────────────── */}
      <section
        className="rounded-2xl border border-sage-soft overflow-hidden grid grid-cols-1 md:grid-cols-2 animate-card-in"
        style={{ background: 'linear-gradient(135deg, var(--sage-tint) 0%, var(--cream-2) 180%)' }}
      >
        {/* Left — Alina identity */}
        <div className="flex flex-col items-start justify-center gap-3 p-6 border-b md:border-b-0 md:border-r border-sage-soft/60">
          <div className="relative">
            <AlinaSymbol size={88} animate />
            <span className="absolute bottom-1 right-1 w-3.5 h-3.5 rounded-full bg-[#4ade80] border-2 border-cream-2 animate-online-pulse" />
          </div>
          <div>
            <h2 className="font-serif text-[1.35rem] text-ink leading-tight">Алина работает для вас</h2>
            <p className="text-xs text-ink-2 mt-0.5">AI-администратор салона</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-[0.6875rem] font-semibold text-sage bg-cream border border-sage-soft rounded-full px-2.5 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80]" />
              Онлайн
            </span>
            <span className="inline-flex items-center gap-1.5 text-[0.6875rem] font-medium text-ink-2 bg-cream/70 border border-sage-soft/60 rounded-full px-2.5 py-1">
              <Sparkles className="w-3 h-3 text-sage" strokeWidth={1.8} />
              Активна 24/7
            </span>
          </div>
        </div>

        {/* Right — "СЕЙЧАС АЛИНА" */}
        <div className="p-5 flex flex-col justify-center">
          <p className="text-[0.6875rem] font-semibold text-ink-2 uppercase tracking-widest mb-3">
            Сейчас {aiName}
          </p>
          <div className="flex flex-col divide-y divide-sage-soft/60">
            {nowItems.map((item, i) => (
              <div key={i} className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-2.5">
                  <item.icon className="w-4 h-4 text-sage shrink-0" strokeWidth={1.7} />
                  <span className="text-[0.8125rem] text-ink-2">{item.label}</span>
                </div>
                <span className="text-[0.8125rem] font-semibold text-ink text-right">
                  {item.value} <span className="font-normal text-ink-2">{item.unit}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 3 KPI cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {kpis.map((kpi, i) => {
          const pos = (kpi.trend ?? 0) > 2
          const neg = (kpi.trend ?? 0) < -2
          return (
            <div key={i} className="rounded-2xl bg-cream border border-line p-4 animate-card-in flex flex-col gap-1.5" style={{ animationDelay: `${i * 60}ms` }}>
              <span className="text-xs text-ink-2">{kpi.label}</span>
              <div className="text-[2rem] font-bold text-ink leading-none">{kpi.value}</div>
              {kpi.trend != null ? (
                <span className={`text-[0.6875rem] font-medium ${pos ? 'text-sage' : neg ? 'text-[#ef4444]' : 'text-ink-2'}`}>
                  {pos ? `+${kpi.trend}%` : neg ? `${kpi.trend}%` : '0%'}
                  <span className="text-ink-2 font-normal"> vs вчера</span>
                </span>
              ) : (
                <span className="text-[0.6875rem] text-ink-2">постоянные клиенты</span>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Bottom: activity feed + right column ────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Activity feed — 2/3 */}
        <section className="md:col-span-2 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Что сделала {aiName} сегодня</h3>
            <Link href="/chats" className="text-xs text-sage font-medium hover:text-sage-2 inline-flex items-center gap-1 transition-colors">
              Смотреть все <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {stats.recent_activity.length === 0 ? (
            <div className="rounded-2xl bg-cream border border-line p-10 text-center">
              <AlinaSymbol size={48} className="mx-auto mb-3 opacity-60" />
              <p className="text-sm font-medium text-ink">{aiName} пока ничего не сделала</p>
              <p className="text-xs text-ink-2 mt-1 max-w-[260px] mx-auto">Когда клиенты начнут писать боту, здесь появится активность</p>
            </div>
          ) : (
            <div className="rounded-2xl bg-cream border border-line overflow-hidden">
              {stats.recent_activity.map((act, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-cream-2 transition-colors cursor-default border-b border-line last:border-0"
                >
                  {/* Time */}
                  <span className="text-[0.75rem] font-mono text-ink-2 w-10 shrink-0 tabular-nums">{fmtHHMM(act.time)}</span>

                  {/* Icon */}
                  <span className="w-7 h-7 rounded-lg bg-sage-tint text-sage flex items-center justify-center shrink-0">
                    {act.type === 'booking'
                      ? <Calendar className="w-3.5 h-3.5" />
                      : act.type === 'handoff'
                      ? <Repeat className="w-3.5 h-3.5" />
                      : <BookOpen className="w-3.5 h-3.5" />}
                  </span>

                  {/* Text + subtitle */}
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.8125rem] font-medium text-ink truncate">{act.text}</p>
                    {act.subtitle && (
                      <p className="text-[0.6875rem] text-ink-2 truncate mt-0.5">{act.subtitle}</p>
                    )}
                  </div>

                  <ChevronRight className="w-3.5 h-3.5 text-ink-2/40 shrink-0" />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Right column: advice + next appointment */}
        <div className="flex flex-col gap-4">

          {/* Совет от Алины */}
          {stats.smart_tip && (
            <div
              className="rounded-2xl border border-sage-soft p-4 flex flex-col gap-3 animate-card-in"
              style={{ background: 'linear-gradient(135deg, var(--sage-tint) 0%, var(--cream-2) 200%)' }}
            >
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-cream border border-sage-soft flex items-center justify-center">
                  <Sparkles className="w-3.5 h-3.5 text-sage" strokeWidth={1.8} />
                </span>
                <span className="text-sm font-semibold text-ink">Совет от {aiName}</span>
              </div>
              <p className="text-[0.8125rem] text-ink-2 leading-relaxed">{stats.smart_tip.text}</p>
              <div className="flex items-center gap-2 flex-wrap">
                <Link
                  href={stats.smart_tip.href}
                  className="inline-flex items-center rounded-xl bg-ink text-page text-xs font-medium px-4 py-2 hover:bg-ink/90 transition-colors"
                >
                  {stats.smart_tip.action}
                </Link>
                <Link href="/promo" className="text-xs text-sage font-medium hover:text-sage-2 transition-colors inline-flex items-center gap-1">
                  Другие идеи <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          )}

          {/* Следующая запись */}
          <div className="rounded-2xl bg-cream border border-line overflow-hidden flex flex-col flex-1">
            <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5 border-b border-line">
              <span className="text-sm font-semibold text-ink">Следующая запись</span>
              <Link href="/calendar" className="text-xs text-sage font-medium hover:text-sage-2 inline-flex items-center gap-1 transition-colors">
                Открыть календарь <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {nextAppt == null ? (
              <div className="p-5 text-center flex flex-col items-center gap-2">
                <Calendar className="w-7 h-7 text-sage opacity-50" strokeWidth={1.6} />
                <p className="text-xs text-ink-2">Ближайших записей нет</p>
              </div>
            ) : (
              <div className="p-4 flex flex-col gap-2.5">
                <p className="text-[0.6875rem] text-ink-2 font-medium uppercase tracking-wide">
                  {formatApptDate(nextAppt.starts_at)}
                </p>
                <div className="text-[2.5rem] font-bold text-ink leading-none tabular-nums">
                  {formatTime(nextAppt.starts_at)}
                </div>
                <div className="rounded-xl bg-cream-2 border border-line p-3">
                  <p className="text-sm font-semibold text-ink truncate">
                    {nextAppt.service?.name ?? 'Услуга'}
                  </p>
                  <p className="text-xs text-ink-2 truncate mt-0.5">
                    {[nextAppt.client?.first_name, nextAppt.client?.last_name].filter(Boolean).join(' ') || 'Клиент'}
                    {nextAppt.master?.name ? ` • ${nextAppt.master.name}` : ''}
                  </p>
                  {nextAppt.service?.price != null && (
                    <p className="text-xs font-medium text-sage mt-1">{formatPrice(nextAppt.service.price, nextAppt.service.currency)}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
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

function greetEmoji(): string {
  const h = new Date().getHours()
  if (h < 12) return '☀️'
  if (h < 17) return '👋'
  if (h < 22) return '🌙'
  return '✨'
}

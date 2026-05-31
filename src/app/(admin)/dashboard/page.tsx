import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Calendar, ChevronRight, AlertCircle, Sparkles,
  Clock, UserX, TrendingUp,
} from 'lucide-react'
import { formatPrice } from '@/lib/utils/format'
import { getAiStats } from '@/lib/admin/get-ai-stats'
import { AlinaCareOrb } from '@/components/motion/AlinaCareOrb'
import { DateNav } from './_components/DateNav'
import { AdviceCard } from './_components/AdviceCard'

async function getTenantContext(): Promise<{ tenantId: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const adminClient = createAdminClient()
  const { data } = await adminClient
    .from('tenant_users').select('tenant_id')
    .eq('user_id', user.id).eq('is_active', true).single()
  if (!data) redirect('/login')
  return { tenantId: (data as { tenant_id: string }).tenant_id }
}

// SERA = бренд платформы, всегда SERA независимо от admin_name в БД
const SERA = 'SERA'

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

function fmtFullDate(): string {
  return new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'long' })
}

const activityIcons: Record<string, string> = {
  booking: '📅',
  message: '📖',
  handoff: '🔄',
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

  const { tenantId } = await getTenantContext()
  const seraName = SERA
  const stats = await getAiStats(tenantId, dateStr)

  const { ai, business } = stats

  const kpis = [
    {
      label: `Записей через ${seraName}`,
      value: String(ai.bookings_today),
      trend: trendPct(ai.bookings_today, ai.bookings_yesterday),
    },
    {
      label: 'Сэкономлено времени',
      value: ai.saved_hours > 0 ? `${ai.saved_hours} ч` : '0 ч',
      trend: trendPct(Math.round(ai.saved_hours * 10), Math.round(ai.saved_hours_yesterday * 10)),
    },
    {
      label: 'Клиентов возвращено',
      value: String(ai.returning_today),
      trend: null as number | null,
    },
    {
      label: 'Диалогов сегодня',
      value: String(ai.conversations_today),
      trend: trendPct(ai.conversations_today, ai.conversations_yesterday),
    },
  ]

  return (
    <div className="p-5 md:p-6 flex flex-col gap-4 pb-10">

      {/* ── Header ── */}
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-serif-h2 text-ink leading-tight">
            {seraName} рядом. Заботится. С каждым клиентом.{' '}
            <span className="text-[#e6a83a]">✦</span>
          </h1>
          <p className="text-xs text-ink-2 mt-0.5">
            {isToday
              ? 'Ваш AI-администратор работает 24/7'
              : `Данные за ${new Date(dateStr + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-ink-2 hidden sm:block">{fmtFullDate()}</span>
          <DateNav dateStr={dateStr} />
          <Link
            href="/chats"
            className="relative w-9 h-9 inline-flex items-center justify-center rounded-xl bg-white border border-line text-ink hover:bg-cream-2 transition-colors"
            aria-label="Сообщения"
          >
            <Calendar className="w-4 h-4" strokeWidth={1.8} />
            {stats.handed_off_count > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[1rem] h-4 px-1 rounded-full bg-[#ef4444] text-white text-[0.625rem] font-semibold inline-flex items-center justify-center">
                {stats.handed_off_count}
              </span>
            )}
          </Link>
        </div>
      </header>

      {/* ── Handoff alert ── */}
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
            <p className="text-xs text-ink-2 mt-0.5">{seraName} передала их вам — клиенты ждут</p>
          </div>
          <span className="shrink-0 rounded-xl bg-[#c05c3c] text-white text-xs font-semibold px-4 py-2">Ответить</span>
        </Link>
      )}

      {/* ── Hero ── */}
      <section
        className="rounded-2xl overflow-hidden"
        style={{ background: '#172417', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <div className="grid grid-cols-1 md:grid-cols-[240px_1fr_300px]">

          {/* Orb */}
          <div
            className="flex flex-col items-center justify-center gap-3 p-6 border-b md:border-b-0 md:border-r"
            style={{ borderColor: 'rgba(255,255,255,0.08)' }}
          >
            <AlinaCareOrb state="online" size={168} />
            <div className="text-center">
              <p className="text-[13px] font-bold text-white">{seraName} онлайн</p>
              <p className="text-[11px] mt-0.5" style={{ color: '#4ade80' }}>● Активна 24/7</p>
            </div>
          </div>

          {/* KPI list */}
          <div className="flex flex-col justify-center">
            {kpis.map((kpi, i) => {
              const pos = (kpi.trend ?? 0) > 2
              const neg = (kpi.trend ?? 0) < -2
              return (
                <div
                  key={i}
                  className="flex items-center justify-between px-5 py-3"
                  style={{ borderBottom: i < kpis.length - 1 ? '1px solid rgba(255,255,255,0.07)' : 'none' }}
                >
                  <span className="text-[12px]" style={{ color: 'rgba(255,255,255,0.50)' }}>{kpi.label}</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-[1.75rem] font-black leading-none text-white tabular-nums">{kpi.value}</span>
                    {kpi.trend != null ? (
                      <span className={`text-[11px] font-semibold ${pos ? 'text-[#4ade80]' : neg ? 'text-[#f87171]' : 'text-white/40'}`}>
                        {pos ? `+${kpi.trend}%` : neg ? `${kpi.trend}%` : '0%'}
                        <span className="text-white/25 font-normal ml-1">к вчера</span>
                      </span>
                    ) : (
                      <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.28)' }}>постоянные</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Advice panel */}
          <div
            className="p-5 border-t md:border-t-0 md:border-l flex flex-col gap-3"
            style={{ borderColor: 'rgba(255,255,255,0.08)' }}
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-3 h-3 shrink-0" style={{ color: '#e6a83a' }} strokeWidth={2.2} />
              <span className="text-[10px] font-black uppercase tracking-[0.12em]" style={{ color: '#e6a83a' }}>
                Совет от {seraName}
              </span>
              <span className="ml-auto text-[10px]" style={{ color: 'rgba(255,255,255,0.30)' }}>
                {new Date().toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' })}
              </span>
            </div>
            <AdviceCard tips={stats.smart_tips} aiName={seraName} dark />
          </div>
        </div>
      </section>

      {/* ── Middle grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Что сделала SERA — col-span-2 */}
        <section className="md:col-span-2 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-ink">Что сделала {seraName} сегодня</h3>
            <Link href="/chats" className="text-xs text-sage font-semibold hover:text-sage-2 inline-flex items-center gap-1 transition-colors">
              Смотреть все <ChevronRight className="w-3 h-3" />
            </Link>
          </div>

          {stats.recent_activity.length === 0 ? (
            <div className="rounded-2xl bg-white border border-line p-8 text-center shadow-sm flex flex-col items-center gap-2">
              <AlinaCareOrb state="idle" size={44} className="opacity-50" />
              <p className="text-sm font-semibold text-ink">{seraName} пока ничего не сделала</p>
              <p className="text-xs text-ink-2">Когда клиенты напишут боту, здесь появится активность</p>
            </div>
          ) : (
            <div className="rounded-2xl bg-white border border-line overflow-hidden shadow-sm">
              {stats.recent_activity.map((act, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 hover:bg-cream-2/70 transition-colors border-b border-line last:border-0">
                  <span className="text-xs font-mono font-bold text-ink w-11 shrink-0 tabular-nums">{fmtHHMM(act.time)}</span>
                  <span className="text-base shrink-0 w-5 text-center">{activityIcons[act.type] ?? '·'}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink truncate">{act.text}</p>
                    {act.subtitle && <p className="text-xs text-ink-2 truncate mt-0.5">{act.subtitle}</p>}
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-ink-2/30 shrink-0" />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Right column */}
        <div className="flex flex-col gap-4">

          {/* Состояние SERA */}
          <div className="rounded-2xl bg-white border border-line overflow-hidden shadow-sm">
            <div className="px-4 pt-3.5 pb-2.5 border-b border-line">
              <span className="text-sm font-bold text-ink">Состояние {seraName}</span>
            </div>
            <div className="p-4 flex flex-col items-center gap-3">
              <AlinaCareOrb state={isToday ? 'online' : 'idle'} size={68} />
              <div className="text-center">
                <p className="text-sm font-bold text-ink">
                  {isToday ? `${seraName} онлайн` : `${seraName} в ожидании`}
                </p>
                <p className="text-xs text-ink-2 mt-0.5 leading-snug">
                  {isToday ? 'Работает для вас и ваших клиентов' : 'Просмотр истории'}
                </p>
              </div>
              <div className="flex gap-1.5 flex-wrap justify-center">
                {['Онлайн', 'Думает', 'Отвечает', 'Записывает'].map((s, i) => (
                  <span
                    key={i}
                    className={`text-[10px] font-semibold px-2 py-1 rounded-full border transition-colors ${i === 0 && isToday ? 'bg-sage-tint border-sage-soft text-sage' : 'bg-cream border-line text-ink-2'}`}
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Активность сегодня */}
          <div className="rounded-2xl bg-white border border-line overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5 border-b border-line">
              <span className="text-sm font-bold text-ink">Активность сегодня</span>
              <Link href="/analytics" className="text-xs text-sage font-semibold hover:text-sage-2 inline-flex items-center gap-1 transition-colors">
                Аналитика <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="grid grid-cols-2 divide-x divide-y divide-line">
              {[
                { label: 'Записей',      value: String(ai.bookings_today)      },
                { label: 'Диалогов',     value: String(ai.conversations_today) },
                { label: 'Возвращено',   value: String(ai.returning_today)     },
                { label: 'Сэкономлено', value: `${ai.saved_hours}ч`           },
              ].map((item, i) => (
                <div key={i} className="p-3 flex flex-col gap-0.5">
                  <span className="text-[1.4rem] font-black text-ink leading-none tabular-nums">{item.value}</span>
                  <span className="text-[10px] text-ink-2 font-medium">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Клиенты под риском */}
        <div className="rounded-2xl bg-white border border-line overflow-hidden shadow-sm flex flex-col">
          <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5 border-b border-line">
            <div className="flex items-center gap-2">
              <UserX className="w-4 h-4 text-[#c05c3c]" strokeWidth={1.8} />
              <span className="text-sm font-bold text-ink">Клиенты под риском</span>
            </div>
            <Link href="/clients" className="text-xs text-sage font-semibold hover:text-sage-2 inline-flex items-center gap-1 transition-colors">
              Все <ChevronRight className="w-3 h-3" />
            </Link>
          </div>

          {stats.at_risk.count === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-2">
              <span className="text-2xl">🎉</span>
              <p className="text-sm font-semibold text-ink">Всё отлично!</p>
              <p className="text-xs text-ink-2">Нет клиентов, давно не приходивших</p>
            </div>
          ) : (
            <div className="flex flex-col flex-1">
              <div className="flex-1">
                {stats.at_risk.top3.map((c, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-line last:border-0 hover:bg-cream-2/50 transition-colors">
                    <span className="w-8 h-8 rounded-full bg-[#fdf0ec] border border-[#e8b4a2] flex items-center justify-center shrink-0 text-[11px] font-bold text-[#c05c3c]">
                      {c.name.charAt(0).toUpperCase()}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-ink truncate">{c.name}</p>
                      <p className="text-[11px] text-ink-2">не приходил {c.days_absent} {pl(c.days_absent, ['день', 'дня', 'дней'])}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-4 py-3 border-t border-line bg-cream-2/50">
                {stats.at_risk.count > 3 && (
                  <p className="text-[11px] text-ink-2 mb-2">
                    +{stats.at_risk.count - 3} клиентов ещё не возвращались
                  </p>
                )}
                <Link
                  href="/chats"
                  className="flex items-center justify-center gap-1.5 w-full rounded-xl bg-sage text-page text-xs font-semibold px-4 py-2.5 hover:bg-sage-2 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" strokeWidth={2} />
                  {seraName} вернёт клиентов
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* SERA рекомендует для роста */}
        <div className="rounded-2xl bg-white border border-line overflow-hidden shadow-sm flex flex-col">
          <div className="flex items-center gap-2 px-4 pt-3.5 pb-2.5 border-b border-line">
            <TrendingUp className="w-4 h-4 text-sage" strokeWidth={1.8} />
            <span className="text-sm font-bold text-ink">Рекомендует для роста</span>
          </div>
          <div className="flex-1 flex flex-col divide-y divide-line">
            {stats.smart_tips.slice(0, 3).map((tip, i) => (
              <div key={i} className="px-4 py-3 flex flex-col gap-2 hover:bg-cream-2/50 transition-colors">
                <p className="text-[12px] text-ink leading-snug">{tip.text}</p>
                <Link
                  href={tip.href}
                  className="self-start text-[11px] font-semibold text-sage hover:text-sage-2 inline-flex items-center gap-1 transition-colors"
                >
                  {tip.action} <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
            ))}
          </div>
        </div>

        {/* Ближайшие записи */}
        <div className="rounded-2xl bg-white border border-line overflow-hidden shadow-sm flex flex-col">
          <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5 border-b border-line">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-sage" strokeWidth={1.8} />
              <span className="text-sm font-bold text-ink">Ближайшие записи</span>
            </div>
            <Link href="/calendar" className="text-xs text-sage font-semibold hover:text-sage-2 inline-flex items-center gap-1 transition-colors">
              Открыть <ChevronRight className="w-3 h-3" />
            </Link>
          </div>

          {stats.upcoming.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-2">
              <Calendar className="w-7 h-7 text-sage opacity-40" strokeWidth={1.6} />
              <p className="text-xs text-ink-2">Нет ближайших записей</p>
              <Link href="/calendar" className="text-xs font-semibold text-sage hover:text-sage-2 transition-colors">
                Открыть расписание →
              </Link>
            </div>
          ) : (
            <div className="flex-1 flex flex-col divide-y divide-line overflow-hidden">
              {stats.upcoming.map((appt, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 hover:bg-cream-2/50 transition-colors">
                  <div className="shrink-0 text-center min-w-[2.5rem]">
                    <p className="text-[1.2rem] font-black text-sage leading-none tabular-nums">{fmtHHMM(appt.starts_at)}</p>
                    <p className="text-[10px] text-ink-2 mt-0.5 whitespace-nowrap">{fmtApptDate(appt.starts_at)}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-ink truncate">{appt.service}</p>
                    <p className="text-[11px] text-ink-2 truncate mt-0.5">
                      {appt.client}{appt.master ? ` · ${appt.master}` : ''}
                    </p>
                  </div>
                  {appt.price != null && (
                    <span className="shrink-0 text-xs font-bold text-sage">{formatPrice(appt.price, appt.currency)}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {business.revenue_today > 0 && (
            <div className="px-4 py-3 border-t border-line bg-sage-tint/40">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-ink-2">Выручка сегодня</span>
                <span className="text-sm font-bold text-sage">{formatPrice(business.revenue_today, 'BYN')}</span>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

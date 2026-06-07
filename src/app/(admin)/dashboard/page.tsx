import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Bell, Calendar, ChevronRight, MessageSquare,
  BookOpen, Clock, RefreshCw, AlertTriangle,
  TrendingUp, Users, Tag, Settings,
} from 'lucide-react'
import { getAiStats } from '@/lib/admin/get-ai-stats'
import { SeraOrb } from '@/components/motion/SeraOrb'
import { DateNav } from './_components/DateNav'
import { AtRiskSection } from './_components/AtRiskSection'
import { TodayDate } from '@/components/admin/TodayDate'
import { formatPrice } from '@/lib/utils/format'
import { formatTime, formatApptLabel, localIsoDate } from '@/lib/utils/date'
import { Avatar } from '@/components/shared/Avatar'

// ── Design tokens (TMA-aligned: cream + sage) ────────────────────────────────
const C = {
  pageBg:      '#efe9dd',
  cardBg:      '#ffffff',
  cardBorder:  'rgba(27,42,34,0.09)',
  ink:         '#1b2a22',
  ink2:        '#2f3b32',
  muted:       '#6b7b6e',
  sage:        '#5e7d5d',
  sageSoft:    '#c9d8c5',
  sageTint:    '#e7eee2',
  gold:        '#e6a83a',
  goldSoft:    '#fdf3dc',
  error:       '#b94040',
  errorSoft:   '#fdf3f1',
  peach:       '#f2ebe5',
}


// ── Helpers ──────────────────────────────────────────────────────────────────
async function getTenantContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()
  const { data } = await admin.from('tenant_users').select('tenant_id')
    .eq('user_id', user.id).eq('is_active', true).single()
  if (!data) redirect('/login')
  const { data: tenant } = await admin.from('tenants').select('name')
    .eq('id', (data as { tenant_id: string }).tenant_id).single()
  return {
    tenantId: (data as { tenant_id: string }).tenant_id,
    salonName: (tenant as { name: string } | null)?.name ?? 'Ваш салон',
  }
}

function getGreeting(): string {
  const h = new Date().getHours()
  if (h >= 5 && h < 12) return 'Доброе утро'
  if (h >= 12 && h < 17) return 'Добрый день'
  return 'Добрый вечер'
}

function trendPct(a: number, b: number): number | null {
  if (b === 0 && a === 0) return null
  if (b === 0) return 100
  return Math.round(((a - b) / b) * 100)
}

function timeUntil(iso: string): { label: string; urgent: boolean } {
  const diff = new Date(iso).getTime() - Date.now()
  if (diff <= 0) return { label: 'Идёт', urgent: true }
  const mins = Math.round(diff / 60000)
  if (mins < 60) return { label: `Через ${mins} мин`, urgent: mins < 30 }
  const h = Math.floor(mins / 60)
  if (h < 24) return { label: `Через ${h} ч`, urgent: false }
  return { label: formatApptLabel(iso), urgent: false }
}

function masterColorDash(name: string) {
  const idx = name.split('').reduce((s, c) => s + c.charCodeAt(0), 0) % 8 + 1
  return { bar: `var(--m${idx}-bar)`, tint: `var(--m${idx}-tint)`, ink: `var(--m${idx}-ink)` }
}

// Activity dot color
function actColor(type: string): string {
  if (type === 'booking')  return C.sage
  if (type === 'handoff')  return '#b94040'
  return '#c9a84c'
}

// Activity icon
function actIcon(type: string): React.ReactNode {
  if (type === 'booking')  return <BookOpen size={13} strokeWidth={1.5} />
  if (type === 'handoff')  return <RefreshCw size={13} strokeWidth={1.5} />
  return <MessageSquare size={13} strokeWidth={1.5} />
}

// Build promo href with prefill
function promoHref(tip: { href: string; promoTitle?: string; promoDescription?: string; promoDiscount?: number; promoType?: string }): string {
  if (!tip.promoTitle) return tip.href
  const p = new URLSearchParams({ new: '1', title: tip.promoTitle, description: tip.promoDescription ?? '', discount: String(tip.promoDiscount ?? ''), type: tip.promoType ?? 'percent' })
  return `/promo?${p}`
}

// Tip icon
function tipIcon(href: string, i: number): { icon: typeof Users; color: string; bg: string } {
  if (href.includes('/promo') && i === 0) return { icon: Users,      color: '#5e7d5d', bg: '#e7eee2' }
  if (href.includes('/promo'))            return { icon: Tag,        color: '#e6a83a', bg: '#fdf3dc' }
  if (href.includes('/ai-settings'))      return { icon: Settings,   color: '#6b7b6e', bg: '#f0efed' }
  return                                         { icon: TrendingUp, color: '#3b82f6', bg: '#eff6ff' }
}

// Delta badge component
function Delta({ trend, label = 'к вчера' }: { trend: number | null; label?: string }) {
  if (trend == null) return null
  const pos = trend > 0, neg = trend < 0
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 2,
      fontSize: 11, fontWeight: 600, padding: '2px 7px',
      borderRadius: 20,
      background: pos ? '#e7eee2' : neg ? '#fdf3f1' : '#f3f4f6',
      color: pos ? '#3d6b3c' : neg ? '#b94040' : '#6b7b6e',
    }}>
      {pos ? `+${trend}%` : `${trend}%`}
      <span style={{ fontWeight: 400, color: '#9ca3af', fontSize: 10 }}> {label}</span>
    </span>
  )
}


// ── Page ─────────────────────────────────────────────────────────────────────
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const { date: dateParam } = await searchParams
  const today   = localIsoDate(new Date())
  const dateStr = dateParam ?? today
  const isToday = dateStr === today

  const { tenantId, salonName } = await getTenantContext()
  const stats = await getAiStats(tenantId, dateStr)
  const { ai, business } = stats

  const nextAppt = stats.upcoming[0] ?? null

  const kpis = [
    {
      icon: BookOpen, label: 'Записей через SERA',
      value: String(ai.bookings_today),
      trend: trendPct(ai.bookings_today, ai.bookings_yesterday),
      href: '/calendar',
    },
    {
      icon: Clock, label: 'Сэкономлено времени',
      value: `${ai.saved_hours} ч`,
      trend: trendPct(Math.round(ai.saved_hours * 10), Math.round(ai.saved_hours_yesterday * 10)),
      href: '/analytics',
    },
    {
      icon: RefreshCw, label: 'Клиентов возвращено',
      value: String(ai.returning_today),
      trend: null as number | null,
      href: '/clients',
    },
    {
      icon: MessageSquare, label: 'Диалогов с клиентами',
      value: String(ai.conversations_today),
      trend: trendPct(ai.conversations_today, ai.conversations_yesterday),
      href: '/chats',
    },
    {
      icon: AlertTriangle, label: 'Под риском',
      value: String(stats.at_risk.count),
      trend: null as number | null,
      alert: stats.at_risk.count > 0,
      href: '/clients',
    },
  ]

  return (
    <div className="dashboard-wrapper" style={{
      height: '100%', overflow: 'hidden',
      display: 'grid',
      gridTemplateRows: 'auto minmax(180px, 1fr) minmax(160px, 1fr)',
      gap: 8,
      padding: '10px 16px 8px',
      minHeight: 0,
      background: C.pageBg, boxSizing: 'border-box',
    }}>

      {/* ═══ ROW 1 (auto): header + hero в одном grid-child ══════════════════ */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        {/* Greeting */}
        <div>
          <h1
            className="flex items-center gap-2 flex-wrap"
            style={{
              fontFamily: 'var(--font-cormorant, Georgia, serif)',
              fontSize: 'clamp(20px, 2.5vw, 26px)',
              fontWeight: 600, color: C.ink, lineHeight: 1.15,
            }}
          >
            {getGreeting()}, {salonName} 👋
          </h1>
          <p style={{ fontSize: 14, color: C.muted, marginTop: 3 }}>
            SERA работает для вашего салона 24/7
          </p>
        </div>

        {/* Date + nav + bell */}
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          <TodayDate style={{ fontSize: 13, color: C.muted }} />
          <DateNav dateStr={dateStr} isDefaultDate={!dateParam} />
          <Link
            href="/chats"
            style={{
              position: 'relative', width: 36, height: 36,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 10, background: 'var(--card)',
              border: '1px solid var(--card-border)', textDecoration: 'none',
              color: C.muted,
            }}
          >
            <Bell size={16} strokeWidth={1.5} />
            {stats.handed_off_count > 0 && (
              <span style={{
                position: 'absolute', top: -4, right: -4,
                minWidth: 16, height: 16, padding: '0 4px',
                borderRadius: 20, background: C.error, color: '#fff',
                fontSize: 10, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {stats.handed_off_count}
              </span>
            )}
          </Link>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════════════════
          HERO CARD — Orb + SERA card + 5 KPIs
      ═══════════════════════════════════════════════════════════════════ */}
      <section className="sera-card">
        <div className="flex flex-col md:flex-row">

          {/* Orb */}
          <div
            className="hidden md:flex"
            style={{
              width: 148, flexShrink: 0,
              alignItems: 'center', justifyContent: 'center',
              padding: '12px 12px',
              borderRight: '1px solid var(--card-border)',
              background: '#ffffff',
            }}
          >
            <SeraOrb state={isToday ? 'online' : 'idle'} size={96} />
          </div>

          {/* SERA identity card */}
          <div
            style={{
              padding: '12px 14px',
              borderRight: '1px solid var(--card-border)',
              display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6,
              minWidth: 140, flexShrink: 0,
            }}
          >
            <div className="flex md:hidden items-center gap-3 mb-1">
              <SeraOrb state={isToday ? 'online' : 'idle'} size={44} />
            </div>
            <div>
              <p style={{ fontSize: 17, fontWeight: 700, color: C.ink, lineHeight: 1.2 }}>SERA</p>
              <p style={{ fontSize: 12, color: C.muted, marginTop: 2, lineHeight: 1.4 }}>
                AI-администратор<br className="hidden md:block" /> вашего салона
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                width: 7, height: 7, borderRadius: '50%',
                background: isToday ? '#3d8a4e' : C.sageSoft, flexShrink: 0,
                boxShadow: isToday ? '0 0 0 2px #d1f0d8' : 'none',
              }} />
              <span style={{ fontSize: 12, color: isToday ? '#3d8a4e' : C.muted, fontWeight: 500 }}>
                {isToday ? 'Система работает отлично' : 'Режим просмотра истории'}
              </span>
            </div>
          </div>

          {/* 5 KPIs — horizontal row, each clickable */}
          <div className="flex flex-wrap md:flex-nowrap flex-1">
            {kpis.map((kpi, i) => (
              <Link
                key={i}
                href={kpi.href}
                className="flex-1 hover:bg-black/[0.025] transition-colors"
                style={{
                  padding: '12px 12px',
                  borderRight: i < kpis.length - 1 ? '1px solid var(--card-border)' : 'none',
                  minWidth: 0,
                  borderBottom: 'none',
                  textDecoration: 'none',
                  display: 'block',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <kpi.icon
                    size={14} strokeWidth={1.5}
                    style={{ color: kpi.alert ? C.error : C.sage, flexShrink: 0 }}
                  />
                  <span style={{ fontSize: 12, color: C.muted, lineHeight: 1.3 }}>{kpi.label}</span>
                </div>
                <p style={{
                  fontSize: 28, fontWeight: 700, color: kpi.alert && stats.at_risk.count > 0 ? C.error : C.ink,
                  lineHeight: 1, fontVariantNumeric: 'tabular-nums', marginBottom: 4,
                }}>
                  {kpi.value}
                </p>
                {kpi.trend != null
                  ? <Delta trend={kpi.trend} />
                  : kpi.alert
                  ? <span style={{ fontSize: 11, color: C.muted }}>клиентов</span>
                  : null
                }
              </Link>
            ))}
          </div>
        </div>
      </section>
      </div>{/* end row-1 wrapper */}

      {/* ═══════════════════════════════════════════════════════════════════
          MIDDLE ROW — Activity | At-risk clients | Next appointment
      ═══════════════════════════════════════════════════════════════════ */}
      <div className="dashboard-row-middle" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, overflow: 'hidden', minHeight: 0 }}>

        {/* Col 1: Activity feed */}
        <div className="sera-card" style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--card-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              ЧТО СДЕЛАЛА SERA СЕГОДНЯ
            </span>
            <Link href="/activity" style={{ fontSize: 12, color: C.sage, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 2, whiteSpace: 'nowrap' }}>
              Смотреть все <ChevronRight size={12} />
            </Link>
          </div>
          <div style={{ flex: 1, padding: '4px 0', overflowY: 'auto', minHeight: 0 }}>
            {stats.recent_activity.length === 0 ? (
              <div style={{ padding: '28px 16px', textAlign: 'center' }}>
                <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
                  Когда клиенты напишут боту,<br />здесь появится активность
                </p>
              </div>
            ) : (
              stats.recent_activity.slice(0, 5).map((act, i) => (
                <Link
                  key={i}
                  href="/activity"
                  className="hover:bg-black/[0.025] transition-colors"
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    padding: '9px 16px',
                    borderBottom: i < 4 ? '1px solid var(--card-border)' : 'none',
                    textDecoration: 'none',
                  }}
                >
                  <span style={{ fontSize: 11, color: C.muted, fontVariantNumeric: 'tabular-nums', width: 36, flexShrink: 0, paddingTop: 1 }}>
                    {formatTime(act.time)}
                  </span>
                  <span style={{
                    width: 24, height: 24, borderRadius: 8, flexShrink: 0,
                    background: actColor(act.type) + '18',
                    color: actColor(act.type),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {actIcon(act.type)}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 500, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {act.text}
                    </p>
                    {act.subtitle && (
                      <p style={{ fontSize: 11, color: C.muted, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {act.subtitle}
                      </p>
                    )}
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Col 2: At-risk clients */}
        <div className="sera-card" style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--card-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              КЛИЕНТЫ, КОТОРЫМ НУЖНО ВНИМАНИЕ
            </span>
            <Link href="/clients?filter=attention" style={{ fontSize: 12, color: C.sage, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 2, whiteSpace: 'nowrap' }}>
              Смотреть все <ChevronRight size={12} />
            </Link>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            <AtRiskSection
              clients={stats.at_risk.top3}
              totalCount={stats.at_risk.count}
            />
          </div>
        </div>

        {/* Col 3: Next appointment */}
        <div className="sera-card" style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--card-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              СЛЕДУЮЩАЯ ЗАПИСЬ
            </span>
            <Link
              href={nextAppt ? `/calendar?date=${localIsoDate(new Date(nextAppt.starts_at))}&appointment=${nextAppt.id}` : '/calendar'}
              style={{ fontSize: 12, color: C.sage, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 2, whiteSpace: 'nowrap' }}
            >
              Открыть календарь <ChevronRight size={12} />
            </Link>
          </div>
          <div style={{ flex: 1, padding: '16px 16px 14px', display: 'flex', flexDirection: 'row', gap: 12, overflow: 'hidden', minHeight: 0 }}>
            {/* Left: main content */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflowY: 'auto' }}>
            {nextAppt == null ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 0' }}>
                <Calendar size={28} strokeWidth={1.5} style={{ color: C.sageSoft }} />
                <p style={{ fontSize: 13, color: C.muted }}>Нет ближайших записей</p>
                <Link href="/calendar" style={{ fontSize: 13, color: C.sage, fontWeight: 600, textDecoration: 'none' }}>
                  Открыть расписание →
                </Link>
              </div>
            ) : (() => {
              const { label: timeLabel, urgent } = timeUntil(nextAppt.starts_at)
              return (
                <>
                  <p style={{ fontSize: 12, color: urgent ? C.error : C.muted, fontWeight: 500, marginBottom: 4 }}>
                    {timeLabel}
                  </p>
                  <p style={{
                    fontSize: 48, fontWeight: 700, color: C.ink,
                    lineHeight: 1, fontVariantNumeric: 'tabular-nums',
                    fontFamily: 'var(--font-inter, sans-serif)',
                    marginBottom: 6,
                  }}>
                    {formatTime(nextAppt.starts_at)}
                  </p>
                  <p style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {nextAppt.service}
                  </p>

                  {/* Client row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <Avatar name={nextAppt.client} size={40} />
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 11, color: C.muted }}>Клиент</p>
                      <p style={{ fontSize: 12, fontWeight: 600, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {nextAppt.client}
                      </p>
                    </div>
                  </div>

                  {/* Master row */}
                  {nextAppt.master && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <Avatar name={nextAppt.master} photo_url={nextAppt.master_photo_url} size={40} />
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: 11, color: C.muted }}>Мастер</p>
                        <p style={{ fontSize: 12, fontWeight: 600, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {nextAppt.master}
                        </p>
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 8, background: C.sageTint, marginTop: 'auto' }}>
                    <Calendar size={13} strokeWidth={1.5} style={{ color: C.sage, flexShrink: 0 }} />
                    <p style={{ fontSize: 11, color: C.sage, lineHeight: 1.4 }}>
                      {nextAppt.price != null ? `${formatPrice(nextAppt.price, nextAppt.currency)} · ` : ''}
                      SERA напомнит клиенту
                    </p>
                  </div>
                </>
              )
            })()}
            </div>{/* end left column */}

            {/* Right: big master avatar */}
            {nextAppt?.master && (() => {
              const mc = masterColorDash(nextAppt.master)
              const initials = nextAppt.master.split(' ').filter(Boolean).map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
              return (
                <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                  <div style={{
                    width: 64, height: 64, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
                    boxShadow: `inset 0 0 0 2.5px ${mc.bar}`,
                    background: nextAppt.master_photo_url ? 'transparent' : mc.tint,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {nextAppt.master_photo_url ? (
                      <img src={nextAppt.master_photo_url} alt={nextAppt.master} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    ) : (
                      <span style={{ fontSize: 20, fontWeight: 700, color: mc.ink, lineHeight: 1 }}>{initials}</span>
                    )}
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          BOTTOM ROW — Upcoming events | Recommendations | Day summary
      ═══════════════════════════════════════════════════════════════════ */}
      <div className="dashboard-row-bottom" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, overflow: 'hidden', minHeight: 0 }}>

        {/* Col 1: Upcoming events */}
        <div className="sera-card" style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--card-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              БЛИЖАЙШИЕ СОБЫТИЯ
            </span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {stats.upcoming.length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center' }}>
                <p style={{ fontSize: 13, color: C.muted }}>Нет ближайших записей</p>
                <Link href="/calendar" style={{ fontSize: 13, color: C.sage, fontWeight: 600, textDecoration: 'none', display: 'block', marginTop: 8 }}>
                  Открыть расписание →
                </Link>
              </div>
            ) : (
              <>
                {stats.upcoming.slice(0, 4).map((appt, i) => {
                  const { label: tu, urgent } = timeUntil(appt.starts_at)
                  return (
                    <Link
                      key={appt.id}
                      href={`/calendar?date=${localIsoDate(new Date(appt.starts_at))}&appointment=${appt.id}`}
                      className="hover:bg-black/[0.025] transition-colors"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px',
                        borderBottom: i < Math.min(stats.upcoming.length, 4) - 1 ? '1px solid var(--card-border)' : 'none',
                        textDecoration: 'none',
                      }}
                    >
                      <div style={{ flexShrink: 0, width: 40, textAlign: 'center' }}>
                        <p style={{ fontSize: 14, fontWeight: 700, color: C.ink, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                          {formatTime(appt.starts_at)}
                        </p>
                        <p style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{formatApptLabel(appt.starts_at)}</p>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 500, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {appt.service}
                        </p>
                        <p style={{ fontSize: 11, color: C.muted, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {appt.client}{appt.master ? ` · ${appt.master}` : ''}
                        </p>
                      </div>
                      <span style={{
                        flexShrink: 0, fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 20,
                        background: urgent ? C.errorSoft : C.sageTint,
                        color: urgent ? C.error : C.sage,
                      }}>
                        {tu}
                      </span>
                    </Link>
                  )
                })}
                <div style={{ padding: '10px 16px', borderTop: '1px solid var(--card-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: C.muted }}>
                    Записей завтра: <strong style={{ color: C.ink }}>{business.tomorrow_appts}</strong>
                  </span>
                  <Link href="/calendar" style={{ fontSize: 12, color: C.sage, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 2 }}>
                    Посмотреть день <ChevronRight size={12} />
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Col 2: Recommendations */}
        <div className="sera-card" style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--card-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              РЕКОМЕНДАЦИИ SERA
            </span>
            <Link href="/recommendations" style={{ fontSize: 12, color: C.sage, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 2, whiteSpace: 'nowrap' }}>
              Все <ChevronRight size={12} />
            </Link>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {stats.smart_tips.slice(0, 4).map((tip, i) => {
              const ic = tipIcon(tip.href, i)
              const Icon = ic.icon
              const href = promoHref(tip)
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 16px',
                    borderBottom: i < 3 ? '1px solid var(--card-border)' : 'none',
                  }}
                >
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: ic.bg, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={14} strokeWidth={1.5} style={{ color: ic.color }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, color: C.ink2, lineHeight: 1.5 }}>{tip.text}</p>
                    <Link href={href} style={{ fontSize: 12, color: C.sage, fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 2, marginTop: 4 }}>
                      {tip.action} <ChevronRight size={11} />
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Col 3: Day summary */}
        <div className="sera-card" style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--card-border)' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              СВОДКА ДНЯ
            </span>
          </div>
          <div style={{ flex: 1, padding: '8px 0', overflowY: 'auto', minHeight: 0 }}>
            {[
              {
                label: 'Постоянных клиентов',
                value: String(ai.returning_today),
                sub: 'вернулись сегодня',
                icon: <Users size={16} strokeWidth={1.5} style={{ color: C.sage }} />,
                href: '/clients',
              },
              {
                label: 'Диалогов обработано',
                value: String(ai.conversations_today),
                sub: `${ai.saved_hours} ч сэкономлено`,
                icon: <MessageSquare size={16} strokeWidth={1.5} style={{ color: '#3b82f6' }} />,
                href: '/chats',
              },
              {
                label: 'Клиентов под риском',
                value: String(stats.at_risk.count),
                sub: 'давно не приходили',
                icon: <AlertTriangle size={16} strokeWidth={1.5} style={{ color: stats.at_risk.count > 0 ? C.error : C.sageSoft }} />,
                href: '/clients',
              },
              ...(business.revenue_today > 0 ? [{
                label: 'Выручка сегодня',
                value: formatPrice(business.revenue_today, 'BYN'),
                sub: 'по записям',
                icon: <TrendingUp size={16} strokeWidth={1.5} style={{ color: '#3d8a4e' }} />,
                href: '/analytics',
              }] : [{
                label: 'Записей завтра',
                value: String(business.tomorrow_appts),
                sub: 'запланировано',
                icon: <Calendar size={16} strokeWidth={1.5} style={{ color: C.sage }} />,
                href: '/calendar',
              }]),
            ].map((row, i, arr) => (
              <Link
                key={i}
                href={row.href}
                className="hover:bg-black/[0.025] transition-colors"
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
                  borderBottom: i < arr.length - 1 ? '1px solid var(--card-border)' : 'none',
                  textDecoration: 'none',
                }}
              >
                <div style={{ width: 32, height: 32, borderRadius: 8, background: C.pageBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {row.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12, color: C.muted }}>{row.label}</p>
                  <p style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>{row.sub}</p>
                </div>
                <p style={{ fontSize: 20, fontWeight: 700, color: C.ink, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                  {row.value}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </div>

    </div>
  )
}

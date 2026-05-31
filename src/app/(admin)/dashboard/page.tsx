import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Calendar, ChevronRight, AlertCircle, Sparkles, Clock,
  UserX, Users, Tag, TrendingUp, BookOpen, RefreshCw,
  MessageSquare, Settings,
} from 'lucide-react'
import { formatPrice } from '@/lib/utils/format'
import { getAiStats } from '@/lib/admin/get-ai-stats'
import { AlinaCareOrb } from '@/components/motion/AlinaCareOrb'
import { DateNav } from './_components/DateNav'
import { AdviceCard } from './_components/AdviceCard'

// ── SERA Design Tokens ─────────────────────────────────────────────────────────
const T = {
  pageBg:      '#F8F5EF',
  cardBg:      '#F4F9F5',
  cardBorder:  'rgba(16,56,47,0.08)',
  cardRadius:  24,
  largeRadius: 32,
  shadowSm:    '0 4px 16px rgba(16,56,47,0.04)',
  shadowMd:    '0 8px 32px rgba(16,56,47,0.08)',
  shadowLg:    '0 20px 60px rgba(16,56,47,0.18)',
  aiGradient:  'linear-gradient(135deg, #10382F 0%, #18483D 100%)',
  aiBorder:    'rgba(255,255,255,0.08)',
  // Glassmorphism card on dark bg
  glassCard: {
    background: 'rgba(255,255,255,0.08)',
    border:     '1px solid rgba(255,255,255,0.12)',
    borderRadius: 14,
  } as React.CSSProperties,
  textPrimary:   '#1B1B1B',
  textSecondary: '#6B7280',
  success:       '#4F8A68',
  error:         '#D46A6A',
  gold:          '#E8D6AE',
  sage:          '#AFC5B0',
}

const card: React.CSSProperties = {
  background:   T.cardBg,
  border:       `1px solid ${T.cardBorder}`,
  borderRadius: T.cardRadius,
  boxShadow:    T.shadowSm,
  overflow:     'hidden',
}

// tip icon by href
function tipIcon(href: string, idx: number) {
  if (href.includes('/promo')) return { icon: Tag,        bg: 'rgba(213,179,106,0.15)', color: '#D5B36A' }
  if (href.includes('/ai-settings')) return { icon: Settings, bg: 'rgba(107,114,128,0.12)', color: '#6B7280' }
  const icons = [
    { icon: Users,       bg: 'rgba(79,138,104,0.15)',  color: T.success },
    { icon: Tag,         bg: 'rgba(213,179,106,0.15)', color: '#D5B36A' },
    { icon: TrendingUp,  bg: 'rgba(59,130,246,0.12)',  color: '#3B82F6' },
  ]
  return icons[idx % 3]
}

// ─────────────────────────────────────────────────────────────────────────────

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

const SERA = 'SERA'

function trendPct(a: number, b: number): number | null {
  if (b === 0 && a === 0) return null
  if (b === 0) return 100
  return Math.round(((a - b) / b) * 100)
}

function fmtHHMM(iso: string): string {
  const d = new Date(iso)
  return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`
}

function fmtApptDate(iso: string): string {
  const d = new Date(iso), t = new Date(), tm = new Date(Date.now() + 86400000)
  const m = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря']
  if (d.toDateString() === t.toDateString())  return 'Сегодня'
  if (d.toDateString() === tm.toDateString()) return `Завтра, ${d.getDate()} ${m[d.getMonth()]}`
  return `${d.getDate()} ${m[d.getMonth()]}`
}

function pl(n: number, f: [string,string,string]): string {
  const a = Math.abs(n) % 100, l = a % 10
  if (a > 10 && a < 20) return f[2]
  if (l > 1 && l < 5)   return f[1]
  if (l === 1)           return f[0]
  return f[2]
}

function fmtFullDate(): string {
  return new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })
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
  const stats  = await getAiStats(tenantId, dateStr)
  const { ai, business } = stats

  const nextAppt = stats.upcoming[0] ?? null

  const kpis = [
    { icon: BookOpen,      label: `Записей через ${SERA}`, value: String(ai.bookings_today),       trend: trendPct(ai.bookings_today, ai.bookings_yesterday) },
    { icon: Clock,         label: 'Сэкономлено времени',   value: `${ai.saved_hours} ч`,           trend: trendPct(Math.round(ai.saved_hours*10), Math.round(ai.saved_hours_yesterday*10)) },
    { icon: RefreshCw,     label: 'Клиентов возвращено',   value: String(ai.returning_today),      trend: null as number | null },
    { icon: MessageSquare, label: 'Диалогов сегодня',      value: String(ai.conversations_today),  trend: trendPct(ai.conversations_today, ai.conversations_yesterday) },
  ]

  return (
    <div style={{ padding: '24px 28px 40px', display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Header ── */}
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 600, color: T.textPrimary, lineHeight: 1.2, fontFamily: 'var(--font-cormorant, Georgia, serif)', display: 'flex', alignItems: 'center', gap: 10 }}>
            {SERA} рядом. Заботится. С каждым клиентом.
            <span style={{ color: T.gold }}>✦</span>
          </h1>
          <p style={{ fontSize: 14, color: T.textSecondary, marginTop: 4 }}>
            {isToday ? 'Ваш AI-администратор работает 24/7' : `Данные за ${new Date(dateStr+'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}`}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 13, color: T.textSecondary }}>{fmtFullDate()}</span>
          <DateNav dateStr={dateStr} />
          <Link href="/chats" style={{ position: 'relative', width: 40, height: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12, background: T.cardBg, border: `1px solid ${T.cardBorder}`, color: T.textPrimary, textDecoration: 'none' }}>
            <Calendar size={18} strokeWidth={1.5} />
            {stats.handed_off_count > 0 && (
              <span style={{ position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, padding: '0 4px', borderRadius: 20, background: T.error, color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {stats.handed_off_count}
              </span>
            )}
          </Link>
        </div>
      </header>

      {/* ── Handoff alert ── */}
      {stats.handed_off_count > 0 && (
        <Link href="/chats" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px', borderRadius: 20, background: '#FDF0EC', border: '1px solid rgba(212,106,106,0.25)', textDecoration: 'none' }}>
          <AlertCircle size={20} strokeWidth={1.5} style={{ color: T.error, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary }}>
              {stats.handed_off_count} {pl(stats.handed_off_count, ['диалог ждёт','диалога ждут','диалогов ждут'])} вашего ответа
            </p>
            <p style={{ fontSize: 13, color: T.textSecondary, marginTop: 2 }}>{SERA} передала их вам — клиенты ждут</p>
          </div>
          <span style={{ padding: '8px 18px', borderRadius: 12, background: T.error, color: '#fff', fontSize: 13, fontWeight: 600, flexShrink: 0 }}>Ответить</span>
        </Link>
      )}

      {/* ── AI Hero ── */}
      <section style={{ background: T.aiGradient, borderRadius: T.largeRadius, boxShadow: T.shadowLg, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1.5fr', minHeight: 240 }}>

          {/* Col 1: Orb */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px', borderRight: `1px solid ${T.aiBorder}` }}>
            <AlinaCareOrb state="online" size={160} />
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{SERA} онлайн</p>
              <p style={{ fontSize: 12, color: '#4ade80', marginTop: 3 }}>● Активна 24/7</p>
            </div>
          </div>

          {/* Col 2: KPI — прозрачные карточки */}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8, padding: '24px 20px', borderRight: `1px solid ${T.aiBorder}` }}>
            {kpis.map((kpi, i) => {
              const pos = (kpi.trend ?? 0) > 2
              const neg = (kpi.trend ?? 0) < -2
              return (
                <div key={i} style={{ ...T.glassCard, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <kpi.icon size={16} strokeWidth={1.5} style={{ color: T.sage, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)' }}>{kpi.label}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexShrink: 0 }}>
                    <span style={{ fontSize: 36, fontWeight: 700, lineHeight: 1, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
                      {kpi.value}
                    </span>
                    {kpi.trend != null ? (
                      <span style={{ fontSize: 11, fontWeight: 600, color: pos ? '#4ade80' : neg ? '#f87171' : 'rgba(255,255,255,0.35)' }}>
                        {pos ? `+${kpi.trend}%` : neg ? `${kpi.trend}%` : '0%'}
                        <span style={{ color: 'rgba(255,255,255,0.25)', fontWeight: 400 }}> к вчера</span>
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)' }}>постоянные</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Col 3: Advice — прозрачная карточка */}
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sparkles size={13} strokeWidth={2} style={{ color: T.gold, flexShrink: 0 }} />
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.gold }}>
                Совет от {SERA}
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 10, color: 'rgba(255,255,255,0.30)' }}>
                {new Date().toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' })}
              </span>
            </div>
            <div style={{ ...T.glassCard, padding: 16, flex: 1, display: 'flex', flexDirection: 'column' }}>
              <AdviceCard tips={stats.smart_tips} aiName={SERA} dark />
            </div>
          </div>
        </div>
      </section>

      {/* ── Middle grid: Activity | Status CENTER | Next+Activity ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr 1.4fr', gap: 20 }}>

        {/* Col 1: Activity feed */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, color: T.textPrimary }}>Что сделала {SERA} сегодня</h2>
            <Link href="/chats" style={{ fontSize: 13, color: T.success, fontWeight: 500, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
              Смотреть все <ChevronRight size={16} strokeWidth={1.5} />
            </Link>
          </div>
          <div style={{ ...card, padding: 0 }}>
            {stats.recent_activity.length === 0 ? (
              <div style={{ padding: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <AlinaCareOrb state="idle" size={44} className="opacity-40" />
                <p style={{ fontSize: 15, fontWeight: 600, color: T.textPrimary }}>{SERA} пока ничего не сделала</p>
                <p style={{ fontSize: 13, color: T.textSecondary }}>Когда клиенты напишут боту, здесь появится активность</p>
              </div>
            ) : stats.recent_activity.map((act, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 20px', borderBottom: i < stats.recent_activity.length - 1 ? `1px solid ${T.cardBorder}` : 'none' }}>
                <span style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 700, color: T.textSecondary, width: 44, flexShrink: 0 }}>{fmtHHMM(act.time)}</span>
                <span style={{ fontSize: 16, flexShrink: 0, width: 22, textAlign: 'center' }}>
                  {act.type === 'booking' ? '📅' : act.type === 'handoff' ? '🔄' : '📖'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 500, color: T.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{act.text}</p>
                  {act.subtitle && <p style={{ fontSize: 12, color: T.textSecondary, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{act.subtitle}</p>}
                </div>
                <ChevronRight size={14} strokeWidth={1.5} style={{ color: T.cardBorder, flexShrink: 0 }} />
              </div>
            ))}
          </div>
        </section>

        {/* Col 2: Состояние SERA (центральная колонка) */}
        <div>
          <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 20px 14px', borderBottom: `1px solid ${T.cardBorder}` }}>
              <span style={{ fontSize: 16, fontWeight: 600, color: T.textPrimary }}>Состояние {SERA}</span>
            </div>
            <div style={{ padding: '24px 16px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
              <AlinaCareOrb state={isToday ? 'online' : 'idle'} size={80} />
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary }}>
                  {SERA} {isToday ? 'онлайн' : 'в ожидании'}
                </p>
                <p style={{ fontSize: 12, color: T.textSecondary, marginTop: 3, lineHeight: 1.4 }}>
                  {isToday ? 'Работает для вас и клиентов' : 'Просмотр истории'}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
                {['Онлайн','Думает','Отвечает','Записывает'].map((s, i) => (
                  <span key={i} style={{
                    fontSize: 11, fontWeight: 500, padding: '4px 10px', borderRadius: 20,
                    background: i === 0 && isToday ? 'rgba(79,138,104,0.12)' : 'rgba(16,56,47,0.05)',
                    border: `1px solid ${i === 0 && isToday ? 'rgba(79,138,104,0.25)' : T.cardBorder}`,
                    color: i === 0 && isToday ? T.success : T.textSecondary,
                  }}>
                    {s}
                  </span>
                ))}
              </div>
            </div>
            <div style={{ padding: '0 16px 16px', textAlign: 'center' }}>
              <p style={{ fontSize: 12, color: T.textSecondary, lineHeight: 1.5 }}>
                {isToday ? 'Ядро стабильно и работает в оптимальном режиме' : 'Архив активности за прошлый день'}
              </p>
            </div>
          </div>
        </div>

        {/* Col 3: Следующая запись + Активность сегодня */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Следующая запись */}
          <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 20px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${T.cardBorder}` }}>
              <span style={{ fontSize: 16, fontWeight: 600, color: T.textPrimary }}>Следующая запись</span>
              <Link href="/calendar" style={{ fontSize: 13, color: T.success, fontWeight: 500, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                Открыть <ChevronRight size={14} strokeWidth={1.5} />
              </Link>
            </div>

            {nextAppt == null ? (
              <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <Calendar size={28} strokeWidth={1.5} style={{ color: T.sage, opacity: 0.4 }} />
                <p style={{ fontSize: 13, color: T.textSecondary }}>Нет ближайших записей</p>
                <Link href="/calendar" style={{ fontSize: 13, fontWeight: 500, color: T.success, textDecoration: 'none' }}>Открыть расписание →</Link>
              </div>
            ) : (
              <div style={{ padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p style={{ fontSize: 12, color: T.textSecondary, fontWeight: 500 }}>{fmtApptDate(nextAppt.starts_at)}</p>
                <p style={{ fontSize: 48, fontWeight: 700, color: '#10382F', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                  {fmtHHMM(nextAppt.starts_at)}
                </p>
                <p style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {nextAppt.service}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 16, background: 'rgba(16,56,47,0.08)', border: `1px solid ${T.cardBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 12, fontWeight: 700, color: T.success }}>
                    {(nextAppt.master || nextAppt.client).charAt(0).toUpperCase()}
                  </div>
                  <p style={{ fontSize: 13, color: T.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {nextAppt.client}{nextAppt.master ? ` · ${nextAppt.master}` : ''}
                  </p>
                </div>
                {nextAppt.price != null && (
                  <p style={{ fontSize: 13, fontWeight: 600, color: T.success }}>{formatPrice(nextAppt.price, nextAppt.currency)}</p>
                )}
                <Link
                  href="/calendar"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4, padding: '10px 0', borderRadius: 12, background: 'transparent', border: `1px solid rgba(16,56,47,0.20)`, color: '#10382F', fontSize: 13, fontWeight: 600, textDecoration: 'none', transition: 'background 150ms ease' }}
                >
                  <Calendar size={14} strokeWidth={1.5} />
                  Подготовить клиента
                </Link>
              </div>
            )}
          </div>

          {/* Активность сегодня — горизонтальный ряд */}
          <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 20px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${T.cardBorder}` }}>
              <span style={{ fontSize: 16, fontWeight: 600, color: T.textPrimary }}>Активность сегодня</span>
              <Link href="/analytics" style={{ fontSize: 13, color: T.success, fontWeight: 500, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                Аналитика <ChevronRight size={14} strokeWidth={1.5} />
              </Link>
            </div>
            <div style={{ display: 'flex' }}>
              {[
                { v: String(ai.bookings_today),      l: 'Записей'    },
                { v: String(ai.conversations_today), l: 'Диалогов'   },
                { v: String(ai.returning_today),     l: 'Возврат'    },
                { v: `${ai.saved_hours}ч`,           l: 'Сэкономл.' },
              ].map((item, i, arr) => (
                <div
                  key={i}
                  style={{ flex: 1, padding: '14px 12px', borderRight: i < arr.length - 1 ? `1px solid ${T.cardBorder}` : 'none' }}
                >
                  <p style={{ fontSize: 28, fontWeight: 700, lineHeight: 1, color: T.textPrimary, fontVariantNumeric: 'tabular-nums' }}>{item.v}</p>
                  <p style={{ fontSize: 11, color: T.textSecondary, marginTop: 4 }}>{item.l}</p>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* ── Bottom grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>

        {/* Клиенты под риском */}
        <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '16px 20px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${T.cardBorder}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <UserX size={18} strokeWidth={1.5} style={{ color: T.error }} />
              <span style={{ fontSize: 16, fontWeight: 600, color: T.textPrimary }}>Клиенты под риском</span>
            </div>
            <Link href="/clients" style={{ fontSize: 13, color: T.success, fontWeight: 500, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
              Все <ChevronRight size={14} strokeWidth={1.5} />
            </Link>
          </div>

          {stats.at_risk.count === 0 ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 28, gap: 8 }}>
              <span style={{ fontSize: 28 }}>🎉</span>
              <p style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary }}>Всё отлично!</p>
              <p style={{ fontSize: 13, color: T.textSecondary, textAlign: 'center' }}>Нет клиентов давно не приходивших</p>
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ flex: 1 }}>
                {stats.at_risk.top3.map((c, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: i < stats.at_risk.top3.length - 1 ? `1px solid ${T.cardBorder}` : 'none' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 18, background: 'rgba(212,106,106,0.08)', border: '1px solid rgba(212,106,106,0.20)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 13, fontWeight: 700, color: T.error }}>
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 500, color: T.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</p>
                      <p style={{ fontSize: 12, color: T.textSecondary, marginTop: 2 }}>не приходил {c.days_absent} {pl(c.days_absent, ['день','дня','дней'])}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ padding: '12px 20px', borderTop: `1px solid ${T.cardBorder}`, background: 'rgba(16,56,47,0.02)' }}>
                {stats.at_risk.count > 3 && (
                  <p style={{ fontSize: 12, color: T.textSecondary, marginBottom: 10 }}>
                    +{stats.at_risk.count - 3} клиентов ещё не возвращались
                  </p>
                )}
                <Link href="/chats" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 0', borderRadius: 12, background: '#10382F', color: '#fff', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                  <Sparkles size={14} strokeWidth={2} />
                  {SERA} вернёт клиентов
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Рекомендует для роста — с иконками */}
        <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '16px 20px 14px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: `1px solid ${T.cardBorder}` }}>
            <TrendingUp size={18} strokeWidth={1.5} style={{ color: T.success }} />
            <span style={{ fontSize: 16, fontWeight: 600, color: T.textPrimary }}>Рекомендует для роста</span>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {stats.smart_tips.slice(0, 3).map((tip, i) => {
              const ic = tipIcon(tip.href, i)
              const Icon = ic.icon
              return (
                <div key={i} style={{ padding: '14px 20px', borderBottom: i < 2 ? `1px solid ${T.cardBorder}` : 'none', display: 'flex', gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: ic.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={18} strokeWidth={1.5} style={{ color: ic.color }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, color: T.textPrimary, lineHeight: 1.5 }}>{tip.text}</p>
                    <Link href={tip.href} style={{ fontSize: 12, color: T.success, fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 6 }}>
                      {tip.action} <ChevronRight size={12} strokeWidth={1.5} />
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Ближайшие записи */}
        <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '16px 20px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${T.cardBorder}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={18} strokeWidth={1.5} style={{ color: T.success }} />
              <span style={{ fontSize: 16, fontWeight: 600, color: T.textPrimary }}>Ближайшие записи</span>
            </div>
            <Link href="/calendar" style={{ fontSize: 13, color: T.success, fontWeight: 500, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
              Открыть <ChevronRight size={14} strokeWidth={1.5} />
            </Link>
          </div>

          {stats.upcoming.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 28, gap: 10 }}>
              <Calendar size={28} strokeWidth={1.5} style={{ color: T.sage, opacity: 0.4 }} />
              <p style={{ fontSize: 13, color: T.textSecondary }}>Нет ближайших записей</p>
              <Link href="/calendar" style={{ fontSize: 13, fontWeight: 500, color: T.success, textDecoration: 'none' }}>Открыть расписание →</Link>
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {stats.upcoming.map((appt, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px', borderBottom: i < stats.upcoming.length - 1 ? `1px solid ${T.cardBorder}` : 'none' }}>
                  <div style={{ flexShrink: 0, textAlign: 'center', minWidth: 48 }}>
                    <p style={{ fontSize: 20, fontWeight: 700, color: '#10382F', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{fmtHHMM(appt.starts_at)}</p>
                    <p style={{ fontSize: 10, color: T.textSecondary, marginTop: 2, whiteSpace: 'nowrap' }}>{fmtApptDate(appt.starts_at)}</p>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 500, color: T.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{appt.service}</p>
                    <p style={{ fontSize: 12, color: T.textSecondary, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {appt.client}{appt.master ? ` · ${appt.master}` : ''}
                    </p>
                  </div>
                  {appt.price != null && (
                    <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 600, color: T.success }}>{formatPrice(appt.price, appt.currency)}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {business.revenue_today > 0 && (
            <div style={{ padding: '12px 20px', borderTop: `1px solid ${T.cardBorder}`, background: 'rgba(79,138,104,0.04)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: T.textSecondary }}>Выручка сегодня</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: T.success }}>{formatPrice(business.revenue_today, 'BYN')}</span>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

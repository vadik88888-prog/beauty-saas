import type { CSSProperties } from 'react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Bell, Calendar, ChevronRight,
  BookOpen, Clock, RefreshCw, MessageSquare,
} from 'lucide-react'
import { getAiStats } from '@/lib/admin/get-ai-stats'
import { AlinaCareOrb } from '@/components/motion/AlinaCareOrb'

// ── Spec color tokens ───────────────────────────────────────────────────────
const C = {
  heroBg:        '#152619',
  heroBorder:    '#2a4d30',
  heroMetricNum: '#e8f0e9',
  heroMetricLbl: '#8aab8e',
  heroDeltaBg:   '#1e3d24',
  heroDeltaText: '#6db87e',
  heroGold:      '#c9a84c',
  heroAdviceBg:  '#1c3521',
  pageBg:        '#f2ede6',
  cardBg:        '#ffffff',
  cardBorder:    '#e8e2d9',
  cardTitle:     '#1a1a1a',
  cardMuted:     '#6b7280',
  cardLink:      '#3d8a4e',
  dotBooking:    '#3d8a4e',
  dotReturn:     '#5b8dd9',
  dotMarketing:  '#c9a84c',
  dotAnswer:     '#8aab8e',
  dotTransfer:   '#b86b5a',
} as const

const CARD: CSSProperties = {
  background:   C.cardBg,
  border:       `0.5px solid ${C.cardBorder}`,
  borderRadius: 10,
  padding:      '12px 14px',
  overflow:     'hidden',
}

// ── Helpers ─────────────────────────────────────────────────────────────────
async function getTenantContext() {
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

function trendPct(a: number, b: number): number | null {
  if (b === 0 && a === 0) return null
  if (b === 0) return 100
  return Math.round(((a - b) / b) * 100)
}

function fmtHHMM(iso: string): string {
  const d = new Date(iso)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function fmtApptDate(iso: string): string {
  const d = new Date(iso), t = new Date(), tm = new Date(Date.now() + 86400000)
  const m = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек']
  if (d.toDateString() === t.toDateString())  return 'Сегодня'
  if (d.toDateString() === tm.toDateString()) return 'Завтра'
  return `${d.getDate()} ${m[d.getMonth()]}`
}

function fmtFullDate(): string {
  return new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })
}

function fmtShortDate(): string {
  return new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

function actDotColor(type: string): string {
  if (type === 'booking')  return C.dotBooking
  if (type === 'handoff')  return C.dotTransfer
  if (type === 'return')   return C.dotReturn
  if (type === 'promo')    return C.dotMarketing
  return C.dotAnswer
}

// ── Gold sparkle SVG (spec) ─────────────────────────────────────────────────
function GoldSparkle({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
      <path d="M7 0 L7.8 6.2 L14 7 L7.8 7.8 L7 14 L6.2 7.8 L0 7 L6.2 6.2 Z" fill="#c9a84c" />
    </svg>
  )
}

// ── Dashboard ────────────────────────────────────────────────────────────────
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
  const stats = await getAiStats(tenantId, dateStr)
  const { ai } = stats

  const nextAppt = stats.upcoming[0] ?? null

  const kpis = [
    { icon: BookOpen,      label: 'Записей через SERA', value: String(ai.bookings_today),      trend: trendPct(ai.bookings_today, ai.bookings_yesterday) },
    { icon: Clock,         label: 'Сэкономлено времени', value: `${ai.saved_hours} ч`,          trend: trendPct(Math.round(ai.saved_hours * 10), Math.round(ai.saved_hours_yesterday * 10)) },
    { icon: RefreshCw,     label: 'Клиентов возвращено', value: String(ai.returning_today),     trend: null as number | null },
    { icon: MessageSquare, label: 'Диалогов сегодня',    value: String(ai.conversations_today), trend: trendPct(ai.conversations_today, ai.conversations_yesterday) },
  ]

  const usagePercent = Math.min(100, Math.round(((ai.bookings_today + ai.conversations_today) / 60) * 100))
  const ring = 2 * Math.PI * 20

  const defaultTips = [
    { text: 'Привлеките клиентов акцией на популярную услугу', href: '/promo',       action: 'Создать акцию' },
    { text: 'Настройте базу знаний для точных ответов',        href: '/ai-settings', action: 'Открыть'      },
    { text: 'Добавьте услуги и мастеров в систему',            href: '/services',    action: 'Услуги'       },
  ]
  const tips = stats.smart_tips.length > 0 ? stats.smart_tips : defaultTips

  const statItems = [
    { v: String(ai.bookings_today),       l: 'Записей'     },
    { v: String(ai.conversations_today),  l: 'Диалогов'    },
    { v: String(ai.returning_today),      l: 'Возврата'    },
    { v: `${ai.saved_hours}ч`,            l: 'Сэкономлено' },
  ]

  const pearls = [0.85, 1.0, 0.75, 0.95, 0.70]

  // ── HEIGHT BUDGET (fits in 900px viewport, no scroll)
  // padding-top: 16 + padding-bottom: 12 = 28
  // header: 36  gap: 6
  // hero:   138 gap: 6
  // middle: 148 gap: 6
  // stats:  28  gap: 6
  // bottom: 108
  // TOTAL:  510px  ──────────────────────────────────────

  return (
    <div style={{
      height:          '100%',
      overflow:        'hidden',
      display:         'flex',
      flexDirection:   'column',
      padding:         '16px 16px 12px 16px',
      gap:             6,
      background:      C.pageBg,
      boxSizing:       'border-box',
    }}>

      {/* ═══════════════════════════════════════════════════════════════════
          1. PAGE HEADER — 36px
      ═══════════════════════════════════════════════════════════════════ */}
      <header style={{ height: 36, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>

        {/* Left: title + subtitle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h1 style={{
            fontSize: 16, fontWeight: 700, color: C.cardTitle,
            lineHeight: 1, margin: 0,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            Главная
            <GoldSparkle size={12} />
          </h1>
          <span style={{
            fontSize: 11, color: C.cardMuted,
            borderLeft: `1px solid ${C.cardBorder}`, paddingLeft: 8,
          }}>
            {isToday
              ? 'AI-администратор активен 24/7'
              : `История за ${new Date(dateStr + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`}
          </span>
        </div>

        {/* Right: date + calendar + bell */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: C.cardMuted, fontVariantNumeric: 'tabular-nums' }}>
            {fmtFullDate()}
          </span>
          <Calendar size={16} strokeWidth={1.5} style={{ color: C.cardMuted }} />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Bell size={16} strokeWidth={1.5} style={{ color: C.cardMuted }} />
            {stats.handed_off_count > 0 && (
              <span style={{
                position: 'absolute', top: -5, right: -5,
                minWidth: 14, height: 14, padding: '0 3px',
                borderRadius: 10, background: '#e05353', color: '#fff',
                fontSize: 9, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {stats.handed_off_count}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════════════════
          2. HERO BLOCK — 138px, dark green, 3 zones
      ═══════════════════════════════════════════════════════════════════ */}
      <section style={{
        height:      138,
        flexShrink:  0,
        borderRadius: 14,
        background:  C.heroBg,
        padding:     '14px 18px',
        display:     'grid',
        gridTemplateColumns: '88px 1fr 152px',
        gap:         12,
        border:      `1px solid ${C.heroBorder}`,
        overflow:    'hidden',
        boxSizing:   'border-box',
      }}>

        {/* Zone 1: Orb */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
            <AlinaCareOrb state={isToday ? 'online' : 'idle'} size={66} />
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: '#fff', lineHeight: 1 }}>SERA</p>
              <p style={{ fontSize: 9, color: '#4ade80', marginTop: 2 }}>● онлайн</p>
            </div>
          </div>
        </div>

        {/* Zone 2: 4 metrics — VERTICAL STACK ONLY */}
        <div style={{
          display:        'flex',
          flexDirection:  'column',
          justifyContent: 'space-between',
          height:         '100%',
          padding:        '2px 0',
        }}>
          {kpis.map((kpi, i) => {
            const pos = (kpi.trend ?? 0) > 2
            const neg = (kpi.trend ?? 0) < -2
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, lineHeight: 1 }}>
                <kpi.icon
                  size={13} strokeWidth={1.5}
                  style={{ color: C.heroMetricLbl, flexShrink: 0, opacity: 0.8 }}
                />
                <span style={{
                  fontSize: 11, color: C.heroMetricLbl,
                  flex: 1, minWidth: 0,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {kpi.label}
                </span>
                <span style={{
                  fontSize: 22, fontWeight: 700, color: C.heroMetricNum,
                  fontVariantNumeric: 'tabular-nums', lineHeight: 1, flexShrink: 0,
                }}>
                  {kpi.value}
                </span>
                {kpi.trend != null && (
                  <span style={{
                    fontSize: 10, flexShrink: 0,
                    background: C.heroDeltaBg,
                    color: pos ? C.heroDeltaText : neg ? '#f87171' : 'rgba(255,255,255,0.35)',
                    padding: '1px 5px', borderRadius: 3,
                  }}>
                    {pos ? `+${kpi.trend}%` : neg ? `${kpi.trend}%` : '—'}
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {/* Zone 3: Совет от SERA + mini schedule */}
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', gap: 5 }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <GoldSparkle size={10} />
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: C.heroGold,
            }}>
              СОВЕТ ОТ SERA
            </span>
            <span style={{ marginLeft: 'auto', fontSize: 9, color: 'rgba(255,255,255,0.30)' }}>
              {fmtShortDate()}
            </span>
          </div>

          {/* Advice panel */}
          <div style={{
            flex:         1,
            background:   C.heroAdviceBg,
            borderRadius: 8,
            padding:      '8px 10px',
            border:       '1px solid rgba(42,77,48,0.5)',
            overflow:     'hidden',
            display:      'flex',
            flexDirection:'column',
            gap:          6,
            justifyContent: 'space-between',
          }}>
            <p style={{
              fontSize: 11, color: 'rgba(255,255,255,0.82)', lineHeight: 1.45,
              overflow: 'hidden',
              display: '-webkit-box' as CSSProperties['display'],
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical' as CSSProperties['WebkitBoxOrient'],
            }}>
              {tips[0].text}
            </p>
            <Link
              href={tips[0].href}
              style={{
                display: 'inline-block', alignSelf: 'flex-start',
                fontSize: 10, fontWeight: 700, color: '#7dd98a',
                background: 'rgba(94,125,93,0.55)',
                border: '1px solid rgba(94,125,93,0.5)',
                borderRadius: 6, padding: '3px 8px', textDecoration: 'none',
              }}
            >
              {tips[0].action}
            </Link>
          </div>

          {/* Mini schedule — upcoming slots, right-aligned */}
          {stats.upcoming.length > 0 && (
            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {stats.upcoming.slice(0, 2).map((appt, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <span style={{
                    fontSize: 10, fontVariantNumeric: 'tabular-nums',
                    color: C.heroGold, fontWeight: 600,
                  }}>
                    {fmtHHMM(appt.starts_at)}
                  </span>
                  <span style={{
                    fontSize: 10, color: 'rgba(255,255,255,0.50)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    maxWidth: 96, marginLeft: 6,
                  }}>
                    {appt.client}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          3. MIDDLE ROW — 148px, columns 45/27/28%
      ═══════════════════════════════════════════════════════════════════ */}
      <div style={{
        height:      148,
        flexShrink:  0,
        display:     'grid',
        gridTemplateColumns: '45fr 27fr 28fr',
        gap:         8,
      }}>

        {/* ── Col 1 (45%): Activity feed "Что сделала SERA сегодня" */}
        <div style={{ ...CARD }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 6,
          }}>
            <span style={{
              fontSize: 11, fontWeight: 600, color: C.cardTitle,
              textTransform: 'uppercase', letterSpacing: '0.4px',
            }}>
              Что сделала SERA сегодня
            </span>
            <Link href="/chats" style={{
              fontSize: 11, color: C.cardLink, textDecoration: 'none',
              display: 'flex', alignItems: 'center', gap: 2, whiteSpace: 'nowrap',
            }}>
              Смотреть все <ChevronRight size={11} strokeWidth={1.5} />
            </Link>
          </div>

          <div style={{ overflow: 'hidden' }}>
            {stats.recent_activity.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 90 }}>
                <p style={{ fontSize: 11, color: C.cardMuted, textAlign: 'center', lineHeight: 1.6 }}>
                  Когда клиенты напишут боту,<br />здесь появится активность
                </p>
              </div>
            ) : (
              stats.recent_activity.slice(0, 5).map((act, i) => (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '28px 8px 1fr',
                  gap: 6, alignItems: 'center',
                  padding: '4px 0',
                  borderBottom: i < 4 ? `0.5px solid ${C.cardBorder}` : 'none',
                }}>
                  <span style={{
                    fontSize: 10, color: '#9ca3af', fontVariantNumeric: 'tabular-nums',
                  }}>
                    {fmtHHMM(act.time)}
                  </span>
                  <span style={{
                    width: 6, height: 6, borderRadius: 3,
                    background: actDotColor(act.type),
                    display: 'inline-block', flexShrink: 0,
                  }} />
                  <span style={{
                    fontSize: 12, color: C.cardTitle,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {act.text}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── Col 2 (27%): Состояние SERA */}
        <div style={{
          ...CARD,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{
            fontSize: 10, fontWeight: 600, color: C.cardTitle,
            textTransform: 'uppercase', letterSpacing: '0.4px',
            alignSelf: 'flex-start',
          }}>
            Состояние SERA
          </span>

          <AlinaCareOrb state={isToday ? 'online' : 'idle'} size={52} />

          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'center' }}>
            {['Онлайн','Думает','Отвечает','Записывает','Работает'].map((s, i) => (
              <span key={i} style={{
                fontSize: 9, padding: '2px 6px', borderRadius: 20, lineHeight: 1.4,
                background: i === 0 && isToday ? 'rgba(61,138,78,0.12)' : 'rgba(0,0,0,0.04)',
                color:      i === 0 && isToday ? '#3d8a4e' : C.cardMuted,
                border:     `0.5px solid ${i === 0 && isToday ? 'rgba(61,138,78,0.25)' : C.cardBorder}`,
              }}>
                {s}
              </span>
            ))}
          </div>

          <p style={{ fontSize: 9, color: C.cardMuted, textAlign: 'center', lineHeight: 1.4 }}>
            Ядро стабильно и работает в оптимальном режиме
          </p>
        </div>

        {/* ── Col 3 (28%): Следующая запись */}
        <div style={{ ...CARD, display: 'flex', flexDirection: 'column' }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 2,
          }}>
            <span style={{
              fontSize: 10, fontWeight: 600, color: C.cardMuted,
              textTransform: 'uppercase', letterSpacing: '0.4px',
            }}>
              Следующая запись
            </span>
            <Link href="/calendar" style={{
              fontSize: 10, color: C.cardLink, textDecoration: 'none',
              display: 'flex', alignItems: 'center', gap: 1,
            }}>
              Открыть <ChevronRight size={10} strokeWidth={1.5} />
            </Link>
          </div>

          {nextAppt ? (
            <>
              <p style={{ fontSize: 10, color: C.cardMuted, margin: '2px 0' }}>
                {fmtApptDate(nextAppt.starts_at)}
              </p>
              {/* LARGE time — must be largest element in card */}
              <p style={{
                fontSize: 36, fontWeight: 700, color: '#1a1a1a',
                lineHeight: 1, fontVariantNumeric: 'tabular-nums', margin: '2px 0',
              }}>
                {fmtHHMM(nextAppt.starts_at)}
              </p>
              <p style={{
                fontSize: 12, fontWeight: 500, color: C.cardTitle,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {nextAppt.service}
              </p>
              <p style={{
                fontSize: 11, color: C.cardMuted,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                marginBottom: 'auto',
              }}>
                {nextAppt.client}
              </p>
              <Link href="/calendar" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '5px 0', borderRadius: 7,
                border: `0.5px solid ${C.cardBorder}`,
                color: '#10382F', fontSize: 11, fontWeight: 600,
                textDecoration: 'none', marginTop: 4, flexShrink: 0,
              }}>
                Подготовить клиента
              </Link>
            </>
          ) : (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 4,
            }}>
              <Calendar size={20} strokeWidth={1.5} style={{ color: C.cardMuted, opacity: 0.35 }} />
              <p style={{ fontSize: 11, color: C.cardMuted }}>Нет ближайших записей</p>
              <Link href="/calendar" style={{ fontSize: 11, color: C.cardLink, textDecoration: 'none' }}>
                Открыть расписание →
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          4. STATS BAR — 28px, inline, no background/border
      ═══════════════════════════════════════════════════════════════════ */}
      <div style={{
        height:     28,
        flexShrink: 0,
        display:    'flex',
        alignItems: 'center',
        padding:    '0 4px',
        gap:        16,
      }}>
        {statItems.map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{
              fontSize: 14, fontWeight: 700, color: C.cardTitle,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {item.v}
            </span>
            <span style={{ fontSize: 11, color: C.cardMuted }}>{item.l}</span>
          </div>
        ))}
        <Link href="/analytics" style={{
          marginLeft: 'auto', fontSize: 11, color: C.cardLink,
          textDecoration: 'none', fontWeight: 500, whiteSpace: 'nowrap',
          display: 'flex', alignItems: 'center', gap: 2,
        }}>
          Смотреть аналитику <ChevronRight size={11} strokeWidth={1.5} />
        </Link>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          5. BOTTOM ROW — 108px, 3 equal columns
      ═══════════════════════════════════════════════════════════════════ */}
      <div style={{
        height:     108,
        flexShrink: 0,
        display:    'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap:        8,
      }}>

        {/* ── Card 1: Использование ядра */}
        <div style={{ ...CARD, display: 'flex', flexDirection: 'column' }}>
          <span style={{
            fontSize: 10, fontWeight: 600, color: C.cardTitle,
            textTransform: 'uppercase', letterSpacing: '0.4px',
            marginBottom: 8, display: 'block', flexShrink: 0,
          }}>
            Использование
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, overflow: 'hidden' }}>
            {/* Circular progress ring */}
            <svg width="52" height="52" viewBox="0 0 52 52" style={{ flexShrink: 0 }}>
              <circle cx="26" cy="26" r="20" fill="none" stroke={C.cardBorder} strokeWidth="4" />
              <circle
                cx="26" cy="26" r="20"
                fill="none" stroke="#3d8a4e" strokeWidth="4"
                strokeDasharray={`${ring * (usagePercent / 100)} ${ring}`}
                strokeLinecap="round"
                transform="rotate(-90 26 26)"
              />
              <text
                x="26" y="30" textAnchor="middle"
                fontSize="11" fontWeight="700" fill={C.cardTitle}
              >
                {usagePercent}%
              </text>
            </svg>
            {/* Usage metrics */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {[
                { l: 'Записей',    v: String(ai.bookings_today)       },
                { l: 'Диалогов',   v: String(ai.conversations_today)  },
                { l: 'Сэкономлено',v: `${ai.saved_hours}ч`           },
              ].map((r, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 10, color: C.cardMuted }}>{r.l}</span>
                  <span style={{ fontSize: 10, color: C.cardTitle, fontWeight: 600 }}>{r.v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Card 2: Рекомендует для роста — 3 horizontal sub-cards */}
        <div style={{ ...CARD, display: 'flex', flexDirection: 'column' }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 6, flexShrink: 0,
          }}>
            <span style={{
              fontSize: 10, fontWeight: 600, color: C.cardTitle,
              textTransform: 'uppercase', letterSpacing: '0.4px',
            }}>
              Рекомендует для роста
            </span>
            <Link href="/promo" style={{ color: C.cardLink, textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
              <ChevronRight size={12} strokeWidth={1.5} />
            </Link>
          </div>
          {/* 3 horizontal sub-cards */}
          <div style={{ display: 'flex', gap: 5, flex: 1, overflow: 'hidden' }}>
            {tips.slice(0, 3).map((tip, i) => (
              <Link
                key={i}
                href={tip.href}
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column', gap: 4,
                  padding: '7px 8px', borderRadius: 8, minWidth: 0,
                  background: 'rgba(61,138,78,0.05)',
                  border: `0.5px solid ${C.cardBorder}`,
                  textDecoration: 'none', overflow: 'hidden',
                }}
              >
                <span style={{ fontSize: 14, lineHeight: 1 }}>
                  {i === 0 ? '🌱' : i === 1 ? '🎁' : '📈'}
                </span>
                <p style={{
                  fontSize: 9, color: C.cardTitle, lineHeight: 1.4,
                  overflow: 'hidden',
                  display: '-webkit-box' as CSSProperties['display'],
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical' as CSSProperties['WebkitBoxOrient'],
                }}>
                  {tip.text}
                </p>
              </Link>
            ))}
          </div>
        </div>

        {/* ── Card 3: Магия анимации SERA — 5 pearl spheres */}
        <div style={{
          ...CARD,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 10,
        }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {pearls.map((scale, i) => {
              const sz = Math.round(22 * scale)
              return (
                <div
                  key={i}
                  style={{
                    width: sz, height: sz, borderRadius: '50%', flexShrink: 0,
                    background: 'radial-gradient(circle at 35% 35%, #e8dfc0 0%, #c9b878 25%, #9a8a5a 55%, #5a4a30 80%, #2a2010 100%)',
                    boxShadow: '0 0 10px rgba(201,168,76,0.35), 0 0 20px rgba(61,122,71,0.15)',
                  }}
                />
              )
            })}
          </div>
          <p style={{ fontSize: 10, color: C.cardMuted, textAlign: 'center', lineHeight: 1.4 }}>
            SERA · 5 граней присутствия
          </p>
        </div>

      </div>
    </div>
  )
}

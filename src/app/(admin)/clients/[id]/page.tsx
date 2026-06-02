import { createClient as supabaseAuth } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Phone, AtSign, Sparkles, MessageSquare } from 'lucide-react'
import { PageHeader, DataCard, EmptyState, SeraOrb, StatusPill } from '@/components/sera'
import type { AppointmentStatus } from '@/components/sera'
import { Avatar } from '@/components/shared/Avatar'
import { formatDate, formatDateLong } from '@/lib/utils/date'
import { formatPrice } from '@/lib/utils/format'

// ── Auth ──────────────────────────────────────────────────────────────────────

async function getStaffContext() {
  const supabase = await supabaseAuth()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from('tenant_users')
    .select('tenant_id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()
  if (!data) return null
  const d = data as { tenant_id: string; role: string }
  return { tenantId: d.tenant_id, role: d.role }
}

// ── Types ─────────────────────────────────────────────────────────────────────

type ClientData = {
  id: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  telegram_username: string | null
  total_visits: number
  total_spent: number
  last_visit_at: string | null
  created_at: string
  is_blocked: boolean
  tags: string[] | null
  birth_date?: string | null
}

type VisitRow = {
  id: string
  starts_at: string
  status: string
  price: number | null
  source: string | null
  master: { id: string; name: string } | null
  service: { name: string; duration_min: number; currency: string } | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pl(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100, last = abs % 10
  if (abs > 10 && abs < 20) return forms[2]
  if (last > 1 && last < 5) return forms[1]
  if (last === 1) return forms[0]
  return forms[2]
}

const STATUS_LABELS: Record<string, string> = {
  confirmed:  'Подтверждена',
  pending:    'Ожидает',
  completed:  'Завершена',
  cancelled:  'Отменена',
  no_show:    'No-show',
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Badge({ color, bg, children }: { color: string; bg: string; children: React.ReactNode }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      fontSize: 10, fontWeight: 700, padding: '2px 7px',
      borderRadius: 'var(--radius-full)',
      color, background: bg, flexShrink: 0,
    }}>
      {children}
    </span>
  )
}

function StatCell({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{
      padding: '10px 12px',
      background: 'var(--card-sunken)',
      borderRadius: 'var(--radius-md)',
    }}>
      <p style={{ fontSize: 11, color: 'var(--muted)', margin: '0 0 2px', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>
        {label}
      </p>
      <p style={{ fontSize: 16, fontWeight: 700, color: accent ? 'var(--sage)' : 'var(--ink)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </p>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function ClientProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const ctx = await getStaffContext()
  if (!ctx) redirect('/login')
  const { tenantId } = ctx

  const db = createAdminClient()

  const [clientRes, visitsRes, convRes] = await Promise.all([
    db.from('clients')
      .select('id, first_name, last_name, phone, telegram_username, total_visits, total_spent, last_visit_at, created_at, is_blocked, tags, birth_date')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single(),

    db.from('appointments')
      .select('id, starts_at, status, price, source, master:masters(id, name), service:services(name, duration_min, currency)')
      .eq('client_id', id)
      .eq('tenant_id', tenantId)
      .order('starts_at', { ascending: false })
      .limit(100),

    // Find most recent conversation for "Написать через SERA" link
    db.from('conversations')
      .select('id')
      .eq('client_id', id)
      .eq('tenant_id', tenantId)
      .order('updated_at', { ascending: false })
      .limit(1),
  ])

  if (clientRes.error || !clientRes.data) notFound()

  const client = clientRes.data as unknown as ClientData
  const allVisits = ((visitsRes.data ?? []) as unknown[]) as VisitRow[]
  const chatId = ((convRes.data ?? []) as { id: string }[])[0]?.id ?? null
  const chatHref = chatId ? `/chats/${chatId}` : '/chats'

  const name = [client.first_name, client.last_name].filter(Boolean).join(' ') || 'Без имени'
  const nowIso = new Date().toISOString()
  const THIRTY_DAYS_AGO = new Date(Date.now() - 30 * 86_400_000).toISOString()

  // Split visits:
  // - past history = completed or no_show, starts_at in the past (not future, not cancelled)
  // - upcoming     = pending or confirmed, starts_at in the future
  // - rhythm calc  = only completed past (actual completed visits)
  const pastVisits = allVisits.filter(v =>
    ['completed', 'no_show'].includes(v.status) && v.starts_at <= nowIso
  )
  const upcomingVisits = allVisits.filter(v =>
    ['pending', 'confirmed'].includes(v.status) && v.starts_at > nowIso
  ).sort((a, b) => a.starts_at.localeCompare(b.starts_at))

  const completedForRhythm = [...pastVisits]
    .filter(v => v.status === 'completed')
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))

  // Status flags — same 30-day threshold as dashboard and /clients list
  const isAtRisk   = Boolean(client.last_visit_at && client.last_visit_at < THIRTY_DAYS_AGO)
  const isNew      = new Date(client.created_at).getTime() > Date.now() - 30 * 86_400_000
  const isReturning = client.total_visits >= 3

  // Key stats
  const avgCheck = client.total_visits > 0 && client.total_spent > 0
    ? Math.round(client.total_spent / client.total_visits)
    : null
  const currency = allVisits.find(v => v.service?.currency)?.service?.currency ?? 'BYN'
  // First visit = oldest in pastVisits array (sorted desc, so last element)
  const firstVisit = pastVisits.length > 0 ? pastVisits[pastVisits.length - 1].starts_at : null

  // ── SERA rhythm — deterministic, no LLM ──────────────────────────────────
  type Rhythm = {
    avgIntervalDays: number
    daysSinceLast: number
    outOfRhythm: boolean
    narrative: string
  }
  let rhythm: Rhythm | null = null

  if (completedForRhythm.length >= 2) {
    let totalInterval = 0
    for (let i = 1; i < completedForRhythm.length; i++) {
      totalInterval +=
        (new Date(completedForRhythm[i].starts_at).getTime() -
         new Date(completedForRhythm[i - 1].starts_at).getTime()) / 86_400_000
    }
    const avgIntervalDays = Math.round(totalInterval / (completedForRhythm.length - 1))
    const lastCompleted = completedForRhythm[completedForRhythm.length - 1].starts_at
    const daysSinceLast = Math.floor(
      (Date.now() - new Date(lastCompleted).getTime()) / 86_400_000
    )
    // "At risk" threshold: same 30d as dashboard, OR exceeded avg interval by 50%
    const outOfRhythm = daysSinceLast > 30 || (avgIntervalDays > 0 && daysSinceLast > avgIntervalDays * 1.5)

    const narrative = outOfRhythm
      ? `Обычно приходит раз в ${avgIntervalDays} ${pl(avgIntervalDays, ['день', 'дня', 'дней'])}. Последний визит ${daysSinceLast} ${pl(daysSinceLast, ['день', 'дня', 'дней'])} назад — выбился из ритма.`
      : `В ритме — приходит раз в ${avgIntervalDays} ${pl(avgIntervalDays, ['день', 'дня', 'дней'])}. Последний визит ${daysSinceLast} ${pl(daysSinceLast, ['день', 'дня', 'дней'])} назад.`

    rhythm = { avgIntervalDays, daysSinceLast, outOfRhythm, narrative }
  }

  return (
    <>
      <style>{`
        .profile-layout {
          display: flex;
          flex-direction: row;
          gap: 16px;
          align-items: flex-start;
        }
        .profile-sidebar { width: 300px; flex-shrink: 0; display: flex; flex-direction: column; gap: 12px; }
        .profile-main    { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 12px; }
        @media (max-width: 860px) {
          .profile-layout  { flex-direction: column; }
          .profile-sidebar { width: 100%; }
        }
      `}</style>

      <div style={{ padding: '20px 20px 48px', maxWidth: 1100, margin: '0 auto' }}>

        {/* ── Back link ──────────────────────────────────────────────── */}
        <Link
          href="/clients"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)', textDecoration: 'none', marginBottom: 12 }}
        >
          <ChevronLeft size={14} strokeWidth={1.8} />
          Клиенты
        </Link>

        {/* ── PageHeader — no duplicate button here ─────────────────── */}
        <PageHeader
          title={name}
          subtitle={
            client.is_blocked ? 'Заблокирован'
            : isAtRisk         ? 'Под риском · давно не приходил'
            : isNew            ? 'Новый клиент'
            : isReturning      ? `Постоянный · ${client.total_visits} ${pl(client.total_visits, ['визит', 'визита', 'визитов'])}`
            : `${client.total_visits} ${pl(client.total_visits, ['визит', 'визита', 'визитов'])}`
          }
        />

        <div className="profile-layout">

          {/* ── LEFT SIDEBAR ────────────────────────────────────────── */}
          <aside className="profile-sidebar">

            {/* Client card */}
            <div className="sera-card" style={{ padding: 'var(--space-5)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
                <Avatar name={name} id={client.id} size={52} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', margin: '0 0 5px', lineHeight: 1.2 }}>
                    {name}
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {client.is_blocked && <Badge color="var(--error)" bg="var(--error-soft)">Заблокирован</Badge>}
                    {isAtRisk && !client.is_blocked && <Badge color="var(--warning)" bg="var(--warning-soft)">Под риском</Badge>}
                    {isNew && <Badge color="var(--info)" bg="var(--info-soft)">Новый</Badge>}
                    {isReturning && !isAtRisk && !isNew && !client.is_blocked && (
                      <Badge color="var(--sage)" bg="var(--sage-tint)">Постоянный</Badge>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 14 }}>
                {client.phone && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink-2)' }}>
                    <Phone size={13} strokeWidth={1.8} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                    {client.phone}
                  </div>
                )}
                {client.telegram_username && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink-2)' }}>
                    <AtSign size={13} strokeWidth={1.8} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                    @{client.telegram_username}
                  </div>
                )}
                {!client.phone && !client.telegram_username && (
                  <p style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>Контакты не указаны</p>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <StatCell label="Визитов" value={String(client.total_visits)} accent={client.total_visits >= 10} />
                {avgCheck != null
                  ? <StatCell label="Средний чек" value={formatPrice(avgCheck, currency)} />
                  : <StatCell label="Клиент с" value={formatDateLong(client.created_at)} />
                }
                {client.last_visit_at && (
                  <StatCell label="Последний визит" value={formatDate(client.last_visit_at)} />
                )}
                {firstVisit && (
                  <StatCell label="Первый визит" value={formatDateLong(firstVisit)} />
                )}
              </div>

              {client.tags && client.tags.length > 0 && (
                <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {client.tags.map(tag => (
                    <span key={tag} style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 'var(--radius-full)', background: 'var(--sage-tint)', color: 'var(--sage)' }}>
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* SERA rhythm block — single SeraOrb on this page (economy rule) */}
            <div className="sera-card" style={{ padding: 'var(--space-5)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <SeraOrb state={rhythm ? (rhythm.outOfRhythm ? 'alert' : 'online') : 'idle'} size={32} />
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Sparkles size={11} style={{ color: 'var(--sage)' }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--sage)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                      Ритм клиента
                    </span>
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--muted)', margin: '1px 0 0' }}>анализ SERA</p>
                </div>
              </div>

              {rhythm ? (
                <>
                  <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6, margin: '0 0 12px' }}>
                    {rhythm.narrative}
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <StatCell label="Средний интервал" value={`${rhythm.avgIntervalDays} дн.`} />
                    <StatCell
                      label="Дней с визита"
                      value={`${rhythm.daysSinceLast} дн.`}
                      accent={!rhythm.outOfRhythm}
                    />
                  </div>
                </>
              ) : (
                <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, margin: 0 }}>
                  Недостаточно истории для анализа ритма — нужно минимум 2 завершённых визита.
                </p>
              )}

              {/* Single "Написать через SERA" button — links to client's conversation if found */}
              <div style={{ marginTop: 14 }}>
                <Link href={chatHref}>
                  <button
                    className="sera-btn sera-btn--ghost sera-btn--sm"
                    style={{ width: '100%', justifyContent: 'center', gap: 6 }}
                  >
                    <MessageSquare size={12} />
                    Написать через SERA
                  </button>
                </Link>
              </div>
            </div>

          </aside>

          {/* ── RIGHT MAIN ────────────────────────────────────────────── */}
          <main className="profile-main">

            {/* Upcoming visits (only if any) */}
            {upcomingVisits.length > 0 && (
              <div className="sera-card" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className="sera-label">Предстоящие записи · {upcomingVisits.length}</span>
                </div>
                <div>
                  {upcomingVisits.map((visit, i) => {
                    const svcName    = visit.service?.name ?? '—'
                    const masterName = visit.master?.name  ?? '—'
                    const isAi       = visit.source === 'ai'
                    const status     = visit.status as AppointmentStatus

                    return (
                      <div key={visit.id} style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '11px 16px',
                        borderBottom: i < upcomingVisits.length - 1 ? '1px solid var(--line-soft)' : 'none',
                        background: 'var(--sage-tint)',
                      }}>
                        <div style={{ flexShrink: 0, width: 88 }}>
                          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>
                            {formatDate(visit.starts_at)}
                          </p>
                          <p style={{ fontSize: 11, color: 'var(--ink-2)', margin: '1px 0 0', fontFamily: 'var(--font-mono)' }}>
                            {new Date(visit.starts_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {svcName}
                            </p>
                            {isAi && <Sparkles size={10} style={{ color: 'var(--gold)', flexShrink: 0 }} />}
                          </div>
                          <p style={{ fontSize: 12, color: 'var(--ink-2)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {masterName}
                          </p>
                        </div>
                        {visit.price != null && visit.price > 0 && (
                          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', margin: 0, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                            {formatPrice(visit.price, visit.service?.currency ?? currency)}
                          </p>
                        )}
                        <div style={{ flexShrink: 0, minWidth: 90, textAlign: 'right' }}>
                          <StatusPill status={status} label={STATUS_LABELS[visit.status] ?? visit.status} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Past visit history */}
            <div className="sera-card" style={{ overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--card-border)' }}>
                <span className="sera-label">История визитов · {pastVisits.length}</span>
              </div>

              {pastVisits.length === 0 ? (
                <div style={{ padding: 'var(--space-5)' }}>
                  <EmptyState
                    orbState="idle"
                    title="Визитов пока не было"
                    description="Когда клиент запишется через SERA или администратор создаст запись, история появится здесь"
                  />
                </div>
              ) : (
                <div>
                  {pastVisits.map((visit, i) => {
                    const svcName    = visit.service?.name ?? '—'
                    const masterName = visit.master?.name  ?? '—'
                    const isAi       = visit.source === 'ai'
                    const status     = visit.status as AppointmentStatus

                    return (
                      <div key={visit.id} style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '11px 16px',
                        borderBottom: i < pastVisits.length - 1 ? '1px solid var(--line-soft)' : 'none',
                      }}>
                        {/* Date + time */}
                        <div style={{ flexShrink: 0, width: 88 }}>
                          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>
                            {formatDate(visit.starts_at)}
                          </p>
                          <p style={{ fontSize: 11, color: 'var(--ink-2)', margin: '1px 0 0', fontFamily: 'var(--font-mono)' }}>
                            {new Date(visit.starts_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>

                        {/* Service + master — --ink-2 for readable secondary text */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {svcName}
                            </p>
                            {isAi && <Sparkles size={10} style={{ color: 'var(--gold)', flexShrink: 0 }} />}
                          </div>
                          <p style={{ fontSize: 12, color: 'var(--ink-2)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {masterName}
                          </p>
                        </div>

                        {/* Price */}
                        <div style={{ flexShrink: 0, textAlign: 'right', minWidth: 70 }}>
                          {visit.price != null && visit.price > 0 ? (
                            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                              {formatPrice(visit.price, visit.service?.currency ?? currency)}
                            </p>
                          ) : (
                            <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>—</p>
                          )}
                        </div>

                        {/* Status */}
                        <div style={{ flexShrink: 0, minWidth: 90, textAlign: 'right' }}>
                          <StatusPill
                            status={status}
                            label={STATUS_LABELS[visit.status] ?? visit.status}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

          </main>
        </div>
      </div>
    </>
  )
}

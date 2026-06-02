import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Search, UserPlus, Phone, AtSign, Calendar,
  AlertTriangle, Gift, UserCheck, Sparkles, ChevronRight,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { PageHeader, DataCard, EmptyState } from '@/components/sera'
import { Avatar } from '@/components/shared/Avatar'
import { formatDate } from '@/lib/utils/date'

// ── Auth ──────────────────────────────────────────────────────────────────────

async function getStaffContext() {
  const supabase = await createClient()
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

type ClientRow = {
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
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pl(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100, last = abs % 10
  if (abs > 10 && abs < 20) return forms[2]
  if (last > 1 && last < 5) return forms[1]
  if (last === 1) return forms[0]
  return forms[2]
}

function filterHref(search: string, current: string, next: string): string {
  const f = current === next ? '' : next
  const p = new URLSearchParams()
  if (search) p.set('search', search)
  if (f) p.set('filter', f)
  const qs = p.toString()
  return `/clients${qs ? `?${qs}` : ''}`
}

function pageHref(search: string, filter: string, page: number): string {
  const p = new URLSearchParams()
  if (search) p.set('search', search)
  if (filter) p.set('filter', filter)
  if (page > 1) p.set('page', String(page))
  const qs = p.toString()
  return `/clients${qs ? `?${qs}` : ''}`
}

// ── Sub-components (server-safe) ──────────────────────────────────────────────

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

function InsightCard({
  href, active, count, label, sublabel, iconColor, activeBg, Icon,
}: {
  href: string; active: boolean; count: number; label: string; sublabel: string
  iconColor: string; activeBg: string; Icon: LucideIcon
}) {
  const empty = count === 0 && !active
  // Disabled state: use --muted-disabled (lighter, signals non-interactive context).
  // No opacity on container — opacity causes double-dimming and kills contrast.
  const dimText = empty ? 'var(--muted-disabled)' : undefined
  return (
    <Link
      href={href}
      style={{
        display: 'flex', flexDirection: 'column', gap: 8,
        padding: '14px 16px',
        borderRadius: 'var(--radius-lg)',
        border: active
          ? `1.5px solid ${iconColor}`
          : empty
          ? '1px solid var(--line-soft)'
          : '1px solid var(--card-border)',
        background: active ? activeBg : 'var(--card)',
        textDecoration: 'none',
        transition: 'box-shadow 0.15s',
        boxShadow: active ? 'var(--shadow-sm)' : 'var(--shadow-xs)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Icon size={15} strokeWidth={1.8} style={{ color: empty ? 'var(--muted-disabled)' : iconColor }} />
        {active && (
          <span style={{ fontSize: 9, fontWeight: 800, color: iconColor, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            фильтр
          </span>
        )}
      </div>
      <div>
        <p style={{ fontSize: 26, fontWeight: 800, color: dimText ?? 'var(--ink)', lineHeight: 1, fontVariantNumeric: 'tabular-nums', margin: 0 }}>
          {count}
        </p>
        <p style={{ fontSize: 12, fontWeight: 600, color: dimText ?? 'var(--ink-2)', margin: '3px 0 0' }}>
          {label}
        </p>
        <p style={{ fontSize: 11, color: dimText ?? 'var(--muted)', margin: '1px 0 0' }}>
          {sublabel}
        </p>
      </div>
    </Link>
  )
}

function ClientRowEl({
  client, isLast, thirtyDaysAgo,
}: {
  client: ClientRow
  isLast: boolean
  thirtyDaysAgo: string
}) {
  const name = [client.first_name, client.last_name].filter(Boolean).join(' ') || 'Без имени'
  const isAtRisk = Boolean(client.last_visit_at && client.last_visit_at < thirtyDaysAgo)
  const isNew = new Date(client.created_at).getTime() > Date.now() - 30 * 86_400_000
  const isReturning = client.total_visits >= 3

  return (
    <Link
      href={`/clients/${client.id}`}
      className="client-row"
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '11px 16px',
        borderBottom: isLast ? 'none' : '1px solid var(--line-soft)',
        textDecoration: 'none',
      }}
    >
      <Avatar name={name} id={client.id} size={36} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>
            {name}
          </span>
          {client.is_blocked && (
            <Badge color="var(--error)" bg="var(--error-soft)">Заблокирован</Badge>
          )}
          {isAtRisk && !client.is_blocked && (
            <Badge color="var(--warning)" bg="var(--warning-soft)">Под риском</Badge>
          )}
          {isNew && (
            <Badge color="var(--info)" bg="var(--info-soft)">Новый</Badge>
          )}
          {isReturning && !isAtRisk && !isNew && !client.is_blocked && (
            <Badge color="var(--sage)" bg="var(--sage-tint)">Постоянный</Badge>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {client.phone && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
              <Phone size={11} strokeWidth={1.8} />
              {client.phone}
            </span>
          )}
          {client.telegram_username && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
              <AtSign size={11} strokeWidth={1.8} />
              {client.telegram_username}
            </span>
          )}
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: isAtRisk ? 'var(--error)' : 'var(--text-muted)' }}>
            <Calendar size={11} strokeWidth={1.8} />
            {client.last_visit_at ? formatDate(client.last_visit_at) : 'нет визитов'}
          </span>
        </div>
      </div>

      <div style={{ flexShrink: 0, textAlign: 'right', marginRight: 4 }}>
        <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums', margin: 0, lineHeight: 1 }}>
          {client.total_visits}
        </p>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>
          {pl(client.total_visits, ['визит', 'визита', 'визитов'])}
        </p>
      </div>

      <ChevronRight size={14} strokeWidth={1.8} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
    </Link>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string; filter?: string }>
}) {
  const { search = '', page: pageStr = '1', filter = '' } = await searchParams
  const page = Math.max(1, parseInt(pageStr) || 1)
  const limit = 30
  const offset = (page - 1) * limit

  const ctx = await getStaffContext()
  if (!ctx) redirect('/login')
  const { tenantId } = ctx

  const db = createAdminClient()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString()

  // ── Insight counts (parallel) ─────────────────────────────────────────────
  const [
    { count: atRiskCount },
    { count: newCount },
    bdResult,
  ] = await Promise.all([
    // At-risk: no visit in last 30 days (matches dashboard threshold)
    db.from('clients').select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .not('last_visit_at', 'is', null)
      .lt('last_visit_at', thirtyDaysAgo),

    // New this month
    db.from('clients').select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .gte('created_at', thirtyDaysAgo),

    // Birthday: column may not exist — handled gracefully below
    db.from('clients').select('id, birth_date')
      .eq('tenant_id', tenantId)
      .not('birth_date', 'is', null),
  ])

  // Compute birthday count + IDs from fetched data (JS-side month+day comparison)
  let birthdayCount = 0
  let birthdayIds: string[] = []
  if (!bdResult.error && bdResult.data) {
    const today = new Date()
    const in14 = new Date(Date.now() + 14 * 86_400_000)
    const matching = (bdResult.data as { id: string; birth_date: string }[]).filter(c => {
      try {
        const bd = new Date(c.birth_date)
        const y = today.getFullYear()
        const bdThis = new Date(y, bd.getMonth(), bd.getDate())
        const bdNext = new Date(y + 1, bd.getMonth(), bd.getDate())
        return (bdThis >= today && bdThis <= in14) || (bdNext >= today && bdNext <= in14)
      } catch { return false }
    })
    birthdayCount = matching.length
    birthdayIds = matching.map(c => c.id)
  }

  // ── Main clients list ─────────────────────────────────────────────────────
  let q = db
    .from('clients')
    .select(
      'id, first_name, last_name, phone, telegram_username, total_visits, total_spent, last_visit_at, created_at, is_blocked, tags',
      { count: 'exact' }
    )
    .eq('tenant_id', tenantId)
    .order('last_visit_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1)

  if (search.trim()) {
    const s = search.trim()
    q = q.or(`first_name.ilike.%${s}%,last_name.ilike.%${s}%,phone.ilike.%${s}%,telegram_username.ilike.%${s}%`)
  }

  if (filter === 'attention') {
    q = q.not('last_visit_at', 'is', null).lt('last_visit_at', thirtyDaysAgo)
  } else if (filter === 'new') {
    q = q.gte('created_at', thirtyDaysAgo)
  } else if (filter === 'birthday') {
    if (birthdayIds.length > 0) {
      q = q.in('id', birthdayIds)
    } else {
      // No birthday clients — force empty result
      q = q.eq('id', '00000000-0000-0000-0000-000000000000')
    }
  }

  const { data: rawClients, count: filteredCount } = await q
  const clients = (rawClients ?? []) as ClientRow[]
  const total = filteredCount ?? 0
  const totalPages = Math.ceil(total / limit)

  const filterLabel =
    filter === 'attention' ? 'Под риском' :
    filter === 'new' ? 'Новые за месяц' :
    filter === 'birthday' ? 'Скоро день рождения' : null

  return (
    <>
      <style>{`
        .client-row { transition: background 0.12s; }
        .client-row:hover { background: var(--sage-tint); }
      `}</style>

      <div style={{ padding: '24px 20px 40px', maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── PageHeader ─────────────────────────────────────────────── */}
        <PageHeader
          title="Клиенты"
          subtitle={`${total} ${pl(total, ['клиент', 'клиента', 'клиентов'])}${filterLabel ? ` · ${filterLabel}` : ''}`}
          action={
            <button className="sera-btn sera-btn--sera" style={{ gap: 6 }}>
              <UserPlus size={14} /> Добавить клиента
            </button>
          }
        />

        {/* ── SERA Insight Strip ─────────────────────────────────────── */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
            <Sparkles size={12} strokeWidth={2} style={{ color: 'var(--sage)' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--sage)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              SERA следит за клиентами
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            <InsightCard
              href={filterHref(search, filter, 'attention')}
              active={filter === 'attention'}
              count={atRiskCount ?? 0}
              label="Под риском"
              sublabel="давно не приходили"
              iconColor="var(--error)"
              activeBg="var(--error-soft)"
              Icon={AlertTriangle}
            />
            <InsightCard
              href={filterHref(search, filter, 'birthday')}
              active={filter === 'birthday'}
              count={birthdayCount}
              label="Скоро день рождения"
              sublabel="повод для касания"
              iconColor="var(--gold)"
              activeBg="var(--gold-soft)"
              Icon={Gift}
            />
            <InsightCard
              href={filterHref(search, filter, 'new')}
              active={filter === 'new'}
              count={newCount ?? 0}
              label="Новые за месяц"
              sublabel="SERA привела"
              iconColor="var(--sage)"
              activeBg="var(--sage-tint)"
              Icon={UserCheck}
            />
          </div>

          {filter && (
            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
              <Link
                href={`/clients${search ? `?search=${encodeURIComponent(search)}` : ''}`}
                style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}
              >
                Сбросить фильтр ×
              </Link>
            </div>
          )}
        </div>

        {/* ── Search ────────────────────────────────────────────────── */}
        <form method="GET" action="/clients">
          {filter && <input type="hidden" name="filter" value={filter} />}
          <div style={{ position: 'relative', maxWidth: 400 }}>
            <Search
              size={14}
              strokeWidth={1.8}
              style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }}
            />
            <input
              name="search"
              defaultValue={search}
              placeholder="Имя, телефон или @username..."
              style={{
                width: '100%', height: 38,
                paddingLeft: 36, paddingRight: 14,
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius-md)',
                background: 'var(--card)',
                color: 'var(--ink)',
                fontSize: 13,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </form>

        {/* ── Client list ───────────────────────────────────────────── */}
        <div
          className="sera-card"
          style={{ overflow: 'hidden' }}
        >
          {/* Card header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid var(--card-border)',
          }}>
            <span className="sera-label">
              {filter ? `${filterLabel} · ${total}` : `Все клиенты · ${total}`}
            </span>
          </div>

          {/* Rows */}
          {clients.length === 0 ? (
            <div style={{ padding: 'var(--space-5)' }}>
              <EmptyState
                title={
                  search
                    ? 'Клиенты не найдены'
                    : filter === 'attention'
                    ? 'Все под контролем'
                    : filter === 'birthday'
                    ? 'Дней рождения нет'
                    : 'Нет клиентов'
                }
                description={
                  search
                    ? `По запросу «${search}» никого нет`
                    : filter === 'attention'
                    ? 'Все клиенты недавно посещали салон — отлично!'
                    : filter === 'birthday'
                    ? 'В ближайшие 14 дней дней рождения нет'
                    : 'Клиенты появятся, когда начнут записываться через SERA'
                }
              />
            </div>
          ) : (
            <div>
              {clients.map((client, i) => (
                <ClientRowEl
                  key={client.id}
                  client={client}
                  isLast={i === clients.length - 1}
                  thirtyDaysAgo={thirtyDaysAgo}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Pagination ────────────────────────────────────────────── */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <Link
                key={p}
                href={pageHref(search, filter, p)}
                style={{
                  width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, textDecoration: 'none',
                  background: p === page ? 'var(--ink)' : 'transparent',
                  color: p === page ? 'var(--page)' : 'var(--muted)',
                }}
              >
                {p}
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

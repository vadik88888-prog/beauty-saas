import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Search, Users, Phone, Star, AtSign, Calendar, Sparkles, Ban } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { MetricCard } from '@/components/shared/MetricCard'
import { formatDate } from '@/lib/utils/date'
import { formatPrice } from '@/lib/utils/format'

async function getTenantId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data } = await supabase
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', user!.id)
    .single()
  return (data as { tenant_id: string } | null)!.tenant_id
}

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

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string }>
}) {
  const { search = '', page: pageStr = '1' } = await searchParams
  const page = parseInt(pageStr)
  const limit = 30
  const offset = (page - 1) * limit

  const tenantId = await getTenantId()
  const supabase = createAdminClient()

  let query = supabase
    .from('clients')
    .select('id, first_name, last_name, phone, telegram_username, total_visits, total_spent, last_visit_at, created_at, is_blocked, tags', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .order('last_visit_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1)

  if (search) {
    query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,phone.ilike.%${search}%,telegram_username.ilike.%${search}%`)
  }

  const { data, count } = await query
  const clients = (data as unknown as ClientRow[]) ?? []
  const total = count ?? 0
  const totalPages = Math.ceil(total / limit)

  const activeRecent = clients.filter(c =>
    c.last_visit_at && new Date(c.last_visit_at) > new Date(Date.now() - 30 * 86400000)
  ).length

  // Count clients who came via AI (heuristic — clients with appointments source='ai')
  type AiClientRow = { client_id: string }
  const { data: aiClientsData } = await supabase
    .from('appointments')
    .select('client_id')
    .eq('tenant_id', tenantId)
    .eq('source', 'ai')
  const aiClientIds = new Set(((aiClientsData ?? []) as AiClientRow[]).map(a => a.client_id))

  return (
    <div className="p-5 md:p-8 max-w-5xl mx-auto flex flex-col gap-6">
      <PageHeader
        title="Клиенты"
        description={`${total} ${pluralize(total, ['клиент', 'клиента', 'клиентов'])} · AI помнит каждого`}
      />

      {/* Search */}
      <form method="GET">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            name="search"
            defaultValue={search}
            placeholder="Имя, телефон или @username..."
            className="pl-9"
          />
        </div>
      </form>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <MetricCard label="Всего" value={total} icon={Users} />
        <MetricCard label="Активные за 30 дней" value={activeRecent} icon={Star} />
        <MetricCard isAi label="Записаны через AI" value={aiClientIds.size} icon={Sparkles} />
      </div>

      {/* List */}
      {clients.length === 0 ? (
        <EmptyState
          icon={Users}
          title={search ? 'Клиенты не найдены' : 'Нет клиентов'}
          description={
            search
              ? `По запросу «${search}» никого нет`
              : 'Клиенты появятся здесь, когда начнут писать боту или приходить на услуги'
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {clients.map(client => {
            const isAi = aiClientIds.has(client.id)
            const fullName = [client.first_name, client.last_name].filter(Boolean).join(' ') || 'Без имени'
            return (
              <ClientCard
                key={client.id}
                client={client}
                fullName={fullName}
                isAi={isAi}
              />
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center gap-1 justify-center flex-wrap">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
            <a
              key={p}
              href={`?page=${p}${search ? `&search=${encodeURIComponent(search)}` : ''}`}
              className={`w-9 h-9 flex items-center justify-center rounded-xl text-[12px] font-medium transition-colors ${
                p === page
                  ? 'bg-foreground text-background'
                  : 'hover:bg-muted text-muted-foreground'
              }`}
            >
              {p}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

function ClientCard({
  client, fullName, isAi,
}: {
  client: ClientRow
  fullName: string
  isAi: boolean
}) {
  return (
    <div
      className="flex items-center gap-4 p-4 rounded-2xl border border-border bg-surface-elevated"
      style={{ boxShadow: 'var(--shadow-xs)' }}
    >
      <div className="w-11 h-11 rounded-2xl bg-surface-sunken flex items-center justify-center shrink-0 text-[14px] font-semibold text-foreground">
        {fullName.charAt(0).toUpperCase()}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="font-semibold text-[14px] text-foreground truncate">{fullName}</p>
          {isAi && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-ai-soft text-ai-foreground border border-ai-border">
              <Sparkles className="w-2.5 h-2.5" strokeWidth={2.2} />
              AI
            </span>
          )}
          {client.is_blocked && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded bg-destructive-soft text-destructive">
              <Ban className="w-2.5 h-2.5" />
              Заблокирован
            </span>
          )}
          {client.tags?.map(tag => (
            <span key={tag} className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              {tag}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
          {client.phone && (
            <span className="inline-flex items-center gap-1">
              <Phone className="w-3 h-3" strokeWidth={1.8} />
              {client.phone}
            </span>
          )}
          {client.telegram_username && (
            <span className="inline-flex items-center gap-1">
              <AtSign className="w-3 h-3" strokeWidth={1.8} />
              {client.telegram_username}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <Calendar className="w-3 h-3" strokeWidth={1.8} />
            {client.last_visit_at ? formatDate(client.last_visit_at) : 'нет визитов'}
          </span>
        </div>
      </div>

      <div className="flex flex-col items-end gap-0.5 shrink-0">
        <div className="text-[15px] font-semibold text-foreground tabular-nums">
          {client.total_visits}
        </div>
        <div className="text-[10px] text-muted-foreground">
          {pluralize(client.total_visits, ['визит', 'визита', 'визитов'])}
        </div>
        {client.total_spent > 0 && (
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {formatPrice(client.total_spent, 'BYN')}
          </div>
        )}
      </div>
    </div>
  )
}

function pluralize(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100
  const last = abs % 10
  if (abs > 10 && abs < 20) return forms[2]
  if (last > 1 && last < 5) return forms[1]
  if (last === 1) return forms[0]
  return forms[2]
}

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Search, Users, Phone, Star } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
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

  return (
    <div className="p-6 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Клиенты</h1>
          <p className="text-muted-foreground text-sm mt-1">{total} клиентов всего</p>
        </div>
      </div>

      {/* Search */}
      <form method="GET">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            name="search"
            defaultValue={search}
            placeholder="Поиск по имени, телефону, username..."
            className="pl-9"
          />
        </div>
      </form>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Всего клиентов" value={total} icon={<Users className="w-5 h-5 text-blue-500" />} />
        <StatCard label="Активные (30 дней)" value={clients.filter(c => c.last_visit_at && new Date(c.last_visit_at) > new Date(Date.now() - 30 * 86400000)).length} icon={<Star className="w-5 h-5 text-yellow-500" />} />
        <StatCard label="На этой странице" value={clients.length} icon={<Phone className="w-5 h-5 text-green-500" />} />
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Клиент</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Контакт</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Визиты</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Потрачено</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Последний визит</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Статус</th>
              </tr>
            </thead>
            <tbody>
              {clients.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-muted-foreground">
                    {search ? 'Клиенты не найдены' : 'Нет клиентов'}
                  </td>
                </tr>
              ) : clients.map(client => (
                <tr key={client.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-semibold">
                        {[client.first_name, client.last_name].filter(Boolean).join(' ') || 'Без имени'}
                      </p>
                      {client.tags && client.tags.length > 0 && (
                        <div className="flex gap-1 mt-1">
                          {client.tags.map(tag => (
                            <Badge key={tag} variant="secondary" className="text-xs py-0">{tag}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {client.phone && <p>{client.phone}</p>}
                    {client.telegram_username && <p className="text-xs">@{client.telegram_username}</p>}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">{client.total_visits}</td>
                  <td className="px-4 py-3 text-right">{formatPrice(client.total_spent, 'BYN')}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {client.last_visit_at ? formatDate(client.last_visit_at) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {client.is_blocked
                      ? <Badge variant="destructive">Заблокирован</Badge>
                      : <Badge variant="secondary">Активен</Badge>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center gap-2 justify-center">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
            <a
              key={p}
              href={`?page=${p}${search ? `&search=${encodeURIComponent(search)}` : ''}`}
              className={`w-9 h-9 flex items-center justify-center rounded-lg text-sm font-medium transition-colors ${
                p === page
                  ? 'bg-primary text-primary-foreground'
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

function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-1">{icon}<span className="text-sm text-muted-foreground">{label}</span></div>
      <p className="text-2xl font-bold">{value}</p>
    </Card>
  )
}

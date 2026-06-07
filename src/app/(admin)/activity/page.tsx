import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Calendar, Repeat, BookOpen, User } from 'lucide-react'
import { DateNav } from '@/app/(admin)/dashboard/_components/DateNav'

async function getTenantId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const adminClient = createAdminClient()
  const { data } = await adminClient
    .from('tenant_users').select('tenant_id')
    .eq('user_id', user.id).eq('is_active', true).single()
  if (!data) redirect('/login')
  return (data as { tenant_id: string }).tenant_id
}


type BookingRow = {
  id: string; created_at: string; starts_at: string
  client: { id: string; first_name: string | null; last_name: string | null; phone: string | null } | null
  master: { name: string } | null
  service: { name: string } | null
}

type HandoffRow = {
  id: string; updated_at: string
  client: { id: string; first_name: string | null; last_name: string | null; telegram_username: string | null } | null
}

type MsgRow = { id: string; created_at: string; content: string }

type ConvRow = {
  id: string; created_at: string; status: string
  client: { id: string; first_name: string | null; last_name: string | null } | null
  messages: MsgRow[]
}

type ClientCard = {
  clientId: string
  clientName: string
  phone?: string | null
  actions: Array<{ time: string; type: 'booking' | 'handoff' | 'message'; text: string; detail?: string }>
}

async function getActivityForDate(tenantId: string, dateStr: string): Promise<ClientCard[]> {
  const supabase = createAdminClient()
  const dayStart = `${dateStr}T00:00:00Z`
  const dayEnd   = `${dateStr}T23:59:59Z`

  const [{ data: bookings }, { data: handoffs }, { data: conversations }] = await Promise.all([
    supabase.from('appointments')
      .select('id, created_at, starts_at, client:clients(id, first_name, last_name, phone), master:masters(name), service:services(name)')
      .eq('tenant_id', tenantId).eq('source', 'ai')
      .gte('created_at', dayStart).lte('created_at', dayEnd)
      .order('created_at', { ascending: false }),

    supabase.from('conversations')
      .select('id, updated_at, client:clients(id, first_name, last_name, telegram_username)')
      .eq('tenant_id', tenantId).eq('status', 'handed_off')
      .gte('updated_at', dayStart).lte('updated_at', dayEnd),

    supabase.from('conversations')
      .select(`id, created_at, status, client:clients(id, first_name, last_name),
        messages(id, created_at, content)`)
      .eq('tenant_id', tenantId)
      .gte('created_at', dayStart).lte('created_at', dayEnd)
      .order('created_at', { ascending: false })
      .limit(30),
  ])

  const clientMap = new Map<string, ClientCard>()

  function ensureClient(id: string, name: string, phone?: string | null): ClientCard {
    if (!clientMap.has(id)) {
      clientMap.set(id, { clientId: id, clientName: name, phone, actions: [] })
    }
    return clientMap.get(id)!
  }

  for (const b of ((bookings ?? []) as unknown as BookingRow[])) {
    const cid  = b.client?.id ?? 'unknown'
    const name = [b.client?.first_name, b.client?.last_name].filter(Boolean).join(' ') || 'Клиент'
    const card = ensureClient(cid, name, b.client?.phone)
    const apptTime = fmtTime(b.starts_at)
    card.actions.push({
      time: fmtHHMM(b.created_at),
      type: 'booking',
      text: `Записала на «${b.service?.name ?? 'услугу'}»`,
      detail: `${apptTime} · мастер: ${b.master?.name ?? '—'}`,
    })
  }

  for (const h of ((handoffs ?? []) as unknown as HandoffRow[])) {
    const cid  = h.client?.id ?? 'unknown'
    const name = h.client?.first_name ?? (h.client?.telegram_username ? `@${h.client.telegram_username}` : 'Клиент')
    const card = ensureClient(cid, name)
    card.actions.push({
      time: fmtHHMM(h.updated_at),
      type: 'handoff',
      text: 'Передала диалог администратору',
      detail: 'Сложный вопрос — требует вашего ответа',
    })
  }

  for (const conv of ((conversations ?? []) as unknown as ConvRow[])) {
    const cid  = conv.client?.id ?? 'unknown'
    const name = [conv.client?.first_name, conv.client?.last_name].filter(Boolean).join(' ') || 'Клиент'
    const card = ensureClient(cid, name)
    const msgs = (conv.messages ?? []).filter((m): m is MsgRow => !!m)
    const count = msgs.length
    if (count > 0) {
      const last = msgs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
      card.actions.push({
        time: fmtHHMM(conv.created_at),
        type: 'message',
        text: `Ответила на ${count} ${plMsg(count)}`,
        detail: truncate(last?.content ?? '', 80),
      })
    }
  }

  // Sort actions within each card by time desc
  for (const card of clientMap.values()) {
    card.actions.sort((a, b) => b.time.localeCompare(a.time))
  }

  return [...clientMap.values()].sort((a, b) => b.actions[0]?.time.localeCompare(a.actions[0]?.time ?? '') ?? 0)
}

function fmtHHMM(iso: string): string {
  const d = new Date(iso)
  return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  const months = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек']
  return `${d.getDate()} ${months[d.getMonth()]}, ${fmtHHMM(iso)}`
}

function plMsg(n: number): string {
  const last = n % 10, abs = n % 100
  if (abs > 10 && abs < 20) return 'сообщений'
  if (last === 1) return 'сообщение'
  if (last > 1 && last < 5) return 'сообщения'
  return 'сообщений'
}

function truncate(s: string, len: number): string {
  return s.length > len ? s.slice(0, len) + '…' : s
}

const RU_MONTHS = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря']
const RU_DAYS   = ['воскресенье','понедельник','вторник','среду','четверг','пятницу','субботу']
function fmtDateHeading(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const today = new Date().toISOString().slice(0, 10)
  if (dateStr === today) return `Сегодня, ${d.getDate()} ${RU_MONTHS[d.getMonth()]}`
  return `${d.getDate()} ${RU_MONTHS[d.getMonth()]} — ${RU_DAYS[d.getDay()]}`
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const { date: dateParam } = await searchParams
  const today   = new Date().toISOString().slice(0, 10)
  const dateStr = dateParam ?? today

  const tenantId = await getTenantId()
  const cards = await getActivityForDate(tenantId, dateStr)

  const iconMap = {
    booking: <Calendar className="w-3.5 h-3.5" />,
    handoff: <Repeat className="w-3.5 h-3.5" />,
    message: <BookOpen className="w-3.5 h-3.5" />,
  }
  const bgMap = {
    booking: 'bg-sage text-page',
    handoff: 'bg-[#f0d8d4] text-[#8b3a2a]',
    message: 'bg-[#e0ecff] text-[#3b6cb5]',
  }

  return (
    <div className="p-5 md:p-6 flex flex-col gap-5 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/dashboard" className="w-8 h-8 rounded-xl border border-line bg-cream hover:bg-cream-2 flex items-center justify-center transition-colors">
              <ArrowLeft className="w-4 h-4 text-ink-2" />
            </Link>
            <h1 className="text-base font-bold text-ink">Что сделала SERA</h1>
          </div>
          <p className="text-xs text-ink-2 ml-10">{fmtDateHeading(dateStr)}</p>
        </div>
        <DateNav dateStr={dateStr} />
      </div>

      {/* Cards per client */}
      {cards.length === 0 ? (
        <div className="rounded-2xl bg-cream border border-line p-10 text-center">
          <User className="w-8 h-8 text-sage/40 mx-auto mb-2.5" />
          <p className="text-sm font-medium text-ink">Нет активности за этот день</p>
          <p className="text-xs text-ink-2 mt-1">SERA ещё не обрабатывала диалоги в выбранный день</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {cards.map(card => (
            <div key={card.clientId} className="rounded-2xl bg-cream border border-line overflow-hidden animate-card-in">
              {/* Client header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-line bg-cream-2/50">
                <span className="w-8 h-8 rounded-xl bg-sage/15 text-sage flex items-center justify-center text-xs font-bold shrink-0">
                  {card.clientName.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{card.clientName}</p>
                  {card.phone && <p className="text-xs text-ink-2">{card.phone}</p>}
                </div>
                <span className="text-xs text-ink-2 shrink-0">
                  {card.actions.length} {card.actions.length === 1 ? 'действие' : card.actions.length < 5 ? 'действия' : 'действий'}
                </span>
              </div>

              {/* Actions */}
              <div className="divide-y divide-line">
                {card.actions.map((action, i) => (
                  <div key={i} className="flex items-start gap-3 px-4 py-3 hover:bg-cream-2/50 transition-colors">
                    <span className="text-xs font-mono font-bold text-ink w-11 shrink-0 mt-0.5 tabular-nums">
                      {action.time}
                    </span>
                    <span className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${bgMap[action.type]}`}>
                      {iconMap[action.type]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink">{action.text}</p>
                      {action.detail && (
                        <p className="text-xs text-ink-2 mt-0.5 leading-snug">{action.detail}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

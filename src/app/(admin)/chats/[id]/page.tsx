'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Send, User, Shield, CheckCircle, BotOff, Power,
  Phone, AtSign, Calendar, History, Ban, BookOpen, Sparkles,
  AlertCircle, ChevronDown, X,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { AiActivityDot } from '@/components/shared/AiActivityDot'
import { AiBadge } from '@/components/shared/AiBadge'
import { formatTime, formatDate } from '@/lib/utils/date'

type Message = {
  id: string
  role: string
  content: string
  created_at: string
  metadata?: { knowledgeSources?: { title: string; relevance_pct: number }[] } | null
}

type Client = {
  id: string
  first_name: string | null
  last_name: string | null
  telegram_username: string | null
  telegram_id: number
  phone: string | null
  total_visits: number | null
  last_visit_at: string | null
  is_blocked: boolean
  notes: string | null
}

type Conversation = {
  id: string
  status: string
  created_at: string
  updated_at: string
  handoff_reason: string | null
  handoff_summary: string | null
  client: Client | null
}

const HANDOFF_REASON_LABEL: Record<string, { icon: string; label: string }> = {
  medical_concern: { icon: '🩺', label: 'Медицинский вопрос' },
  user_request: { icon: '👋', label: 'Клиент попросил человека' },
  frustration: { icon: '😤', label: 'Клиент расстроен' },
  complaint: { icon: '⚠️', label: 'Жалоба' },
  complex_question: { icon: '🤔', label: 'Сложный вопрос' },
  tool_failure: { icon: '⚙️', label: 'Технический сбой' },
}

type Appt = {
  id: string
  starts_at: string
  status: string
  source: string | null
  service: { name: string } | null
  master: { name: string } | null
}

export default function ChatDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [id, setId] = useState<string>('')
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [appointments, setAppointments] = useState<Appt[]>([])
  const [aiName, setAiName] = useState('Алина')
  const [isLoading, setIsLoading] = useState(true)
  const [reply, setReply] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [showSidePanel, setShowSidePanel] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    params.then(p => setId(p.id))
  }, [params])

  useEffect(() => {
    if (!id) return
    fetch(`/api/admin/chats/${id}`)
      .then(r => r.json())
      .then(({ data }) => {
        if (data) {
          setConversation(data.conversation)
          setMessages(data.messages ?? [])
          setAppointments(data.recentAppointments ?? [])
          // Pre-fill reply from conversation.draft (set by ContactButton, cleared after send)
          const draft = (data.conversation as { draft?: string | null }).draft
          if (draft) setReply(draft)
        }
      })
      .finally(() => setIsLoading(false))

    fetch('/api/admin/ai-settings')
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        const name = (json?.data as { admin_name?: string } | undefined)?.admin_name
        if (name && name !== 'Администратор') setAiName(name)
      })
      .catch(() => null)
  }, [id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    if (!reply.trim() || !id) return
    setIsSending(true)
    try {
      const res = await fetch(`/api/admin/chats/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: reply.trim() }),
      })
      if (!res.ok) throw new Error()
      const { data } = await res.json()
      setMessages(prev => [...prev, data])
      setReply('')
      toast.success('Отправлено в Telegram')
    } catch {
      toast.error('Ошибка отправки')
    } finally {
      setIsSending(false)
    }
  }

  async function handleResolve() {
    if (!id) return
    const res = await fetch(`/api/admin/chats/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: conversation?.status === 'resolved' ? 'active' : 'resolved' }),
    })
    if (res.ok) {
      const { data } = await res.json()
      setConversation(prev => prev ? { ...prev, status: data.status } : prev)
      toast.success(data.status === 'resolved' ? 'Диалог завершён' : 'Диалог снова активен')
    }
  }

  async function handleHandoff() {
    if (!id) return
    const isHandedOff = conversation?.status === 'handed_off'
    const res = await fetch(`/api/admin/chats/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: isHandedOff ? 'active' : 'handed_off' }),
    })
    if (res.ok) {
      const { data } = await res.json()
      setConversation(prev => prev ? { ...prev, status: data.status } : prev)
      toast.success(isHandedOff ? `${aiName} снова отвечает` : `${aiName} остановлена, отвечаете вы`)
    }
  }

  const client = conversation?.client
  const clientName = client
    ? [client.first_name, client.last_name].filter(Boolean).join(' ') ||
      (client.telegram_username ? `@${client.telegram_username}` : `TG ${client.telegram_id}`)
    : 'Клиент'
  const clientInitial = clientName.charAt(0).toUpperCase()
  const isHandedOff = conversation?.status === 'handed_off'
  const isResolved = conversation?.status === 'resolved'

  return (
    <div className="flex h-full bg-background">
      {/* Main chat column */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <header className="flex items-center gap-3 px-4 md:px-6 py-3.5 border-b border-border bg-background">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="w-9 h-9 rounded-full bg-surface-sunken flex items-center justify-center text-[13px] font-semibold text-foreground">
            {clientInitial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[14px] text-foreground truncate">{clientName}</p>
            <p className="text-[11px] text-muted-foreground truncate">
              {client?.telegram_username ? `@${client.telegram_username}` : `TG ${client?.telegram_id ?? '—'}`}
              {client?.total_visits && client.total_visits > 0 ? ` · ${client.total_visits} визит(ов)` : ''}
            </p>
          </div>

          {/* Action buttons */}
          <div className="hidden sm:flex items-center gap-2">
            <button
              onClick={handleHandoff}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 h-9 rounded-xl text-[12px] font-medium border transition-colors',
                isHandedOff
                  ? 'bg-warning-soft border-warning text-foreground'
                  : 'border-border hover:bg-muted text-muted-foreground'
              )}
              title={isHandedOff ? `${aiName} остановлена` : `Остановить ${aiName}`}
            >
              {isHandedOff ? <Power className="w-3.5 h-3.5" /> : <BotOff className="w-3.5 h-3.5" />}
              {isHandedOff ? `Вернуть ${aiName}` : `Стоп ${aiName}`}
            </button>
            <button
              onClick={handleResolve}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 h-9 rounded-xl text-[12px] font-medium border transition-colors',
                isResolved
                  ? 'bg-success-soft border-success text-foreground'
                  : 'border-border hover:bg-muted text-muted-foreground'
              )}
            >
              <CheckCircle className="w-3.5 h-3.5" />
              {isResolved ? 'Открыть' : 'Завершить'}
            </button>
          </div>

          {/* Mobile: side panel toggle */}
          <button
            onClick={() => setShowSidePanel(true)}
            className="lg:hidden w-9 h-9 flex items-center justify-center rounded-xl hover:bg-muted"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </header>

        {/* Handoff banner */}
        {isHandedOff && (() => {
          const reasonKey = conversation?.handoff_reason ?? ''
          const reasonInfo = HANDOFF_REASON_LABEL[reasonKey]
          const summary = conversation?.handoff_summary
          return (
            <div className="px-4 md:px-6 py-3 bg-warning-soft border-b border-warning/30 flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-warning/20 flex items-center justify-center shrink-0 text-[15px]">
                {reasonInfo?.icon ?? '🆘'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-foreground">
                  {aiName} передала диалог вам {reasonInfo && (
                    <span className="text-muted-foreground font-normal">· {reasonInfo.label}</span>
                  )}
                </p>
                {summary
                  ? <p className="text-[11px] text-muted-foreground mt-0.5"><span className="font-medium">Контекст:</span> {summary}</p>
                  : <p className="text-[11px] text-muted-foreground">Отвечайте сами — AI не вмешивается.</p>
                }
              </div>
            </div>
          )
        })()}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 flex flex-col gap-3">
          {isLoading ? (
            <div className="text-center text-muted-foreground text-sm py-8">Загрузка...</div>
          ) : messages.length === 0 ? (
            <div className="text-center text-muted-foreground text-sm py-8">Нет сообщений</div>
          ) : (
            messages.map(msg => <MessageBubble key={msg.id} message={msg} aiName={aiName} clientInitial={clientInitial} />)
          )}
          <div ref={bottomRef} />
        </div>

        {/* Reply input */}
        <div className="px-4 md:px-6 py-4 border-t border-border bg-background safe-bottom">
          <p className="text-[11px] text-muted-foreground mb-2">
            {isHandedOff ? `Отвечаете вы — ${aiName} не вмешивается` : `Ваш ответ заменит ${aiName} на это сообщение`}
          </p>
          <div className="flex items-center gap-2">
            <input
              value={reply}
              onChange={e => setReply(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder="Написать клиенту..."
              className="flex-1 px-4 py-2.5 rounded-2xl border border-border bg-surface-sunken text-[14px] focus:outline-none focus:border-ai-border transition-colors"
            />
            <button
              onClick={handleSend}
              disabled={!reply.trim() || isSending}
              className="w-11 h-11 rounded-2xl bg-foreground text-background flex items-center justify-center disabled:opacity-40 active:scale-95 transition-transform"
            >
              <Send className="w-4 h-4" strokeWidth={1.8} />
            </button>
          </div>
        </div>
      </div>

      {/* Side panel — Desktop */}
      <SidePanel
        className="hidden lg:flex"
        client={client}
        appointments={appointments}
        conversation={conversation}
        aiName={aiName}
      />

      {/* Side panel — Mobile drawer */}
      {showSidePanel && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
            onClick={() => setShowSidePanel(false)}
          />
          <SidePanel
            className="ml-auto h-full w-80 relative"
            client={client}
            appointments={appointments}
            conversation={conversation}
            aiName={aiName}
            onClose={() => setShowSidePanel(false)}
          />
        </div>
      )}
    </div>
  )
}

function SidePanel({
  className, client, appointments, conversation, aiName, onClose,
}: {
  className?: string
  client: Client | null | undefined
  appointments: Appt[]
  conversation: Conversation | null
  aiName: string
  onClose?: () => void
}) {
  const ai = useAiSummary(appointments)
  const clientName = client
    ? [client.first_name, client.last_name].filter(Boolean).join(' ') || (client.telegram_username ? `@${client.telegram_username}` : 'Клиент')
    : 'Клиент'

  return (
    <aside className={cn('flex flex-col w-80 border-l border-border bg-sidebar overflow-y-auto shrink-0', className)}>
      {onClose && (
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <p className="text-[12px] font-semibold text-foreground">Карточка клиента</p>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Client info */}
      <section className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-surface-sunken flex items-center justify-center text-[18px] font-semibold text-foreground">
            {clientName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-foreground text-[14px] truncate">{clientName}</p>
            {client?.is_blocked && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-destructive mt-0.5">
                <Ban className="w-2.5 h-2.5" />
                Заблокирован
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {client?.telegram_username && (
            <InfoRow icon={AtSign} value={`@${client.telegram_username}`} />
          )}
          {client?.phone && (
            <InfoRow icon={Phone} value={client.phone} />
          )}
          <InfoRow
            icon={History}
            value={client?.total_visits
              ? `${client.total_visits} ${pluralize(client.total_visits, ['визит', 'визита', 'визитов'])}`
              : 'Первый визит'
            }
          />
          {client?.last_visit_at && (
            <InfoRow icon={Calendar} value={`Последний: ${formatDate(client.last_visit_at)}`} />
          )}
        </div>
      </section>

      {/* AI summary */}
      <section className="px-5 pb-5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-subtle mb-2">
          Что заметила {aiName}
        </p>
        <div className="rounded-2xl bg-ai-soft border border-ai-border p-3.5">
          <div className="flex items-start gap-2">
            <AiActivityDot className="shrink-0 mt-1" />
            <p className="text-[12px] text-ai-foreground leading-snug">{ai.summary}</p>
          </div>
        </div>
      </section>

      {/* Recent appointments */}
      {appointments.length > 0 && (
        <section className="px-5 pb-5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-subtle mb-2">
            История записей
          </p>
          <div className="flex flex-col gap-1.5">
            {appointments.map(a => (
              <div key={a.id} className="rounded-xl bg-surface-elevated border border-border p-2.5">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <p className="text-[12px] font-medium text-foreground truncate">{a.service?.name ?? '—'}</p>
                  {a.source === 'ai' && <AiBadge label="AI" withIcon={false} />}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {formatDate(a.starts_at)} · {formatTime(a.starts_at)} · {a.master?.name ?? '—'}
                </p>
                <span className={cn(
                  'inline-block mt-1 text-[10px] font-medium px-1.5 py-0.5 rounded',
                  a.status === 'completed' ? 'bg-success-soft text-success' :
                  a.status === 'no_show' ? 'bg-destructive-soft text-destructive' :
                  a.status === 'cancelled' ? 'bg-muted text-muted-foreground' :
                  'bg-ai-soft text-ai-foreground'
                )}>
                  {statusLabel(a.status)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Quick actions */}
      <section className="px-5 pb-5 mt-auto">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-subtle mb-2">
          Быстрые действия
        </p>
        <div className="flex flex-col gap-1.5">
          <Link
            href="/calendar"
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-surface-elevated border border-border hover:bg-surface-sunken transition-colors text-[12px] font-medium text-foreground"
          >
            <Calendar className="w-3.5 h-3.5" />
            Открыть календарь
          </Link>
          <Link
            href={`/clients`}
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-surface-elevated border border-border hover:bg-surface-sunken transition-colors text-[12px] font-medium text-foreground"
          >
            <User className="w-3.5 h-3.5" />
            Список клиентов
          </Link>
        </div>
        {conversation?.created_at && (
          <p className="text-[10px] text-muted-foreground mt-3 text-center">
            Диалог начат {formatDate(conversation.created_at)}
          </p>
        )}
      </section>
    </aside>
  )
}

function InfoRow({ icon: Icon, value }: { icon: typeof Phone; value: string }) {
  return (
    <div className="flex items-center gap-2.5 text-[12px] text-muted-foreground">
      <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={1.8} />
      <span className="truncate text-foreground">{value}</span>
    </div>
  )
}

function MessageBubble({
  message: msg, aiName, clientInitial,
}: {
  message: Message
  aiName: string
  clientInitial: string
}) {
  const isUser = msg.role === 'user'
  const isAI = msg.role === 'assistant'
  const isAdmin = msg.role === 'admin'
  const time = formatTime(msg.created_at)

  return (
    <div className={cn('flex gap-2', isUser ? 'flex-row' : 'flex-row-reverse')}>
      <div className={cn(
        'w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-1 text-[11px] font-semibold',
        isUser ? 'bg-surface-sunken text-foreground' :
        isAI ? 'bg-ai text-white' :
        'bg-foreground text-background'
      )}>
        {isUser ? clientInitial : isAI ? aiName.charAt(0).toUpperCase() : <Shield className="w-3.5 h-3.5" />}
      </div>

      <div className={cn(
        'max-w-[75%] rounded-2xl px-4 py-2.5',
        isUser
          ? 'bg-surface-sunken border border-border rounded-tl-md'
          : isAI
            ? 'bg-ai-soft border border-ai-border rounded-tr-md'
            : 'bg-foreground text-background rounded-tr-md'
      )}>
        {(isAI || isAdmin) && (
          <p className={cn(
            'text-[10px] font-semibold mb-1',
            isAI ? 'text-ai-foreground/70' : 'text-background/70'
          )}>
            {isAI ? aiName : 'Вы'}
          </p>
        )}
        <p className={cn(
          'text-[13px] whitespace-pre-wrap leading-relaxed',
          isAdmin ? 'text-background' : 'text-foreground'
        )}>
          {msg.content}
        </p>
        {isAI && msg.metadata?.knowledgeSources && msg.metadata.knowledgeSources.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {msg.metadata.knowledgeSources.map((s, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-surface-elevated border border-ai-border text-[10px] text-ai-foreground font-medium"
              >
                <BookOpen className="w-2.5 h-2.5" strokeWidth={2.2} />
                {s.title}
                <span className="text-ai-foreground/60">·</span>
                <span className="text-ai-foreground/70">{s.relevance_pct}%</span>
              </span>
            ))}
          </div>
        )}
        <p className={cn(
          'text-[10px] mt-1',
          isAdmin ? 'text-background/50' : 'text-muted-foreground'
        )}>
          {time}
        </p>
      </div>
    </div>
  )
}

// ────── Helpers ──────

function useAiSummary(appointments: Appt[]): { summary: string } {
  if (appointments.length === 0) {
    return { summary: 'Новый клиент. Ещё нет истории визитов — стоит обратиться особенно внимательно.' }
  }
  const completed = appointments.filter(a => a.status === 'completed').length
  const noShows = appointments.filter(a => a.status === 'no_show').length
  const aiCreated = appointments.filter(a => a.source === 'ai').length

  const parts: string[] = []
  if (completed > 0) parts.push(`${completed} завершённ${completed === 1 ? 'ый' : 'ых'} визит${completed === 1 ? '' : 'а'}`)
  if (aiCreated > 0) parts.push(`из них ${aiCreated} записан${aiCreated === 1 ? 'а' : 'о'} через меня`)
  if (noShows >= 2) parts.push(`${noShows} no-show — будьте мягче`)

  if (parts.length === 0) {
    return { summary: 'Постоянный клиент. История стабильная.' }
  }
  return { summary: parts.join(', ') + '.' }
}

function pluralize(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100
  const last = abs % 10
  if (abs > 10 && abs < 20) return forms[2]
  if (last > 1 && last < 5) return forms[1]
  if (last === 1) return forms[0]
  return forms[2]
}

function statusLabel(status: string): string {
  switch (status) {
    case 'pending': return 'ожидает'
    case 'confirmed': return 'подтверждена'
    case 'completed': return 'завершена'
    case 'cancelled': return 'отменена'
    case 'no_show': return 'no-show'
    default: return status
  }
}

void Sparkles

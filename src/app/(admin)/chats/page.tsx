'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MessageSquare, User, Clock, CheckCircle, AlertCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

type Conversation = {
  id: string
  status: string
  created_at: string
  updated_at: string
  client: {
    id: string
    first_name: string | null
    last_name: string | null
    telegram_username: string | null
    telegram_id: number
  } | null
  last_message: {
    id: string
    role: string
    content: string
    created_at: string
  } | null
  message_count: number
}

const STATUS_CONFIG: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  active: { label: 'Активный', icon: MessageSquare, color: 'bg-blue-100 text-blue-700' },
  resolved: { label: 'Завершён', icon: CheckCircle, color: 'bg-green-100 text-green-700' },
  handed_off: { label: 'Передан', icon: AlertCircle, color: 'bg-orange-100 text-orange-700' },
}

export default function ChatsPage() {
  const router = useRouter()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    fetch('/api/admin/chats')
      .then(r => r.json())
      .then(({ data }) => setConversations(data ?? []))
      .finally(() => setIsLoading(false))
  }, [])

  const filtered = filter === 'all'
    ? conversations
    : conversations.filter(c => c.status === filter)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-5 border-b bg-background">
        <h1 className="text-xl font-bold">Чаты с клиентами</h1>
        <p className="text-sm text-muted-foreground mt-0.5">История диалогов AI-администратора</p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 px-6 pt-4 pb-2">
        {[
          { key: 'all', label: 'Все' },
          { key: 'active', label: 'Активные' },
          { key: 'handed_off', label: 'Переданы' },
          { key: 'resolved', label: 'Завершённые' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === tab.key ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80 text-muted-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground text-sm">Загрузка...</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">Нет диалогов</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 pt-2">
            {filtered.map(conv => (
              <ConversationRow
                key={conv.id}
                conversation={conv}
                onClick={() => router.push(`/chats/${conv.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ConversationRow({
  conversation: conv,
  onClick,
}: {
  conversation: Conversation
  onClick: () => void
}) {
  const statusCfg = STATUS_CONFIG[conv.status] ?? STATUS_CONFIG.active
  const StatusIcon = statusCfg.icon
  const clientName = conv.client
    ? [conv.client.first_name, conv.client.last_name].filter(Boolean).join(' ') || `@${conv.client.telegram_username}` || `TG ${conv.client.telegram_id}`
    : 'Неизвестный клиент'

  const lastMsg = conv.last_message
  const lastMsgTime = lastMsg ? new Date(lastMsg.created_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''
  const preview = lastMsg ? (lastMsg.content.length > 80 ? lastMsg.content.slice(0, 80) + '...' : lastMsg.content) : 'Нет сообщений'
  const isFromClient = lastMsg?.role === 'user'

  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-start gap-4 p-4 rounded-xl border bg-card hover:bg-muted/50 transition-colors"
    >
      {/* Avatar */}
      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
        <User className="w-5 h-5 text-primary" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <p className="font-semibold text-sm truncate">{clientName}</p>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="secondary" className={`text-xs ${statusCfg.color}`}>
              <StatusIcon className="w-3 h-3 mr-1" />
              {statusCfg.label}
            </Badge>
          </div>
        </div>

        <p className={`text-xs line-clamp-1 ${isFromClient ? 'text-foreground' : 'text-muted-foreground'}`}>
          {isFromClient ? '' : 'AI: '}{preview}
        </p>

        <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {lastMsgTime}
          </span>
          <span>{conv.message_count} сообщений</span>
        </div>
      </div>
    </button>
  )
}

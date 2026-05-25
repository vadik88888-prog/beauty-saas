'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Send, User, Bot, Shield, CheckCircle, BotOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

type Message = {
  id: string
  role: string
  content: string
  created_at: string
}

type Conversation = {
  id: string
  status: string
  created_at: string
  client: {
    id: string
    first_name: string | null
    last_name: string | null
    telegram_username: string | null
    telegram_id: number
    phone: string | null
  } | null
}

export default function ChatDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [id, setId] = useState<string>('')
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [reply, setReply] = useState('')
  const [isSending, setIsSending] = useState(false)
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
        }
      })
      .finally(() => setIsLoading(false))
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
      toast.success('Сообщение отправлено')
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
      toast.success(data.status === 'resolved' ? 'Чат завершён' : 'Чат снова активен')
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
      toast.success(isHandedOff ? 'Бот снова активен' : 'Бот остановлен, подключён оператор')
    }
  }

  const clientName = conversation?.client
    ? [conversation.client.first_name, conversation.client.last_name].filter(Boolean).join(' ') || `@${conversation.client.telegram_username}` || `TG ${conversation.client.telegram_id}`
    : 'Клиент'

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 md:px-6 py-4 border-b bg-background">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
          <User className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">{clientName}</p>
          {conversation?.client?.telegram_username && (
            <p className="text-xs text-muted-foreground">@{conversation.client.telegram_username}</p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleHandoff}
          className={conversation?.status === 'handed_off' ? 'text-orange-600 border-orange-300' : ''}
          title={conversation?.status === 'handed_off' ? 'Включить бота' : 'Остановить бота'}
        >
          <BotOff className="w-4 h-4 mr-1.5" />
          {conversation?.status === 'handed_off' ? 'Вкл. бота' : 'Стоп бот'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleResolve}
          className={conversation?.status === 'resolved' ? 'text-green-600 border-green-300' : ''}
        >
          <CheckCircle className="w-4 h-4 mr-1.5" />
          {conversation?.status === 'resolved' ? 'Открыть' : 'Завершить'}
        </Button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 flex flex-col gap-3">
        {isLoading ? (
          <div className="text-center text-muted-foreground text-sm py-8">Загрузка...</div>
        ) : messages.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-8">Нет сообщений</div>
        ) : (
          messages.map(msg => <MessageBubble key={msg.id} message={msg} />)
        )}
        <div ref={bottomRef} />
      </div>

      {/* Reply input */}
      <div className="px-4 md:px-6 py-4 border-t bg-background">
        <p className="text-xs text-muted-foreground mb-2">Ответить клиенту (сообщение придёт в Telegram):</p>
        <div className="flex gap-2">
          <input
            value={reply}
            onChange={e => setReply(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Напишите ответ..."
            className="flex-1 px-4 py-2.5 rounded-xl border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <Button onClick={handleSend} disabled={!reply.trim() || isSending} size="icon" className="rounded-xl h-10 w-10">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

function MessageBubble({ message: msg }: { message: Message }) {
  const isUser = msg.role === 'user'
  const isAI = msg.role === 'assistant'
  const isAdmin = msg.role === 'admin'
  const time = new Date(msg.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className={`flex gap-2 ${isUser ? 'flex-row' : 'flex-row-reverse'}`}>
      {/* Avatar */}
      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-1 ${
        isUser ? 'bg-muted' : isAI ? 'bg-primary/10' : 'bg-green-100'
      }`}>
        {isUser ? <User className="w-4 h-4 text-muted-foreground" /> :
         isAI ? <Bot className="w-4 h-4 text-primary" /> :
         <Shield className="w-4 h-4 text-green-600" />}
      </div>

      {/* Bubble */}
      <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
        isUser ? 'bg-muted rounded-tl-sm' :
        isAI ? 'bg-primary/10 rounded-tr-sm' :
        'bg-green-50 border border-green-200 rounded-tr-sm'
      }`}>
        {(isAI || isAdmin) && (
          <p className="text-xs font-semibold mb-1 opacity-60">{isAI ? 'AI-Администратор' : 'Администратор'}</p>
        )}
        <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
        <p className={`text-[10px] mt-1 opacity-50 ${isUser ? 'text-left' : 'text-right'}`}>{time}</p>
      </div>
    </div>
  )
}

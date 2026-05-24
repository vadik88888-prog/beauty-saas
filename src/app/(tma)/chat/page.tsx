'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Send, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatTime } from '@/lib/utils/date'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  isLoading?: boolean
}

export default function ChatPage() {
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Привет! Чем могу помочь? 😊\n\nЯ могу:\n• Записать вас на услугу\n• Рассказать о ценах\n• Перенести или отменить запись',
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState('')
  const [conversationId, setConversationId] = useState<string | undefined>()
  const [isSending, setIsSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    const text = input.trim()
    if (!text || isSending) return

    setInput('')
    setIsSending(true)

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    }

    const loadingMsg: Message = {
      id: 'loading',
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isLoading: true,
    }

    setMessages(prev => [...prev, userMsg, loadingMsg])

    try {
      const token = sessionStorage.getItem('tma_token')
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: text,
          conversationId,
        }),
      })

      const { data, error } = await res.json()

      if (error || !data) {
        throw new Error(error ?? 'Ошибка')
      }

      if (data.conversationId) setConversationId(data.conversationId)

      const aiMsg: Message = {
        id: Date.now().toString() + '_ai',
        role: 'assistant',
        content: data.reply,
        timestamp: new Date(),
      }

      setMessages(prev => prev.filter(m => m.id !== 'loading').concat(aiMsg))

      window.Telegram?.WebApp.HapticFeedback?.notificationOccurred('success')
    } catch {
      const errMsg: Message = {
        id: Date.now().toString() + '_err',
        role: 'assistant',
        content: 'Извините, произошла ошибка. Попробуйте ещё раз.',
        timestamp: new Date(),
      }
      setMessages(prev => prev.filter(m => m.id !== 'loading').concat(errMsg))
    } finally {
      setIsSending(false)
      inputRef.current?.focus()
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const quickReplies = ['Записаться', 'Цены', 'Мои записи', 'Перенести запись']

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-tg-bg">
        <button onClick={() => router.back()} className="w-9 h-9 flex items-center justify-center rounded-xl bg-tg-secondary">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-tg-button flex items-center justify-center text-white font-bold text-sm">
            А
          </div>
          <div>
            <p className="font-semibold text-tg-text text-sm">Администратор</p>
            <p className="text-xs text-green-500">онлайн</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
        {messages.map(msg => (
          <ChatBubble key={msg.id} message={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick replies */}
      {messages.length <= 2 && (
        <div className="px-4 pb-2 flex gap-2 overflow-x-auto scrollbar-hide">
          {quickReplies.map(reply => (
            <button
              key={reply}
              onClick={() => { setInput(reply); inputRef.current?.focus() }}
              className="shrink-0 px-4 py-2 rounded-full bg-tg-secondary text-tg-text text-sm whitespace-nowrap"
            >
              {reply}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="px-4 pb-4 safe-bottom pt-2 border-t border-border bg-tg-bg">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Написать..."
            className="flex-1 px-4 py-3 rounded-2xl bg-tg-secondary text-tg-text text-sm outline-none placeholder:text-tg-hint"
            disabled={isSending}
            autoComplete="off"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isSending}
            className="w-11 h-11 rounded-2xl flex items-center justify-center transition-opacity disabled:opacity-40"
            style={{ background: 'var(--tg-button)' }}
          >
            {isSending ? (
              <Loader2 className="w-5 h-5 text-white animate-spin" />
            ) : (
              <Send className="w-5 h-5 text-white" />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

function ChatBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[82%] px-4 py-3 rounded-2xl text-sm',
          isUser
            ? 'rounded-br-md text-white'
            : 'rounded-bl-md bg-tg-secondary text-tg-text'
        )}
        style={isUser ? { background: 'var(--tg-button)' } : {}}
      >
        {message.isLoading ? (
          <div className="flex gap-1 items-center h-5">
            <span className="w-1.5 h-1.5 rounded-full bg-tg-hint animate-bounce [animation-delay:0ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-tg-hint animate-bounce [animation-delay:150ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-tg-hint animate-bounce [animation-delay:300ms]" />
          </div>
        ) : (
          <>
            <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
            <p className={cn('text-xs mt-1', isUser ? 'text-white/60' : 'text-tg-hint')}>
              {formatTime(message.timestamp.toISOString())}
            </p>
          </>
        )}
      </div>
    </div>
  )
}

'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Send, Loader2, Paperclip, X, Image as ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatTime } from '@/lib/utils/date'
import type { AttachmentInput } from '@/lib/ai/administrator/types'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  isLoading?: boolean
  imageUrl?: string  // Preview URL for images sent by user
}

export default function ChatPage() {
  const router = useRouter()
  const [hasToken, setHasToken] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Привет! Чем могу помочь? 😊\n\nЯ могу:\n• Записать вас на услугу\n• Рассказать о ценах\n• Перенести или отменить запись',
      timestamp: new Date(),
    },
  ])

  useEffect(() => {
    setHasToken(!!sessionStorage.getItem('tma_token'))
  }, [])

  // Load chat history on mount if we have a saved conversationId
  useEffect(() => {
    const savedId = sessionStorage.getItem('chat_conversation_id')
    if (!savedId) return
    const token = sessionStorage.getItem('tma_token')
    if (!token) return

    fetch(`/api/ai/chat/history?id=${savedId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (!json?.data?.length) return
        type MsgRow = { role: string; content: string; created_at: string }
        const historyMsgs: Message[] = (json.data as MsgRow[]).map((m, i) => ({
          id: `hist_${i}`,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          timestamp: new Date(m.created_at),
        }))
        setMessages([...historyMsgs])
      })
      .catch(() => null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [input, setInput] = useState('')
  const [conversationId, setConversationId] = useState<string | undefined>(() => {
    if (typeof window !== 'undefined') return sessionStorage.getItem('chat_conversation_id') ?? undefined
    return undefined
  })
  const [isSending, setIsSending] = useState(false)
  const [pendingAttachments, setPendingAttachments] = useState<AttachmentInput[]>([])
  const [attachmentPreviews, setAttachmentPreviews] = useState<string[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleAttachClick() {
    fileInputRef.current?.click()
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return

    const allowed = files.filter(f =>
      ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(f.type)
    )
    // Limit to 3 images
    const toProcess = allowed.slice(0, 3 - pendingAttachments.length)

    const newAttachments: AttachmentInput[] = []
    const newPreviews: string[] = []

    for (const file of toProcess) {
      const base64 = await fileToBase64(file)
      newAttachments.push({ type: 'image', base64, mimeType: file.type, name: file.name })
      newPreviews.push(`data:${file.type};base64,${base64}`)
    }

    setPendingAttachments(prev => [...prev, ...newAttachments])
    setAttachmentPreviews(prev => [...prev, ...newPreviews])

    // Reset file input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function removeAttachment(index: number) {
    setPendingAttachments(prev => prev.filter((_, i) => i !== index))
    setAttachmentPreviews(prev => prev.filter((_, i) => i !== index))
  }

  async function handleSend() {
    const text = input.trim()
    if ((!text && !pendingAttachments.length) || isSending) return

    const displayText = text || '📷 Фото'
    const imagePreview = attachmentPreviews[0]

    setInput('')
    setPendingAttachments([])
    setAttachmentPreviews([])
    setIsSending(true)

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: displayText,
      timestamp: new Date(),
      imageUrl: imagePreview,
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
      // Token might not be set yet if auth is still in progress — wait up to 4 seconds
      let token = sessionStorage.getItem('tma_token')
      if (!token) {
        const deadline = Date.now() + 4000
        while (!token && Date.now() < deadline) {
          await new Promise(r => setTimeout(r, 300))
          token = sessionStorage.getItem('tma_token')
        }
      }
      if (!token) {
        throw new Error('Для общения откройте приложение через Telegram бот и подождите секунду пока загружается.')
      }

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: text || '(клиент прислал фото)',
          conversationId,
          attachments: pendingAttachments.length ? pendingAttachments : undefined,
        }),
      })

      if (res.status === 401) {
        sessionStorage.removeItem('tma_token')
        throw new Error('Сессия истекла. Закройте и снова откройте приложение.')
      }

      const { data, error } = await res.json()

      if (error || !data) throw new Error(error ?? 'Ошибка')

      if (data.conversationId) {
        setConversationId(data.conversationId)
        sessionStorage.setItem('chat_conversation_id', data.conversationId)
      }

      const aiMsg: Message = {
        id: Date.now().toString() + '_ai',
        role: 'assistant',
        content: data.reply,
        timestamp: new Date(),
      }

      setMessages(prev => prev.filter(m => m.id !== 'loading').concat(aiMsg))
      window.Telegram?.WebApp.HapticFeedback?.notificationOccurred('success')
    } catch (e) {
      const errMsg: Message = {
        id: Date.now().toString() + '_err',
        role: 'assistant',
        content: e instanceof Error ? e.message : 'Извините, произошла ошибка. Попробуйте ещё раз.',
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

      {/* Attachment previews */}
      {attachmentPreviews.length > 0 && (
        <div className="px-4 pb-2 flex gap-2 overflow-x-auto scrollbar-hide">
          {attachmentPreviews.map((src, i) => (
            <div key={i} className="relative shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt="Вложение"
                className="w-16 h-16 rounded-xl object-cover"
              />
              <button
                onClick={() => removeAttachment(i)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center"
              >
                <X className="w-3 h-3 text-white" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="px-4 pb-4 safe-bottom pt-2 border-t border-border bg-tg-bg">
        <div className="flex items-center gap-2">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />

          {/* Attachment button */}
          <button
            onClick={handleAttachClick}
            disabled={isSending || pendingAttachments.length >= 3}
            className="w-11 h-11 rounded-2xl flex items-center justify-center bg-tg-secondary text-tg-hint disabled:opacity-40"
          >
            <Paperclip className="w-5 h-5" />
          </button>

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
            disabled={(!input.trim() && !pendingAttachments.length) || isSending}
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
          'max-w-[82%] rounded-2xl text-sm overflow-hidden',
          isUser
            ? 'rounded-br-md text-white'
            : 'rounded-bl-md bg-tg-secondary text-tg-text'
        )}
        style={isUser ? { background: 'var(--tg-button)' } : {}}
      >
        {/* Image attachment in message */}
        {message.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={message.imageUrl}
            alt="Фото"
            className="w-full max-w-[240px] rounded-t-2xl object-cover"
          />
        )}

        <div className="px-4 py-3">
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
    </div>
  )
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Strip the data URL prefix (e.g. "data:image/jpeg;base64,")
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

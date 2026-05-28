'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Send, Loader2, Paperclip, X, Sparkles, BookOpen, Mic, Square } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatTime } from '@/lib/utils/date'
import { toast } from 'sonner'
import { AiActivityDot } from '@/components/shared/AiActivityDot'
import type { AttachmentInput } from '@/lib/ai/administrator/types'
import { waitForTmaToken } from '@/lib/tma-token'

interface KnowledgeSource {
  title: string
  relevance_pct: number
}

interface SuggestedAction {
  label: string
  message: string
}

interface Message {
  id: string
  role: 'user' | 'assistant' | 'admin'
  content: string
  timestamp: Date
  isLoading?: boolean
  imageUrl?: string
  knowledgeSources?: KnowledgeSource[]
  suggestedActions?: SuggestedAction[]
}

export default function ChatPage() {
  const router = useRouter()
  const [aiName, setAiName] = useState('Алина')
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Привет! Помогу выбрать услугу, подобрать мастера и записать на удобное время. С чего начнём?',
      timestamp: new Date(),
      suggestedActions: [
        { label: '✨ Записаться', message: 'Хочу записаться' },
        { label: 'Цены', message: 'Расскажи про цены и услуги' },
        { label: 'Мои записи', message: 'Покажи мои записи' },
      ],
    },
  ])

  useEffect(() => {
    let cancelled = false
    waitForTmaToken().then(token => {
      if (cancelled || !token) return
      fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null)
        .then(json => {
          const welcome = json?.aiSettings?.welcome_message
          const name = json?.aiSettings?.admin_name
          if (name && name !== 'Администратор') setAiName(name)
          if (welcome) {
            setMessages(prev => {
              if (prev.length === 1 && prev[0].id === 'welcome') {
                return [{ ...prev[0], content: welcome }]
              }
              return prev
            })
          }
        })
        .catch(() => null)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const savedId = sessionStorage.getItem('chat_conversation_id')
    if (!savedId) return
    let cancelled = false

    waitForTmaToken().then(token => {
      if (cancelled || !token) return
      fetch(`/api/ai/chat/history?id=${savedId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (!json?.data?.length) return
        type MsgRow = {
          role: string
          content: string
          created_at: string
          metadata: { knowledgeSources?: KnowledgeSource[]; suggestedActions?: SuggestedAction[] } | null
        }
        const historyMsgs: Message[] = (json.data as MsgRow[]).map((m, i) => ({
          id: `hist_${i}`,
          role: m.role as 'user' | 'assistant' | 'admin',
          content: m.content,
          timestamp: new Date(m.created_at),
          knowledgeSources: m.metadata?.knowledgeSources,
          suggestedActions: m.metadata?.suggestedActions,
        }))
        setMessages([...historyMsgs])

        // Detect handoff state from history: any admin message → admin connected
        const hasAdminReply = historyMsgs.some(m => m.role === 'admin')
        if (hasAdminReply) {
          setHandoffState('admin_connected')
        }
      })
      .catch(() => null)
    })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [handoffState, setHandoffState] = useState<'none' | 'awaiting' | 'admin_connected'>('none')
  const [pendingAttachments, setPendingAttachments] = useState<AttachmentInput[]>([])
  const [attachmentPreviews, setAttachmentPreviews] = useState<string[]>([])
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [recordSeconds, setRecordSeconds] = useState(0)
  const [liveStatus, setLiveStatus] = useState<string | null>(null)
  const liveStatusTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messageQueueRef = useRef<string[]>([])
  const conversationIdRef = useRef<string | undefined>(
    typeof window !== 'undefined' ? sessionStorage.getItem('chat_conversation_id') ?? undefined : undefined
  )

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isSending])

  // Polling history когда conversation в handoff state — иначе клиент не увидит
  // admin reply пока не перезагрузит TMA. Раз в 4 сек, только пока handoff активен.
  useEffect(() => {
    if (handoffState === 'none') return
    const convId = conversationIdRef.current
    const token = sessionStorage.getItem('tma_token')
    if (!convId || !token) return

    async function pollHistory() {
      try {
        const res = await fetch(`/api/ai/chat/history?id=${convId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return
        const json = await res.json() as { data?: Array<{ role: string; content: string; created_at: string; metadata: { knowledgeSources?: KnowledgeSource[] } | null }> }
        const fresh = json.data ?? []
        if (fresh.length === 0) return

        // Если последнее серверное сообщение admin — апдейтим UI и переключаем banner
        const lastServer = fresh[fresh.length - 1]
        setMessages(prev => {
          // Достраиваем только новые server messages (по timestamp > последнего)
          const lastLocalTs = prev.length > 0 ? prev[prev.length - 1].timestamp.getTime() : 0
          const newOnes = fresh
            .filter(m => new Date(m.created_at).getTime() > lastLocalTs)
            .map((m, i) => ({
              id: `live_${m.created_at}_${i}`,
              role: m.role as 'user' | 'assistant' | 'admin',
              content: m.content,
              timestamp: new Date(m.created_at),
              knowledgeSources: m.metadata?.knowledgeSources,
            }))
          if (newOnes.length === 0) return prev
          return [...prev, ...newOnes]
        })
        if (lastServer.role === 'admin' && handoffState !== 'admin_connected') {
          setHandoffState('admin_connected')
        }
      } catch {
        // ignore
      }
    }
    const timer = setInterval(pollHistory, 4000)
    void pollHistory()
    return () => clearInterval(timer)
  }, [handoffState])

  // Polling live_status пока AI печатает — показывает что AI делает (вызывает tool calls)
  useEffect(() => {
    if (!isSending) {
      if (liveStatusTimerRef.current) {
        clearInterval(liveStatusTimerRef.current)
        liveStatusTimerRef.current = null
      }
      setLiveStatus(null)
      return
    }
    const convId = conversationIdRef.current
    const token = sessionStorage.getItem('tma_token')
    if (!convId || !token) return

    async function poll() {
      try {
        const res = await fetch(`/api/ai/chat/status?id=${convId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return
        const { status } = await res.json() as { status?: string | null }
        setLiveStatus(status ?? null)
      } catch {
        // ignore — polling best-effort
      }
    }
    void poll()
    liveStatusTimerRef.current = setInterval(poll, 800)

    return () => {
      if (liveStatusTimerRef.current) {
        clearInterval(liveStatusTimerRef.current)
        liveStatusTimerRef.current = null
      }
    }
  }, [isSending])

  function handleAttachClick() {
    fileInputRef.current?.click()
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return

    const allowed = files.filter(f =>
      ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(f.type)
    )
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

    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function removeAttachment(index: number) {
    setPendingAttachments(prev => prev.filter((_, i) => i !== index))
    setAttachmentPreviews(prev => prev.filter((_, i) => i !== index))
  }

  async function startRecording() {
    if (isRecording || isTranscribing || isSending) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      mediaRecorderRef.current = mr
      audioChunksRef.current = []
      mr.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(audioChunksRef.current, { type: mr.mimeType || 'audio/webm' })
        await transcribeAndSend(blob)
      }
      mr.start()
      setIsRecording(true)
      setRecordSeconds(0)
      window.Telegram?.WebApp.HapticFeedback?.impactOccurred('medium')
      recordTimerRef.current = setInterval(() => {
        setRecordSeconds(s => {
          const next = s + 1
          if (next >= 60) stopRecording()  // auto-stop at 60s — Whisper лимит хватает
          return next
        })
      }, 1000)
    } catch (err) {
      console.error('Mic error:', err)
      toast.error('Не получилось включить микрофон. Проверьте разрешения.')
    }
  }

  function stopRecording() {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current)
      recordTimerRef.current = null
    }
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
    setIsRecording(false)
  }

  async function transcribeAndSend(blob: Blob) {
    setIsTranscribing(true)
    try {
      const token = sessionStorage.getItem('tma_token')
      if (!token) throw new Error('Не авторизованы. Переоткройте бот.')
      const fd = new FormData()
      const ext = blob.type.includes('webm') ? 'webm' : 'ogg'
      fd.append('audio', blob, `voice.${ext}`)
      const res = await fetch('/api/ai/transcribe', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      })
      if (!res.ok) {
        const errJson = await res.json().catch(() => null) as { error?: string } | null
        if (errJson?.error === 'voice_disabled') {
          toast.error('Голосовые в этом салоне выключены. Напишите текстом.')
        } else if (errJson?.error === 'too_large') {
          toast.error('Запись слишком длинная.')
        } else {
          toast.error('Не получилось распознать голос.')
        }
        return
      }
      const { text } = await res.json() as { text?: string }
      const cleaned = (text ?? '').trim()
      if (!cleaned) {
        toast.error('Не услышала ни слова. Попробуйте ещё раз.')
        return
      }
      // Отправляем как обычное сообщение
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'user',
        content: `🎤 ${cleaned}`,
        timestamp: new Date(),
      }])
      if (isSending) {
        messageQueueRef.current = [...messageQueueRef.current, cleaned]
        return
      }
      setIsSending(true)
      callApi(cleaned)
    } finally {
      setIsTranscribing(false)
    }
  }

  async function callApi(text: string, attachments: AttachmentInput[] = []) {
    try {
      let token = sessionStorage.getItem('tma_token')
      if (!token) {
        const deadline = Date.now() + 4000
        while (!token && Date.now() < deadline) {
          await new Promise(r => setTimeout(r, 300))
          token = sessionStorage.getItem('tma_token')
        }
      }
      if (!token) throw new Error('Не удалось отправить сообщение. Попробуйте через секунду.')

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          message: text,
          conversationId: conversationIdRef.current,
          attachments: attachments.length ? attachments : undefined,
        }),
      })

      if (res.status === 401) {
        sessionStorage.removeItem('tma_token')
        throw new Error('Сессия истекла. Закройте и снова откройте приложение.')
      }

      const { data, error } = await res.json()
      if (error || !data) throw new Error(error ?? 'Ошибка')

      if (data.conversationId) {
        conversationIdRef.current = data.conversationId
        sessionStorage.setItem('chat_conversation_id', data.conversationId)
      }

      setMessages(prev => prev.concat({
        id: Date.now().toString() + '_ai',
        role: 'assistant',
        content: data.reply,
        timestamp: new Date(),
        knowledgeSources: data.knowledgeSources,
        suggestedActions: data.suggestedActions,
      }))
      window.Telegram?.WebApp.HapticFeedback?.notificationOccurred('success')

      if (data.action === 'booking_created') {
        toast.success('Запись создана! Открываю мои записи...')
        setTimeout(() => router.push('/appointments'), 2000)
      }
      if (data.action === 'handoff') {
        setHandoffState('awaiting')
      }
    } catch (e) {
      setMessages(prev => prev.concat({
        id: Date.now().toString() + '_err',
        role: 'assistant',
        content: e instanceof Error ? e.message : 'Извините, произошла ошибка. Попробуйте ещё раз.',
        timestamp: new Date(),
      }))
    } finally {
      const queue = messageQueueRef.current
      if (queue.length > 0) {
        const [next, ...rest] = queue
        messageQueueRef.current = rest
        setTimeout(() => callApi(next), 50)
      } else {
        setIsSending(false)
        inputRef.current?.focus()
      }
    }
  }

  function handleSend() {
    const text = input.trim()
    if (!text && !pendingAttachments.length) return

    const displayText = text || '📷 Фото'
    const imagePreview = attachmentPreviews[0]
    const currentAttachments = [...pendingAttachments]

    setInput('')
    setPendingAttachments([])
    setAttachmentPreviews([])

    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      role: 'user',
      content: displayText,
      timestamp: new Date(),
      imageUrl: imagePreview,
    }])

    if (isSending) {
      messageQueueRef.current = [...messageQueueRef.current, text || '(клиент прислал фото)']
      return
    }

    setIsSending(true)
    callApi(text || '(клиент прислал фото)', currentAttachments)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const aiInitial = aiName.charAt(0).toUpperCase()

  // Suggested actions appear only under the LAST assistant message
  const lastAssistantId = [...messages].reverse().find(m => m.role === 'assistant' && !m.isLoading)?.id

  function handleSmartAction(text: string) {
    if (isSending) {
      messageQueueRef.current = [...messageQueueRef.current, text]
      return
    }
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    }])
    setIsSending(true)
    callApi(text)
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background/95 backdrop-blur-md safe-top">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-muted transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-foreground" strokeWidth={1.8} />
        </button>
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="relative shrink-0">
            <div className="w-9 h-9 rounded-full bg-ai flex items-center justify-center text-white font-semibold text-sm">
              {aiInitial}
            </div>
            <AiActivityDot className="absolute -bottom-0.5 -right-0.5 scale-75 bg-background rounded-full p-0.5" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-foreground text-[14px] leading-tight">{aiName}</p>
            <p className="text-[11px] text-ai-foreground/80 leading-tight mt-0.5">
              AI-администратор · онлайн
            </p>
          </div>
        </div>
      </header>

      {/* Handoff banner */}
      {handoffState !== 'none' && (
        <div className={cn(
          'mx-4 mt-3 p-3 rounded-2xl border text-[12px] flex items-start gap-2',
          handoffState === 'awaiting'
            ? 'bg-warning-soft border-warning/30 text-foreground'
            : 'bg-ai-soft border-ai-border text-ai-foreground'
        )}>
          <span className="text-[14px] leading-none mt-0.5">
            {handoffState === 'awaiting' ? '⏳' : '✓'}
          </span>
          <div className="flex-1">
            {handoffState === 'awaiting'
              ? `${aiName} передала ваш диалог администратору. Он подключится в течение нескольких минут.`
              : 'Администратор на связи — отвечает он, не AI.'
            }
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {messages.filter(m => !m.isLoading).map(msg => (
          <ChatBubble
            key={msg.id}
            message={msg}
            aiInitial={aiInitial}
            isLastAssistant={msg.id === lastAssistantId}
            isSending={isSending}
            onSmartAction={handleSmartAction}
          />
        ))}

        {/* Typing indicator — показывает live_status (текущий шаг tool calls) если есть */}
        {isSending && (
          <div className="flex items-end gap-2">
            <div className="w-7 h-7 rounded-full bg-ai flex items-center justify-center text-white text-[11px] font-semibold shrink-0">
              {aiInitial}
            </div>
            <div className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl rounded-bl-md bg-ai-soft border border-ai-border max-w-[82%]">
              <span className="w-1.5 h-1.5 rounded-full bg-ai animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-ai animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-ai animate-bounce [animation-delay:300ms]" />
              <span className="text-[11px] text-ai-foreground ml-1 transition-opacity">
                {liveStatus ?? `${aiName} печатает`}
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Attachment previews */}
      {attachmentPreviews.length > 0 && (
        <div className="px-4 pb-2 flex gap-2 overflow-x-auto scrollbar-hide">
          {attachmentPreviews.map((src, i) => (
            <div key={i} className="relative shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt="Вложение"
                className="w-16 h-16 rounded-xl object-cover border border-border"
              />
              <button
                onClick={() => removeAttachment(i)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive flex items-center justify-center"
              >
                <X className="w-3 h-3 text-white" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="px-4 pb-4 safe-bottom pt-2 border-t border-border bg-background">
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />

          <button
            onClick={handleAttachClick}
            disabled={isSending || pendingAttachments.length >= 3}
            className="w-11 h-11 rounded-2xl flex items-center justify-center bg-surface-sunken text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40"
          >
            <Paperclip className="w-5 h-5" strokeWidth={1.8} />
          </button>

          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isRecording ? `🔴 Запись... ${recordSeconds}с`
              : isTranscribing ? 'Распознаю голос...'
              : isSending ? 'Подождите ответа...'
              : `Написать ${aiName}...`
            }
            disabled={isRecording || isTranscribing}
            className="flex-1 px-4 py-3 rounded-2xl bg-surface-sunken text-foreground text-[14px] outline-none placeholder:text-muted-foreground/70 border border-border focus:border-ai-border transition-colors disabled:opacity-60"
            autoComplete="off"
          />
          {/* Mic / Send button — голос когда input пустой, иначе send */}
          {!input.trim() && !pendingAttachments.length ? (
            <button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isSending || isTranscribing}
              aria-label={isRecording ? 'Остановить запись' : 'Записать голос'}
              className={cn(
                'w-11 h-11 rounded-2xl flex items-center justify-center transition-all disabled:opacity-40 active:scale-95',
                isRecording
                  ? 'bg-destructive text-white animate-pulse'
                  : 'bg-foreground text-background'
              )}
            >
              {isTranscribing ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : isRecording ? (
                <Square className="w-4 h-4 fill-current" strokeWidth={1.8} />
              ) : (
                <Mic className="w-5 h-5" strokeWidth={1.8} />
              )}
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={(!input.trim() && !pendingAttachments.length) || isSending}
              className="w-11 h-11 rounded-2xl flex items-center justify-center bg-foreground text-background transition-opacity disabled:opacity-40 active:scale-95"
            >
              {isSending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" strokeWidth={1.8} />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function ChatBubble({
  message, aiInitial, isLastAssistant, isSending, onSmartAction,
}: {
  message: Message
  aiInitial: string
  isLastAssistant?: boolean
  isSending?: boolean
  onSmartAction?: (text: string) => void
}) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[82%] rounded-2xl rounded-br-md bg-foreground text-background overflow-hidden">
          {message.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={message.imageUrl}
              alt="Фото"
              className="w-full max-w-[240px] object-cover"
            />
          )}
          <div className="px-4 py-2.5">
            <p className="whitespace-pre-wrap leading-relaxed text-[14px]">{message.content}</p>
            <p className="text-[10px] text-background/60 mt-1">
              {formatTime(message.timestamp.toISOString())}
            </p>
          </div>
        </div>
      </div>
    )
  }

  const isAdmin = message.role === 'admin'

  return (
    <div className="flex items-end gap-2">
      <div className={cn(
        'w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-semibold shrink-0 mb-1',
        isAdmin ? 'bg-foreground' : 'bg-ai'
      )}>
        {isAdmin ? '👤' : aiInitial}
      </div>
      <div className="max-w-[82%] flex flex-col gap-1.5">
        <div className={cn(
          'rounded-2xl rounded-bl-md border px-4 py-2.5',
          isAdmin
            ? 'bg-surface-sunken border-border'
            : 'bg-ai-soft border-ai-border'
        )}>
          {isAdmin && (
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Администратор
            </p>
          )}
          <p className="whitespace-pre-wrap leading-relaxed text-[14px] text-foreground">{message.content}</p>
          <p className={cn(
            'text-[10px] mt-1',
            isAdmin ? 'text-muted-foreground' : 'text-ai-foreground/60'
          )}>
            {formatTime(message.timestamp.toISOString())}
          </p>
        </div>
        {message.knowledgeSources && message.knowledgeSources.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {message.knowledgeSources.map((s, i) => (
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
        {/* Smart actions — only under the last AI message, hidden while AI is responding */}
        {isLastAssistant && !isSending && message.suggestedActions && message.suggestedActions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-0.5">
            {message.suggestedActions.map((a, i) => (
              <button
                key={i}
                onClick={() => onSmartAction?.(a.message)}
                className="px-3.5 py-1.5 rounded-full bg-surface-elevated text-ai-foreground border border-ai-border text-[12px] font-medium hover:bg-ai-soft transition-colors active:scale-95"
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

void Sparkles

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

'use client'
import { useState } from 'react'
import { Send } from 'lucide-react'
import { TypingWave } from '@/components/shared/microinteractions/TypingWave'
import { MessageReveal } from '@/components/shared/microinteractions/MessageReveal'

type AiPreviewChatProps = {
  /** Callback fetches AI reply in selected tone. Receives client input, returns AI text. */
  onPreview: (input: string) => Promise<string>
  /** Display name (e.g. selected tone) */
  toneLabel?: string
  className?: string
}

/**
 * Right-side preview chat for /ai-settings.
 * Caller wires `onPreview` to /api/admin/ai/preview-tone (or any backend).
 */
export function AiPreviewChat({
  onPreview,
  toneLabel,
  className = '',
}: AiPreviewChatProps) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [reply, setReply] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || loading) return
    setLoading(true)
    setError(null)
    setReply(null)
    try {
      const text = await onPreview(input.trim())
      setReply(text)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось получить ответ')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`bg-cream rounded-2xl border border-line p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-medium text-ink">Как AI ответит клиенту?</div>
        {toneLabel && (
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground rounded-full bg-sage-tint px-2 py-0.5">
            {toneLabel}
          </span>
        )}
      </div>

      <form onSubmit={handleSubmit} className="mb-3">
        <div className="relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Что хочет клиент?"
            className="w-full h-10 rounded-xl bg-cream-2 border border-line px-3 pr-10 text-sm text-ink placeholder:text-muted-2 focus-visible:outline-none focus-visible:border-sage focus-visible:ring-2 focus-visible:ring-sage-glow/40"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="absolute right-1.5 top-1.5 inline-flex items-center justify-center w-7 h-7 rounded-lg bg-ink text-page disabled:opacity-40"
            aria-label="Отправить"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </form>

      <div className="min-h-[120px] rounded-xl bg-cream-2 border border-line-soft p-3">
        {loading && <TypingWave label="Алина печатает…" />}
        {!loading && error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
        {!loading && !error && reply && (
          <p className="font-serif text-sm text-ink-2 leading-snug">
            <MessageReveal text={reply} />
          </p>
        )}
        {!loading && !error && !reply && (
          <p className="text-xs text-muted-2 italic">
            Введите вопрос клиента — AI ответит в выбранном тоне.
          </p>
        )}
      </div>
    </div>
  )
}

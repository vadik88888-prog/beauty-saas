'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MessageSquare } from 'lucide-react'
import { toast } from 'sonner'

interface ContactButtonProps {
  clientId: string
  telegramId: number | null | undefined
  draftText: string                           // pre-computed template text
  draftMeta?: Record<string, unknown> | null  // { template, source } for Level 2
}

export function ContactButton({ clientId, telegramId, draftText, draftMeta }: ContactButtonProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  // ── STATE C: no telegram_id — can't initiate ──────────────────────────────
  if (!telegramId) {
    return (
      <button
        disabled
        title="У клиента нет Telegram — написать можно только если он сам начнёт диалог с ботом"
        className="sera-btn sera-btn--ghost sera-btn--sm"
        style={{ width: '100%', justifyContent: 'center', gap: 6, opacity: 0.45, cursor: 'not-allowed' }}
      >
        <MessageSquare size={12} />
        Написать через SERA
      </button>
    )
  }

  // ── STATE A & B: find-or-create conversation, write draft to DB, navigate ─
  // Draft travels in conversations.draft (not in URL) so it survives page reload
  // and is cleared after the admin sends the message.
  async function handleOpen() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          draft:     draftText,
          draftMeta: draftMeta ?? null,
        }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error((json as { error?: string }).error ?? 'Ошибка')
      }
      const { data } = await res.json() as { data: { id: string } }
      router.push(`/chats/${data.id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка открытия диалога')
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleOpen}
      disabled={loading}
      className="sera-btn sera-btn--ghost sera-btn--sm"
      style={{ width: '100%', justifyContent: 'center', gap: 6 }}
    >
      <MessageSquare size={12} />
      {loading ? 'Открываю диалог...' : 'Написать через SERA'}
    </button>
  )
}

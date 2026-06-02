'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MessageSquare } from 'lucide-react'
import { toast } from 'sonner'

interface ContactButtonProps {
  clientId: string
  clientName: string
  telegramId: number | null | undefined
  chatId: string | null    // existing conversation UUID, or null
  draftText: string        // pre-computed template text
}

export function ContactButton({ clientId, telegramId, chatId, draftText }: ContactButtonProps) {
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

  // ── STATE A: existing conversation — navigate directly ───────────────────
  if (chatId) {
    return (
      <button
        onClick={() => router.push(`/chats/${chatId}?draft=${encodeURIComponent(draftText)}`)}
        className="sera-btn sera-btn--ghost sera-btn--sm"
        style={{ width: '100%', justifyContent: 'center', gap: 6 }}
      >
        <MessageSquare size={12} />
        Написать через SERA
      </button>
    )
  }

  // ── STATE B: has telegram_id, no conversation yet ─────────────────────────
  // Lazily create conversation → navigate to chat with prefilled draft.
  // Same send path as State A: POST /api/admin/chats/[id] → INSERT messages + Telegram.
  async function handleCreate() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error((json as { error?: string }).error ?? 'Ошибка')
      }
      const { data } = await res.json() as { data: { id: string } }
      router.push(`/chats/${data.id}?draft=${encodeURIComponent(draftText)}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка создания диалога')
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleCreate}
      disabled={loading}
      className="sera-btn sera-btn--ghost sera-btn--sm"
      style={{ width: '100%', justifyContent: 'center', gap: 6 }}
    >
      <MessageSquare size={12} />
      {loading ? 'Открываю диалог...' : 'Написать через SERA'}
    </button>
  )
}

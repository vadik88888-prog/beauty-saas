'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MessageSquare, X, Send } from 'lucide-react'
import { toast } from 'sonner'

interface ContactButtonProps {
  clientId: string
  clientName: string
  telegramId: number | null | undefined
  chatId: string | null         // existing conversation UUID, or null
  draftText: string             // pre-computed template text for this client
}

export function ContactButton({ clientId, clientName, telegramId, chatId, draftText }: ContactButtonProps) {
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)
  const [text, setText] = useState(draftText)
  const [sending, setSending] = useState(false)

  // ── STATE A: has conversation — navigate to chat with prefilled draft ─────
  if (chatId) {
    function goToChat() {
      router.push(`/chats/${chatId}?draft=${encodeURIComponent(draftText)}`)
    }
    return (
      <button
        onClick={goToChat}
        className="sera-btn sera-btn--ghost sera-btn--sm"
        style={{ width: '100%', justifyContent: 'center', gap: 6 }}
      >
        <MessageSquare size={12} />
        Написать через SERA
      </button>
    )
  }

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

  // ── STATE B: has telegram_id, no conversation — compose modal ────────────
  async function handleSend() {
    if (!text.trim()) return
    setSending(true)
    try {
      const res = await fetch('/api/admin/trigger-client-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, template: 'custom', customText: text.trim() }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error((json as { error?: string }).error ?? 'Ошибка')
      }
      toast.success('Сообщение отправлено в Telegram')
      setShowModal(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка отправки')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <button
        onClick={() => { setText(draftText); setShowModal(true) }}
        className="sera-btn sera-btn--ghost sera-btn--sm"
        style={{ width: '100%', justifyContent: 'center', gap: 6 }}
      >
        <MessageSquare size={12} />
        Написать через SERA
      </button>

      {showModal && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(27,42,34,0.45)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
        >
          <div style={{
            background: 'var(--card)', borderRadius: 'var(--radius-xl)',
            padding: 24, maxWidth: 480, width: '100%',
            boxShadow: 'var(--shadow-hero)',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>
                Написать {clientName}
              </p>
              <button
                onClick={() => setShowModal(false)}
                className="sera-btn-icon"
                style={{ color: 'var(--text-muted)', borderColor: 'var(--line)', width: 28, height: 28 }}
              >
                <X size={12} />
              </button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px', lineHeight: 1.5 }}>
              Отредактируйте текст перед отправкой — он уйдёт клиенту напрямую в Telegram от бота салона.
            </p>

            {/* Draft editor */}
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              rows={6}
              style={{
                width: '100%', padding: '10px 12px',
                border: '1px solid var(--line)', borderRadius: 'var(--radius-md)',
                background: 'var(--page)', color: 'var(--ink)',
                fontSize: 13, lineHeight: 1.6, resize: 'vertical',
                outline: 'none', boxSizing: 'border-box',
                fontFamily: 'var(--font-body)',
              }}
            />

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowModal(false)}
                className="sera-btn sera-btn--secondary sera-btn--sm"
              >
                Отмена
              </button>
              <button
                onClick={handleSend}
                disabled={sending || !text.trim()}
                className="sera-btn sera-btn--sera sera-btn--sm"
                style={{ gap: 6 }}
              >
                <Send size={12} />
                {sending ? 'Отправка...' : 'Отправить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

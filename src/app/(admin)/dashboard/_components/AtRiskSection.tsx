'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Send, X } from 'lucide-react'
import { toast } from 'sonner'
import type { AtRiskClient } from '@/lib/admin/get-ai-stats'

const C = {
  cardBorder: '#e8e2d9',
  ink:        '#1b2a22',
  muted:      '#6b7b6e',
  sage:       '#5e7d5d',
  sageTint:   '#e7eee2',
  error:      '#b94040',
  pageBg:     '#efe9dd',
}

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

type Template = 'winback' | 'birthday' | 'new_slot' | 'custom'

const TEMPLATES: { key: Template; label: string; emoji: string }[] = [
  { key: 'winback',  label: 'Вернуть клиента',      emoji: '💚' },
  { key: 'birthday', label: 'Поздравить с ДР',       emoji: '🎂' },
  { key: 'new_slot', label: 'Предложить время',      emoji: '📅' },
  { key: 'custom',   label: 'Своё сообщение',        emoji: '✏️' },
]

const PREVIEW: Record<Template, (name: string) => string> = {
  winback:  n => `${n}, мы скучаем по вам! 💚\nЗапишитесь и получите скидку 10% — только для вас.`,
  birthday: n => `С днём рождения, ${n}! 🎂\nДарим скидку 15% на любую процедуру в этом месяце 💝`,
  new_slot: n => `${n}, у нас появилось свободное окно для вас! 📅\nХотите записаться?`,
  custom:   _  => '',
}

interface Props {
  clients: AtRiskClient[]
  totalCount: number
}

export function AtRiskSection({ clients, totalCount }: Props) {
  const [modal, setModal] = useState<{ client: AtRiskClient; template: Template } | null>(null)
  const [customText, setCustomText] = useState('')
  const [sending, setSending] = useState(false)

  function openModal(client: AtRiskClient, template: Template = 'winback') {
    setModal({ client, template })
    setCustomText('')
  }

  function closeModal() {
    setModal(null)
    setCustomText('')
  }

  async function send() {
    if (!modal) return
    if (modal.template === 'custom' && !customText.trim()) {
      toast.error('Введите текст сообщения')
      return
    }

    setSending(true)
    try {
      const res = await fetch('/api/admin/trigger-client-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: modal.client.id,
          template: modal.template,
          customText: customText.trim() || undefined,
        }),
      })

      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(j.error ?? 'Ошибка отправки')
      }

      toast.success(`Сообщение отправлено ${modal.client.name} через SERA`)
      closeModal()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось отправить')
    } finally {
      setSending(false)
    }
  }

  const previewText = modal
    ? modal.template === 'custom'
      ? customText
      : PREVIEW[modal.template](modal.client.name.split(' ')[0] ?? modal.client.name)
    : ''

  return (
    <>
      {/* ── At-risk cards ────────────────────────────────────────── */}
      {clients.length === 0 ? (
        <div style={{ padding: '28px 16px', textAlign: 'center' }}>
          <p style={{ fontSize: 22 }}>🎉</p>
          <p style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginTop: 8 }}>Всё отлично!</p>
          <p style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Нет клиентов, которые давно не приходили</p>
        </div>
      ) : (
        clients.map((client, i) => (
          <div
            key={client.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
              borderBottom: i < clients.length - 1 ? `1px solid ${C.cardBorder}` : 'none',
            }}
          >
            {/* Avatar */}
            <div style={{
              width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
              background: C.sageTint, color: C.sage,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700,
            }}>
              {initials(client.name)}
            </div>

            {/* Name + days */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {client.name}
              </p>
              <p style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>
                Не была {client.days_absent} дней
              </p>
            </div>

            {/* Action button */}
            <button
              onClick={() => openModal(client, 'winback')}
              style={{
                flexShrink: 0, padding: '5px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                border: `1px solid ${C.cardBorder}`, color: C.sage, cursor: 'pointer',
                background: C.sageTint, whiteSpace: 'nowrap',
              }}
            >
              Вернуть
            </button>
          </div>
        ))
      )}

      {/* ── Modal ──────────────────────────────────────────────── */}
      {modal && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
          }}
          onClick={e => { if (e.target === e.currentTarget) closeModal() }}
        >
          <div style={{
            background: '#fff', borderRadius: 18, padding: '24px 20px',
            width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
          }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <p style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>Написать клиенту</p>
                <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                  SERA отправит сообщение {modal.client.name} в Telegram
                </p>
              </div>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, padding: 4 }}>
                <X size={18} strokeWidth={1.5} />
              </button>
            </div>

            {/* Template chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              {TEMPLATES.map(t => (
                <button
                  key={t.key}
                  onClick={() => setModal(m => m ? { ...m, template: t.key } : m)}
                  style={{
                    padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', border: '1px solid',
                    background:    modal.template === t.key ? C.sage     : C.sageTint,
                    color:         modal.template === t.key ? '#fff'     : C.sage,
                    borderColor:   modal.template === t.key ? C.sage     : C.cardBorder,
                  }}
                >
                  {t.emoji} {t.label}
                </button>
              ))}
            </div>

            {/* Message preview / custom input */}
            {modal.template === 'custom' ? (
              <textarea
                value={customText}
                onChange={e => setCustomText(e.target.value)}
                placeholder="Введите своё сообщение..."
                rows={4}
                style={{
                  width: '100%', borderRadius: 10, border: `1px solid ${C.cardBorder}`,
                  padding: '10px 12px', fontSize: 13, color: C.ink,
                  resize: 'none', outline: 'none', fontFamily: 'inherit',
                  background: C.pageBg, boxSizing: 'border-box',
                }}
              />
            ) : (
              <div style={{
                background: C.sageTint, borderRadius: 10, padding: '12px 14px',
                fontSize: 13, color: C.ink, lineHeight: 1.6, whiteSpace: 'pre-line',
                marginBottom: 4,
              }}>
                {previewText}
              </div>
            )}

            <p style={{ fontSize: 11, color: C.muted, marginTop: 8, marginBottom: 16 }}>
              Сообщение придёт клиенту в Telegram от вашего бота. Ответ появится в разделе «Сообщения».
            </p>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={closeModal}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 13, fontWeight: 600,
                  border: `1px solid ${C.cardBorder}`, color: C.muted,
                  background: 'transparent', cursor: 'pointer',
                }}
              >
                Отмена
              </button>
              <button
                onClick={send}
                disabled={sending || (modal.template === 'custom' && !customText.trim())}
                style={{
                  flex: 2, padding: '10px 0', borderRadius: 10, fontSize: 13, fontWeight: 600,
                  border: 'none', color: '#fff', background: C.sage,
                  cursor: sending ? 'not-allowed' : 'pointer',
                  opacity: (sending || (modal.template === 'custom' && !customText.trim())) ? 0.6 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                <Send size={14} strokeWidth={1.5} />
                {sending ? 'Отправляем...' : 'Отправить через SERA'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

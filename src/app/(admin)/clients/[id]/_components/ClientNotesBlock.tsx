'use client'

import { useState } from 'react'

export function ClientNotesBlock({
  clientId,
  initialNotes,
}: {
  clientId: string
  initialNotes: string | null
}) {
  const [notes, setNotes] = useState(initialNotes ?? '')
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isDirty = notes !== (initialNotes ?? '')

  async function handleSave() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      })
      if (!res.ok) throw new Error('err')
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      setError('Не удалось сохранить')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      background: 'var(--card-sunken)',
      border: '1px solid var(--card-border)',
      borderRadius: 'var(--radius-md)',
      padding: '10px 12px',
    }}>
      <p style={{
        fontSize: 11,
        fontWeight: 700,
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        margin: '0 0 6px',
      }}>
        Заметки (только для салона)
      </p>
      <textarea
        value={notes}
        onChange={e => {
          setNotes(e.target.value)
          setSaved(false)
        }}
        placeholder="Добавьте заметку о клиенте..."
        rows={3}
        style={{
          width: '100%',
          resize: 'vertical',
          fontSize: 13,
          color: 'var(--ink)',
          background: 'var(--card-bg)',
          border: '1px solid var(--card-border)',
          borderRadius: 'var(--radius-sm)',
          padding: '7px 9px',
          lineHeight: 1.5,
          fontFamily: 'inherit',
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
        {error && (
          <span style={{ fontSize: 12, color: 'var(--error)' }}>{error}</span>
        )}
        {saved && !isDirty && (
          <span style={{ fontSize: 12, color: 'var(--sage)' }}>Сохранено</span>
        )}
        <button
          onClick={handleSave}
          disabled={!isDirty || loading}
          className="sera-btn"
          style={{
            fontSize: 12,
            padding: '5px 14px',
            opacity: !isDirty || loading ? 0.45 : 1,
            cursor: !isDirty || loading ? 'default' : 'pointer',
          }}
        >
          {loading ? 'Сохранение…' : 'Сохранить'}
        </button>
      </div>
    </div>
  )
}

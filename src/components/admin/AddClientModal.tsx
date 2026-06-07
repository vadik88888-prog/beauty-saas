'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

type DuplicateInfo = {
  id: string
  first_name: string | null
  last_name: string | null
  total_visits: number
}

export function AddClientModal() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [telegram, setTelegram] = useState('')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<{ first_name?: string; phone?: string }>({})
  const [duplicate, setDuplicate] = useState<DuplicateInfo | null>(null)
  const firstNameRef = useRef<HTMLInputElement>(null)

  const canSubmit = firstName.trim().length > 0 && phone.trim().length > 0

  function resetForm() {
    setFirstName('')
    setLastName('')
    setPhone('')
    setTelegram('')
    setErrors({})
    setDuplicate(null)
  }

  function closeModal() {
    setOpen(false)
    resetForm()
  }

  useEffect(() => {
    if (open) {
      setTimeout(() => firstNameRef.current?.focus(), 60)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeModal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function submit(forceCreate = false) {
    const errs: typeof errors = {}
    if (!firstName.trim()) errs.first_name = 'Обязательное поле'
    if (!phone.trim())     errs.phone      = 'Обязательное поле'
    if (Object.keys(errs).length) { setErrors(errs); return }

    setLoading(true)
    setDuplicate(null)

    try {
      const res = await fetch('/api/admin/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name:        firstName.trim(),
          last_name:         lastName.trim() || null,
          phone:             phone.trim(),
          telegram_username: telegram.trim() || null,
          ...(forceCreate ? { forceCreate: true } : {}),
        }),
      })

      const data = await res.json()

      if (res.status === 201) {
        const name = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ')
        closeModal()
        router.refresh()
        toast.success(`Клиент ${name} добавлен`, {
          action: {
            label: 'Открыть',
            onClick: () => router.push(`/clients/${data.id}`),
          },
        })
        return
      }

      if (res.status === 409 && data.duplicate) {
        setDuplicate(data.existing)
        setLoading(false)
        return
      }

      const msg =
        res.status === 400 ? (data.error ?? 'Некорректные данные') :
        'Ошибка сервера, попробуйте ещё раз'
      toast.error(msg)
    } catch {
      toast.error('Ошибка сети')
    }

    setLoading(false)
  }

  return (
    <>
      {/* Trigger button */}
      <button
        className="sera-btn sera-btn--sera"
        style={{ gap: 6 }}
        onClick={() => setOpen(true)}
      >
        <UserPlus size={14} /> Добавить клиента
      </button>

      {/* Modal overlay */}
      {open && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(27,42,34,0.45)', backdropFilter: 'blur(4px)',
            padding: 16,
          }}
          onClick={e => { if (e.target === e.currentTarget) closeModal() }}
        >
          <div className="sera-card" style={{
            width: '100%', maxWidth: 480,
            padding: 24, maxHeight: '90dvh', overflowY: 'auto',
            boxShadow: 'var(--shadow-hero)',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>
                Новый клиент
              </h2>
              <button className="sera-btn-icon" onClick={closeModal} aria-label="Закрыть">
                <X size={15} />
              </button>
            </div>

            {/* Duplicate banner */}
            {duplicate && (
              <div style={{
                background: 'var(--gold-pearl)', border: '1px solid var(--gold)',
                borderRadius: 'var(--radius-md)', padding: '12px 14px', marginBottom: 16,
              }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', margin: '0 0 8px' }}>
                  Клиент с этим телефоном уже есть:&nbsp;
                  {[duplicate.first_name, duplicate.last_name].filter(Boolean).join(' ')}
                  &nbsp;·&nbsp;{duplicate.total_visits}&nbsp;визитов
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="sera-btn sera-btn--secondary sera-btn--sm"
                    style={{ flex: 1 }}
                    onClick={() => { closeModal(); router.push(`/clients/${duplicate.id}`) }}
                  >
                    Открыть существующего
                  </button>
                  <button
                    className="sera-btn sera-btn--sm"
                    style={{ flex: 1, background: 'var(--gold)', color: '#3A2A06', border: 'none' }}
                    onClick={() => submit(true)}
                    disabled={loading}
                  >
                    Всё равно создать
                  </button>
                </div>
              </div>
            )}

            {/* Form */}
            <form
              onSubmit={e => { e.preventDefault(); submit() }}
              style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
            >
              {/* Имя */}
              <div>
                <label className="sera-label" style={{ display: 'block', marginBottom: 4 }}>
                  Имя <span style={{ color: 'var(--error)' }}>*</span>
                </label>
                <input
                  ref={firstNameRef}
                  className="sera-input"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  placeholder="Мария"
                  value={firstName}
                  onChange={e => { setFirstName(e.target.value); if (errors.first_name) setErrors(p => ({ ...p, first_name: undefined })) }}
                />
                {errors.first_name && (
                  <p style={{ fontSize: 11, color: 'var(--error)', margin: '3px 0 0' }}>{errors.first_name}</p>
                )}
              </div>

              {/* Фамилия */}
              <div>
                <label className="sera-label" style={{ display: 'block', marginBottom: 4 }}>
                  Фамилия
                </label>
                <input
                  className="sera-input"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  placeholder="Иванова"
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                />
              </div>

              {/* Телефон */}
              <div>
                <label className="sera-label" style={{ display: 'block', marginBottom: 4 }}>
                  Телефон <span style={{ color: 'var(--error)' }}>*</span>
                </label>
                <input
                  className="sera-input"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  type="tel"
                  placeholder="+375291234567"
                  value={phone}
                  onChange={e => { setPhone(e.target.value); if (errors.phone) setErrors(p => ({ ...p, phone: undefined })) }}
                />
                {errors.phone && (
                  <p style={{ fontSize: 11, color: 'var(--error)', margin: '3px 0 0' }}>{errors.phone}</p>
                )}
              </div>

              {/* Telegram */}
              <div>
                <label className="sera-label" style={{ display: 'block', marginBottom: 4 }}>
                  Telegram
                </label>
                <input
                  className="sera-input"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  placeholder="username (без @)"
                  value={telegram}
                  onChange={e => setTelegram(e.target.value)}
                />
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button
                  type="button"
                  className="sera-btn sera-btn--secondary"
                  style={{ flex: 1 }}
                  onClick={closeModal}
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="sera-btn sera-btn--sera"
                  style={{ flex: 1, gap: 6 }}
                  disabled={!canSubmit || loading}
                >
                  {loading ? (
                    <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Сохраняем…</>
                  ) : (
                    <><UserPlus size={14} /> Добавить</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

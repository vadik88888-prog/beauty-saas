'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2, Tag, X } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { formatPrice } from '@/lib/utils/format'

type Service = { id: string; name: string }

type Offer = {
  id: string
  service_id: string | null
  service: { id: string; name: string } | null
  discount_type: 'percent' | 'fixed'
  discount_value: number
  valid_until: string | null
  is_one_time: boolean
  is_active: boolean
  source: 'salon' | 'sera'
  used_at: string | null
  created_at: string
}

const EMPTY_FORM = {
  serviceId: '',
  discountType: 'percent' as 'percent' | 'fixed',
  discountValue: '',
  scope: 'all' as 'all' | 'service',
  validMode: 'forever' as 'forever' | 'date' | 'once',
  validUntil: '',
}

export function ClientOffersBlock({ clientId, currency }: { clientId: string; currency: string }) {
  const [offers, setOffers] = useState<Offer[] | null>(null)
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  async function load() {
    const [offersRes, servicesRes] = await Promise.all([
      fetch(`/api/admin/client-offers?clientId=${clientId}`),
      fetch('/api/admin/services'),
    ])
    const offersJson = offersRes.ok ? await offersRes.json() : {}
    const servicesJson = servicesRes.ok ? await servicesRes.json() : {}
    setOffers(offersJson.data ?? [])
    setServices((servicesJson.data ?? []).map((s: { id: string; name: string }) => ({ id: s.id, name: s.name })))
    setLoading(false)
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function openModal() { setForm(EMPTY_FORM); setModalOpen(true) }
  function closeModal() { setModalOpen(false) }

  async function handleCreate() {
    const value = parseFloat(form.discountValue)
    if (isNaN(value) || value < 0) { toast.error('Укажите корректный размер скидки'); return }
    if (form.scope === 'service' && !form.serviceId) { toast.error('Выберите услугу'); return }
    if (form.validMode === 'date' && !form.validUntil) { toast.error('Укажите дату'); return }

    setSaving(true)
    try {
      const res = await fetch('/api/admin/client-offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          serviceId:     form.scope === 'service' ? form.serviceId : null,
          discountType:  form.discountType,
          discountValue: value,
          validUntil:    form.validMode === 'date' ? form.validUntil : null,
          isOneTime:     form.validMode === 'once',
        }),
      })
      if (!res.ok) throw new Error()
      toast.success('Скидка добавлена')
      closeModal()
      await load()
    } catch {
      toast.error('Не удалось сохранить')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(offer: Offer) {
    const prev = offers
    setOffers(o => o?.map(x => x.id === offer.id ? { ...x, is_active: !x.is_active } : x) ?? o)
    const res = await fetch(`/api/admin/client-offers/${offer.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !offer.is_active }),
    })
    if (!res.ok) { setOffers(prev); toast.error('Ошибка') }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/admin/client-offers/${id}`, { method: 'DELETE' })
    if (res.ok) { setOffers(o => o?.filter(x => x.id !== id) ?? o) }
    else toast.error('Не удалось удалить')
  }

  function formatOffer(o: Offer) {
    const disc = o.discount_type === 'percent'
      ? `${o.discount_value}%`
      : formatPrice(o.discount_value, currency)
    const on = o.service ? `на «${o.service.name}»` : 'на любую услугу'
    const until = o.is_one_time ? '· разовая'
      : o.valid_until ? `· до ${new Date(o.valid_until).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}`
      : '· бессрочно'
    return `${disc} ${on} ${until}`
  }

  return (
    <>
      {/* ── Block in sidebar ─────────────────────────────────── */}
      <div className="sera-card" style={{ padding: 'var(--space-5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Tag size={13} style={{ color: 'var(--sage-deep)' }} strokeWidth={1.8} />
            <span className="sera-label">Персональные скидки</span>
          </div>
          <button
            onClick={openModal}
            className="sera-btn sera-btn--secondary sera-btn--sm inline-flex items-center gap-1"
            style={{ height: 28, padding: '0 10px', fontSize: 11 }}
          >
            <Plus size={11} />
            Добавить
          </button>
        </div>

        {loading ? (
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Загрузка…</p>
        ) : !offers || offers.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
            Персональных скидок нет
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {offers.map(o => (
              <div
                key={o.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 12px',
                  borderRadius: 'var(--radius-md)',
                  background: o.is_active ? 'var(--card-sunken)' : 'transparent',
                  border: '1px solid var(--line-soft)',
                  opacity: o.is_active ? 1 : 0.5,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', margin: 0, lineHeight: 1.3 }}>
                    {formatOffer(o)}
                  </p>
                  {o.used_at && (
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                      Использована {new Date(o.used_at).toLocaleDateString('ru-RU')}
                    </p>
                  )}
                  {o.source === 'sera' && (
                    <p style={{ fontSize: 10, color: 'var(--sage-deep)', margin: '2px 0 0', fontWeight: 600 }}>
                      SERA
                    </p>
                  )}
                </div>
                <Switch checked={o.is_active} onCheckedChange={() => toggleActive(o)} />
                <button
                  onClick={() => handleDelete(o.id)}
                  className="sera-btn-icon"
                  style={{ color: 'var(--error)', borderColor: 'transparent', flexShrink: 0 }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Modal ────────────────────────────────────────────── */}
      {modalOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(27,42,34,0.45)', backdropFilter: 'blur(4px)',
            padding: 16,
          }}
          onClick={e => { if (e.target === e.currentTarget) closeModal() }}
        >
          <div
            className="sera-card"
            style={{
              width: '100%', maxWidth: 420,
              padding: 24, maxHeight: '90dvh', overflowY: 'auto',
              boxShadow: 'var(--shadow-hero)',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>
                Новая скидка
              </h2>
              <button
                className="sera-btn-icon"
                onClick={closeModal}
                aria-label="Закрыть"
                style={{ color: 'var(--ink)', background: 'var(--card-sunken)', border: '1px solid var(--line)' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* На что */}
            <div style={{ marginBottom: 14 }}>
              <p className="sera-label" style={{ marginBottom: 6 }}>На что</p>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                {(['all', 'service'] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => setForm(f => ({ ...f, scope: v, serviceId: '' }))}
                    style={{
                      height: 32, padding: '0 14px', fontSize: 13,
                      borderRadius: 'var(--radius-sm)',
                      background: form.scope === v ? 'var(--ink)' : 'var(--card-sunken)',
                      color: form.scope === v ? 'var(--card)' : 'var(--ink-2)',
                      border: '1px solid var(--line)',
                      cursor: 'pointer',
                    }}
                  >
                    {v === 'all' ? 'На все услуги' : 'На конкретную услугу'}
                  </button>
                ))}
              </div>
              {form.scope === 'service' && (
                <select
                  value={form.serviceId}
                  onChange={e => setForm(f => ({ ...f, serviceId: e.target.value }))}
                  style={{
                    width: '100%', height: 38, padding: '0 12px',
                    borderRadius: 'var(--radius-md)', border: '1px solid var(--line)',
                    background: 'var(--card)', color: 'var(--ink)', fontSize: 13,
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="">Выберите услугу…</option>
                  {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              )}
            </div>

            {/* Тип и размер */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <p className="sera-label">Тип скидки</p>
                <select
                  value={form.discountType}
                  onChange={e => setForm(f => ({ ...f, discountType: e.target.value as 'percent' | 'fixed' }))}
                  style={{
                    height: 38, padding: '0 10px', borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--line)', background: 'var(--card)',
                    color: 'var(--ink)', fontSize: 13,
                  }}
                >
                  <option value="percent">Процент (%)</option>
                  <option value="fixed">Фиксированная сумма</option>
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                <p className="sera-label">Размер</p>
                <input
                  type="number"
                  min={0}
                  step={form.discountType === 'percent' ? 1 : 0.01}
                  value={form.discountValue}
                  onChange={e => setForm(f => ({ ...f, discountValue: e.target.value }))}
                  placeholder={form.discountType === 'percent' ? 'например: 10' : 'например: 500'}
                  style={{
                    height: 38, padding: '0 12px', borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--line)', background: 'var(--card)',
                    color: 'var(--ink)', fontSize: 13, width: '100%', boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            {/* Срок */}
            <div style={{ marginBottom: 20 }}>
              <p className="sera-label" style={{ marginBottom: 6 }}>Срок действия</p>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                {(['forever', 'date', 'once'] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => setForm(f => ({ ...f, validMode: v }))}
                    style={{
                      height: 32, padding: '0 12px', fontSize: 12,
                      borderRadius: 'var(--radius-sm)',
                      background: form.validMode === v ? 'var(--ink)' : 'var(--card-sunken)',
                      color: form.validMode === v ? 'var(--card)' : 'var(--ink-2)',
                      border: '1px solid var(--line)',
                      cursor: 'pointer',
                    }}
                  >
                    {v === 'forever' ? 'Бессрочно' : v === 'date' ? 'До даты' : 'Разовая'}
                  </button>
                ))}
              </div>
              {form.validMode === 'date' && (
                <input
                  type="date"
                  value={form.validUntil}
                  onChange={e => setForm(f => ({ ...f, validUntil: e.target.value }))}
                  style={{
                    height: 38, padding: '0 12px', borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--line)', background: 'var(--card)',
                    color: 'var(--ink)', fontSize: 13, boxSizing: 'border-box',
                  }}
                />
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={closeModal}
                className="sera-btn sera-btn--secondary"
                style={{ flex: 1 }}
              >
                Отмена
              </button>
              <button
                onClick={handleCreate}
                disabled={saving}
                className="sera-btn sera-btn--sera"
                style={{ flex: 2 }}
              >
                {saving ? 'Сохраняем…' : 'Сохранить скидку'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

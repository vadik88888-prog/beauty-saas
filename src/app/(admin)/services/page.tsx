'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Clock, ToggleLeft, ToggleRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { formatPrice } from '@/lib/utils/format'
import { formatDuration } from '@/lib/utils/date'

type ServiceItem = {
  id: string
  name: string
  description: string | null
  duration_min: number
  buffer_after_min: number | null
  price: number
  price_from: number | null
  currency: string
  is_active: boolean
  sort_order: number
  category: { id: string; name: string } | null
}

const EMPTY_FORM = {
  name: '',
  description: '',
  duration_min: 60,
  buffer_after_min: 0,
  price: 0,
  price_from: '',
  currency: 'BYN',
  is_active: true,
  sort_order: 0,
}

export default function ServicesAdminPage() {
  const [services, setServices] = useState<ServiceItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  async function loadServices() {
    const res = await fetch('/api/admin/services')
    const { data } = await res.json()
    setServices(data ?? [])
    setIsLoading(false)
  }

  useEffect(() => { loadServices() }, [])

  function openCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  function openEdit(s: ServiceItem) {
    setEditingId(s.id)
    setForm({
      name: s.name,
      description: s.description ?? '',
      duration_min: s.duration_min,
      buffer_after_min: s.buffer_after_min ?? 0,
      price: s.price,
      price_from: s.price_from != null ? String(s.price_from) : '',
      currency: s.currency,
      is_active: s.is_active,
      sort_order: s.sort_order,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    setSaving(true)
    const payload = {
      ...form,
      price: Number(form.price),
      price_from: form.price_from !== '' ? Number(form.price_from) : null,
    }

    const url = editingId ? `/api/admin/services/${editingId}` : '/api/admin/services'
    const method = editingId ? 'PATCH' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (res.ok) {
      setDialogOpen(false)
      await loadServices()
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    await fetch(`/api/admin/services/${id}`, { method: 'DELETE' })
    setDeleteId(null)
    await loadServices()
  }

  async function toggleActive(s: ServiceItem) {
    await fetch(`/api/admin/services/${s.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !s.is_active }),
    })
    await loadServices()
  }

  // Group by category
  const grouped = services.reduce<Record<string, ServiceItem[]>>((acc, s) => {
    const key = s.category?.name ?? 'Без категории'
    if (!acc[key]) acc[key] = []
    acc[key].push(s)
    return acc
  }, {})

  return (
    <div className="p-6 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Услуги</h1>
          <p className="text-muted-foreground text-sm mt-1">{services.length} услуг</p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="w-4 h-4" />
          Добавить услугу
        </Button>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground text-sm">Загрузка...</div>
      ) : services.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">
          <p>Услуги ещё не добавлены</p>
          <Button variant="outline" className="mt-4" onClick={openCreate}>Добавить первую услугу</Button>
        </Card>
      ) : (
        Object.entries(grouped).map(([category, items]) => (
          <div key={category}>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">{category}</h2>
            <div className="flex flex-col gap-2">
              {items.map(service => (
                <Card key={service.id} className="p-4 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm">{service.name}</p>
                      {!service.is_active && <Badge variant="secondary">Скрыта</Badge>}
                    </div>
                    {service.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{service.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />{formatDuration(service.duration_min)}
                      </span>
                      <span className="text-xs font-semibold">
                        {service.price_from
                          ? `от ${formatPrice(service.price_from, service.currency)}`
                          : formatPrice(service.price, service.currency)
                        }
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => toggleActive(service)}
                      className="p-2 rounded-lg hover:bg-muted transition-colors"
                      title={service.is_active ? 'Скрыть' : 'Показать'}
                    >
                      {service.is_active
                        ? <ToggleRight className="w-5 h-5 text-green-500" />
                        : <ToggleLeft className="w-5 h-5 text-muted-foreground" />
                      }
                    </button>
                    <button
                      onClick={() => openEdit(service)}
                      className="p-2 rounded-lg hover:bg-muted transition-colors"
                    >
                      <Pencil className="w-4 h-4 text-muted-foreground" />
                    </button>
                    <button
                      onClick={() => setDeleteId(service.id)}
                      className="p-2 rounded-lg hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ))
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Редактировать услугу' : 'Новая услуга'}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Название *</label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Маникюр классический"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Описание</label>
              <Input
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Краткое описание услуги"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Длительность (мин) *</label>
                <Input
                  type="number"
                  value={form.duration_min}
                  onChange={e => setForm(f => ({ ...f, duration_min: parseInt(e.target.value) || 60 }))}
                  min={5}
                  max={480}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Пауза после (мин)</label>
                <Input
                  type="number"
                  value={form.buffer_after_min}
                  onChange={e => setForm(f => ({ ...f, buffer_after_min: parseInt(e.target.value) || 0 }))}
                  min={0}
                  max={120}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Цена *</label>
                <Input
                  type="number"
                  value={form.price}
                  onChange={e => setForm(f => ({ ...f, price: parseFloat(e.target.value) || 0 }))}
                  min={0}
                  step={0.01}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Цена от (необязательно)</label>
                <Input
                  type="number"
                  value={form.price_from}
                  onChange={e => setForm(f => ({ ...f, price_from: e.target.value }))}
                  placeholder="0"
                  min={0}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Валюта</label>
                <Input
                  value={form.currency}
                  onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                  placeholder="BYN"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                className="rounded"
              />
              <span className="text-sm">Активна (видна клиентам)</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Отмена</Button>
            <Button onClick={handleSave} disabled={saving || !form.name}>
              {saving ? 'Сохраняем...' : 'Сохранить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Удалить услугу?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Это действие нельзя отменить. Все записи на эту услугу останутся в истории.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Отмена</Button>
            <Button variant="destructive" onClick={() => deleteId && handleDelete(deleteId)}>Удалить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

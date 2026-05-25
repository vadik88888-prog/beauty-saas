'use client'

import { useEffect, useState } from 'react'
import { Plus, Tag, ToggleLeft, ToggleRight, Trash2, Pencil } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'

type Promotion = {
  id: string
  title: string
  description: string | null
  discount_type: 'percent' | 'fixed' | null
  discount_value: number | null
  starts_at: string | null
  ends_at: string | null
  is_active: boolean
  created_at: string
}

const EMPTY_FORM = {
  title: '',
  description: '',
  discount_type: 'percent' as 'percent' | 'fixed',
  discount_value: '',
  starts_at: '',
  ends_at: '',
  is_active: true,
}

export default function PromotionsAdminPage() {
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  async function load() {
    const res = await fetch('/api/admin/promotions')
    const { data } = await res.json()
    setPromotions(data ?? [])
    setIsLoading(false)
  }

  useEffect(() => { load() }, [])

  function openCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  function openEdit(p: Promotion) {
    setEditingId(p.id)
    setForm({
      title: p.title,
      description: p.description ?? '',
      discount_type: p.discount_type ?? 'percent',
      discount_value: p.discount_value?.toString() ?? '',
      starts_at: p.starts_at ? p.starts_at.split('T')[0] : '',
      ends_at: p.ends_at ? p.ends_at.split('T')[0] : '',
      is_active: p.is_active,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.title.trim()) return
    setSaving(true)
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        discount_type: form.discount_value ? form.discount_type : null,
        discount_value: form.discount_value ? Number(form.discount_value) : null,
        starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
        ends_at: form.ends_at ? new Date(form.ends_at + 'T23:59:59').toISOString() : null,
        is_active: form.is_active,
      }
      const url = editingId ? `/api/admin/promotions/${editingId}` : '/api/admin/promotions'
      const method = editingId ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) throw new Error()
      toast.success(editingId ? 'Акция обновлена' : 'Акция создана')
      setDialogOpen(false)
      await load()
    } catch {
      toast.error('Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(p: Promotion) {
    await fetch(`/api/admin/promotions/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !p.is_active }),
    })
    await load()
  }

  async function handleDelete(id: string) {
    await fetch(`/api/admin/promotions/${id}`, { method: 'DELETE' })
    toast.success('Акция деактивирована')
    await load()
  }

  const discountLabel = (p: Promotion) =>
    p.discount_value
      ? p.discount_type === 'percent' ? `−${p.discount_value}%` : `−${p.discount_value} руб.`
      : null

  const dateRange = (p: Promotion) => {
    const start = p.starts_at ? new Date(p.starts_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : null
    const end = p.ends_at ? new Date(p.ends_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : null
    if (start && end) return `${start} — ${end}`
    if (end) return `до ${end}`
    return null
  }

  return (
    <div className="p-6 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Акции</h1>
          <p className="text-muted-foreground text-sm mt-1">AI-администратор автоматически знает об активных акциях</p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="w-4 h-4" />
          Добавить акцию
        </Button>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground text-sm">Загрузка...</div>
      ) : promotions.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">
          <Tag className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Акций пока нет</p>
          <p className="text-xs mt-1">Создайте акцию — клиенты увидят её в приложении, а AI начнёт о ней рассказывать</p>
          <Button variant="outline" className="mt-4" onClick={openCreate}>Создать первую акцию</Button>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {promotions.map(p => (
            <Card key={p.id} className={`p-4 flex items-start gap-4 ${!p.is_active ? 'opacity-60' : ''}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-sm">{p.title}</p>
                  {discountLabel(p) && (
                    <Badge className="text-xs bg-primary/10 text-primary">{discountLabel(p)}</Badge>
                  )}
                  <Badge variant={p.is_active ? 'default' : 'secondary'} className="text-xs">
                    {p.is_active ? 'Активна' : 'Скрыта'}
                  </Badge>
                </div>
                {p.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{p.description}</p>}
                {dateRange(p) && <p className="text-xs text-muted-foreground mt-0.5">{dateRange(p)}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => toggleActive(p)} className="p-1.5 rounded-lg hover:bg-muted" title={p.is_active ? 'Скрыть' : 'Активировать'}>
                  {p.is_active ? <ToggleRight className="w-4 h-4 text-green-500" /> : <ToggleLeft className="w-4 h-4 text-muted-foreground" />}
                </button>
                <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg hover:bg-muted">
                  <Pencil className="w-4 h-4 text-muted-foreground" />
                </button>
                <button onClick={() => handleDelete(p.id)} className="p-1.5 rounded-lg hover:bg-destructive/10">
                  <Trash2 className="w-4 h-4 text-destructive" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Редактировать акцию' : 'Новая акция'}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Название *</label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Скидка 20% на маникюр" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Описание</label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Только в мае для новых клиентов" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Тип скидки</label>
                <select value={form.discount_type} onChange={e => setForm(f => ({ ...f, discount_type: e.target.value as 'percent' | 'fixed' }))} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="percent">Процент (%)</option>
                  <option value="fixed">Фиксированная (руб.)</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Размер скидки</label>
                <Input type="number" value={form.discount_value} onChange={e => setForm(f => ({ ...f, discount_value: e.target.value }))} placeholder="20" min="0" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Дата начала</label>
                <Input type="date" value={form.starts_at} onChange={e => setForm(f => ({ ...f, starts_at: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Дата окончания</label>
                <Input type="date" value={form.ends_at} onChange={e => setForm(f => ({ ...f, ends_at: e.target.value }))} />
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="rounded" />
              <span className="text-sm">Активна (видна клиентам и известна AI)</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Отмена</Button>
            <Button onClick={handleSave} disabled={saving || !form.title.trim()}>
              {saving ? 'Сохраняем...' : 'Сохранить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

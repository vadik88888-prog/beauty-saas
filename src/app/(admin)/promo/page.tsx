'use client'

import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { Plus, Tag, Trash2, Pencil, Calendar, Sparkles } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { cn } from '@/lib/utils'

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
  const searchParams = useSearchParams()
  const prefillHandled = useRef(false)

  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  // Pre-fill from SERA's tip (URL params: new, title, description, discount, type)
  useEffect(() => {
    if (prefillHandled.current) return
    if (searchParams.get('new') !== '1') return
    prefillHandled.current = true
    const title       = searchParams.get('title') ?? ''
    const description = searchParams.get('description') ?? ''
    const discount    = searchParams.get('discount') ?? ''
    const type        = (searchParams.get('type') ?? 'percent') as 'percent' | 'fixed'
    if (!title) return
    setEditingId(null)
    setForm({ ...EMPTY_FORM, title, description, discount_value: discount, discount_type: type, is_active: true })
    setDialogOpen(true)
  }, [searchParams])

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
    setPromotions(prev => prev.map(x => x.id === p.id ? { ...x, is_active: !x.is_active } : x))
  }

  async function handleDelete(id: string) {
    await fetch(`/api/admin/promotions/${id}`, { method: 'DELETE' })
    toast.success('Акция удалена')
    await load()
  }

  const discountLabel = (p: Promotion) =>
    p.discount_value
      ? p.discount_type === 'percent' ? `−${p.discount_value}%` : `−${p.discount_value}`
      : null

  const dateRange = (p: Promotion) => {
    const start = p.starts_at ? new Date(p.starts_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : null
    const end = p.ends_at ? new Date(p.ends_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : null
    if (start && end) return `${start} — ${end}`
    if (end) return `до ${end}`
    if (start) return `с ${start}`
    return null
  }

  const activeCount = promotions.filter(p => p.is_active).length

  return (
    <div className="p-5 md:p-8 max-w-4xl mx-auto flex flex-col gap-6">
      <PageHeader
        title="Акции"
        description={
          activeCount > 0
            ? `${activeCount} ${pluralize(activeCount, ['активная', 'активных', 'активных'])} ${pluralize(activeCount, ['акция', 'акции', 'акций'])} · AI рассказывает о них клиентам`
            : 'Создайте акцию — AI начнёт рассказывать о ней клиентам'
        }
        actions={
          <button
            onClick={openCreate}
            className="px-4 h-10 rounded-xl bg-foreground text-background text-[13px] font-medium hover:opacity-90 transition-opacity inline-flex items-center gap-2"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Добавить акцию</span>
            <span className="sm:hidden">Добавить</span>
          </button>
        }
      />

      {isLoading ? (
        <div className="text-muted-foreground text-sm">Загрузка...</div>
      ) : promotions.length === 0 ? (
        <EmptyState
          icon={Tag}
          title="Акций пока нет"
          description="Создайте акцию — клиенты увидят её в приложении, AI начнёт мягко предлагать"
          action={
            <button
              onClick={openCreate}
              className="px-4 h-10 rounded-xl bg-foreground text-background text-[13px] font-medium hover:opacity-90 transition-opacity inline-flex items-center gap-2"
            >
              <Plus className="w-3.5 h-3.5" />
              Создать первую
            </button>
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {promotions.map(p => (
            <div
              key={p.id}
              className={cn(
                'p-4 rounded-2xl border border-border bg-surface-elevated flex items-start gap-4 transition-opacity',
                !p.is_active && 'opacity-60'
              )}
              style={{ boxShadow: 'var(--shadow-xs)' }}
            >
              <div className="w-10 h-10 rounded-xl bg-accent-soft flex items-center justify-center shrink-0">
                <Tag className="w-4 h-4 text-accent-foreground" strokeWidth={1.8} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <p className="font-semibold text-[14px] text-foreground">{p.title}</p>
                  {discountLabel(p) && (
                    <span className="inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-full bg-foreground text-background">
                      {discountLabel(p)}
                    </span>
                  )}
                  {p.is_active && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-ai-soft text-ai-foreground border border-ai-border">
                      <Sparkles className="w-2.5 h-2.5" strokeWidth={2.2} />
                      AI знает
                    </span>
                  )}
                </div>
                {p.description && (
                  <p className="text-[12px] text-muted-foreground line-clamp-1 mb-1">{p.description}</p>
                )}
                {dateRange(p) && (
                  <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                    <Calendar className="w-3 h-3" strokeWidth={1.8} />
                    {dateRange(p)}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <Switch checked={p.is_active} onCheckedChange={() => toggleActive(p)} />
                <button onClick={() => openEdit(p)} className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => handleDelete(p.id)} className="p-2 rounded-lg hover:bg-destructive-soft text-destructive transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
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
              <label className="text-[12px] font-medium text-muted-foreground mb-1.5 block">Название *</label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Скидка 20% на маникюр" />
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground mb-1.5 block">Описание</label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Только в мае для новых клиентов" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[12px] font-medium text-muted-foreground mb-1.5 block">Тип скидки</label>
                <select
                  value={form.discount_type}
                  onChange={e => setForm(f => ({ ...f, discount_type: e.target.value as 'percent' | 'fixed' }))}
                  className="w-full h-10 rounded-xl border border-border bg-surface-sunken px-3 text-[13px]"
                >
                  <option value="percent">Процент (%)</option>
                  <option value="fixed">Фиксированная</option>
                </select>
              </div>
              <div>
                <label className="text-[12px] font-medium text-muted-foreground mb-1.5 block">Размер</label>
                <Input type="number" value={form.discount_value} onChange={e => setForm(f => ({ ...f, discount_value: e.target.value }))} placeholder="20" min="0" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[12px] font-medium text-muted-foreground mb-1.5 block">Дата начала</label>
                <Input type="date" value={form.starts_at} onChange={e => setForm(f => ({ ...f, starts_at: e.target.value }))} />
              </div>
              <div>
                <label className="text-[12px] font-medium text-muted-foreground mb-1.5 block">Дата окончания</label>
                <Input type="date" value={form.ends_at} onChange={e => setForm(f => ({ ...f, ends_at: e.target.value }))} />
              </div>
            </div>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <Switch checked={form.is_active} onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))} />
              <span className="text-[13px] text-foreground">Активна — видна клиентам, AI о ней знает</span>
            </label>
          </div>
          <DialogFooter>
            <button onClick={() => setDialogOpen(false)} className="px-4 h-10 rounded-xl bg-muted text-foreground text-[13px] font-medium hover:bg-surface-sunken transition-colors">
              Отмена
            </button>
            <button onClick={handleSave} disabled={saving || !form.title.trim()} className="px-4 h-10 rounded-xl bg-foreground text-background text-[13px] font-medium hover:opacity-90 transition-opacity disabled:opacity-40">
              {saving ? 'Сохраняем...' : 'Сохранить'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function pluralize(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100
  const last = abs % 10
  if (abs > 10 && abs < 20) return forms[2]
  if (last > 1 && last < 5) return forms[1]
  if (last === 1) return forms[0]
  return forms[2]
}

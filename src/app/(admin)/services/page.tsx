'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Clock, Search, Scissors, Tag } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatPrice } from '@/lib/utils/format'
import { formatDuration } from '@/lib/utils/date'
import { cn } from '@/lib/utils'

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

type SortKey = 'name' | 'price' | 'duration_min'

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
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)

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
    setServices(prev => prev.map(x => x.id === s.id ? { ...x, is_active: !x.is_active } : x))
  }

  const categories = Array.from(new Set(services.map(s => s.category?.name).filter(Boolean) as string[])).sort()

  const filtered = services
    .filter(s => !categoryFilter || s.category?.name === categoryFilter)
    .filter(s =>
      !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.category?.name ?? '').toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name, 'ru')
      if (sortKey === 'price') return a.price - b.price
      if (sortKey === 'duration_min') return a.duration_min - b.duration_min
      return 0
    })

  // Group by category for visual sections
  const grouped = filtered.reduce<Record<string, ServiceItem[]>>((acc, s) => {
    const key = s.category?.name ?? 'Без категории'
    if (!acc[key]) acc[key] = []
    acc[key].push(s)
    return acc
  }, {})

  return (
    <div className="p-5 md:p-8 max-w-5xl mx-auto flex flex-col gap-6">
      <PageHeader
        title="Услуги"
        description={services.length > 0 ? `${services.length} ${pluralize(services.length, ['услуга', 'услуги', 'услуг'])} · AI использует их для записи` : 'AI использует услуги для записи клиентов'}
        actions={
          <button
            onClick={openCreate}
            className="px-4 h-10 rounded-xl bg-foreground text-background text-[13px] font-medium hover:opacity-90 transition-opacity inline-flex items-center gap-2"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Добавить услугу</span>
            <span className="sm:hidden">Добавить</span>
          </button>
        }
      />

      {/* Search + filter + sort */}
      {services.length > 0 && (
        <div className="flex flex-col md:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Поиск услуг..."
              className="pl-9"
            />
          </div>

          {categories.length > 0 && (
            <div className="flex gap-1 overflow-x-auto scrollbar-hide">
              <FilterChip
                active={categoryFilter === null}
                onClick={() => setCategoryFilter(null)}
              >
                Все
              </FilterChip>
              {categories.map(cat => (
                <FilterChip
                  key={cat}
                  active={categoryFilter === cat}
                  onClick={() => setCategoryFilter(cat)}
                >
                  {cat}
                </FilterChip>
              ))}
            </div>
          )}

          <select
            value={sortKey}
            onChange={e => setSortKey(e.target.value as SortKey)}
            className="h-10 px-3 rounded-xl border border-border bg-surface-sunken text-[12px] font-medium shrink-0"
          >
            <option value="name">По названию</option>
            <option value="price">По цене</option>
            <option value="duration_min">По длительности</option>
          </select>
        </div>
      )}

      {isLoading ? (
        <div className="text-muted-foreground text-sm">Загрузка...</div>
      ) : services.length === 0 ? (
        <EmptyState
          icon={Scissors}
          title="Услуги ещё не добавлены"
          description="Добавьте первую услугу — AI сможет записывать клиентов и рассказывать о ценах"
          action={
            <button
              onClick={openCreate}
              className="px-4 h-10 rounded-xl bg-foreground text-background text-[13px] font-medium hover:opacity-90 transition-opacity inline-flex items-center gap-2"
            >
              <Plus className="w-3.5 h-3.5" />
              Добавить услугу
            </button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Ничего не найдено"
          description={`По запросу «${search || categoryFilter}» услуг нет`}
        />
      ) : (
        <div className="flex flex-col gap-6">
          {Object.entries(grouped).map(([category, items]) => (
            <section key={category}>
              <div className="flex items-center gap-2 mb-3">
                <Tag className="w-3 h-3 text-muted-foreground" strokeWidth={1.8} />
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {category}
                </h2>
                <span className="text-[11px] text-muted-foreground">·</span>
                <span className="text-[11px] text-muted-foreground">{items.length}</span>
              </div>
              <div className="flex flex-col gap-2">
                {items.map(service => (
                  <ServiceCard
                    key={service.id}
                    service={service}
                    onToggle={() => toggleActive(service)}
                    onEdit={() => openEdit(service)}
                    onDelete={() => setDeleteId(service.id)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Редактировать услугу' : 'Новая услуга'}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground mb-1.5 block">Название *</label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Маникюр классический"
              />
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground mb-1.5 block">Описание</label>
              <Input
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Краткое описание услуги"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[12px] font-medium text-muted-foreground mb-1.5 block">Длительность (мин) *</label>
                <Input
                  type="number"
                  value={form.duration_min}
                  onChange={e => setForm(f => ({ ...f, duration_min: parseInt(e.target.value) || 60 }))}
                  min={5}
                  max={480}
                />
              </div>
              <div>
                <label className="text-[12px] font-medium text-muted-foreground mb-1.5 block">Пауза после (мин)</label>
                <Input
                  type="number"
                  value={form.buffer_after_min}
                  onChange={e => setForm(f => ({ ...f, buffer_after_min: parseInt(e.target.value) || 0 }))}
                  min={0}
                  max={120}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[12px] font-medium text-muted-foreground mb-1.5 block">Цена *</label>
                <Input
                  type="number"
                  value={form.price}
                  onChange={e => setForm(f => ({ ...f, price: parseFloat(e.target.value) || 0 }))}
                  min={0}
                  step={0.01}
                />
              </div>
              <div>
                <label className="text-[12px] font-medium text-muted-foreground mb-1.5 block">Валюта</label>
                <Input
                  value={form.currency}
                  onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground mb-1.5 block">Цена «от» (необязательно)</label>
              <Input
                type="number"
                value={form.price_from}
                onChange={e => setForm(f => ({ ...f, price_from: e.target.value }))}
                min={0}
              />
            </div>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <Switch
                checked={form.is_active}
                onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))}
              />
              <span className="text-[13px] text-foreground">Активна — видна клиентам и AI</span>
            </label>
          </div>
          <DialogFooter>
            <button
              onClick={() => setDialogOpen(false)}
              className="px-4 h-10 rounded-xl bg-muted text-foreground text-[13px] font-medium hover:bg-surface-sunken transition-colors"
            >
              Отмена
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !form.name}
              className="px-4 h-10 rounded-xl bg-foreground text-background text-[13px] font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {saving ? 'Сохраняем...' : 'Сохранить'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Удалить услугу?</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-muted-foreground">
            Это действие нельзя отменить. Все записи на эту услугу останутся в истории.
          </p>
          <DialogFooter>
            <button
              onClick={() => setDeleteId(null)}
              className="px-4 h-10 rounded-xl bg-muted text-foreground text-[13px] font-medium hover:bg-surface-sunken transition-colors"
            >
              Отмена
            </button>
            <button
              onClick={() => deleteId && handleDelete(deleteId)}
              className="px-4 h-10 rounded-xl bg-destructive text-white text-[13px] font-medium hover:opacity-90 transition-opacity"
            >
              Удалить
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'h-10 px-3.5 rounded-xl text-[12px] font-medium whitespace-nowrap transition-colors shrink-0',
        active
          ? 'bg-foreground text-background'
          : 'bg-surface-sunken text-muted-foreground hover:bg-muted'
      )}
    >
      {children}
    </button>
  )
}

function ServiceCard({
  service, onToggle, onEdit, onDelete,
}: {
  service: ServiceItem
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-4 p-4 rounded-2xl border bg-surface-elevated transition-opacity',
        !service.is_active && 'opacity-60'
      )}
      style={{ boxShadow: 'var(--shadow-xs)' }}
    >
      <div className="w-10 h-10 rounded-xl bg-surface-sunken flex items-center justify-center shrink-0">
        <Scissors className="w-4 h-4 text-foreground" strokeWidth={1.8} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="font-semibold text-[14px] text-foreground truncate">{service.name}</p>
          {!service.is_active && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              скрыта
            </span>
          )}
        </div>
        {service.description && (
          <p className="text-[12px] text-muted-foreground line-clamp-1 mb-1">{service.description}</p>
        )}
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" strokeWidth={1.8} />
            {formatDuration(service.duration_min)}
            {service.buffer_after_min ? (
              <span className="text-muted-foreground/70">+{service.buffer_after_min}м</span>
            ) : null}
          </span>
          <span className="text-foreground font-semibold">
            {service.price_from
              ? `от ${formatPrice(service.price_from, service.currency)}`
              : formatPrice(service.price, service.currency)
            }
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <Switch checked={service.is_active} onCheckedChange={onToggle} />
        <button
          onClick={onEdit}
          className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onDelete}
          className="p-2 rounded-lg hover:bg-destructive-soft text-destructive transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
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

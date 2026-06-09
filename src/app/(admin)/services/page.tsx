'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Plus, Pencil, Trash2, Clock, Search, Scissors, RefreshCw,
  ExternalLink, EyeOff, Zap, Tag,
} from 'lucide-react'
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
import { OverdueBlock } from './_components/OverdueBlock'
import { CategoriesModal } from './_components/CategoriesModal'
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
  repeat_interval_days: number | null
  show_in_storefront: boolean
  is_promoted: boolean
  category: { id: string; name: string } | null
}

type ServiceStat = {
  count: number
  revenue: number
  aiCount: number
  delta: number | null
}

type SidebarStats = {
  totalCount: number
  totalRevenue: number
  avgCheck: number
  repeatRate: number
}

type SortKey = 'name' | 'price' | 'duration_min'

const EMPTY_FORM = {
  name: '',
  description: '',
  category_id: '',
  duration_min: 60,
  buffer_after_min: 0,
  price: 0,
  price_from: '',
  currency: 'BYN',
  is_active: true,
  sort_order: 0,
  repeat_interval_days: '',
  show_in_storefront: true,
  is_promoted: false,
}

export default function ServicesAdminPage() {
  const [services, setServices] = useState<ServiceItem[]>([])
  const [statsMap, setStatsMap] = useState<Record<string, ServiceStat>>({})
  const [sidebar, setSidebar] = useState<SidebarStats | null>(null)
  const [tenantSlug, setTenantSlug] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [period, setPeriod] = useState(30)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  const [formCategories, setFormCategories] = useState<{ id: string; name: string }[]>([])
  const [addingCat, setAddingCat] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [creatingCat, setCreatingCat] = useState(false)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)

  const loadAll = useCallback(async (p: number) => {
    setIsLoading(true)
    const [servRes, analyticsRes, settingsRes] = await Promise.all([
      fetch('/api/admin/services'),
      fetch(`/api/admin/services/analytics?period=${p}`),
      fetch('/api/admin/settings'),
    ])
    const { data: servData } = await servRes.json()
    const analyticsJson = await analyticsRes.json()
    const settingsJson = await settingsRes.json()

    setServices(servData ?? [])
    setStatsMap(analyticsJson?.data?.byService ?? {})
    setSidebar(analyticsJson?.data?.sidebar ?? null)
    setTenantSlug(settingsJson?.data?.slug ?? null)
    setIsLoading(false)
  }, [])

  useEffect(() => { loadAll(period) }, [period, loadAll])

  useEffect(() => {
    if (!dialogOpen) { setAddingCat(false); setNewCatName(''); return }
    fetch('/api/admin/categories')
      .then(r => r.json())
      .then(({ data }) => setFormCategories(data ?? []))
  }, [dialogOpen])

  async function handleCreateCat() {
    const name = newCatName.trim()
    if (!name) return
    setCreatingCat(true)
    const res = await fetch('/api/admin/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (res.ok) {
      const { data } = await res.json()
      setFormCategories(prev => [...prev, data])
      setForm(f => ({ ...f, category_id: data.id }))
      setAddingCat(false)
      setNewCatName('')
    }
    setCreatingCat(false)
  }

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
      category_id: s.category?.id ?? '',
      duration_min: s.duration_min,
      buffer_after_min: s.buffer_after_min ?? 0,
      price: s.price,
      price_from: s.price_from != null ? String(s.price_from) : '',
      currency: s.currency,
      is_active: s.is_active,
      sort_order: s.sort_order,
      repeat_interval_days: s.repeat_interval_days != null ? String(s.repeat_interval_days) : '',
      show_in_storefront: s.show_in_storefront,
      is_promoted: s.is_promoted ?? false,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    setSaving(true)
    const intervalDays = form.repeat_interval_days !== '' ? parseInt(String(form.repeat_interval_days)) : null
    const payload = {
      ...form,
      category_id: form.category_id || null,
      price: Number(form.price),
      price_from: form.price_from !== '' ? Number(form.price_from) : null,
      repeat_interval_days: intervalDays && !isNaN(intervalDays) ? intervalDays : null,
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
      await loadAll(period)
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    await fetch(`/api/admin/services/${id}`, { method: 'DELETE' })
    setDeleteId(null)
    await loadAll(period)
  }

  async function toggleActive(s: ServiceItem) {
    await fetch(`/api/admin/services/${s.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !s.is_active }),
    })
    setServices(prev => prev.map(x => x.id === s.id ? { ...x, is_active: !x.is_active } : x))
  }

  const currency = services[0]?.currency ?? 'BYN'

  const categories = Array.from(
    new Set(services.map(s => s.category?.name).filter(Boolean) as string[])
  ).sort()

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

  const grouped = filtered.reduce<Record<string, ServiceItem[]>>((acc, s) => {
    const key = s.category?.name ?? 'Без категории'
    if (!acc[key]) acc[key] = []
    acc[key].push(s)
    return acc
  }, {})

  const storefrontUrl = tenantSlug
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/booking/services?slug=${encodeURIComponent(tenantSlug)}`
    : null

  return (
    <div className="p-5 md:p-8 max-w-6xl mx-auto flex flex-col gap-6">
      <PageHeader
        title="Услуги"
        description={
          services.length > 0
            ? `${services.length} ${pluralize(services.length, ['услуга', 'услуги', 'услуг'])} · SERA использует их при записи`
            : 'SERA использует услуги для записи клиентов'
        }
        actions={
          <div className="flex items-center gap-2">
            {storefrontUrl && (
              <a
                href={storefrontUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="sera-btn sera-btn--secondary sera-btn--sm inline-flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Открыть в витрине</span>
              </a>
            )}
            <button
              onClick={() => setCategoriesOpen(true)}
              className="sera-btn sera-btn--secondary sera-btn--sm inline-flex items-center gap-1.5"
            >
              <Tag className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Категории</span>
            </button>
            <button onClick={openCreate} className="sera-btn sera-btn--sera sera-btn--sm inline-flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Добавить услугу</span>
              <span className="sm:hidden">Добавить</span>
            </button>
          </div>
        }
      />

      <div className="flex gap-6 items-start">
        {/* Main content */}
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          {/* Search + filters */}
          {services.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                  <Input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Поиск услуг..."
                    className="pl-9"
                  />
                </div>
                <select
                  value={sortKey}
                  onChange={e => setSortKey(e.target.value as SortKey)}
                  className="h-10 px-3 rounded-xl border text-[12px] font-medium shrink-0"
                  style={{ background: 'var(--card-sunken)', borderColor: 'var(--line)', color: 'var(--ink)' }}
                >
                  <option value="name">По названию</option>
                  <option value="price">По цене</option>
                  <option value="duration_min">По длительности</option>
                </select>
              </div>
              {categories.length > 0 && (
                <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
                  <FilterChip active={categoryFilter === null} onClick={() => setCategoryFilter(null)}>Все</FilterChip>
                  {categories.map(cat => (
                    <FilterChip key={cat} active={categoryFilter === cat} onClick={() => setCategoryFilter(cat)}>
                      {cat}
                    </FilterChip>
                  ))}
                </div>
              )}
            </div>
          )}

          {isLoading ? (
            <div className="text-[13px]" style={{ color: 'var(--text-muted)' }}>Загрузка...</div>
          ) : services.length === 0 ? (
            <EmptyState
              icon={Scissors}
              title="Услуги ещё не добавлены"
              description="Добавьте первую услугу — SERA сможет записывать клиентов и рассказывать о ценах"
              action={
                <button onClick={openCreate} className="sera-btn sera-btn--sera sera-btn--sm inline-flex items-center gap-1.5">
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
                    <h2 className="sera-label">{category}</h2>
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>· {items.length}</span>
                  </div>
                  <div className="flex flex-col gap-3">
                    {items.map(service => (
                      <ServiceCard
                        key={service.id}
                        service={service}
                        stat={statsMap[service.id] ?? null}
                        period={period}
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
        </div>

        {/* Sidebar */}
        <div className="w-72 shrink-0 hidden md:flex flex-col gap-3">
          {/* Period selector */}
          <div className="flex items-center justify-between">
            <span className="sera-label">Статистика услуг</span>
            <select
              value={period}
              onChange={e => setPeriod(Number(e.target.value))}
              className="h-7 px-2 rounded-lg border text-[11px] font-medium"
              style={{ background: 'var(--card-sunken)', borderColor: 'var(--line)', color: 'var(--ink)' }}
            >
              <option value={7}>7 дней</option>
              <option value={30}>30 дней</option>
              <option value={90}>90 дней</option>
            </select>
          </div>

          <div className="sera-card p-4 flex flex-col gap-3">
            <SidebarStat
              label="Записей выполнено"
              value={sidebar ? String(sidebar.totalCount) : '—'}
            />
            <SidebarStat
              label="Выручка"
              value={sidebar ? formatPrice(sidebar.totalRevenue, currency) : '—'}
            />
            <SidebarStat
              label="Средний чек"
              value={sidebar && sidebar.avgCheck > 0 ? formatPrice(sidebar.avgCheck, currency) : '—'}
            />
            <SidebarStat
              label="Повторных клиентов"
              value={sidebar ? `${sidebar.repeatRate}%` : '—'}
              accent={sidebar ? sidebar.repeatRate > 0 : false}
            />
          </div>

          <OverdueBlock />
        </div>
      </div>

      <CategoriesModal open={categoriesOpen} onClose={() => { setCategoriesOpen(false); loadAll(period) }} />

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Редактировать услугу' : 'Новая услуга'}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div>
              <label className="text-[12px] font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>Название *</label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Маникюр классический"
              />
            </div>
            <div>
              <label className="text-[12px] font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>Описание</label>
              <Input
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Краткое описание услуги"
              />
            </div>
            <div>
              <label className="text-[12px] font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>Категория</label>
              {addingCat ? (
                <div className="flex gap-1.5">
                  <Input
                    value={newCatName}
                    onChange={e => setNewCatName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleCreateCat(); if (e.key === 'Escape') setAddingCat(false) }}
                    placeholder="Название новой категории"
                    className="flex-1"
                    autoFocus
                  />
                  <button
                    onClick={handleCreateCat}
                    disabled={creatingCat || !newCatName.trim()}
                    className="sera-btn sera-btn--sera sera-btn--sm shrink-0"
                  >
                    {creatingCat ? '...' : 'Создать'}
                  </button>
                  <button
                    onClick={() => setAddingCat(false)}
                    className="sera-btn sera-btn--secondary sera-btn--sm shrink-0"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <select
                  value={form.category_id}
                  onChange={e => {
                    if (e.target.value === '__new__') {
                      setAddingCat(true)
                      setNewCatName('')
                    } else {
                      setForm(f => ({ ...f, category_id: e.target.value }))
                    }
                  }}
                  className="h-10 w-full px-3 rounded-xl border text-[13px]"
                  style={{ background: 'var(--card-sunken)', borderColor: 'var(--line)', color: 'var(--ink)' }}
                >
                  <option value="">Без категории</option>
                  {formCategories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                  <option value="__new__">+ Создать новую...</option>
                </select>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[12px] font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>Длительность (мин) *</label>
                <Input
                  type="number"
                  value={form.duration_min}
                  onChange={e => setForm(f => ({ ...f, duration_min: parseInt(e.target.value) || 60 }))}
                  min={5}
                  max={480}
                />
              </div>
              <div>
                <label className="text-[12px] font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>Пауза после (мин)</label>
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
                <label className="text-[12px] font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>Цена *</label>
                <Input
                  type="number"
                  value={form.price}
                  onChange={e => setForm(f => ({ ...f, price: parseFloat(e.target.value) || 0 }))}
                  min={0}
                  step={0.01}
                />
              </div>
              <div>
                <label className="text-[12px] font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>Валюта</label>
                <Input
                  value={form.currency}
                  onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="text-[12px] font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>Цена «от» (необязательно)</label>
              <Input
                type="number"
                value={form.price_from}
                onChange={e => setForm(f => ({ ...f, price_from: e.target.value }))}
                min={0}
              />
            </div>
            {/* New fields */}
            <div>
              <label className="text-[12px] font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
                Интервал повтора (дней, необязательно)
              </label>
              <Input
                type="number"
                value={form.repeat_interval_days}
                onChange={e => setForm(f => ({ ...f, repeat_interval_days: e.target.value }))}
                placeholder="Например: 28"
                min={1}
                max={365}
              />
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                Через сколько дней клиенту стоит повторить услугу
              </p>
            </div>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <Switch
                checked={form.is_active}
                onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))}
              />
              <span className="text-[13px]" style={{ color: 'var(--ink)' }}>Активна — видна клиентам и SERA</span>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <Switch
                checked={form.show_in_storefront}
                onCheckedChange={v => setForm(f => ({ ...f, show_in_storefront: v }))}
              />
              <span className="text-[13px]" style={{ color: 'var(--ink)' }}>Показывать в клиентской витрине</span>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <Switch
                checked={form.is_promoted}
                onCheckedChange={v => setForm(f => ({ ...f, is_promoted: v }))}
              />
              <div>
                <span className="text-[13px]" style={{ color: 'var(--ink)' }}>Продвигать в витрине</span>
                <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>Показывать новым клиентам и тем, у кого нет персональной рекомендации. Постоянным SERA сначала предлагает то, что нужно именно им.</p>
              </div>
            </label>
          </div>
          <DialogFooter>
            <button
              onClick={() => setDialogOpen(false)}
              className="sera-btn sera-btn--secondary"
            >
              Отмена
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !form.name}
              className="sera-btn sera-btn--sera"
            >
              {saving ? 'Сохраняем...' : 'Сохранить'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Удалить услугу?</DialogTitle>
          </DialogHeader>
          <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
            Это действие нельзя отменить. Все записи на эту услугу останутся в истории.
          </p>
          <DialogFooter>
            <button onClick={() => setDeleteId(null)} className="sera-btn sera-btn--secondary">
              Отмена
            </button>
            <button
              onClick={() => deleteId && handleDelete(deleteId)}
              className="sera-btn sera-btn--danger"
            >
              Удалить
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="h-8 px-3.5 rounded-xl text-[12px] font-medium whitespace-nowrap transition-colors shrink-0"
      style={active
        ? { background: 'var(--ink)', color: 'var(--card)' }
        : { background: 'var(--card-sunken)', color: 'var(--text-muted)' }
      }
    >
      {children}
    </button>
  )
}

function ServiceCard({
  service, stat, period, onToggle, onEdit, onDelete,
}: {
  service: ServiceItem
  stat: ServiceStat | null
  period: number
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className={cn('sera-card px-4 py-3 flex items-center gap-3', !service.is_active && 'opacity-60')}>
      {/* Photo placeholder — squircle 56px */}
      <div
        className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: 'var(--sage-tint)' }}
      >
        <Scissors className="w-5 h-5" style={{ color: 'var(--sage-deep)' }} strokeWidth={1.5} />
      </div>

      {/* Name + meta */}
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-semibold text-[14px] leading-snug" style={{ color: 'var(--ink)' }}>
            {service.name}
          </span>
          {service.category && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0"
              style={{ background: 'var(--sage-tint)', color: 'var(--sage-deep)' }}>
              {service.category.name}
            </span>
          )}
          {!service.is_active && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0"
              style={{ background: 'var(--card-sunken)', color: 'var(--text-muted)' }}>
              скрыта
            </span>
          )}
          {service.show_in_storefront === false && service.is_active && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0"
              style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}>
              <EyeOff className="w-2.5 h-2.5" />
              не в витрине
            </span>
          )}
          {service.is_promoted && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0"
              style={{ background: 'var(--gold-soft)', color: 'var(--gold)' }}>
              <Zap className="w-2.5 h-2.5" />
              продвигается
            </span>
          )}
        </div>
        <div className="flex items-center gap-2.5 text-[12px]" style={{ color: 'var(--text-muted)' }}>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" strokeWidth={1.8} />
            {formatDuration(service.duration_min)}
          </span>
          <span className="font-semibold" style={{ color: 'var(--ink)' }}>
            {service.price_from
              ? `от ${formatPrice(service.price_from, service.currency)}`
              : formatPrice(service.price, service.currency)
            }
          </span>
          {service.repeat_interval_days && (
            <span className="flex items-center gap-1">
              <RefreshCw className="w-3 h-3" strokeWidth={1.8} />
              {service.repeat_interval_days} дн.
            </span>
          )}
        </div>
      </div>

      {/* Metrics block — compact group */}
      <div className="hidden sm:flex items-center gap-3 px-3 py-1.5 rounded-lg shrink-0"
        style={{ background: 'var(--card-sunken)' }}>
        <MetricCol label="Записей" value={String(stat?.count ?? 0)} />
        <MetricCol
          label="Выручка"
          value={stat && stat.revenue > 0 ? formatPrice(stat.revenue, service.currency) : '—'}
          primary
        />
        <MetricCol label="Динамика" delta={stat?.delta ?? null} period={period} />
        <MetricCol label="AI" value={String(stat?.aiCount ?? 0)} sage />
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1 shrink-0">
        <Switch checked={service.is_active} onCheckedChange={onToggle} />
        <button onClick={onEdit} className="sera-btn-icon"
          style={{ color: 'var(--ink-2)', borderColor: 'var(--line)' }}>
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button onClick={onDelete} className="sera-btn-icon"
          style={{ color: 'var(--error)', borderColor: 'transparent' }}>
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

function MetricCol({
  label, value, primary, sage, delta, period,
}: {
  label: string
  value?: string
  primary?: boolean
  sage?: boolean
  delta?: number | null
  period?: number
}) {
  const isDelta = delta !== undefined
  let displayValue: string
  let valueColor: string

  if (isDelta) {
    if (delta === null) {
      displayValue = '—'
      valueColor = 'var(--text-muted)'
    } else if (delta > 0) {
      displayValue = `+${delta}%`
      valueColor = 'var(--success)'
    } else if (delta < 0) {
      displayValue = `${delta}%`
      valueColor = 'var(--error)'
    } else {
      displayValue = '0%'
      valueColor = 'var(--text-muted)'
    }
  } else {
    displayValue = value ?? '—'
    valueColor = primary ? 'var(--ink)' : sage ? 'var(--sage-deep)' : 'var(--ink-2)'
  }

  return (
    <div
      className="flex flex-col items-center gap-0 min-w-[40px]"
      title={isDelta && delta === null && period !== undefined ? `Нет данных за предыдущие ${period} дней` : undefined}
    >
      <span className="text-[9px] font-medium whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
        {label}
      </span>
      <span
        className={cn('tabular-nums font-bold text-center leading-tight whitespace-nowrap', primary ? 'text-[14px]' : 'text-[12px]')}
        style={{ color: valueColor }}
      >
        {displayValue}
      </span>
    </div>
  )
}

function SidebarStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span
        className="text-[13px] font-semibold tabular-nums"
        style={{ color: accent ? 'var(--sage-deep)' : 'var(--ink)' }}
      >
        {value}
      </span>
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

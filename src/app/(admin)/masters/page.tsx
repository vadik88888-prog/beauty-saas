'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, User, ToggleLeft, ToggleRight, CalendarDays, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
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
import Image from 'next/image'

type MasterItem = {
  id: string
  name: string
  bio: string | null
  speciality: string | null
  phone: string | null
  photo_url: string | null
  is_active: boolean
  sort_order: number
}

type ServiceItem = {
  id: string
  name: string
}

const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

type DaySchedule = {
  day_of_week: number
  start_time: string
  end_time: string
  is_working: boolean
}

function defaultSchedule(): DaySchedule[] {
  return DAY_NAMES.map((_, i) => ({
    day_of_week: i,
    start_time: '09:00',
    end_time: '18:00',
    is_working: i < 6,
  }))
}

const EMPTY_FORM = {
  name: '',
  bio: '',
  speciality: '',
  phone: '',
  photo_url: '',
  is_active: true,
  sort_order: 0,
}

export default function MastersAdminPage() {
  const [masters, setMasters] = useState<MasterItem[]>([])
  const [services, setServices] = useState<ServiceItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [scheduleMasterId, setScheduleMasterId] = useState<string | null>(null)
  const [scheduleMasterName, setScheduleMasterName] = useState('')
  const [schedule, setSchedule] = useState<DaySchedule[]>(defaultSchedule())
  const [savingSchedule, setSavingSchedule] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Файл слишком большой (макс 5 МБ)')
      return
    }

    setUploadingPhoto(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/admin/upload', { method: 'POST', body: fd })
      if (!res.ok) {
        const { error } = await res.json()
        toast.error(error ?? 'Ошибка загрузки')
        return
      }
      const { url } = await res.json()
      setForm(f => ({ ...f, photo_url: url }))
      toast.success('Фото загружено')
    } catch {
      toast.error('Ошибка загрузки')
    } finally {
      setUploadingPhoto(false)
      e.target.value = ''
    }
  }

  async function loadMasters() {
    const [mastersRes, servicesRes] = await Promise.all([
      fetch('/api/admin/masters'),
      fetch('/api/admin/services'),
    ])
    const { data: mastersData } = await mastersRes.json()
    const { data: servicesData } = await servicesRes.json()
    setMasters(mastersData ?? [])
    setServices((servicesData ?? []).map((s: { id: string; name: string }) => ({ id: s.id, name: s.name })))
    setIsLoading(false)
  }

  useEffect(() => { loadMasters() }, [])

  function openCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setSelectedServiceIds([])
    setDialogOpen(true)
  }

  async function openEdit(m: MasterItem) {
    setEditingId(m.id)
    setForm({
      name: m.name,
      bio: m.bio ?? '',
      speciality: m.speciality ?? '',
      phone: m.phone ?? '',
      photo_url: m.photo_url ?? '',
      is_active: m.is_active,
      sort_order: m.sort_order,
    })
    // Load existing service assignments
    const res = await fetch(`/api/admin/master-services?masterId=${m.id}`)
    if (res.ok) {
      const { data } = await res.json()
      setSelectedServiceIds(data ?? [])
    }
    setDialogOpen(true)
  }

  async function handleSave() {
    setSaving(true)
    const payload = {
      ...form,
      photo_url: form.photo_url || null,
      bio: form.bio || null,
      speciality: form.speciality || null,
      phone: form.phone || null,
    }

    const url = editingId ? `/api/admin/masters/${editingId}` : '/api/admin/masters'
    const method = editingId ? 'PATCH' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (res.ok) {
      const { data: savedMaster } = await res.json()
      const masterId = editingId ?? savedMaster?.id

      if (masterId && services.length > 0) {
        // Load current assignments and sync
        const currentRes = await fetch(`/api/admin/master-services?masterId=${masterId}`)
        const { data: currentIds } = currentRes.ok ? await currentRes.json() : { data: [] }
        const current = new Set<string>(currentIds ?? [])
        const desired = new Set<string>(selectedServiceIds)

        const toAdd = selectedServiceIds.filter(id => !current.has(id))
        const toRemove = [...current].filter(id => !desired.has(id))

        await Promise.all([
          ...toAdd.map(serviceId => fetch('/api/admin/master-services', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ masterId, serviceId }),
          })),
          ...toRemove.map(serviceId => fetch('/api/admin/master-services', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ masterId, serviceId }),
          })),
        ])
      }

      setDialogOpen(false)
      await loadMasters()
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    await fetch(`/api/admin/masters/${id}`, { method: 'DELETE' })
    setDeleteId(null)
    await loadMasters()
  }

  async function openSchedule(m: MasterItem) {
    setScheduleMasterId(m.id)
    setScheduleMasterName(m.name)
    const res = await fetch(`/api/admin/masters/${m.id}/schedule`)
    if (res.ok) {
      const { data } = await res.json()
      if (data?.length) {
        setSchedule(data as DaySchedule[])
      } else {
        setSchedule(defaultSchedule())
      }
    } else {
      setSchedule(defaultSchedule())
    }
    setScheduleOpen(true)
  }

  async function handleSaveSchedule() {
    if (!scheduleMasterId) return
    setSavingSchedule(true)
    const res = await fetch(`/api/admin/masters/${scheduleMasterId}/schedule`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schedule }),
    })
    if (res.ok) {
      toast.success('Расписание сохранено')
      setScheduleOpen(false)
    } else {
      toast.error('Ошибка сохранения')
    }
    setSavingSchedule(false)
  }

  async function toggleActive(m: MasterItem) {
    await fetch(`/api/admin/masters/${m.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !m.is_active }),
    })
    await loadMasters()
  }

  return (
    <div className="p-6 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Мастера</h1>
          <p className="text-muted-foreground text-sm mt-1">{masters.length} мастеров</p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="w-4 h-4" />
          Добавить мастера
        </Button>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground text-sm">Загрузка...</div>
      ) : masters.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">
          <p>Мастера ещё не добавлены</p>
          <Button variant="outline" className="mt-4" onClick={openCreate}>Добавить первого мастера</Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {masters.map(master => (
            <Card key={master.id} className="p-4 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-xl overflow-hidden bg-muted shrink-0">
                  {master.photo_url ? (
                    <Image src={master.photo_url} alt={master.name} width={56} height={56} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <User className="w-6 h-6 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm truncate">{master.name}</p>
                  {master.speciality && <p className="text-xs text-muted-foreground">{master.speciality}</p>}
                  {master.phone && <p className="text-xs text-muted-foreground">{master.phone}</p>}
                </div>
              </div>

              {master.bio && (
                <p className="text-xs text-muted-foreground line-clamp-2">{master.bio}</p>
              )}

              <div className="flex items-center justify-between">
                {master.is_active
                  ? <Badge variant="secondary" className="text-green-600 bg-green-50">Активен</Badge>
                  : <Badge variant="secondary">Скрыт</Badge>
                }
                <div className="flex items-center gap-1">
                  <button onClick={() => toggleActive(master)} className="p-1.5 rounded-lg hover:bg-muted transition-colors" title={master.is_active ? 'Скрыть' : 'Активировать'}>
                    {master.is_active
                      ? <ToggleRight className="w-4 h-4 text-green-500" />
                      : <ToggleLeft className="w-4 h-4 text-muted-foreground" />
                    }
                  </button>
                  <button onClick={() => openSchedule(master)} className="p-1.5 rounded-lg hover:bg-muted transition-colors" title="Расписание">
                    <CalendarDays className="w-4 h-4 text-muted-foreground" />
                  </button>
                  <button onClick={() => openEdit(master)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                    <Pencil className="w-4 h-4 text-muted-foreground" />
                  </button>
                  <button onClick={() => setDeleteId(master.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors">
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Редактировать мастера' : 'Новый мастер'}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Имя *</label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Анна Иванова" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Специализация</label>
              <Input value={form.speciality} onChange={e => setForm(f => ({ ...f, speciality: e.target.value }))} placeholder="Мастер маникюра и педикюра" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Биография</label>
              <Input value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} placeholder="Опыт работы, сертификаты..." />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Телефон</label>
              <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+375 29 000-00-00" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Фото мастера</label>
              {form.photo_url ? (
                <div className="flex items-center gap-3">
                  <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-muted shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={form.photo_url} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setForm(f => ({ ...f, photo_url: '' }))}
                      className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                  <label className="text-sm text-primary cursor-pointer hover:underline">
                    <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoUpload} className="hidden" />
                    {uploadingPhoto ? 'Загружаем...' : 'Заменить фото'}
                  </label>
                </div>
              ) : (
                <label className="flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-muted-foreground/30 cursor-pointer hover:bg-muted/50 transition-colors">
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoUpload} className="hidden" />
                  <Upload className="w-5 h-5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {uploadingPhoto ? 'Загружаем...' : 'Загрузить фото (JPG/PNG/WebP, до 5 МБ)'}
                  </span>
                </label>
              )}
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="rounded" />
              <span className="text-sm">Активен (виден клиентам)</span>
            </label>

            {services.length > 0 && (
              <div>
                <label className="text-sm font-medium mb-2 block">Услуги мастера</label>
                <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto border rounded-lg p-2">
                  {services.map(svc => (
                    <label key={svc.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted px-1 py-0.5 rounded">
                      <input
                        type="checkbox"
                        checked={selectedServiceIds.includes(svc.id)}
                        onChange={e => {
                          setSelectedServiceIds(prev =>
                            e.target.checked ? [...prev, svc.id] : prev.filter(id => id !== svc.id)
                          )
                        }}
                        className="rounded"
                      />
                      <span className="text-sm">{svc.name}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Если не выбрана ни одна услуга — мастер показывается для всех
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Отмена</Button>
            <Button onClick={handleSave} disabled={saving || !form.name}>
              {saving ? 'Сохраняем...' : 'Сохранить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Удалить мастера?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Профиль мастера будет удалён. История записей сохранится.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Отмена</Button>
            <Button variant="destructive" onClick={() => deleteId && handleDelete(deleteId)}>Удалить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule dialog */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Расписание — {scheduleMasterName}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            {schedule.map((day, i) => (
              <div key={day.day_of_week} className="flex items-center gap-3">
                <label className="flex items-center gap-2 w-16 shrink-0 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={day.is_working}
                    onChange={e => setSchedule(prev => prev.map((d, j) => j === i ? { ...d, is_working: e.target.checked } : d))}
                    className="rounded"
                  />
                  <span className="text-sm font-medium">{DAY_NAMES[day.day_of_week]}</span>
                </label>
                {day.is_working ? (
                  <>
                    <input
                      type="time"
                      value={day.start_time}
                      onChange={e => setSchedule(prev => prev.map((d, j) => j === i ? { ...d, start_time: e.target.value } : d))}
                      className="flex-1 border rounded-lg px-2 py-1 text-sm bg-background"
                    />
                    <span className="text-muted-foreground text-sm">—</span>
                    <input
                      type="time"
                      value={day.end_time}
                      onChange={e => setSchedule(prev => prev.map((d, j) => j === i ? { ...d, end_time: e.target.value } : d))}
                      className="flex-1 border rounded-lg px-2 py-1 text-sm bg-background"
                    />
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">Выходной</span>
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleOpen(false)}>Отмена</Button>
            <Button onClick={handleSaveSchedule} disabled={savingSchedule}>
              {savingSchedule ? 'Сохраняем...' : 'Сохранить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

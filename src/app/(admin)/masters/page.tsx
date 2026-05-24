'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, User, ToggleLeft, ToggleRight } from 'lucide-react'
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
  const [isLoading, setIsLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  async function loadMasters() {
    const res = await fetch('/api/admin/masters')
    const { data } = await res.json()
    setMasters(data ?? [])
    setIsLoading(false)
  }

  useEffect(() => { loadMasters() }, [])

  function openCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  function openEdit(m: MasterItem) {
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
              <label className="text-sm font-medium mb-1.5 block">URL фото</label>
              <Input value={form.photo_url} onChange={e => setForm(f => ({ ...f, photo_url: e.target.value }))} placeholder="https://..." />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="rounded" />
              <span className="text-sm">Активен (виден клиентам)</span>
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
    </div>
  )
}

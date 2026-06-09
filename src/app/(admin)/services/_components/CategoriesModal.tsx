'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, ChevronUp, ChevronDown, Check, X, Pencil, Tag } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

type Category = {
  id: string
  name: string
  sort_order: number
}

export function CategoriesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(false)
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [moving, setMoving] = useState(false)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/admin/categories')
    if (res.ok) {
      const { data } = await res.json()
      setCategories((data ?? []) as Category[])
    }
    setLoading(false)
  }

  useEffect(() => {
    if (open) load()
  }, [open])

  async function handleAdd() {
    const name = newName.trim()
    if (!name) return
    setAdding(true)
    const res = await fetch('/api/admin/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (res.ok) {
      setNewName('')
      await load()
    }
    setAdding(false)
  }

  async function handleRename(id: string) {
    const name = editName.trim()
    if (!name) return
    setSavingId(id)
    const res = await fetch(`/api/admin/categories/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (res.ok) {
      setEditingId(null)
      await load()
    }
    setSavingId(null)
  }

  async function handleDelete(id: string) {
    await fetch(`/api/admin/categories/${id}`, { method: 'DELETE' })
    setDeleteId(null)
    await load()
  }

  async function handleMove(id: string, direction: 'up' | 'down') {
    const idx = categories.findIndex(c => c.id === id)
    if (direction === 'up' && idx === 0) return
    if (direction === 'down' && idx === categories.length - 1) return
    setMoving(true)

    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    const newOrder = [...categories]
    ;[newOrder[idx], newOrder[targetIdx]] = [newOrder[targetIdx], newOrder[idx]]

    // Save new index-based sort_orders for both moved items
    const moved = [newOrder[idx], newOrder[targetIdx]]
    const positions = [idx, targetIdx]
    await Promise.all(
      moved.map((cat, i) =>
        fetch(`/api/admin/categories/${cat.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sort_order: positions[i] }),
        })
      )
    )
    await load()
    setMoving(false)
  }

  const deletingName = deleteId ? (categories.find(c => c.id === deleteId)?.name ?? '') : ''

  return (
    <>
      <Dialog open={open} onOpenChange={v => !v && onClose()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Категории услуг</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-1.5 py-1 min-h-[60px]">
            {loading ? (
              <div className="text-[13px] py-6 text-center" style={{ color: 'var(--text-muted)' }}>
                Загрузка...
              </div>
            ) : categories.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6">
                <Tag className="w-7 h-7" style={{ color: 'var(--text-muted)' }} strokeWidth={1.5} />
                <p className="text-[13px] text-center" style={{ color: 'var(--text-muted)' }}>
                  Категорий пока нет. Добавьте первую.
                </p>
              </div>
            ) : (
              categories.map((cat, idx) => (
                <div
                  key={cat.id}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
                  style={{ background: 'var(--card-sunken)' }}
                >
                  {/* Reorder arrows */}
                  <div className="flex flex-col shrink-0" style={{ gap: 1 }}>
                    <button
                      onClick={() => handleMove(cat.id, 'up')}
                      disabled={idx === 0 || moving}
                      className="w-5 h-5 flex items-center justify-center rounded transition-opacity"
                      style={{ color: 'var(--ink-2)', opacity: idx === 0 ? 0.2 : 0.5 }}
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleMove(cat.id, 'down')}
                      disabled={idx === categories.length - 1 || moving}
                      className="w-5 h-5 flex items-center justify-center rounded transition-opacity"
                      style={{ color: 'var(--ink-2)', opacity: idx === categories.length - 1 ? 0.2 : 0.5 }}
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {editingId === cat.id ? (
                    <div className="flex-1 flex items-center gap-1.5 min-w-0">
                      <Input
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleRename(cat.id)
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                        className="h-8 text-[13px] flex-1 min-w-0"
                        autoFocus
                      />
                      <button
                        onClick={() => handleRename(cat.id)}
                        disabled={savingId === cat.id || !editName.trim()}
                        className="w-7 h-7 flex items-center justify-center rounded-lg shrink-0"
                        style={{ background: 'var(--sage-deep)', color: 'white' }}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg shrink-0"
                        style={{ background: 'var(--card)', color: 'var(--ink-2)', border: '1px solid var(--line)' }}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="flex-1 text-[13px] font-medium min-w-0 truncate" style={{ color: 'var(--ink)' }}>
                        {cat.name}
                      </span>
                      <button
                        onClick={() => { setEditingId(cat.id); setEditName(cat.name) }}
                        className="sera-btn-icon shrink-0"
                        style={{ color: 'var(--ink-2)', borderColor: 'var(--line)' }}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteId(cat.id)}
                        className="sera-btn-icon shrink-0"
                        style={{ color: 'var(--error)', borderColor: 'transparent' }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Add new category */}
          <div className="flex gap-2 pt-2 border-t" style={{ borderColor: 'var(--line)' }}>
            <Input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder="Название новой категории"
              className="flex-1"
            />
            <button
              onClick={handleAdd}
              disabled={adding || !newName.trim()}
              className="sera-btn sera-btn--sera sera-btn--sm inline-flex items-center gap-1.5 shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Добавить
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Удалить категорию?</DialogTitle>
          </DialogHeader>
          <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
            Категория <strong style={{ color: 'var(--ink)' }}>«{deletingName}»</strong> будет удалена.
            Услуги этой категории останутся, но окажутся без категории — вы сможете назначить им другую.
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
    </>
  )
}

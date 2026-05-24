'use client'

import { useEffect, useState } from 'react'
import { Bot, Plus, Trash2, ToggleLeft, ToggleRight, Save } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

type AiSettings = {
  admin_name: string
  tone_of_voice: 'friendly' | 'formal' | 'playful'
  custom_instructions: string | null
  faq_enabled: boolean
  booking_enabled: boolean
  max_messages_day: number
  model: string
  language: string
}

type FaqItem = {
  id: string
  question: string
  answer: string
  is_active: boolean
}

const DEFAULT_SETTINGS: AiSettings = {
  admin_name: 'Администратор',
  tone_of_voice: 'friendly',
  custom_instructions: '',
  faq_enabled: true,
  booking_enabled: true,
  max_messages_day: 20,
  model: 'gpt-4o-mini',
  language: 'ru',
}

export default function AiSettingsPage() {
  const [settings, setSettings] = useState<AiSettings>(DEFAULT_SETTINGS)
  const [faq, setFaq] = useState<FaqItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [newQ, setNewQ] = useState('')
  const [newA, setNewA] = useState('')
  const [addingFaq, setAddingFaq] = useState(false)

  async function load() {
    const [settingsRes, faqRes] = await Promise.all([
      fetch('/api/admin/ai-settings').then(r => r.json()),
      fetch('/api/admin/faq').then(r => r.json()),
    ])
    if (settingsRes.data) setSettings({ ...DEFAULT_SETTINGS, ...settingsRes.data })
    setFaq(faqRes.data ?? [])
    setIsLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const res = await fetch('/api/admin/ai-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2000) }
    setSaving(false)
  }

  async function handleAddFaq() {
    if (!newQ || !newA) return
    setAddingFaq(true)
    const res = await fetch('/api/admin/ai-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add_faq', question: newQ, answer: newA }),
    })
    if (res.ok) {
      setNewQ('')
      setNewA('')
      await load()
    }
    setAddingFaq(false)
  }

  async function handleDeleteFaq(id: string) {
    await fetch('/api/admin/ai-settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete_faq', id }) })
    setFaq(f => f.filter(item => item.id !== id))
  }

  async function handleToggleFaq(item: FaqItem) {
    await fetch('/api/admin/ai-settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'toggle_faq', id: item.id, is_active: !item.is_active }) })
    setFaq(f => f.map(i => i.id === item.id ? { ...i, is_active: !i.is_active } : i))
  }

  if (isLoading) return <div className="p-6 text-muted-foreground text-sm">Загрузка...</div>

  return (
    <div className="p-6 flex flex-col gap-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Bot className="w-6 h-6" />
        <h1 className="text-2xl font-bold">AI Настройки</h1>
      </div>

      {/* Main settings */}
      <form onSubmit={handleSave}>
        <Card className="p-6 flex flex-col gap-5">
          <h2 className="font-semibold">Личность AI-администратора</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Имя администратора</label>
              <Input value={settings.admin_name} onChange={e => setSettings(s => ({ ...s, admin_name: e.target.value }))} placeholder="Администратор" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Модель GPT</label>
              <select
                value={settings.model}
                onChange={e => setSettings(s => ({ ...s, model: e.target.value }))}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="gpt-4o-mini">GPT-4o Mini (быстрый, дешёвый)</option>
                <option value="gpt-4o">GPT-4o (умный, дороже)</option>
                <option value="gpt-4-turbo">GPT-4 Turbo</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Тон общения</label>
            <div className="flex gap-2">
              {[
                { value: 'friendly', label: 'Дружелюбный', desc: 'Тепло, как добрый друг' },
                { value: 'formal', label: 'Официальный', desc: 'Профессионально' },
                { value: 'playful', label: 'Лёгкий', desc: 'С юмором и позитивом' },
              ].map(tone => (
                <button
                  key={tone.value}
                  type="button"
                  onClick={() => setSettings(s => ({ ...s, tone_of_voice: tone.value as AiSettings['tone_of_voice'] }))}
                  className={`flex-1 p-3 rounded-xl border-2 text-left transition-colors ${settings.tone_of_voice === tone.value ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/40'}`}
                >
                  <p className="text-sm font-medium">{tone.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{tone.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Дополнительные инструкции</label>
            <textarea
              value={settings.custom_instructions ?? ''}
              onChange={e => setSettings(s => ({ ...s, custom_instructions: e.target.value }))}
              placeholder="Например: Всегда предлагай записаться на пятницу или субботу. Упоминай акцию -20% на маникюр в феврале..."
              className="w-full h-24 rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
            />
            <p className="text-xs text-muted-foreground mt-1">Эти инструкции добавляются к системному промпту AI</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Лимит сообщений в день</label>
              <Input
                type="number"
                value={settings.max_messages_day}
                onChange={e => setSettings(s => ({ ...s, max_messages_day: parseInt(e.target.value) || 20 }))}
                min={1}
                max={200}
              />
              <p className="text-xs text-muted-foreground mt-1">На одного клиента</p>
            </div>
            <div className="flex flex-col gap-3 pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={settings.booking_enabled} onChange={e => setSettings(s => ({ ...s, booking_enabled: e.target.checked }))} className="rounded" />
                <span className="text-sm">AI может создавать записи</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={settings.faq_enabled} onChange={e => setSettings(s => ({ ...s, faq_enabled: e.target.checked }))} className="rounded" />
                <span className="text-sm">AI использует FAQ</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={saving} className="gap-2 px-6">
              <Save className="w-4 h-4" />
              {saved ? 'Сохранено ✓' : saving ? 'Сохраняем...' : 'Сохранить настройки'}
            </Button>
          </div>
        </Card>
      </form>

      {/* FAQ */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold">База знаний (FAQ)</h2>
            <p className="text-xs text-muted-foreground mt-0.5">AI отвечает на вопросы из этой базы</p>
          </div>
          <Badge variant="secondary">{faq.length} вопросов</Badge>
        </div>

        {/* Add new */}
        <div className="bg-muted/40 rounded-xl p-4 mb-4 flex flex-col gap-3">
          <Input value={newQ} onChange={e => setNewQ(e.target.value)} placeholder="Вопрос: Как отменить запись?" />
          <Input value={newA} onChange={e => setNewA(e.target.value)} placeholder="Ответ: Вы можете отменить запись не менее чем за 2 часа через бота или позвонив нам." />
          <Button onClick={handleAddFaq} disabled={!newQ || !newA || addingFaq} variant="outline" className="gap-2 self-end">
            <Plus className="w-4 h-4" />
            Добавить
          </Button>
        </div>

        {faq.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">FAQ пуст. Добавьте частые вопросы клиентов.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {faq.map(item => (
              <div key={item.id} className={`flex gap-3 p-3 rounded-xl border ${!item.is_active ? 'opacity-50' : ''}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{item.question}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.answer}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => handleToggleFaq(item)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                    {item.is_active ? <ToggleRight className="w-4 h-4 text-green-500" /> : <ToggleLeft className="w-4 h-4 text-muted-foreground" />}
                  </button>
                  <button onClick={() => handleDeleteFaq(item.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors">
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

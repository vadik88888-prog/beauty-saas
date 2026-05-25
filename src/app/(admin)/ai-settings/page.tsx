'use client'

import { useEffect, useState } from 'react'
import { Bot, Plus, Trash2, ToggleLeft, ToggleRight, Save, Pencil, FileText, BookOpen, MessageSquare, Settings as SettingsIcon, X } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

type AiSettings = {
  admin_name: string
  tone_of_voice: 'friendly' | 'formal' | 'playful'
  custom_instructions: string | null
  welcome_message: string | null
  temperature: number
  faq_enabled: boolean
  booking_enabled: boolean
  max_messages_day: number
  model: string
  language: string
  knowledge_enabled: boolean
  knowledge_max_results: number
  knowledge_min_relevance: number
  knowledge_smart_search: boolean
  knowledge_context_messages: number
  knowledge_rerank: boolean
}

type FaqItem = { id: string; question: string; answer: string; is_active: boolean }
type Article = { id: string; title: string; content: string; is_active: boolean; updated_at: string }

const DEFAULT_SETTINGS: AiSettings = {
  admin_name: 'Администратор',
  tone_of_voice: 'friendly',
  custom_instructions: '',
  welcome_message: null,
  temperature: 0.7,
  faq_enabled: true,
  booking_enabled: true,
  max_messages_day: 100,
  model: 'gpt-4o-mini',
  language: 'ru',
  knowledge_enabled: true,
  knowledge_max_results: 3,
  knowledge_min_relevance: 30,
  knowledge_smart_search: false,
  knowledge_context_messages: 3,
  knowledge_rerank: true,
}

type Tab = 'agent' | 'prompt' | 'knowledge' | 'faq'

export default function AiSettingsPage() {
  const [tab, setTab] = useState<Tab>('agent')
  const [settings, setSettings] = useState<AiSettings>(DEFAULT_SETTINGS)
  const [faq, setFaq] = useState<FaqItem[]>([])
  const [articles, setArticles] = useState<Article[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newQ, setNewQ] = useState('')
  const [newA, setNewA] = useState('')
  const [articleSearch, setArticleSearch] = useState('')
  const [editingArticle, setEditingArticle] = useState<Article | null>(null)
  const [showArticleDialog, setShowArticleDialog] = useState(false)

  async function load() {
    const [settingsRes, faqRes, articlesRes] = await Promise.all([
      fetch('/api/admin/ai-settings').then(r => r.json()),
      fetch('/api/admin/faq').then(r => r.json()),
      fetch('/api/admin/knowledge').then(r => r.json()),
    ])
    if (settingsRes.data) setSettings({ ...DEFAULT_SETTINGS, ...settingsRes.data })
    setFaq(faqRes.data ?? [])
    setArticles(articlesRes.data ?? [])
    setIsLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleSaveSettings() {
    setSaving(true)
    const res = await fetch('/api/admin/ai-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
    if (res.ok) toast.success('Настройки сохранены')
    else toast.error('Ошибка сохранения')
    setSaving(false)
  }

  async function handleAddFaq() {
    if (!newQ || !newA) return
    const res = await fetch('/api/admin/ai-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add_faq', question: newQ, answer: newA }),
    })
    if (res.ok) { setNewQ(''); setNewA(''); await load() }
  }

  async function handleDeleteFaq(id: string) {
    await fetch('/api/admin/ai-settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete_faq', id }) })
    setFaq(f => f.filter(i => i.id !== id))
  }

  async function handleToggleFaq(item: FaqItem) {
    await fetch('/api/admin/ai-settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'toggle_faq', id: item.id, is_active: !item.is_active }) })
    setFaq(f => f.map(i => i.id === item.id ? { ...i, is_active: !i.is_active } : i))
  }

  function openNewArticle() {
    setEditingArticle({ id: '', title: '', content: '', is_active: true, updated_at: '' })
    setShowArticleDialog(true)
  }

  async function handleSaveArticle() {
    if (!editingArticle || !editingArticle.title.trim() || !editingArticle.content.trim()) return
    const isNew = !editingArticle.id
    const url = isNew ? '/api/admin/knowledge' : `/api/admin/knowledge/${editingArticle.id}`
    const method = isNew ? 'POST' : 'PATCH'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: editingArticle.title.trim(),
        content: editingArticle.content.trim(),
        is_active: editingArticle.is_active,
      }),
    })
    if (res.ok) {
      toast.success(isNew ? 'Статья добавлена' : 'Статья обновлена')
      setShowArticleDialog(false)
      setEditingArticle(null)
      await load()
    } else {
      toast.error('Ошибка сохранения')
    }
  }

  async function handleDeleteArticle(id: string) {
    await fetch(`/api/admin/knowledge/${id}`, { method: 'DELETE' })
    setArticles(a => a.filter(x => x.id !== id))
    toast.success('Статья удалена')
  }

  async function handleToggleArticle(a: Article) {
    await fetch(`/api/admin/knowledge/${a.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !a.is_active }),
    })
    setArticles(prev => prev.map(x => x.id === a.id ? { ...x, is_active: !x.is_active } : x))
  }

  const filteredArticles = articles.filter(a =>
    a.title.toLowerCase().includes(articleSearch.toLowerCase()) ||
    a.content.toLowerCase().includes(articleSearch.toLowerCase())
  )

  if (isLoading) return <div className="p-6 text-muted-foreground text-sm">Загрузка...</div>

  const TABS: Array<{ key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { key: 'agent', label: 'Агент', icon: SettingsIcon },
    { key: 'prompt', label: 'Главный промпт', icon: FileText },
    { key: 'knowledge', label: 'База знаний', icon: BookOpen },
    { key: 'faq', label: 'FAQ', icon: MessageSquare },
  ]

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5 max-w-4xl">
      <div className="flex items-center gap-3">
        <Bot className="w-6 h-6" />
        <h1 className="text-xl md:text-2xl font-bold">AI Настройки</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b overflow-x-auto">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                tab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'agent' && (
        <Card className="p-5 md:p-6 flex flex-col gap-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Имя администратора</label>
              <Input value={settings.admin_name} onChange={e => setSettings(s => ({ ...s, admin_name: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Модель</label>
              <select
                value={settings.model}
                onChange={e => setSettings(s => ({ ...s, model: e.target.value }))}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="gpt-4o-mini">GPT-4o Mini (быстрый, дешёвый)</option>
                <option value="gpt-4o">GPT-4o (умный)</option>
                <option value="gpt-4-turbo">GPT-4 Turbo</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">
              Приветственное сообщение
              <span className="text-xs text-muted-foreground ml-2">(показывается первым в чате)</span>
            </label>
            <textarea
              value={settings.welcome_message ?? ''}
              onChange={e => setSettings(s => ({ ...s, welcome_message: e.target.value }))}
              placeholder="Привет! Чем могу помочь? 😊"
              maxLength={2000}
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Тон общения</label>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'friendly', label: 'Дружелюбный' },
                { value: 'formal', label: 'Официальный' },
                { value: 'playful', label: 'Лёгкий' },
              ].map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setSettings(s => ({ ...s, tone_of_voice: t.value as AiSettings['tone_of_voice'] }))}
                  className={`flex-1 min-w-[120px] p-2.5 rounded-xl border-2 text-sm transition-colors ${settings.tone_of_voice === t.value ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/40'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Температура (креативность)</label>
              <span className="text-sm font-mono text-primary">{settings.temperature.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={settings.temperature}
              onChange={e => setSettings(s => ({ ...s, temperature: parseFloat(e.target.value) }))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>0 — точные ответы</span>
              <span>0.7 — баланс</span>
              <span>1.0 — креативные</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Лимит сообщений в день</label>
              <Input
                type="number"
                value={settings.max_messages_day}
                onChange={e => setSettings(s => ({ ...s, max_messages_day: parseInt(e.target.value) || 100 }))}
                min={1}
                max={500}
              />
            </div>
            <div className="flex flex-col gap-2 pt-1">
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
            <Button onClick={handleSaveSettings} disabled={saving} className="gap-2 px-6">
              <Save className="w-4 h-4" />
              {saving ? 'Сохраняем...' : 'Сохранить'}
            </Button>
          </div>
        </Card>
      )}

      {tab === 'prompt' && (
        <Card className="p-5 md:p-6 flex flex-col gap-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold">Главный промпт</h2>
              <span className="text-xs text-muted-foreground">
                {(settings.custom_instructions ?? '').length} / 20000
              </span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Эти инструкции добавляются в конец системного промпта. Опишите специфику салона, политики обслуживания, дополнительные правила. Не нужно прописывать команды AI — они уже есть в базе.
            </p>
            <textarea
              value={settings.custom_instructions ?? ''}
              onChange={e => setSettings(s => ({ ...s, custom_instructions: e.target.value }))}
              maxLength={20000}
              rows={20}
              placeholder="Например:&#10;Мы специализируемся на anti-age косметологии. Не рекомендуй массаж лица без консультации.&#10;Перед посещением напомни клиенту прийти без макияжа.&#10;Стоимость указана за процедуру с одной зоной, дополнительные зоны оплачиваются отдельно."
              className="w-full min-h-[500px] rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSaveSettings} disabled={saving} className="gap-2 px-6">
              <Save className="w-4 h-4" />
              {saving ? 'Сохраняем...' : 'Сохранить промпт'}
            </Button>
          </div>
        </Card>
      )}

      {tab === 'knowledge' && (
        <>
          {/* Knowledge base settings */}
          <Card className="p-5 md:p-6 flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Настройки поиска</h2>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={settings.knowledge_enabled} onChange={e => setSettings(s => ({ ...s, knowledge_enabled: e.target.checked }))} className="rounded" />
                <span className="text-sm">Включить базу знаний</span>
              </label>
            </div>

            <div className={settings.knowledge_enabled ? '' : 'opacity-50 pointer-events-none'}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium">Максимум результатов</label>
                    <span className="text-sm font-mono text-primary">{settings.knowledge_max_results}</span>
                  </div>
                  <input
                    type="range" min={1} max={10} step={1}
                    value={settings.knowledge_max_results}
                    onChange={e => setSettings(s => ({ ...s, knowledge_max_results: parseInt(e.target.value) }))}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Больше = разнообразнее, но дороже по токенам</p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium">Минимальный % совпадений</label>
                    <span className="text-sm font-mono text-primary">{settings.knowledge_min_relevance}%</span>
                  </div>
                  <input
                    type="range" min={0} max={100} step={5}
                    value={settings.knowledge_min_relevance}
                    onChange={e => setSettings(s => ({ ...s, knowledge_min_relevance: parseInt(e.target.value) }))}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Низкий = гибкие ответы, высокий = точные</p>
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={settings.knowledge_smart_search} onChange={e => setSettings(s => ({ ...s, knowledge_smart_search: e.target.checked }))} className="rounded" />
                  <span className="text-sm">Умный поиск (учитывать контекст предыдущих сообщений)</span>
                </label>

                {settings.knowledge_smart_search && (
                  <div className="pl-6">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-sm">Сообщений для контекста</label>
                      <span className="text-sm font-mono text-primary">{settings.knowledge_context_messages}</span>
                    </div>
                    <input
                      type="range" min={1} max={10} step={1}
                      value={settings.knowledge_context_messages}
                      onChange={e => setSettings(s => ({ ...s, knowledge_context_messages: parseInt(e.target.value) }))}
                      className="w-full"
                    />
                  </div>
                )}

                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={settings.knowledge_rerank} onChange={e => setSettings(s => ({ ...s, knowledge_rerank: e.target.checked }))} className="rounded" />
                  <span className="text-sm">Переоценка результатов по релевантности</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleSaveSettings} disabled={saving} size="sm" className="gap-2">
                <Save className="w-4 h-4" />
                {saving ? 'Сохраняем...' : 'Сохранить настройки'}
              </Button>
            </div>
          </Card>

          {/* Articles list */}
          <Card className="p-5 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold">Статьи</h2>
                <p className="text-xs text-muted-foreground mt-0.5">AI использует их для ответов через search_knowledge</p>
              </div>
              <Badge variant="secondary">{articles.length}</Badge>
            </div>

            <div className="flex items-center gap-2 mb-4">
              <Input
                placeholder="Поиск по статьям..."
                value={articleSearch}
                onChange={e => setArticleSearch(e.target.value)}
                className="flex-1"
              />
              <Button onClick={openNewArticle} className="gap-2">
                <Plus className="w-4 h-4" />
                Добавить
              </Button>
            </div>

            {filteredArticles.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                {articles.length === 0 ? 'База знаний пуста. Добавьте первую статью.' : 'Ничего не найдено'}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {filteredArticles.map(a => (
                  <div key={a.id} className={`flex gap-3 p-3 rounded-xl border ${!a.is_active ? 'opacity-50' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">{a.title}</p>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.content}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => handleToggleArticle(a)} className="p-1.5 rounded-lg hover:bg-muted">
                        {a.is_active ? <ToggleRight className="w-4 h-4 text-green-500" /> : <ToggleLeft className="w-4 h-4 text-muted-foreground" />}
                      </button>
                      <button onClick={() => { setEditingArticle(a); setShowArticleDialog(true) }} className="p-1.5 rounded-lg hover:bg-muted">
                        <Pencil className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <button onClick={() => handleDeleteArticle(a.id)} className="p-1.5 rounded-lg hover:bg-destructive/10">
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      {tab === 'faq' && (
        <Card className="p-5 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold">FAQ (быстрые ответы)</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Короткие Q&A для частых вопросов</p>
            </div>
            <Badge variant="secondary">{faq.length}</Badge>
          </div>

          <div className="bg-muted/40 rounded-xl p-4 mb-4 flex flex-col gap-3">
            <Input value={newQ} onChange={e => setNewQ(e.target.value)} placeholder="Вопрос: Как отменить запись?" />
            <Input value={newA} onChange={e => setNewA(e.target.value)} placeholder="Ответ: Не менее чем за 2 часа через бота." />
            <Button onClick={handleAddFaq} disabled={!newQ || !newA} variant="outline" className="gap-2 self-end">
              <Plus className="w-4 h-4" />
              Добавить
            </Button>
          </div>

          {faq.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">FAQ пуст.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {faq.map(item => (
                <div key={item.id} className={`flex gap-3 p-3 rounded-xl border ${!item.is_active ? 'opacity-50' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{item.question}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.answer}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => handleToggleFaq(item)} className="p-1.5 rounded-lg hover:bg-muted">
                      {item.is_active ? <ToggleRight className="w-4 h-4 text-green-500" /> : <ToggleLeft className="w-4 h-4 text-muted-foreground" />}
                    </button>
                    <button onClick={() => handleDeleteFaq(item.id)} className="p-1.5 rounded-lg hover:bg-destructive/10">
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Article edit dialog */}
      {showArticleDialog && editingArticle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowArticleDialog(false)} />
          <div className="relative bg-background rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 md:p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-lg">{editingArticle.id ? 'Редактировать статью' : 'Новая статья'}</h2>
              <button onClick={() => setShowArticleDialog(false)} className="p-1 rounded-lg hover:bg-muted">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Название</label>
                <Input
                  value={editingArticle.title}
                  onChange={e => setEditingArticle({ ...editingArticle, title: e.target.value })}
                  placeholder="Например: Уход после мезотерапии"
                  maxLength={300}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Контент</label>
                <textarea
                  value={editingArticle.content}
                  onChange={e => setEditingArticle({ ...editingArticle, content: e.target.value })}
                  placeholder="Подробное описание процедуры, противопоказания, рекомендации..."
                  maxLength={50000}
                  rows={15}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
                />
                <p className="text-xs text-muted-foreground mt-1">{editingArticle.content.length} / 50000</p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingArticle.is_active}
                  onChange={e => setEditingArticle({ ...editingArticle, is_active: e.target.checked })}
                  className="rounded"
                />
                <span className="text-sm">Активна (AI использует эту статью)</span>
              </label>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <Button variant="outline" onClick={() => setShowArticleDialog(false)}>Отмена</Button>
              <Button onClick={handleSaveArticle} disabled={!editingArticle.title.trim() || !editingArticle.content.trim()}>
                Сохранить
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

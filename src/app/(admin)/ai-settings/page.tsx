'use client'

import { useEffect, useState } from 'react'
import {
  Sparkles, Plus, Trash2, Save, Pencil, FileText, BookOpen, MessageSquare,
  User as UserIcon, Target, ChevronDown, X, Search, TrendingUp, UserCheck, CalendarCheck,
  Heart, AlertCircle, Clock, Star, Mic,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/shared/PageHeader'
import { GradientCard } from '@/components/shared/GradientCard'
import { AiActivityDot } from '@/components/shared/AiActivityDot'
import { EmptyState } from '@/components/shared/EmptyState'

type AiGoalKey = 'more_bookings' | 'less_no_show' | 'upsell' | 'returning'

type AiSettings = {
  admin_name: string
  tone_of_voice: 'friendly' | 'formal' | 'playful'
  custom_instructions: string | null
  welcome_message: string | null
  temperature: number
  faq_enabled: boolean
  booking_enabled: boolean
  max_messages_day: number
  min_cancel_hours: number
  model: string
  language: string
  ai_goals: AiGoalKey[]
  knowledge_enabled: boolean
  knowledge_max_results: number
  knowledge_min_relevance: number
  knowledge_smart_search: boolean
  knowledge_context_messages: number
  knowledge_rerank: boolean
  send_24h_reminder: boolean
  send_post_visit_feedback: boolean
  voice_enabled: boolean
}

type FaqItem = { id: string; question: string; answer: string; is_active: boolean }
type Article = { id: string; title: string; content: string; is_active: boolean; updated_at: string }

const DEFAULT_SETTINGS: AiSettings = {
  admin_name: 'SERA',
  tone_of_voice: 'friendly',
  custom_instructions: '',
  welcome_message: null,
  temperature: 0.7,
  faq_enabled: true,
  booking_enabled: true,
  max_messages_day: 100,
  min_cancel_hours: 1,
  model: 'gpt-4o-mini',
  language: 'ru',
  ai_goals: [],
  knowledge_enabled: true,
  knowledge_max_results: 3,
  knowledge_min_relevance: 30,
  knowledge_smart_search: false,
  knowledge_context_messages: 3,
  knowledge_rerank: true,
  send_24h_reminder: true,
  send_post_visit_feedback: true,
  voice_enabled: true,
}

const TONES: Array<{ key: 'friendly' | 'formal' | 'playful'; label: string; description: string; sample: string }> = [
  {
    key: 'friendly',
    label: 'Дружелюбный',
    description: 'Тёплое и заботливое общение',
    sample: 'Привет! Помогу подобрать удобное время — на какую услугу записать? ✨',
  },
  {
    key: 'formal',
    label: 'Официальный',
    description: 'Сдержанно и профессионально',
    sample: 'Добрый день. Подскажите, пожалуйста, на какую услугу вы хотели бы записаться?',
  },
  {
    key: 'playful',
    label: 'Лёгкий',
    description: 'С юмором и непринуждённо',
    sample: 'Хей! Готова устроить вам красоту — что выбираем? 💅',
  },
]

const GOALS: Array<{ key: AiGoalKey; label: string; description: string; icon: typeof Target }> = [
  { key: 'more_bookings', label: 'Больше записей', description: 'Мягко подводить интерес к записи', icon: CalendarCheck },
  { key: 'less_no_show', label: 'Меньше no-show', description: 'Напоминать подтвердить запись', icon: AlertCircle },
  { key: 'upsell', label: 'Допуслуги', description: 'Предлагать дополняющие процедуры', icon: TrendingUp },
  { key: 'returning', label: 'Возвращать клиентов', description: 'Тепло встречать повторных', icon: Heart },
]

type Tab = 'profile' | 'knowledge' | 'faq'

export default function AiSettingsPage() {
  const [tab, setTab] = useState<Tab>('profile')
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
  const [advancedOpen, setAdvancedOpen] = useState(false)

  async function load() {
    const [settingsRes, faqRes, articlesRes] = await Promise.all([
      fetch('/api/admin/ai-settings').then(r => r.json()),
      fetch('/api/admin/faq').then(r => r.json()),
      fetch('/api/admin/knowledge').then(r => r.json()),
    ])
    if (settingsRes.data) {
      setSettings({
        ...DEFAULT_SETTINGS,
        ...settingsRes.data,
        ai_goals: Array.isArray(settingsRes.data.ai_goals) ? settingsRes.data.ai_goals : [],
      })
    }
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

  function toggleGoal(key: AiGoalKey) {
    setSettings(s => ({
      ...s,
      ai_goals: s.ai_goals.includes(key)
        ? s.ai_goals.filter(g => g !== key)
        : [...s.ai_goals, key],
    }))
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

  const aiInitial = settings.admin_name.charAt(0).toUpperCase()
  const activeTone = TONES.find(t => t.key === settings.tone_of_voice) ?? TONES[0]

  return (
    <div className="p-5 md:p-8 max-w-4xl mx-auto flex flex-col gap-6">
      <PageHeader
        title="Настройки AI"
        description="Имя, характер и знания вашей AI-сотрудницы"
        actions={
          <button
            onClick={handleSaveSettings}
            disabled={saving}
            className="px-4 py-2 rounded-xl bg-foreground text-background text-[13px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50 inline-flex items-center gap-2"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Сохраняем...' : 'Сохранить'}
          </button>
        }
      />

      {/* AI Profile Hero */}
      <GradientCard className="flex items-start gap-4">
        <div className="relative shrink-0">
          <div className="w-14 h-14 rounded-2xl bg-ai flex items-center justify-center text-white font-semibold text-xl">
            {aiInitial}
          </div>
          <AiActivityDot className="absolute -bottom-1 -right-1 bg-background rounded-full p-0.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-h1 text-ai-foreground">{settings.admin_name}</p>
          <p className="text-[13px] text-ai-foreground/80 mt-0.5">AI-администратор · стиль «{activeTone.label.toLowerCase()}»</p>
          {settings.ai_goals.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {settings.ai_goals.map(g => {
                const goal = GOALS.find(x => x.key === g)
                if (!goal) return null
                return (
                  <span key={g} className="ai-pill">
                    <goal.icon className="w-2.5 h-2.5" strokeWidth={2.2} />
                    {goal.label}
                  </span>
                )
              })}
            </div>
          )}
        </div>
      </GradientCard>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="w-full">
        <TabsList className="bg-surface-sunken">
          <TabsTrigger value="profile">
            <UserIcon className="w-3.5 h-3.5 mr-1.5" />
            Профиль
          </TabsTrigger>
          <TabsTrigger value="knowledge">
            <BookOpen className="w-3.5 h-3.5 mr-1.5" />
            Знания
          </TabsTrigger>
          <TabsTrigger value="faq">
            <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
            FAQ
          </TabsTrigger>
        </TabsList>

        {/* ──── PROFILE TAB ──── */}
        <TabsContent value="profile" className="flex flex-col gap-5 mt-5">
          {/* Identity */}
          <section className="card-elevated p-5 md:p-6">
            <h2 className="text-h2 mb-4">Личность</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[12px] font-medium text-muted-foreground mb-1.5 block">Имя AI</label>
                <Input
                  value={settings.admin_name}
                  onChange={e => setSettings(s => ({ ...s, admin_name: e.target.value }))}
                  placeholder="SERA"
                  maxLength={100}
                />
              </div>
            </div>

            <div className="mt-5">
              <label className="text-[12px] font-medium text-muted-foreground mb-1.5 block">
                Приветственное сообщение
                <span className="text-muted-foreground/60 ml-1">— первое, что услышит клиент</span>
              </label>
              <textarea
                value={settings.welcome_message ?? ''}
                onChange={e => setSettings(s => ({ ...s, welcome_message: e.target.value }))}
                placeholder="Привет! Помогу выбрать услугу и записать на удобное время."
                maxLength={2000}
                rows={3}
                className="w-full rounded-xl border border-border bg-surface-sunken px-3 py-2.5 text-[14px] resize-none focus:border-ai-border outline-none transition-colors"
              />
            </div>
          </section>

          {/* Tone */}
          <section className="card-elevated p-5 md:p-6">
            <h2 className="text-h2">Стиль общения</h2>
            <p className="text-[12px] text-muted-foreground mt-1 mb-4">Как SERA разговаривает с клиентами</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {TONES.map(t => {
                const active = settings.tone_of_voice === t.key
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setSettings(s => ({ ...s, tone_of_voice: t.key }))}
                    className={cn(
                      'text-left p-4 rounded-2xl border transition-colors',
                      active
                        ? 'bg-ai-soft border-ai-border ring-2 ring-ai/30'
                        : 'bg-surface-elevated border-border hover:bg-surface-sunken'
                    )}
                  >
                    <p className={cn('font-semibold text-[14px]', active ? 'text-ai-foreground' : 'text-foreground')}>
                      {t.label}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{t.description}</p>
                    <p className={cn(
                      'text-[12px] mt-3 italic leading-snug',
                      active ? 'text-ai-foreground/80' : 'text-muted-foreground'
                    )}>
                      «{t.sample}»
                    </p>
                  </button>
                )
              })}
            </div>
          </section>

          {/* Goals */}
          <section className="card-elevated p-5 md:p-6">
            <h2 className="text-h2">Цели AI</h2>
            <p className="text-[12px] text-muted-foreground mt-1 mb-4">
              На чём фокусироваться. Влияет на стиль ответов — деликатно, без давления.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {GOALS.map(g => {
                const active = settings.ai_goals.includes(g.key)
                const Icon = g.icon
                return (
                  <button
                    key={g.key}
                    type="button"
                    onClick={() => toggleGoal(g.key)}
                    className={cn(
                      'flex items-start gap-3 text-left p-4 rounded-2xl border transition-colors',
                      active
                        ? 'bg-ai-soft border-ai-border'
                        : 'bg-surface-elevated border-border hover:bg-surface-sunken'
                    )}
                  >
                    <div className={cn(
                      'w-9 h-9 rounded-xl flex items-center justify-center shrink-0',
                      active ? 'bg-ai text-white' : 'bg-surface-sunken text-muted-foreground'
                    )}>
                      <Icon className="w-4 h-4" strokeWidth={1.8} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={cn('font-semibold text-[13px]', active ? 'text-ai-foreground' : 'text-foreground')}>
                        {g.label}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{g.description}</p>
                    </div>
                    <div className={cn(
                      'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5',
                      active ? 'bg-ai border-ai' : 'border-border'
                    )}>
                      {active && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                  </button>
                )
              })}
            </div>
          </section>

          {/* Capabilities */}
          <section className="card-elevated p-5 md:p-6">
            <h2 className="text-h2 mb-4">Что AI умеет</h2>
            <div className="flex flex-col gap-3">
              <CapabilityRow
                icon={CalendarCheck}
                label="Создавать записи"
                description="AI бронирует слоты после подтверждения клиента"
                checked={settings.booking_enabled}
                onChange={v => setSettings(s => ({ ...s, booking_enabled: v }))}
              />
              <CapabilityRow
                icon={MessageSquare}
                label="Использовать FAQ"
                description="AI отвечает на частые вопросы из вкладки FAQ"
                checked={settings.faq_enabled}
                onChange={v => setSettings(s => ({ ...s, faq_enabled: v }))}
              />
              <CapabilityRow
                icon={BookOpen}
                label="Использовать базу знаний"
                description="AI ищет ответы в статьях, которые вы загрузили"
                checked={settings.knowledge_enabled}
                onChange={v => setSettings(s => ({ ...s, knowledge_enabled: v }))}
              />
              <CapabilityRow
                icon={Clock}
                label="Напоминать о записи за день"
                description="Бот пришлёт клиенту напоминание с кнопкой «Открыть мои записи» примерно за 24 часа"
                checked={settings.send_24h_reminder}
                onChange={v => setSettings(s => ({ ...s, send_24h_reminder: v }))}
              />
              <CapabilityRow
                icon={Star}
                label="Спрашивать оценку после визита"
                description="Через несколько часов после завершения визита бот пришлёт опрос «Как прошло? 1–5 ⭐»"
                checked={settings.send_post_visit_feedback}
                onChange={v => setSettings(s => ({ ...s, send_post_visit_feedback: v }))}
              />
              <CapabilityRow
                icon={Mic}
                label="Понимать голосовые"
                description="Распознавать голосовые сообщения через Whisper. Стоимость ~$0.006/мин голоса"
                checked={settings.voice_enabled}
                onChange={v => setSettings(s => ({ ...s, voice_enabled: v }))}
              />
            </div>

            <div className="mt-5 pt-5 border-t border-border">
              <label className="text-[12px] font-medium text-muted-foreground block mb-2">
                Дневной лимит сообщений на клиента
                <span className="ml-2 text-foreground font-semibold">{settings.max_messages_day}</span>
              </label>
              <Slider
                min={20}
                max={500}
                step={10}
                value={[settings.max_messages_day]}
                onValueChange={(v) => setSettings(s => ({ ...s, max_messages_day: pickValue(v) }))}
              />
            </div>

            <div className="mt-5 pt-5 border-t border-border">
              <label className="text-[12px] font-medium text-muted-foreground block mb-2">
                Минимум часов до отмены/переноса
                <span className="ml-2 text-foreground font-semibold">{settings.min_cancel_hours} ч</span>
              </label>
              <Slider
                min={0}
                max={24}
                step={1}
                value={[settings.min_cancel_hours]}
                onValueChange={(v) => setSettings(s => ({ ...s, min_cancel_hours: pickValue(v) }))}
              />
              <p className="text-[11px] text-muted-foreground mt-1.5">
                За сколько часов до записи клиент может сам отменить/перенести через бота. Меньше — только через администратора
              </p>
            </div>
          </section>

          {/* Advanced */}
          <section className="card-elevated">
            <button
              onClick={() => setAdvancedOpen(v => !v)}
              className="w-full flex items-center justify-between p-5 md:p-6 hover:bg-surface-sunken transition-colors rounded-2xl"
            >
              <div className="text-left">
                <p className="text-h2">Продвинутые настройки</p>
                <p className="text-[12px] text-muted-foreground mt-0.5">Модель, креативность, параметры поиска</p>
              </div>
              <ChevronDown
                className={cn('w-4 h-4 text-muted-foreground transition-transform', advancedOpen && 'rotate-180')}
              />
            </button>

            {advancedOpen && (
              <div className="px-5 md:px-6 pb-5 md:pb-6 flex flex-col gap-5 pt-1 border-t border-border">
                <div>
                  <label className="text-[12px] font-medium text-muted-foreground mb-1.5 block">Модель OpenAI</label>
                  <select
                    value={settings.model}
                    onChange={e => setSettings(s => ({ ...s, model: e.target.value }))}
                    className="w-full h-10 rounded-xl border border-border bg-surface-sunken px-3 text-[13px]"
                  >
                    <option value="gpt-5.2">GPT-5.2 — лучший баланс (рекомендуется)</option>
                    <option value="gpt-5.5">GPT-5.5 — премиум, 1M контекст</option>
                    <option value="gpt-5.5-pro">GPT-5.5 Pro — топ, дорого</option>
                    <option value="gpt-4o">GPT-4o — старая, надёжная</option>
                    <option value="gpt-4o-mini">GPT-4o Mini — дёшево, ограниченно</option>
                    <option value="o3-mini">o3-mini — reasoning</option>
                  </select>
                </div>

                {(() => {
                  const isModern = /^(gpt-5|o1|o3|o4)/i.test(settings.model)
                  return (
                    <div className={cn(isModern && 'opacity-50 pointer-events-none')}>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-[12px] font-medium text-muted-foreground">Креативность ответов</label>
                        <span className="text-[12px] font-mono text-ai-foreground">{settings.temperature.toFixed(1)}</span>
                      </div>
                      <Slider
                        min={0}
                        max={1}
                        step={0.1}
                        value={[settings.temperature]}
                        onValueChange={(v) => setSettings(s => ({ ...s, temperature: pickValue(v) }))}
                      />
                      <div className="flex justify-between text-[10px] text-muted-foreground mt-1.5">
                        <span>точно</span>
                        <span>баланс</span>
                        <span>креативно</span>
                      </div>
                      {isModern && (
                        <p className="text-[11px] text-warning mt-2">
                          ⚠ Модели GPT-5.x / o1 / o3 не поддерживают настройку креативности — они сами выбирают оптимальную. Параметр актуален только для GPT-4o и старее.
                        </p>
                      )}
                    </div>
                  )
                })()}

                <div className="pt-3 border-t border-border">
                  <p className="text-[12px] font-semibold text-foreground mb-3">Поиск в базе знаний</p>
                  <div className="flex flex-col gap-4">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-[12px] text-muted-foreground">Макс. результатов</label>
                        <span className="text-[12px] font-mono text-ai-foreground">{settings.knowledge_max_results}</span>
                      </div>
                      <Slider
                        min={1} max={10} step={1}
                        value={[settings.knowledge_max_results]}
                        onValueChange={(v) => setSettings(s => ({ ...s, knowledge_max_results: pickValue(v) }))}
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-[12px] text-muted-foreground">Минимум совпадений</label>
                        <span className="text-[12px] font-mono text-ai-foreground">{settings.knowledge_min_relevance}%</span>
                      </div>
                      <Slider
                        min={0} max={100} step={5}
                        value={[settings.knowledge_min_relevance]}
                        onValueChange={(v) => setSettings(s => ({ ...s, knowledge_min_relevance: pickValue(v) }))}
                      />
                    </div>
                    <CapabilityRow
                      icon={Search}
                      label="Умный поиск"
                      description="Учитывать контекст последних сообщений"
                      checked={settings.knowledge_smart_search}
                      onChange={v => setSettings(s => ({ ...s, knowledge_smart_search: v }))}
                    />
                    <CapabilityRow
                      icon={UserCheck}
                      label="Переоценка релевантности"
                      description="Дополнительная фильтрация результатов"
                      checked={settings.knowledge_rerank}
                      onChange={v => setSettings(s => ({ ...s, knowledge_rerank: v }))}
                    />
                  </div>
                </div>
              </div>
            )}
          </section>
        </TabsContent>

        {/* ──── KNOWLEDGE TAB ──── */}
        <TabsContent value="knowledge" className="flex flex-col gap-5 mt-5">
          {/* Salon-specific instructions */}
          <section className="card-elevated p-5 md:p-6">
            <h2 className="text-h2">Особенности вашего салона</h2>
            <p className="text-[12px] text-muted-foreground mt-1 mb-4">
              Что SERA должна знать. Эти инструкции добавляются к её базовым правилам.
              Не нужно прописывать команды AI — только специфику салона.
            </p>
            <textarea
              value={settings.custom_instructions ?? ''}
              onChange={e => setSettings(s => ({ ...s, custom_instructions: e.target.value }))}
              maxLength={20000}
              rows={14}
              placeholder={`Например:
• Мы специализируемся на anti-age косметологии
• Перед мезотерапией клиент должен прийти без макияжа
• Цены указаны за одну зону, доп. зоны оплачиваются отдельно
• По пятницам у нас работает только один мастер до 17:00`}
              className="w-full rounded-xl border border-border bg-surface-sunken px-3 py-2.5 text-[13px] leading-relaxed resize-y focus:border-ai-border outline-none transition-colors min-h-[260px]"
            />
            <p className="text-[11px] text-muted-foreground mt-1.5 text-right">
              {(settings.custom_instructions ?? '').length} / 20000
            </p>
          </section>

          {/* Articles */}
          <section className="card-elevated p-5 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-h2">Статьи базы знаний</h2>
                <p className="text-[12px] text-muted-foreground mt-0.5">
                  Детальные ответы о процедурах, уходе, противопоказаниях. AI ищет их при ответе на сложные вопросы.
                </p>
              </div>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {articles.length}
              </span>
            </div>

            <div className="flex items-center gap-2 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Найти статью..."
                  value={articleSearch}
                  onChange={e => setArticleSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <button
                onClick={openNewArticle}
                className="px-4 h-10 rounded-xl bg-foreground text-background text-[13px] font-medium hover:opacity-90 transition-opacity inline-flex items-center gap-2 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                Добавить
              </button>
            </div>

            {filteredArticles.length === 0 ? (
              <EmptyState
                icon={BookOpen}
                title={articles.length === 0 ? 'База знаний пуста' : 'Ничего не найдено'}
                description={articles.length === 0 ? 'Добавьте статью, чтобы AI отвечала точнее на вопросы клиентов' : undefined}
              />
            ) : (
              <div className="flex flex-col gap-2">
                {filteredArticles.map(a => (
                  <div
                    key={a.id}
                    className={cn(
                      'flex gap-3 p-3 rounded-xl border bg-surface-elevated',
                      !a.is_active && 'opacity-50'
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-foreground">{a.title}</p>
                      <p className="text-[12px] text-muted-foreground mt-1 line-clamp-2">{a.content}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Switch
                        checked={a.is_active}
                        onCheckedChange={() => handleToggleArticle(a)}
                      />
                      <button
                        onClick={() => { setEditingArticle(a); setShowArticleDialog(true) }}
                        className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteArticle(a.id)}
                        className="p-1.5 rounded-lg hover:bg-destructive-soft text-destructive"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </TabsContent>

        {/* ──── FAQ TAB ──── */}
        <TabsContent value="faq" className="flex flex-col gap-5 mt-5">
          <section className="card-elevated p-5 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-h2">Быстрые вопросы и ответы</h2>
                <p className="text-[12px] text-muted-foreground mt-0.5">
                  Короткие Q&A для типичных вопросов. AI отвечает по ним мгновенно.
                </p>
              </div>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {faq.length}
              </span>
            </div>

            <div className="bg-surface-sunken rounded-xl p-4 mb-4 flex flex-col gap-2.5 border border-border">
              <Input value={newQ} onChange={e => setNewQ(e.target.value)} placeholder="Вопрос: Как отменить запись?" />
              <Input value={newA} onChange={e => setNewA(e.target.value)} placeholder="Ответ: Не менее чем за 2 часа через бота." />
              <button
                onClick={handleAddFaq}
                disabled={!newQ || !newA}
                className="self-end px-4 h-9 rounded-xl bg-foreground text-background text-[13px] font-medium hover:opacity-90 transition-opacity inline-flex items-center gap-2 disabled:opacity-40"
              >
                <Plus className="w-3.5 h-3.5" />
                Добавить
              </button>
            </div>

            {faq.length === 0 ? (
              <EmptyState
                icon={MessageSquare}
                title="FAQ пустой"
                description="Добавьте частый вопрос — AI будет на него быстро отвечать"
              />
            ) : (
              <div className="flex flex-col gap-2">
                {faq.map(item => (
                  <div
                    key={item.id}
                    className={cn(
                      'flex gap-3 p-3 rounded-xl border bg-surface-elevated',
                      !item.is_active && 'opacity-50'
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-foreground">{item.question}</p>
                      <p className="text-[12px] text-muted-foreground mt-0.5 line-clamp-2">{item.answer}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Switch
                        checked={item.is_active}
                        onCheckedChange={() => handleToggleFaq(item)}
                      />
                      <button
                        onClick={() => handleDeleteFaq(item.id)}
                        className="p-1.5 rounded-lg hover:bg-destructive-soft text-destructive"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </TabsContent>
      </Tabs>

      {/* Article edit dialog */}
      {showArticleDialog && editingArticle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => setShowArticleDialog(false)} />
          <div className="relative bg-surface-elevated rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 md:p-6 border border-border" style={{ boxShadow: 'var(--shadow-md)' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-h1">{editingArticle.id ? 'Редактировать статью' : 'Новая статья'}</h2>
              <button onClick={() => setShowArticleDialog(false)} className="p-1.5 rounded-lg hover:bg-muted">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <label className="text-[12px] font-medium text-muted-foreground mb-1.5 block">Название</label>
                <Input
                  value={editingArticle.title}
                  onChange={e => setEditingArticle({ ...editingArticle, title: e.target.value })}
                  placeholder="Например: Уход после мезотерапии"
                  maxLength={300}
                />
              </div>
              <div>
                <label className="text-[12px] font-medium text-muted-foreground mb-1.5 block">Содержание</label>
                <textarea
                  value={editingArticle.content}
                  onChange={e => setEditingArticle({ ...editingArticle, content: e.target.value })}
                  placeholder="Подробное описание процедуры, противопоказания, рекомендации..."
                  maxLength={50000}
                  rows={15}
                  className="w-full rounded-xl border border-border bg-surface-sunken px-3 py-2.5 text-[13px] resize-y focus:border-ai-border outline-none transition-colors"
                />
                <p className="text-[11px] text-muted-foreground mt-1 text-right">{editingArticle.content.length} / 50000</p>
              </div>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <Switch
                  checked={editingArticle.is_active}
                  onCheckedChange={(v) => setEditingArticle({ ...editingArticle, is_active: v })}
                />
                <span className="text-[13px] text-foreground">Активна — AI использует эту статью</span>
              </label>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowArticleDialog(false)}
                className="px-4 h-10 rounded-xl bg-muted text-foreground text-[13px] font-medium hover:bg-surface-sunken transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={handleSaveArticle}
                disabled={!editingArticle.title.trim() || !editingArticle.content.trim()}
                className="px-4 h-10 rounded-xl bg-foreground text-background text-[13px] font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CapabilityRow({
  icon: Icon, label, description, checked, onChange,
}: {
  icon: typeof Target
  label: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-9 h-9 rounded-xl bg-surface-sunken flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-foreground" strokeWidth={1.8} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-foreground">{label}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} className="shrink-0 mt-0.5" />
    </div>
  )
}

function pickValue(v: number | readonly number[]): number {
  return Array.isArray(v) ? v[0] : (v as number)
}

void Sparkles
void FileText

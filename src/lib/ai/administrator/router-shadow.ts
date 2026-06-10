import OpenAI from 'openai'
import { createAdminClient } from '@/lib/supabase/admin'
import type { LLMMessage } from './types'

// SHADOW-роутер (план: docs/ROUTER_SHADOW_PLAN.md).
// Классифицирует входящее сообщение клиента в один из 7 маршрутов и пишет
// предсказание в router_shadow_log. На ответ клиенту НЕ влияет: вызывается
// fire-and-forget из runAdministrator, результат никуда не передаётся.
// Любая ошибка — console.error, наружу не пробрасывается.

const ROUTES = ['BOOK', 'RESCHEDULE', 'CANCEL', 'FAQ', 'CLARIFY', 'HANDOFF', 'SOCIAL'] as const
type ShadowRoute = typeof ROUTES[number]

const CLASSIFIER_MODEL = 'gpt-4o-mini'
const HISTORY_MESSAGES = 6
const HISTORY_SNIPPET_LEN = 200
const ASSISTANT_MSG_LOG_LEN = 300

const CLASSIFIER_SYSTEM_PROMPT = `Ты — роутер сообщений клиентов салона красоты. Твоя единственная задача —
отнести ВХОДЯЩЕЕ СООБЩЕНИЕ клиента к одному из 7 маршрутов. Ты НЕ отвечаешь
клиенту. Ты возвращаешь строго JSON.

# МАРШРУТЫ (выбери ровно один)

BOOK — клиент хочет СОЗДАТЬ НОВУЮ запись или движется к ней:
«хочу записаться», «есть время на пятницу?», «запишите на маникюр»,
«а к Анне можно?», «сколько стоит и когда можно прийти?» (вопрос цены
вместе с намерением прийти = BOOK, не FAQ).

RESCHEDULE — клиент хочет ПЕРЕНЕСТИ существующую запись на другое время:
«можно перенести?», «не успеваю к 14:00, давайте позже». Ключевое: запись
уже есть, меняется только время. Если клиент отменяет И сразу просит новое
время — это RESCHEDULE.

CANCEL — клиент хочет ОТМЕНИТЬ существующую запись без новой:
«отмените запись», «не приду», «отменяюсь».

FAQ — вопрос об информации БЕЗ намерения записаться прямо сейчас:
адрес, парковка, часы работы, оплата, цены («сколько стоит маникюр?» без
«хочу записаться»), что входит в процедуру, как подготовиться,
противопоказания в общем виде, есть ли акции.

CLARIFY — сообщение непонятно, обрывочно или вне всех категорий, нужен
уточняющий вопрос: «ну это», «а?», одиночное слово без контекста,
бессвязный набор слов, сообщение не про салон вообще.

HANDOFF — нужен живой человек:
(а) клиент прямо просит человека/администратора/менеджера;
(б) ЛИЧНЫЙ медицинский контекст: «у меня сыпь/аллергия/беременна/принимаю
лекарства/после операции» — даже если внутри есть вопрос о записи;
(в) жалоба, претензия, конфликт, агрессия, угрозы;
(г) выраженная фрустрация («ничего не работает», «вы бесполезны»).
Медицина и жалоба ВСЕГДА перевешивают остальные маршруты.

SOCIAL — чистая социальная реплика без задачи:
«привет», «спасибо!», «хорошего дня», «👍», «ок», поздравление.
Если в приветствии есть задача («привет, хочу записаться») — это задача,
не SOCIAL.

# ПРАВИЛО АКТИВНОГО СЦЕНАРИЯ (важнейшее)

Тебе передан флаг active_scenario и краткая история диалога.
Если active_scenario = true И сообщение выглядит как ОТВЕТ НА ВОПРОС
ассистента внутри текущего сценария — маршрут ОСТАЁТСЯ маршрутом сценария,
это НЕ новый маршрут:
- ассистент спросил «на какое число?» → клиент: «на пятницу» → BOOK;
- ассистент показал слоты → клиент: «давайте 14:30» → BOOK;
- ассистент спросил «подтверждаете отмену?» → клиент: «да» → CANCEL.
Короткие реплики «да», «нет», «давай», «вторая», «к любому» при активном
сценарии — это продолжение сценария, НЕ SOCIAL и НЕ CLARIFY.
Новый маршрут при активном сценарии выбирай только если клиент ЯВНО сменил
тему («а кстати, какой у вас адрес?» → FAQ).

# ПРИОРИТЕТ ПРИ КОНФЛИКТЕ

HANDOFF (медицина/жалоба/просьба человека) > RESCHEDULE/CANCEL > BOOK > FAQ
> SOCIAL > CLARIFY. CLARIFY — только когда ничего не подошло.

# ФОРМАТ ОТВЕТА

Верни строго JSON без пояснений, без markdown, без лишнего текста:
{"route": "BOOK", "confidence": 0.93}

route — одно из: BOOK, RESCHEDULE, CANCEL, FAQ, CLARIFY, HANDOFF, SOCIAL.
confidence — число 0.00–1.00, твоя уверенность в выборе.`

function buildClassifierInput(
  message: string,
  history: LLMMessage[],
  hadActiveScenario: boolean
): string {
  // Последние N реплик user/assistant, контент-строки, обрезка до snippet len
  const recent = history
    .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-HISTORY_MESSAGES)
    .map(m => {
      const text = (m.content as string).replace(/\s+/g, ' ').trim()
      const snippet = text.length > HISTORY_SNIPPET_LEN ? text.slice(0, HISTORY_SNIPPET_LEN) + '…' : text
      return `  ${m.role}: ${snippet}`
    })

  return [
    `active_scenario: ${hadActiveScenario}`,
    `recent_history:`,
    ...(recent.length > 0 ? recent : ['  (пусто — начало диалога)']),
    `message: ${message}`,
  ].join('\n')
}

export async function classifyShadow(opts: {
  tenantId: string
  conversationId: string
  clientId: string
  message: string
  history: LLMMessage[]
  hadActiveScenario: boolean
}): Promise<void> {
  const { tenantId, conversationId, clientId, message, history, hadActiveScenario } = opts

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    const response = await openai.chat.completions.create({
      model: CLASSIFIER_MODEL,
      temperature: 0,
      max_tokens: 60,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: CLASSIFIER_SYSTEM_PROMPT },
        { role: 'user', content: buildClassifierInput(message, history, hadActiveScenario) },
      ],
    })

    const raw = response.choices[0]?.message?.content ?? ''
    const parsed = JSON.parse(raw) as { route?: string; confidence?: number }

    const route = (parsed.route ?? '').toUpperCase() as ShadowRoute
    if (!ROUTES.includes(route)) {
      console.error('[router-shadow] invalid route from model:', raw.slice(0, 120))
      return
    }
    const confidence = Math.min(1, Math.max(0, Number(parsed.confidence) || 0))

    // Последняя реплика ассистента перед сообщением клиента — контекст для разметки
    const lastAssistant = [...history]
      .reverse()
      .find(m => m.role === 'assistant' && typeof m.content === 'string' && (m.content as string).trim().length > 0)
    const lastAssistantMessage = lastAssistant
      ? (() => {
          const text = (lastAssistant.content as string).replace(/\s+/g, ' ').trim()
          return text.length > ASSISTANT_MSG_LOG_LEN ? text.slice(0, ASSISTANT_MSG_LOG_LEN) + '…' : text
        })()
      : null

    const supabase = createAdminClient()
    const { error } = await supabase.from('router_shadow_log').insert({
      tenant_id: tenantId,
      conversation_id: conversationId || null,
      client_id: clientId || null,
      message,
      predicted_route: route,
      confidence,
      had_active_scenario: hadActiveScenario,
      last_assistant_message: lastAssistantMessage,
    })
    if (error) {
      console.error('[router-shadow] insert failed:', error.message)
    }
  } catch (err) {
    console.error('[router-shadow] classification failed:', err)
  }
}

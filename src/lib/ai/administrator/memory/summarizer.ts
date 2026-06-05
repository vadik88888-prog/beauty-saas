import { callLLM } from '@/lib/ai/openai-client'
import { ConversationStore, SUMMARY_THRESHOLD, KEEP_RECENT_MESSAGES } from './conversation-store'

// Пересчёт summary длинного диалога. Берёт все messages кроме последних KEEP_RECENT_MESSAGES,
// гонит через gpt-4o-mini, получает ~200-словный summary, сохраняет в conversation.
// Fire-and-forget: вызывается после save, не блокирует ответ клиенту.
export async function maybeRecomputeSummary(
  store: ConversationStore,
  conversationId: string,
  totalMessageCount: number,
  summaryUpToCount: number
): Promise<void> {
  // Пересжимаем только если выросли на 10+ messages с прошлого пересчёта
  if (totalMessageCount < SUMMARY_THRESHOLD) return
  if (totalMessageCount - summaryUpToCount < 10) return

  const messagesToSummarize = Math.max(0, totalMessageCount - KEEP_RECENT_MESSAGES)
  if (messagesToSummarize <= 0) return

  const oldMessages = await store.loadOldMessages(conversationId, messagesToSummarize)
  if (oldMessages.length === 0) return

  const transcript = oldMessages
    .map(m => {
      const role = m.role === 'user' ? 'Клиент' : m.role === 'assistant' ? 'SERA' : m.role
      const content = m.content.length > 400 ? m.content.slice(0, 400) + '…' : m.content
      return `${role}: ${content}`
    })
    .join('\n')

  const systemPrompt = `Ты сжимаешь долгий диалог между клиентом салона и AI-администратором SERA для сохранения контекста. Напиши сводку до 200 слов, на русском, в третьем лице. Покрой:
- О чём клиент спрашивал и какой результат получил
- Какие услуги/мастера обсуждались (точные названия)
- Какие записи созданы/отменены/перенесены (даты, время, мастер)
- Личный контекст клиента (предпочтения, ограничения, упомянутые проблемы)
- Незавершённые задачи

НЕ повторяй точные реплики дословно. НЕ добавляй вводных типа "В этом диалоге…". Начни сразу с фактов.`

  try {
    const res = await callLLM({
      system: systemPrompt,
      messages: [{ role: 'user', content: transcript }],
      model: 'gpt-4o-mini',
      temperature: 0.3,
    })

    const summary = res.content.trim()
    if (summary.length === 0) return

    await store.updateSummary(conversationId, summary, messagesToSummarize)
    console.log(`[summarizer] saved summary for ${conversationId}: ${summary.length} chars, up to msg ${messagesToSummarize}`)
  } catch (err) {
    console.error('[summarizer] failed:', err)
  }
}

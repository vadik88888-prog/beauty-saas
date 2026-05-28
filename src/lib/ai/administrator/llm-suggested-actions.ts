import { callLLM } from '@/lib/ai/openai-client'
import type { SuggestedAction, ConversationState } from './types'

/**
 * Generate up to 3 quick-reply buttons for the user based on AI's reply.
 * Uses an extra (cheap) LLM call instead of regex heuristics — works for any phrasing.
 * Cost: ~$0.00003 per message (gpt-4o-mini, ~300 input + 100 output tokens).
 *
 * Returns [] if LLM fails or sees no obvious actions — caller may apply own fallback.
 */
export async function buildLlmSuggestedActions(opts: {
  reply: string
  conversationState: ConversationState
  isFirstMessage: boolean
  isHandedOff: boolean
  bookingJustCreated: boolean
}): Promise<SuggestedAction[]> {
  const { reply, conversationState, isHandedOff, bookingJustCreated } = opts

  // Hard cases — don't even call LLM
  if (isHandedOff) return []  // admin handles
  if (bookingJustCreated) {
    return [
      { label: 'Мои записи', message: 'Покажи мои записи' },
      { label: 'Записаться ещё', message: 'Хочу записаться ещё на одну услугу' },
    ]
  }

  const system = `You are a UI assistant. The user is chatting with a beauty-salon AI.
Given the AI's last reply, generate up to 3 short quick-reply buttons that the USER is
most likely to want to press next.

Rules:
- Each button: max 22 chars, in Russian
- Be concrete to what AI asked or said — if AI asked for a date, suggest "Завтра", "На неделе"
- If AI is waiting for confirmation, suggest "✓ Да" / "Изменить"
- If AI gave info but no question — suggest "Записаться" / "Цены" / "Контакты" if relevant
- DO NOT suggest "Спасибо" or "Понятно" type — useless buttons
- If no obvious next action — return empty array

Return ONLY valid JSON array, no markdown, no explanation:
[{"label":"...","message":"..."}, ...]

The "message" is what gets sent if user clicks (longer than label is OK).

Conversation state: ${conversationState}`

  try {
    const result = await callLLM({
      system,
      messages: [
        { role: 'user', content: `AI reply:\n"${reply.slice(0, 500)}"\n\nGenerate buttons JSON.` },
      ],
      model: 'gpt-4o-mini',
      temperature: 0.3,
      maxTokens: 200,
    })

    const content = result.content.trim()
    // Extract JSON (model may wrap in code fences)
    const jsonMatch = content.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return []

    const parsed = JSON.parse(jsonMatch[0]) as unknown
    if (!Array.isArray(parsed)) return []

    const actions: SuggestedAction[] = []
    for (const item of parsed) {
      if (typeof item !== 'object' || !item) continue
      const obj = item as { label?: unknown; message?: unknown }
      if (typeof obj.label !== 'string' || typeof obj.message !== 'string') continue
      const label = obj.label.trim().slice(0, 30)
      const message = obj.message.trim().slice(0, 200)
      if (!label || !message) continue
      actions.push({ label, message })
      if (actions.length >= 3) break
    }
    return actions
  } catch (err) {
    console.warn('[suggested-actions] LLM generation failed:', err)
    return []
  }
}

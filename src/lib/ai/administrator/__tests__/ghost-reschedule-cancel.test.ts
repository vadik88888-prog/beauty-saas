/**
 * Ghost-reschedule / ghost-cancel detector — two-direction proof
 *
 * Run:  npx tsx src/lib/ai/administrator/__tests__/ghost-reschedule-cancel.test.ts
 *
 * Proves:
 *   Direction 1 — ghost claim (no real DB write) → detected + blocked
 *   Direction 2 — legitimate confirmation after real write → NOT blocked
 *
 * No Supabase / Next.js / LLM deps — imports only ResponseValidator (no runtime deps).
 */

// ─── import validator ──────────────────────────────────────────────────────
import { ResponseValidator } from '../validators/response-validator'

const validator = new ResponseValidator()

// ─── helpers ──────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

function assert(condition: boolean, label: string, got?: unknown) {
  if (condition) {
    console.log(`  ✓ ${label}`)
    passed++
  } else {
    console.error(`  ✗ ${label}${got !== undefined ? `  (got: ${JSON.stringify(got)})` : ''}`)
    failed++
  }
}

// Mirrors finalReply selection from index.ts (lines ~580-583):
//   const finalReply = previewReply
//     ?? ((validation.isValid || hadDestructiveSuccess) ? llmResponse.content : sanitizedContent)
function computeFinalReply(opts: {
  previewReply: string | null
  isValid: boolean
  hadDestructiveSuccess: boolean
  llmContent: string
  sanitizedContent: string | undefined
}): string {
  const { previewReply, isValid, hadDestructiveSuccess, llmContent, sanitizedContent } = opts
  return previewReply ?? ((isValid || hadDestructiveSuccess) ? llmContent : (sanitizedContent ?? llmContent))
}

// Mirrors hadDestructiveSuccess check from index.ts (lines ~504-508):
function computeHadDestructiveSuccess(toolResults: { success: boolean; data?: unknown }[]): boolean {
  return toolResults.some(r => {
    if (!r.success || !r.data) return false
    const d = r.data as Record<string, unknown>
    return d.appointment_id !== undefined || d.cancelled === true || d.action === 'handoff'
  })
}

// ─── DIRECTION 1: ghost claims are detected and blocked ───────────────────

console.log('\nНАПРАВЛЕНИЕ 1 — ложные заявления без реального действия: детектируются и блокируются')

// 1a: ghost reschedule — LLM says "перенесла" but no real write
console.log('\n  [1a] "Перенесла вашу запись на 15:00."')
{
  const text = 'Перенесла вашу запись на 15:00. Ждём вас!'
  const result = validator.validate(text, { toolResults: [] })
  assert(result.violations.includes('GHOST_RESCHEDULE_CLAIM'), 'GHOST_RESCHEDULE_CLAIM обнаружен', result.violations)
  assert(!result.isValid, 'isValid = false')
  assert(result.sanitizedContent === 'Чтобы перенести запись, подтвердите новое время.', 'sanitizedContent — верный fallback', result.sanitizedContent)
}

// 1b: ghost reschedule — "Ваша запись перенесена"
console.log('\n  [1b] "Ваша запись перенесена на пятницу, 18:00."')
{
  const text = 'Ваша запись перенесена на пятницу, 18:00.'
  const result = validator.validate(text, { toolResults: [] })
  assert(result.violations.includes('GHOST_RESCHEDULE_CLAIM'), 'GHOST_RESCHEDULE_CLAIM обнаружен', result.violations)
}

// 1c: ghost reschedule — "перенос выполнен"
console.log('\n  [1c] "Перенос выполнен! Ждём вас в 12:00."')
{
  const text = 'Перенос выполнен! Ждём вас в 12:00.'
  const result = validator.validate(text, { toolResults: [] })
  assert(result.violations.includes('GHOST_RESCHEDULE_CLAIM'), 'GHOST_RESCHEDULE_CLAIM обнаружен', result.violations)
}

// 1d: ghost cancel — LLM says "отменила" but no real write
console.log('\n  [1d] "Отменила вашу запись."')
{
  const text = 'Отменила вашу запись. Если захотите — запишемся снова.'
  const result = validator.validate(text, { toolResults: [] })
  assert(result.violations.includes('GHOST_CANCEL_CLAIM'), 'GHOST_CANCEL_CLAIM обнаружен', result.violations)
  assert(!result.isValid, 'isValid = false')
  assert(result.sanitizedContent === 'Чтобы отменить запись, подтвердите действие.', 'sanitizedContent — верный fallback', result.sanitizedContent)
}

// 1e: ghost cancel — "запись отменена"
console.log('\n  [1e] "Ваша запись успешно отменена."')
{
  const text = 'Ваша запись успешно отменена.'
  const result = validator.validate(text, { toolResults: [] })
  assert(result.violations.includes('GHOST_CANCEL_CLAIM'), 'GHOST_CANCEL_CLAIM обнаружен', result.violations)
}

// 1f: ghost cancel — "отмена выполнена"
console.log('\n  [1f] "Отмена выполнена, запись удалена из расписания."')
{
  const text = 'Отмена выполнена, запись удалена из расписания.'
  const result = validator.validate(text, { toolResults: [] })
  assert(result.violations.includes('GHOST_CANCEL_CLAIM'), 'GHOST_CANCEL_CLAIM обнаружен', result.violations)
}

// ─── false-positive guard: questions and offers must NOT fire ──────────────

console.log('\n  [FP] Ложные срабатывания на вопросы/предложения недопустимы')
{
  const offers = [
    'Хотите, чтобы я перенесла запись?',
    'Перенести на другой день?',
    'Отменить запись?',
    'Хотите, чтобы я отменила?',
    'Могу перенести запись на удобное время.',
  ]
  for (const text of offers) {
    const result = validator.validate(text, { toolResults: [] })
    const hasGhost = result.violations.some(v => v === 'GHOST_RESCHEDULE_CLAIM' || v === 'GHOST_CANCEL_CLAIM')
    assert(!hasGhost, `Нет ghost-нарушения для: "${text}"`, result.violations.filter(v => v.startsWith('GHOST')))
  }
}

// ─── DIRECTION 2: legitimate actions are NOT blocked ─────────────────────

console.log('\nНАПРАВЛЕНИЕ 2 — легитимные подтверждения после реального действия: НЕ блокируются')

// 2a: real cancel — hadDestructiveSuccess=true → finalReply bypasses sanitizedContent
console.log('\n  [2a] Реальная отмена: cancelled=true в toolResults → bypass через hadDestructiveSuccess')
{
  const llmContent = 'Отменила вашу запись на маникюр. Ждём вас снова!'
  const cancelToolResult = {
    success: true,
    data: { cancelled: true, appointment_id: 'appt-uuid-123', cancelled_at: '2026-06-21T10:00:00Z' },
  }

  const result = validator.validate(llmContent, { toolResults: [cancelToolResult] })
  // Validator itself may flag GHOST_CANCEL_CLAIM — that's expected (it's text-pattern based)
  // But the bypass in index.ts ensures sanitizedContent is never used

  const hds = computeHadDestructiveSuccess([cancelToolResult])
  const finalReply = computeFinalReply({
    previewReply: null,
    isValid: result.isValid,
    hadDestructiveSuccess: hds,
    llmContent,
    sanitizedContent: result.sanitizedContent,
  })

  assert(hds, 'hadDestructiveSuccess = true (toolResult.data.cancelled=true)')
  assert(finalReply === llmContent, 'finalReply = llmContent (NOT sanitizedContent)', finalReply)
  assert(finalReply !== result.sanitizedContent, 'finalReply ≠ sanitizedContent — клиент получит правильный текст')
}

// 2b: cancel via handoff — action=handoff → hadDestructiveSuccess=true → bypass
console.log('\n  [2b] Отмена через handoff: action=handoff → bypass')
{
  const llmContent = 'Передала вашу просьбу администратору — он свяжется в течение нескольких минут.'
  const handoffToolResult = {
    success: true,
    data: { action: 'handoff', message: 'Передала просьбу.' },
  }

  const result = validator.validate(llmContent, { toolResults: [handoffToolResult] })
  const hds = computeHadDestructiveSuccess([handoffToolResult])
  const finalReply = computeFinalReply({
    previewReply: null,
    isValid: result.isValid,
    hadDestructiveSuccess: hds,
    llmContent,
    sanitizedContent: result.sanitizedContent,
  })

  assert(hds, 'hadDestructiveSuccess = true (action=handoff)')
  assert(finalReply === llmContent, 'finalReply = llmContent — handoff подтверждение доходит до клиента')
}

// 2c: reschedule (engine=new) — previewReply set → bypass validator entirely
console.log('\n  [2c] Перенос (engine=new): previewReply задан → bypass через previewReply')
{
  const llmContent = 'Перенесла вашу запись на маникюр на 15 июня в 15:00.'
  // Reschedule intent tool returns action:'reschedule_intent' — NOT a destructive success
  const rescheduleIntentToolResult = {
    success: true,
    data: {
      action: 'reschedule_intent',
      appointment_id: 'appt-uuid-456',
      old_starts_at: '2026-06-14T10:00:00Z',
      service_name: 'Маникюр',
      master_name: 'Мария',
      new_date: '2026-06-15',
      new_slot: '15:00',
    },
  }

  const result = validator.validate(llmContent, { toolResults: [rescheduleIntentToolResult] })
  const hds = computeHadDestructiveSuccess([rescheduleIntentToolResult])
  // previewReply is set by STATE D in index.ts when reschedule_intent detected
  const previewReply = '📋 Перенести запись\n«Маникюр» с Марией\n14 июня → 15 июня 15:00\n[Подтвердить] [Отмена]'

  const finalReply = computeFinalReply({
    previewReply,
    isValid: result.isValid,
    hadDestructiveSuccess: hds,
    llmContent,
    sanitizedContent: result.sanitizedContent,
  })

  // reschedule_intent data contains appointment_id → hadDestructiveSuccess=true as well.
  // Primary bypass: previewReply set by STATE D takes priority in finalReply selection.
  // Secondary bypass: hadDestructiveSuccess=true (appointment_id in data) would also bypass.
  assert(hds, 'hadDestructiveSuccess = true (reschedule_intent.data содержит appointment_id)')
  assert(finalReply === previewReply, 'finalReply = previewReply (takes priority — preview-карточка)', finalReply?.slice(0, 40))
  assert(finalReply !== result.sanitizedContent, 'sanitizedContent не используется — клиент видит preview-карточку')
}

// ─── summary ───────────────────────────────────────────────────────────────
console.log(`\nИТОГО: ${passed} ✓  /  ${failed} ✗\n`)
if (failed > 0) process.exit(1)

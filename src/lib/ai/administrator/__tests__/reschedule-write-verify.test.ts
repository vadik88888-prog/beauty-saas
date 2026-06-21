/**
 * Reschedule write-verification — 4 сценария
 *
 * Run:  npx tsx src/lib/ai/administrator/__tests__/reschedule-write-verify.test.ts
 *
 * Без Supabase / LLM. Проверяет детерминированную логику:
 *   (1) UPDATE вернул строку с НОВЫМ временем → success, "перенесла" разрешён
 *   (2) UPDATE вернул 0 строк                 → НЕ success, текста успеха нет
 *   (3) UPDATE со СТАРЫМ временем             → НЕ success (pre-guard + post-guard)
 *   (4) reschedule_intent + appointment_id    → hadDestructiveSuccess=false, ghost блокирует
 */

export {}

// ─── Инлайн логики под тест ────────────────────────────────────────────────

/** Зеркало pre-guard из rescheduleAppointment (manage-appointment.ts) */
function guardSameTime(
  newStartsAt: string,
  oldStartsAt: string
): { ok: true } | { ok: false; code: string; error: string } {
  if (new Date(newStartsAt).getTime() === new Date(oldStartsAt).getTime()) {
    return {
      ok: false,
      code: 'invalid_date',
      error: 'Новое время совпадает с текущим — укажите другую дату или время',
    }
  }
  return { ok: true }
}

/** Зеркало post-guard из rescheduleAppointment (после .update().select()) */
function verifyRescheduleResult(opts: {
  updatedRows: { starts_at: string }[] | null | undefined
  expectedStartsAt: string
}): { success: true } | { success: false; code: string; error: string } {
  const updatedRow = (opts.updatedRows ?? [])[0]

  if (!updatedRow) {
    return { success: false, code: 'not_found', error: 'Не удалось перенести: запись не найдена в базе' }
  }
  if (new Date(updatedRow.starts_at).getTime() !== new Date(opts.expectedStartsAt).getTime()) {
    return { success: false, code: 'server_error', error: 'Время записи не было обновлено в базе' }
  }
  return { success: true }
}

/** Зеркало hadDestructiveSuccess из index.ts (новая версия с исключением reschedule_intent) */
function computeHadDestructiveSuccess(toolResults: { success: boolean; data?: unknown }[]): boolean {
  return toolResults.some(r => {
    if (!r.success || !r.data) return false
    const d = r.data as Record<string, unknown>
    return (
      (d.appointment_id !== undefined && d.action !== 'reschedule_intent') ||
      d.cancelled === true ||
      d.action === 'handoff'
    )
  })
}

/** Зеркало finalReply selection из index.ts */
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

// ─── Test harness ──────────────────────────────────────────────────────────

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

const OLD_TIME = '2026-06-20T11:00:00.000Z'
const NEW_TIME = '2026-06-21T09:00:00.000Z'

// ─── СЦЕНАРИЙ 1 ──────────────────────────────────────────────────────────────
// UPDATE вернул строку с НОВЫМ временем → success, "перенесла" разрешён

console.log('\nСЦЕНАРИЙ 1 — UPDATE вернул строку с НОВЫМ временем → success')
{
  const guard = guardSameTime(NEW_TIME, OLD_TIME)
  assert(guard.ok === true, 'pre-guard: разные времена → ok=true')

  const result = verifyRescheduleResult({
    updatedRows: [{ starts_at: NEW_TIME }],
    expectedStartsAt: NEW_TIME,
  })
  assert(result.success === true, 'verifyRescheduleResult: 1 строка с новым временем → success=true', result)

  // Текст успеха разрешён: STATE E задаёт previewReply и он идёт напрямую в finalReply
  const finalReply = computeFinalReply({
    previewReply: 'Перенесла на 21 июня в 12:00 ✓',
    isValid: true,
    hadDestructiveSuccess: false,
    llmContent: 'что-то от LLM',
    sanitizedContent: undefined,
  })
  assert(finalReply === 'Перенесла на 21 июня в 12:00 ✓', 'finalReply = previewReply (STATE E success branch)')
}

// ─── СЦЕНАРИЙ 2 ──────────────────────────────────────────────────────────────
// UPDATE вернул 0 строк → НЕ success

console.log('\nСЦЕНАРИЙ 2 — UPDATE вернул 0 строк → НЕ success, текста успеха нет')
{
  const resultNull = verifyRescheduleResult({ updatedRows: null, expectedStartsAt: NEW_TIME })
  assert(resultNull.success === false, 'updatedRows=null → success=false', resultNull)
  assert(!resultNull.success && resultNull.code === 'not_found', 'code=not_found', resultNull)

  const resultEmpty = verifyRescheduleResult({ updatedRows: [], expectedStartsAt: NEW_TIME })
  assert(resultEmpty.success === false, 'updatedRows=[] → success=false', resultEmpty)
  assert(!resultEmpty.success && resultEmpty.code === 'not_found', 'code=not_found', resultEmpty)

  // STATE E не задаёт previewReply при failure → LLM отвечает, но ghost должен поймать "перенесла"
  const finalReply = computeFinalReply({
    previewReply: null,  // STATE E failure branch — нет previewReply
    isValid: false,      // ghost detector сработал
    hadDestructiveSuccess: false,
    llmContent: 'Перенесла вашу запись ✓',
    sanitizedContent: 'Это время уже занято — давайте выберем другое?',
  })
  assert(finalReply !== 'Перенесла вашу запись ✓', 'LLM "перенесла" до клиента не доходит при 0-row update')
  assert(finalReply === 'Это время уже занято — давайте выберем другое?', 'finalReply = error-сообщение из STATE E', finalReply)
}

// ─── СЦЕНАРИЙ 3 ──────────────────────────────────────────────────────────────
// UPDATE со СТАРЫМ временем → НЕ success (pre-guard блокирует до UPDATE; post-guard ловит сбой триггера)

console.log('\nСЦЕНАРИЙ 3 — СТАРОЕ время == НОВОЕ время → НЕ success (pre-guard + post-guard)')
{
  // Pre-guard: блокирует вызов UPDATE вообще
  const preGuard = guardSameTime(OLD_TIME, OLD_TIME)
  assert(preGuard.ok === false, 'pre-guard: одинаковые времена → ok=false')
  assert(!preGuard.ok && preGuard.code === 'invalid_date', 'code=invalid_date', preGuard)

  // Post-guard: DB-триггер "откатил" starts_at к старому значению — тоже NOT success
  const result = verifyRescheduleResult({
    updatedRows: [{ starts_at: OLD_TIME }],  // DB вернула старое время
    expectedStartsAt: NEW_TIME,              // мы пытались записать новое
  })
  assert(result.success === false, 'post-guard: DB вернула старое время → success=false', result)
  assert(!result.success && result.code === 'server_error', 'code=server_error', result)
}

// ─── СЦЕНАРИЙ 4 ──────────────────────────────────────────────────────────────
// reschedule_intent с appointment_id, реального write не было → ghost блокирует LLM "перенесла"

console.log('\nСЦЕНАРИЙ 4 — reschedule_intent + appointment_id, write нет → ghost ловит LLM "перенесла"')
{
  const rescheduleIntentResult = {
    success: true,
    data: {
      action: 'reschedule_intent',
      appointment_id: 'appt-uuid-123',
      old_starts_at: OLD_TIME,
      new_date: '2026-06-21',
      new_slot: '12:00',
    },
  }

  const hds = computeHadDestructiveSuccess([rescheduleIntentResult])
  assert(hds === false, 'hadDestructiveSuccess=false для reschedule_intent (appointment_id исключён)', hds)

  // Ghost detector поймал "перенесла" (isValid=false), bypass не активен (hds=false)
  const finalReply = computeFinalReply({
    previewReply: null,
    isValid: false,
    hadDestructiveSuccess: hds,
    llmContent: 'Перенесла вашу запись на 21 июня в 12:00 ✓',
    sanitizedContent: 'Чтобы перенести запись, подтвердите новое время.',
  })
  assert(
    finalReply === 'Чтобы перенести запись, подтвердите новое время.',
    'finalReply = ghost fallback, НЕ LLM-текст',
    finalReply
  )
  assert(finalReply !== 'Перенесла вашу запись на 21 июня в 12:00 ✓', 'LLM-фантом до клиента не доходит')
}

// ─── ЭКСТРА: смежные случаи не сломаны ──────────────────────────────────────

console.log('\nЭКСТРА — реальная отмена / handoff / engine=old book_appointment остаются с bypass')
{
  const cancelResult = {
    success: true,
    data: { cancelled: true, appointment_id: 'appt-uuid-456', cancelled_at: '2026-06-21T10:00:00Z' },
  }
  assert(
    computeHadDestructiveSuccess([cancelResult]) === true,
    'отмена (cancelled=true) → hadDestructiveSuccess=true'
  )

  const handoffResult = {
    success: true,
    data: { action: 'handoff', message: 'Передаю администратору' },
  }
  assert(
    computeHadDestructiveSuccess([handoffResult]) === true,
    'handoff → hadDestructiveSuccess=true'
  )

  // engine=old: book_appointment возвращает appointment_id без action='reschedule_intent'
  const bookOldResult = {
    success: true,
    data: { appointment_id: 'appt-uuid-789', service_name: 'Маникюр', starts_at: '...' },
  }
  assert(
    computeHadDestructiveSuccess([bookOldResult]) === true,
    'engine=old book_appointment (appointment_id, нет action) → hadDestructiveSuccess=true'
  )
}

// ─── Summary ────────────────────────────────────────────────────────────────
console.log(`\nИТОГО: ${passed} ✓  /  ${failed} ✗\n`)
if (failed > 0) process.exit(1)

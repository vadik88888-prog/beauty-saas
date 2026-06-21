/**
 * Router verdict gate — 5 сценариев
 *
 * Run:  npx tsx src/lib/ai/administrator/__tests__/router-verdict-gate.test.ts
 *
 * Проверяет две независимые части:
 *   A) Гейт isFirstIntentHop: когда роутер ожидается (await) vs fire-and-forget
 *   B) verdictToToolChoice: маппинг verdict → toolChoice
 *
 * Нет Supabase / Next.js / LLM — только импорт чистой функции verdictToToolChoice.
 */

import { verdictToToolChoice } from '../router-shadow'
import type { ShadowVerdict } from '../router-shadow'

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

// Инлайн гейта из index.ts (строки ~119):
//   const isFirstIntentHop = !hadActiveScenario && !awaitingFinalConfirmation
function isFirstIntentHop(opts: {
  bookingStateState: string
  awaitingFinalConfirmation: boolean
}): boolean {
  const hadActiveScenario = !['IDLE', 'BOOKING_CREATED', 'HUMAN_HANDOFF'].includes(opts.bookingStateState)
  return !hadActiveScenario && !opts.awaitingFinalConfirmation
}

// Полная логика toolChoice из index.ts (строки ~193):
//   isMedicalQuery ? force_handoff : verdictToToolChoice(routerVerdict)
function computeToolChoice(opts: {
  isMedical: boolean
  verdict: ShadowVerdict
}): 'auto' | { type: 'function'; function: { name: string } } {
  if (opts.isMedical) return { type: 'function', function: { name: 'request_human_handoff' } }
  return verdictToToolChoice(opts.verdict)
}

// ─── СЦЕНАРИЙ 1 ──────────────────────────────────────────────────────────
// Первый ход намерения "перенесите запись", confidence >= 0.85 → форс reschedule

console.log('\nСЦЕНАРИЙ 1 — первый ход "перенесите запись", confidence=0.91 → форс reschedule')
{
  const hop = isFirstIntentHop({ bookingStateState: 'IDLE', awaitingFinalConfirmation: false })
  assert(hop, 'isFirstIntentHop = true (state=IDLE, awaitingFinal=false)')

  const verdict: ShadowVerdict = { route: 'RESCHEDULE', confidence: 0.91 }
  const tc = computeToolChoice({ isMedical: false, verdict })
  assert(
    typeof tc === 'object' && tc.type === 'function' && tc.function.name === 'reschedule_appointment',
    'toolChoice = force reschedule_appointment',
    tc
  )
}

// То же для CANCEL
console.log('\n  + CANCEL confidence=0.88 → форс cancel')
{
  const verdict: ShadowVerdict = { route: 'CANCEL', confidence: 0.88 }
  const tc = computeToolChoice({ isMedical: false, verdict })
  assert(
    typeof tc === 'object' && tc.type === 'function' && tc.function.name === 'cancel_appointment',
    'toolChoice = force cancel_appointment',
    tc
  )
}

// ─── СЦЕНАРИЙ 2 ──────────────────────────────────────────────────────────
// Тот же первый ход, но awaitingFinalConfirmation=true → форса НЕТ, auto

console.log('\nСЦЕНАРИЙ 2 — awaitingFinalConfirmation=true → форса НЕТ, routerVerdict=null, auto')
{
  const hop = isFirstIntentHop({ bookingStateState: 'IDLE', awaitingFinalConfirmation: true })
  assert(!hop, 'isFirstIntentHop = false (awaitingFinalConfirmation=true)')

  // routerVerdict остаётся null (не ждали роутера — fire-and-forget)
  const verdict: ShadowVerdict = null
  const tc = computeToolChoice({ isMedical: false, verdict })
  assert(tc === 'auto', "toolChoice = 'auto' (нет вердикта)", tc)
}

// ─── СЦЕНАРИЙ 3 ──────────────────────────────────────────────────────────
// Активный сценарий (клиент уже внутри флоу) → форса НЕТ, fire-and-forget

console.log('\nСЦЕНАРИЙ 3 — активный сценарий (state=RESCHEDULING) → форса НЕТ, fire-and-forget')
{
  const hop = isFirstIntentHop({ bookingStateState: 'RESCHEDULING', awaitingFinalConfirmation: false })
  assert(!hop, 'isFirstIntentHop = false (state=RESCHEDULING → hadActiveScenario=true)')

  // Роутер не ожидается → routerVerdict=null
  const verdict: ShadowVerdict = null
  const tc = computeToolChoice({ isMedical: false, verdict })
  assert(tc === 'auto', "toolChoice = 'auto' (fire-and-forget, нет вердикта)", tc)
}

// Проверяем все активные состояния
{
  const activeStates = ['COLLECTING_BOOKING_DETAILS', 'RESCHEDULING', 'CANCELLING', 'FAQ', 'CONSULTING', 'UPSELL']
  for (const state of activeStates) {
    const hop = isFirstIntentHop({ bookingStateState: state, awaitingFinalConfirmation: false })
    assert(!hop, `state=${state} → isFirstIntentHop=false`)
  }
}

// ─── СЦЕНАРИЙ 4 ──────────────────────────────────────────────────────────
// Низкая confidence → auto

console.log('\nСЦЕНАРИЙ 4 — низкая confidence < 0.85 → auto')
{
  const hop = isFirstIntentHop({ bookingStateState: 'IDLE', awaitingFinalConfirmation: false })
  assert(hop, 'isFirstIntentHop = true (state=IDLE)')

  const cases: { verdict: ShadowVerdict; label: string }[] = [
    { verdict: { route: 'RESCHEDULE', confidence: 0.84 }, label: 'RESCHEDULE confidence=0.84' },
    { verdict: { route: 'RESCHEDULE', confidence: 0.70 }, label: 'RESCHEDULE confidence=0.70' },
    { verdict: { route: 'CANCEL',     confidence: 0.79 }, label: 'CANCEL confidence=0.79' },
    { verdict: { route: 'BOOK',       confidence: 0.95 }, label: 'BOOK confidence=0.95 (не форсим)' },
    { verdict: { route: 'FAQ',        confidence: 0.98 }, label: 'FAQ confidence=0.98 (не форсим)' },
    { verdict: { route: 'SOCIAL',     confidence: 0.99 }, label: 'SOCIAL (не форсим)' },
    { verdict: { route: 'CLARIFY',    confidence: 0.90 }, label: 'CLARIFY (не форсим)' },
  ]

  for (const { verdict, label } of cases) {
    const tc = computeToolChoice({ isMedical: false, verdict })
    assert(tc === 'auto', `${label} → 'auto'`, tc)
  }

  // Граничный случай: ровно 0.85 = форс
  const tcBoundary = computeToolChoice({ isMedical: false, verdict: { route: 'RESCHEDULE', confidence: 0.85 } })
  assert(
    typeof tcBoundary === 'object' && tcBoundary.function?.name === 'reschedule_appointment',
    'RESCHEDULE confidence=0.85 (граница) → форс reschedule',
    tcBoundary
  )
}

// ─── СЦЕНАРИЙ 5 ──────────────────────────────────────────────────────────
// Роутер вернул null (ошибка / невалидный JSON) → auto

console.log('\nСЦЕНАРИЙ 5 — роутер вернул null (ошибка/timeout) → auto')
{
  const tc = computeToolChoice({ isMedical: false, verdict: null })
  assert(tc === 'auto', "verdict=null → toolChoice='auto'", tc)
}

// ─── Medical override (не трогаем, убеждаемся что не сломан) ─────────────

console.log('\nMEDICAL — переопределение при любом вердикте роутера')
{
  const medicalCases: ShadowVerdict[] = [
    null,
    { route: 'RESCHEDULE', confidence: 0.95 },
    { route: 'CANCEL', confidence: 0.99 },
  ]
  for (const verdict of medicalCases) {
    const tc = computeToolChoice({ isMedical: true, verdict })
    assert(
      typeof tc === 'object' && tc.function?.name === 'request_human_handoff',
      `isMedical=true + verdict=${JSON.stringify(verdict)} → force handoff`,
      tc
    )
  }
}

// ─── summary ──────────────────────────────────────────────────────────────
console.log(`\nИТОГО: ${passed} ✓  /  ${failed} ✗\n`)
if (failed > 0) process.exit(1)

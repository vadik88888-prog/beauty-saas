/**
 * STATE E slot-clearing fix — two smoke scenarios
 *
 * Run:  npx tsx src/lib/ai/administrator/__tests__/state-e-slot-fix.test.ts
 *
 * Does NOT import Supabase / Next.js / LLM — only pure logic inlined below.
 */

export {}

// ─── inlined pure functions ────────────────────────────────────────────────

function detectConfirmation(text: string): 'yes' | 'no' | 'unclear' {
  const lower = text.toLowerCase().trim().replace(/[!.?,]+$/, '').trim()

  const hasNyet = lower === 'нет'
    || lower.startsWith('нет ') || lower.startsWith('нет,')
    || lower.includes(' нет') || lower.includes(',нет')
  if (hasNyet) return 'no'
  if (lower.includes('вряд')) return 'no'
  const NO_START = [
    'не подходит', 'не хочу', 'передумал', 'передумала',
    'другой', 'другое', 'другую', 'другая', 'другие',
    'не тот', 'не та', 'отмена', 'cancel', 'no',
  ]
  if (NO_START.some(w => lower === w || lower.startsWith(w + ' ') || lower.startsWith(w + ','))) return 'no'

  if (lower.startsWith('да')) {
    const OBJECTION = ['но ', ', но', 'однако', 'только ', 'не так', 'неверно', 'не такая', 'цена']
    if (OBJECTION.some(w => lower.includes(w))) return 'unclear'
  }

  const YES_EXACT = new Set([
    'да', 'ок', 'окей', 'хорошо', 'подходит', 'согласна', 'согласен',
    'записывай', 'верно', 'всё верно', 'все верно', 'всё правильно', 'все правильно',
    'подойдёт', 'подойдет', 'годится', 'пойдёт', 'пойдет',
    'супер', 'отлично', 'давай', 'ладно', 'конечно',
    'yes', 'ok', 'okay',
    'подтверждаю',
  ])
  if (YES_EXACT.has(lower)) return 'yes'
  if (lower.startsWith('подтверждаю')) return 'yes'
  if (['да,', 'да ', 'записывай', 'хорошо,', 'отлично,', 'супер,', 'конечно,', 'ладно,'].some(p => lower.startsWith(p))) return 'yes'

  return 'unclear'
}

type SlotEntry = { value: string; source: string }
type ShadowForm = { slot?: SlotEntry; [key: string]: unknown }
type BookingFlowState = { shadowForm?: ShadowForm; awaitingFinalConfirmation?: boolean; [key: string]: unknown }

function simulateStateE(params: {
  message: string
  bookingState: BookingFlowState
  bookResultSuccess: boolean
  bookResultFallback?: string
}): { nextShadowForm: ShadowForm | undefined; awaitingFinalConfirmation: boolean; skipPreviewThisTurn: boolean } {
  const { message, bookingState, bookResultSuccess, bookResultFallback } = params

  let clearAwaitingConfirmation = false
  let skipPreviewThisTurn = false
  let clearSlotFromForm = false
  let previewReply: string | null = null

  const confirmE = detectConfirmation(message)
  const frozenForm = bookingState.shadowForm

  const formComplete = !!(
    frozenForm?.service && frozenForm?.master && frozenForm?.date && frozenForm?.slot
  )

  if (confirmE === 'yes' && formComplete) {
    if (bookResultSuccess) {
      previewReply = 'Записала ✓'
      clearAwaitingConfirmation = true
      clearSlotFromForm = true
    } else {
      previewReply = bookResultFallback ?? 'Время занято.'
      clearAwaitingConfirmation = true
      clearSlotFromForm = true
    }
  } else if (confirmE === 'no') {
    clearAwaitingConfirmation = true
    skipPreviewThisTurn = true
    clearSlotFromForm = true
  } else {
    clearAwaitingConfirmation = true
    skipPreviewThisTurn = true
    clearSlotFromForm = true
  }

  // Simulate: nextBookingState = { ...bookingState }
  let nextShadowForm: ShadowForm | undefined = bookingState.shadowForm

  // Simulate step 12b: shadowFormToSave = shadowForm (from buildShadowForm → returns prevForm)
  // (in real code buildShadowForm('Да', prevForm) returns prevForm unchanged for simple messages)
  const shadowFormToSave = bookingState.shadowForm

  if (shadowFormToSave) {
    nextShadowForm = shadowFormToSave
  }

  // NEW fix: strip slot on failure / decline / off-topic
  if (clearSlotFromForm && nextShadowForm?.slot) {
    nextShadowForm = { ...nextShadowForm, slot: undefined }
  }

  const awaitingFinalConfirmation = clearAwaitingConfirmation ? false : true

  return { nextShadowForm, awaitingFinalConfirmation, skipPreviewThisTurn }
}

function isReadyToBook(form?: ShadowForm): boolean {
  if (!form) return false
  return !!(
    (form as { service?: { source?: string } }).service?.source === 'FACT' &&
    (form as { master?: { source?: string } }).master?.source === 'FACT' &&
    (form as { date?: { source?: string } }).date?.source === 'FACT' &&
    form.slot?.source === 'FACT'
  )
}

// ─── test runner ──────────────────────────────────────────────────────────

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

// ─── SCENARIO 1: booking failure ─────────────────────────────────────────
console.log('\nСЦЕНАРИЙ 1 — карточка → подтверждение → провал → следующий ход')

const fullForm: ShadowForm = {
  service: { id: 'svc-1', source: 'FACT' },
  master:  { id: 'mst-1', source: 'FACT' },
  date:    { value: '2026-06-25', source: 'FACT' },
  slot:    { value: '10:00', source: 'FACT' },
}

const failState: BookingFlowState = {
  shadowForm: fullForm,
  awaitingFinalConfirmation: true,
}

// Turn N: client says "Да" → booking fails
const afterFail = simulateStateE({
  message: 'Да',
  bookingState: failState,
  bookResultSuccess: false,
  bookResultFallback: 'Это время уже занято. Давайте выберем другое — вызовите get_available_slots.',
})

assert(afterFail.awaitingFinalConfirmation === false, 'awaitingFinalConfirmation сброшен в false')
assert(afterFail.nextShadowForm?.slot === undefined, 'slot удалён из shadowForm')
assert(!isReadyToBook(afterFail.nextShadowForm), 'isReadyToBook = false (карточка не повторится)')
assert(!afterFail.skipPreviewThisTurn, 'skipPreviewThisTurn не мешает STATE D (previewReply уже установлен в "занято")')

// Turn N+1: simulate STATE D with no new slot in form
const nextTurnForm = afterFail.nextShadowForm
console.log(`  → shadowForm.slot на следующем ходу: ${JSON.stringify(nextTurnForm?.slot)}`)
assert(!isReadyToBook(nextTurnForm), 'STATE D не покажет карточку на следующем ходу')

// ─── SCENARIO 2: client sends off-topic ("покажи мои записи") while preview pending ─
console.log('\nСЦЕНАРИЙ 2 — карточка показана → клиент: "покажи мои записи"')

const pendingState: BookingFlowState = {
  shadowForm: fullForm,
  awaitingFinalConfirmation: true,
}

const afterOffTopic = simulateStateE({
  message: 'покажи мои записи',
  bookingState: pendingState,
  bookResultSuccess: false, // irrelevant — form incomplete path not reached (confirmE='unclear')
})

const classify = detectConfirmation('покажи мои записи')
assert(classify === 'unclear', `detectConfirmation("покажи мои записи") = "unclear"  (got: "${classify}")`, classify)
assert(afterOffTopic.skipPreviewThisTurn === true, 'skipPreviewThisTurn=true (STATE D пропускается на этом ходу)')
assert(afterOffTopic.awaitingFinalConfirmation === false, 'awaitingFinalConfirmation сброшен')
assert(afterOffTopic.nextShadowForm?.slot === undefined, 'slot очищен из shadowForm')
assert(!isReadyToBook(afterOffTopic.nextShadowForm), 'isReadyToBook = false (карточка не повторится на следующем ходу)')

// bonus: "нет" also handled
const afterNo = simulateStateE({
  message: 'нет',
  bookingState: pendingState,
  bookResultSuccess: false,
})
assert(detectConfirmation('нет') === 'no', 'detectConfirmation("нет") = "no"')
assert(afterNo.skipPreviewThisTurn === true, '"нет": skipPreviewThisTurn=true')
assert(afterNo.nextShadowForm?.slot === undefined, '"нет": slot очищен')
assert(!isReadyToBook(afterNo.nextShadowForm), '"нет": isReadyToBook = false')

// ─── SCENARIO 3: successful booking → next turn must not re-show card ────
console.log('\nСЦЕНАРИЙ 3 — успешная запись → следующий ход с любым вводом')

const afterSuccess = simulateStateE({
  message: 'Да',
  bookingState: pendingState,
  bookResultSuccess: true,
})

assert(afterSuccess.awaitingFinalConfirmation === false, 'awaitingFinalConfirmation сброшен после успешной записи')
assert(afterSuccess.nextShadowForm?.slot === undefined, 'slot удалён из shadowForm после успешной записи')
assert(!isReadyToBook(afterSuccess.nextShadowForm), 'isReadyToBook = false (карточка не повторится на следующем ходу)')

// Simulate next turn: client says "покажите мои записи"
const nextTurnSf = afterSuccess.nextShadowForm
assert(!isReadyToBook(nextTurnSf), '"покажите мои записи" на следующем ходу: STATE D не перехватит ввод')

// ─── summary ──────────────────────────────────────────────────────────────
console.log(`\nИТОГО: ${passed} ✓  /  ${failed} ✗\n`)
if (failed > 0) process.exit(1)

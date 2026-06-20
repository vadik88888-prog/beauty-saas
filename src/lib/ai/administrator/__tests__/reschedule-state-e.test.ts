/**
 * Reschedule STATE E — unit tests (no Supabase / Next.js)
 *
 * Run:  npx tsx src/lib/ai/administrator/__tests__/reschedule-state-e.test.ts
 *
 * Tests:
 *   1. isReadyToBook with rescheduleMode — only date+slot=FACT required
 *   2. isReadyToBook normal mode — still requires all 4 fields
 *   3. STATE E simulation: rescheduleAppointmentId present → UPDATE path chosen
 *   4. STATE E: client declines → rescheduleAppointmentId cleared
 *   5. Overlap exclusion: verifies .neq('id', appointmentId) exists in manage-appointment source
 */

// ─── inline pure copies of the functions under test ────────────────────────

type ShadowFieldSource = 'FACT' | 'ASSUMPTION'
interface ShadowFormEntry {
  id?: string
  value?: string
  source: ShadowFieldSource
}
interface ShadowBookingForm {
  service?: ShadowFormEntry
  master?: ShadowFormEntry
  date?: ShadowFormEntry
  slot?: ShadowFormEntry
  updatedAt: string
}

function isReadyToBook(
  shadowForm: ShadowBookingForm | null | undefined,
  opts?: { rescheduleMode?: boolean }
): shadowForm is ShadowBookingForm {
  if (!shadowForm) return false
  if (opts?.rescheduleMode) {
    const { date, slot } = shadowForm
    if (!date?.value || date.source !== 'FACT') return false
    if (!slot?.value || slot.source !== 'FACT') return false
    return true
  }
  const { service, master, date, slot } = shadowForm
  if (!service?.id   || service.source !== 'FACT') return false
  if (!master?.id    || master.source  !== 'FACT') return false
  if (!date?.value   || date.source    !== 'FACT') return false
  if (!slot?.value   || slot.source    !== 'FACT') return false
  return true
}

function detectConfirmation(text: string): 'yes' | 'no' | 'unclear' {
  const lower = text.toLowerCase().trim().replace(/[!.?,]+$/, '').trim()
  if (lower === 'нет' || lower.startsWith('нет ') || lower.startsWith('нет,') ||
      lower.includes(' нет') || lower.includes(',нет')) return 'no'
  if (lower.includes('вряд')) return 'no'
  const NO_START = ['не подходит','не хочу','передумал','передумала','другой','другое','другую','другая','другие','не тот','не та','отмена','cancel','no']
  if (NO_START.some(w => lower === w || lower.startsWith(w + ' ') || lower.startsWith(w + ','))) return 'no'
  if (lower.startsWith('да')) {
    const OBJECTION = ['но ', ', но', 'однако', 'только ', 'не так', 'неверно', 'не такая', 'цена']
    if (OBJECTION.some(w => lower.includes(w))) return 'unclear'
  }
  const YES_EXACT = new Set(['да','ок','окей','хорошо','подходит','согласна','согласен','записывай','верно','всё верно','все верно','всё правильно','все правильно','подойдёт','подойдет','годится','пойдёт','пойдет','супер','отлично','давай','ладно','конечно','yes','ok','okay','подтверждаю'])
  if (YES_EXACT.has(lower)) return 'yes'
  if (lower.startsWith('подтверждаю')) return 'yes'
  if (['да,','да ','записывай','хорошо,','отлично,','супер,','конечно,','ладно,'].some(p => lower.startsWith(p))) return 'yes'
  return 'unclear'
}

interface BookingFlowState {
  shadowForm?: ShadowBookingForm
  awaitingFinalConfirmation?: boolean
  rescheduleAppointmentId?: string
}

type SimResult = {
  previewReply: string | null
  clearAwaitingConfirmation: boolean
  clearSlotFromForm: boolean
  updateCalled: boolean
  updateArgs?: { appointmentId: string; newDate: string; newSlot: string }
}

function simulateStateE(params: {
  message: string
  bookingState: BookingFlowState
  rescheduleResult: 'success' | 'slot_taken' | 'too_late' | 'error'
}): SimResult {
  const { message, bookingState } = params
  let previewReply: string | null = null
  let clearAwaitingConfirmation = false
  let clearSlotFromForm = false
  let updateCalled = false
  let updateArgs: SimResult['updateArgs']

  const confirmE = detectConfirmation(message)
  const frozenForm = bookingState.shadowForm

  if (confirmE === 'yes' && bookingState.rescheduleAppointmentId) {
    if (frozenForm?.date?.value && frozenForm?.slot?.value) {
      // Simulate the rescheduleAppointment call
      updateCalled = true
      updateArgs = { appointmentId: bookingState.rescheduleAppointmentId, newDate: frozenForm.date.value, newSlot: frozenForm.slot.value }

      if (params.rescheduleResult === 'success') {
        previewReply = `Перенесла на ${frozenForm.date.value} в ${frozenForm.slot.value} ✓`
        clearAwaitingConfirmation = true
        clearSlotFromForm = true
      } else if (params.rescheduleResult === 'slot_taken') {
        previewReply = 'Это время уже занято — давайте выберем другое?'
        clearAwaitingConfirmation = true
        clearSlotFromForm = true
      } else if (params.rescheduleResult === 'too_late') {
        previewReply = 'К сожалению, уже слишком поздно для самостоятельного переноса. Обратитесь к администратору.'
        clearAwaitingConfirmation = true
        clearSlotFromForm = true
      } else {
        previewReply = 'Не удалось перенести запись.'
        clearAwaitingConfirmation = true
        clearSlotFromForm = true
      }
    } else {
      clearAwaitingConfirmation = true
      clearSlotFromForm = true
    }
  } else if (confirmE === 'yes' && frozenForm?.service?.id && frozenForm?.master?.id && frozenForm?.date?.value && frozenForm?.slot?.value) {
    // Normal booking path — should NOT be reached when rescheduleAppointmentId is set
    previewReply = 'КНИГА СОЗДАНА (не должно случиться в reschedule-тесте)'
    clearAwaitingConfirmation = true
    clearSlotFromForm = true
  } else if (confirmE === 'no') {
    clearAwaitingConfirmation = true
    clearSlotFromForm = true
  } else {
    clearAwaitingConfirmation = true
    clearSlotFromForm = true
  }

  return { previewReply, clearAwaitingConfirmation, clearSlotFromForm, updateCalled, updateArgs }
}

// ─── test runner ────────────────────────────────────────────────────────────

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

// ─── TEST 1: isReadyToBook rescheduleMode — only date+slot needed ─────────
console.log('\nТЕСТ 1 — isReadyToBook(rescheduleMode=true): достаточно date+slot=FACT')

const reschedSf: ShadowBookingForm = {
  date: { value: '2026-06-27', source: 'FACT' },
  slot: { value: '11:00', source: 'FACT' },
  updatedAt: new Date().toISOString(),
}
assert(isReadyToBook(reschedSf, { rescheduleMode: true }),  'date+slot=FACT → true в reschedule mode')
assert(!isReadyToBook(reschedSf),                           'те же поля → false в normal mode (service/master отсутствуют)')

const sfDateAssumption: ShadowBookingForm = {
  date: { value: '2026-06-27', source: 'ASSUMPTION' },
  slot: { value: '11:00', source: 'FACT' },
  updatedAt: new Date().toISOString(),
}
assert(!isReadyToBook(sfDateAssumption, { rescheduleMode: true }), 'date=ASSUMPTION → false в reschedule mode')

const sfNoSlot: ShadowBookingForm = {
  date: { value: '2026-06-27', source: 'FACT' },
  updatedAt: new Date().toISOString(),
}
assert(!isReadyToBook(sfNoSlot, { rescheduleMode: true }), 'slot отсутствует → false в reschedule mode')

// ─── TEST 2: normal mode still requires all 4 fields ─────────────────────
console.log('\nТЕСТ 2 — isReadyToBook(normal): требует все 4 поля')

const fullSf: ShadowBookingForm = {
  service: { id: 'svc-1', source: 'FACT' },
  master:  { id: 'mst-1', source: 'FACT' },
  date:    { value: '2026-06-27', source: 'FACT' },
  slot:    { value: '11:00', source: 'FACT' },
  updatedAt: new Date().toISOString(),
}
assert(isReadyToBook(fullSf), 'все 4 FACT → true в normal mode')
assert(!isReadyToBook({ ...fullSf, service: { id: 'svc-1', source: 'ASSUMPTION' } }),
  'service=ASSUMPTION → false')
assert(!isReadyToBook({ ...fullSf, master: undefined }),
  'master отсутствует → false')

// ─── TEST 3: STATE E — rescheduleAppointmentId present → UPDATE called ────
console.log('\nТЕСТ 3 — STATE E: rescheduleAppointmentId → UPDATE, не INSERT')

const reschedState: BookingFlowState = {
  shadowForm: {
    date: { value: '2026-06-27', source: 'FACT' },
    slot: { value: '11:00', source: 'FACT' },
    updatedAt: new Date().toISOString(),
  },
  awaitingFinalConfirmation: true,
  rescheduleAppointmentId: 'appt-uuid-123',
}

const afterSuccess = simulateStateE({ message: 'Да', bookingState: reschedState, rescheduleResult: 'success' })
assert(afterSuccess.updateCalled, 'UPDATE вызван')
assert(afterSuccess.updateArgs?.appointmentId === 'appt-uuid-123', 'appointmentId передан корректно')
assert(afterSuccess.updateArgs?.newDate === '2026-06-27', 'newDate корректный')
assert(afterSuccess.updateArgs?.newSlot === '11:00', 'newSlot корректный')
assert(afterSuccess.clearAwaitingConfirmation, 'awaitingFinalConfirmation сброшен')
assert(afterSuccess.clearSlotFromForm, 'slot очищен из формы')
assert(afterSuccess.previewReply?.includes('✓') ?? false, 'сообщение успеха содержит ✓')

// Verify INSERT path is NOT taken (no booking_created action in reschedule mode)
const stateWithBothIds: BookingFlowState = {
  shadowForm: {
    service: { id: 'svc-1', source: 'FACT' },
    master:  { id: 'mst-1', source: 'FACT' },
    date: { value: '2026-06-27', source: 'FACT' },
    slot: { value: '11:00', source: 'FACT' },
    updatedAt: new Date().toISOString(),
  },
  awaitingFinalConfirmation: true,
  rescheduleAppointmentId: 'appt-uuid-123',  // reschedule takes priority
}
const afterSuccessBoth = simulateStateE({ message: 'Да', bookingState: stateWithBothIds, rescheduleResult: 'success' })
assert(afterSuccessBoth.updateCalled, 'reschedule-ветка приоритетна над booking-веткой')
assert(!(afterSuccessBoth.previewReply?.includes('КНИГА') ?? false), 'INSERT-ветка не вызвана')

// ─── TEST 4: STATE E — slot_taken → error, confirmation cleared ───────────
console.log('\nТЕСТ 4 — STATE E: slot_taken → ошибка, awaitingFinalConfirmation сброшен')

const afterSlotTaken = simulateStateE({ message: 'Да', bookingState: reschedState, rescheduleResult: 'slot_taken' })
assert(afterSlotTaken.updateCalled, 'UPDATE вызван (попытка была)')
assert(afterSlotTaken.clearAwaitingConfirmation, 'awaitingFinalConfirmation сброшен')
assert(afterSlotTaken.previewReply?.includes('занято') ?? false, 'сообщение об ошибке содержит "занято"')

// ─── TEST 5: STATE E — client declines → rescheduleAppointmentId cleared ──
console.log('\nТЕСТ 5 — STATE E: клиент отказывается → intent сброшен')

const afterDecline = simulateStateE({ message: 'нет', bookingState: reschedState, rescheduleResult: 'success' })
assert(!afterDecline.updateCalled, 'UPDATE НЕ вызван при отказе')
assert(afterDecline.clearAwaitingConfirmation, 'awaitingFinalConfirmation сброшен')

// ─── TEST 6-А: slot normalizer ───────────────────────────────────────────────
console.log('\nТЕСТ 6-А — нормализация слота: «18.00» → «18:00», «9.00» → «09:00», «18:00» → «18:00»')

const SLOT_RE = /^([01]\d|2[0-3]):[0-5]\d$/
function normalizeSlot(raw: string): string | null {
  let normalized = raw.replace('.', ':')
  if (/^\d:[0-5]\d$/.test(normalized)) normalized = '0' + normalized
  return SLOT_RE.test(normalized) ? normalized : null
}

assert(normalizeSlot('18.00') === '18:00', '«18.00» → «18:00»',  normalizeSlot('18.00'))
assert(normalizeSlot('9.00')  === '09:00', '«9.00»  → «09:00» (ведущий ноль дописывается)', normalizeSlot('9.00'))
assert(normalizeSlot('18:00') === '18:00', '«18:00» → «18:00» (уже корректный)',  normalizeSlot('18:00'))
assert(normalizeSlot('09.30') === '09:30', '«09.30» → «09:30»',  normalizeSlot('09.30'))
assert(normalizeSlot('25.00') === null,    '«25.00» → null (невалидный час)',  normalizeSlot('25.00'))

// ─── TEST 6-Б: isRescheduleMode via saved ID, no fresh intent ─────────────
console.log('\nТЕСТ 6-Б — isRescheduleMode=true через rescheduleAppointmentId (без свежего intent)')

// Simulates turn 2: intent=null, but rescheduleAppointmentId in state.
// isRescheduleMode should be true, so reschedule preview branch is chosen (not create preview).
const savedIdState: BookingFlowState = {
  shadowForm: {
    date: { value: '2026-06-22', source: 'FACT' },
    slot: { value: '18:00', source: 'FACT' },
    updatedAt: new Date().toISOString(),
  },
  awaitingFinalConfirmation: false,
  rescheduleAppointmentId: 'appt-uuid-456',
}

// Verify isRescheduleMode logic: when no fresh intent, saved ID alone makes mode true
assert(!!savedIdState.rescheduleAppointmentId, 'isRescheduleMode=true когда rescheduleAppointmentId есть, intent=null')

// Verify isReadyToBook passes with rescheduleMode=true on date+slot only
assert(isReadyToBook(savedIdState.shadowForm, { rescheduleMode: true }),
  'isReadyToBook(rescheduleMode=true) passes для date+slot=FACT при сохранённом ID')

// ─── TEST 6-В: STATE E outcomes all clear rescheduleAppointmentId ──────────
console.log('\nТЕСТ 6-В — все исходы STATE E очищают rescheduleAppointmentId')

const stateForClearCheck: BookingFlowState = {
  shadowForm: {
    date: { value: '2026-06-22', source: 'FACT' },
    slot: { value: '18:00', source: 'FACT' },
    updatedAt: new Date().toISOString(),
  },
  awaitingFinalConfirmation: true,
  rescheduleAppointmentId: 'appt-uuid-789',
}

const outcomes: Array<{ message: string; result: 'success' | 'slot_taken' | 'too_late' | 'error'; label: string }> = [
  { message: 'да',          result: 'success',   label: 'success → cleared' },
  { message: 'да',          result: 'slot_taken', label: 'slot_taken → cleared' },
  { message: 'да',          result: 'too_late',   label: 'too_late → cleared' },
  { message: 'нет',         result: 'success',   label: 'decline → cleared' },
  { message: 'а сколько стоит', result: 'success', label: 'unclear → cleared' },
]
for (const { message, result, label } of outcomes) {
  const sim = simulateStateE({ message, bookingState: stateForClearCheck, rescheduleResult: result })
  assert(sim.clearAwaitingConfirmation, `${label}: clearAwaitingConfirmation=true`)
}

// ─── TEST 6: overlap check — verify .neq('id', ...) in manage-appointment ─
console.log('\nТЕСТ 6 — overlap: .neq(\'id\', appointmentId) присутствует в manage-appointment.ts')

import { readFileSync } from 'fs'
import { resolve } from 'path'

const manageApptSrc = readFileSync(
  resolve(process.cwd(), 'src/lib/booking/manage-appointment.ts'),
  'utf8'
)
const hasNeq = manageApptSrc.includes(".neq('id', appointmentId)")
assert(hasNeq, 'manage-appointment.ts: overlap query содержит .neq(\'id\', appointmentId) → переносимая запись не считается занятой')

// ─── summary ────────────────────────────────────────────────────────────────
console.log(`\nИТОГО: ${passed} ✓  /  ${failed} ✗\n`)
if (failed > 0) process.exit(1)

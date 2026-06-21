import type { ValidationResult, ToolResult } from '@/lib/ai/administrator/types'
import type { HallucinationGuard } from './hallucination-guard'

const SYSTEM_PROMPT_LEAKS = [
  'system prompt', 'these instructions', 'эти инструкции', 'системный промпт',
  'CRITICAL RULES', 'BOOKING FLOW', 'SAFETY RULES', 'TONE', '# IDENTITY',
]

const MEDICAL_PATTERNS = [
  'вы должны обратиться к врачу', 'у вас', 'ваш диагноз', 'вам нужно лечение',
  'рекомендую препарат', 'принимайте', 'это симптомы', 'медицинский совет',
]

const COMPETITOR_WORDS: string[] = []

// Common Russian/English words that shouldn't be treated as master names
const COMMON_NAME_WHITELIST = new Set([
  'вы', 'я', 'мы', 'он', 'она', 'оно', 'они',
  'привет', 'здравствуйте', 'спасибо', 'пожалуйста',
])

export interface ValidationContext {
  toolResults?: ToolResult[]
  hallucinationGuard?: HallucinationGuard
  allMasterNames?: string[]   // all masters of the tenant (full DB list)
  allServiceNames?: string[]  // all services of the tenant (full DB list)
}

export class ResponseValidator {
  validate(response: string, context: ValidationContext): ValidationResult {
    const violations: string[] = []

    if (!response || response.trim().length < 3) {
      violations.push('EMPTY_RESPONSE')
    }

    if (this.containsSystemPromptLeak(response)) {
      violations.push('SYSTEM_PROMPT_LEAK')
    }

    if (this.containsMedicalAdvice(response)) {
      violations.push('MEDICAL_ADVICE')
    }

    if (COMPETITOR_WORDS.length > 0 && this.mentionsCompetitors(response)) {
      violations.push('COMPETITOR_MENTION')
    }

    // Ghost booking/reschedule/cancel: model asserts a completed action that didn't happen this turn.
    // When a real action exists (hadDestructiveSuccess=true or previewReply set), the
    // finalReply logic in index.ts bypasses this sanitizedContent entirely — safe to check always.
    if (this.detectsCompletedBookingClaim(response)) {
      violations.push('GHOST_BOOKING_CLAIM')
    }
    if (this.detectsCompletedRescheduleClaim(response)) {
      violations.push('GHOST_RESCHEDULE_CLAIM')
    }
    if (this.detectsCompletedCancelClaim(response)) {
      violations.push('GHOST_CANCEL_CLAIM')
    }

    if (context.toolResults && this.containsInventedPrice(response, context.toolResults)) {
      violations.push('POTENTIAL_HALLUCINATION')
    }

    // Hard check: master names, slot times, service names mentioned in response
    // must be present in tool results of this conversation
    if (context.hallucinationGuard) {
      const factCheck = this.validateFactsAgainstTools(response, context)
      if (factCheck.length > 0) {
        violations.push(...factCheck)
      }
    }

    return {
      isValid: violations.length === 0,
      violations,
      sanitizedContent: violations.length > 0 ? this.fallback(violations) : response,
    }
  }

  private containsSystemPromptLeak(text: string): boolean {
    const lower = text.toLowerCase()
    return SYSTEM_PROMPT_LEAKS.some(leak => lower.includes(leak.toLowerCase()))
  }

  private containsMedicalAdvice(text: string): boolean {
    const lower = text.toLowerCase()
    return MEDICAL_PATTERNS.some(pattern => lower.includes(pattern))
  }

  private mentionsCompetitors(text: string): boolean {
    const lower = text.toLowerCase()
    return COMPETITOR_WORDS.some(name => lower.includes(name.toLowerCase()))
  }

  /**
   * Detects sentences where the model asserts a completed reschedule without a real DB write.
   * Fires on past-tense completion verbs; skips questions and conditionals.
   * When a real reschedule happened, previewReply is set in index.ts and this check is bypassed.
   */
  private detectsCompletedRescheduleClaim(text: string): boolean {
    const segments = text.split(/(?<=[.!?…])\s+|\n+/)
    for (const seg of segments) {
      const s = seg.toLowerCase().trim()
      if (!s) continue
      if (s.endsWith('?')) continue
      if (/\bчтобы\b/.test(s) || /\bесли бы\b/.test(s)) continue
      if (
        /перенесл[аи]?\s+(вас|вашу|запись)/.test(s) ||
        /вашу?\s+запись\s+перенес/.test(s) ||
        /запись\s+(успешно\s+)?перенесена/.test(s) ||
        /перенос\s+(выполнен|завершён|завершен|сделан|подтверждён|подтвержден)/.test(s)
      ) {
        return true
      }
    }
    return false
  }

  /**
   * Detects sentences where the model asserts a completed cancellation without a real DB write.
   * Fires on past-tense completion verbs; skips questions and conditionals.
   * When a real cancel happened, hadDestructiveSuccess=true in index.ts and this check is bypassed.
   */
  private detectsCompletedCancelClaim(text: string): boolean {
    const segments = text.split(/(?<=[.!?…])\s+|\n+/)
    for (const seg of segments) {
      const s = seg.toLowerCase().trim()
      if (!s) continue
      if (s.endsWith('?')) continue
      if (/\bчтобы\b/.test(s) || /\bесли бы\b/.test(s)) continue
      if (
        /отменил[аи]?\s+(вашу?\s+)?запись/.test(s) ||
        /вашу?\s+запись\s+отменил/.test(s) ||
        /запись\s+(успешно\s+)?отменена/.test(s) ||
        /отмена\s+(выполнена|завершена|сделана|подтверждена)/.test(s)
      ) {
        return true
      }
    }
    return false
  }

  private containsInventedPrice(text: string, toolResults: ToolResult[]): boolean {
    if (!toolResults.length) return false
    const toolResultText = JSON.stringify(toolResults).toLowerCase()
    const pricePattern = /\b(\d{2,6})\s*(руб|rub|byn|usd|\$|€|₽|бел)/gi
    const responsePrices = [...text.matchAll(pricePattern)].map(m => m[1])
    for (const price of responsePrices) {
      if (!toolResultText.includes(price)) return true
    }
    return false
  }

  /**
   * Hard hallucination check: any specific master name, service name, or
   * time slot mentioned in the response must be backed by tool results.
   */
  private validateFactsAgainstTools(text: string, ctx: ValidationContext): string[] {
    const violations: string[] = []
    const guard = ctx.hallucinationGuard!
    const allMasters = (ctx.allMasterNames ?? []).map(s => s.toLowerCase().trim())
    const allServices = (ctx.allServiceNames ?? []).map(s => s.toLowerCase().trim())
    const knownMasters = guard.getKnownMasterNames()
    const knownServices = guard.getKnownServiceNames()
    const knownTimes = guard.getKnownSlotTimes()

    // Check 1: time slots mentioned in response (HH:MM)
    const timePattern = /\b(\d{1,2}):(\d{2})\b/g
    const mentionedTimes = [...text.matchAll(timePattern)].map(m => {
      const hh = m[1].padStart(2, '0')
      return `${hh}:${m[2]}`
    })
    if (mentionedTimes.length > 0 && knownTimes.size === 0) {
      // Response has times but no slot tool was called
      violations.push('HALLUCINATED_TIME_SLOTS')
    } else {
      for (const t of mentionedTimes) {
        if (!knownTimes.has(t)) {
          violations.push('HALLUCINATED_TIME_SLOTS')
          break
        }
      }
    }

    // Check 2: master names mentioned in response
    // Find any DB master name appearing in text, check it's in knownMasters
    const lower = text.toLowerCase()
    for (const masterName of allMasters) {
      if (COMMON_NAME_WHITELIST.has(masterName)) continue
      // Match as whole word (Cyrillic/Latin)
      const escaped = masterName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const pattern = new RegExp(`(?:^|[^\\p{L}])${escaped}(?:$|[^\\p{L}])`, 'iu')
      if (pattern.test(lower)) {
        if (!knownMasters.has(masterName)) {
          violations.push('HALLUCINATED_MASTER_NAME')
          break
        }
      }
    }

    // Check 3: service names mentioned in response
    for (const serviceName of allServices) {
      if (serviceName.length < 4) continue // skip very short to avoid false positives
      const escaped = serviceName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const pattern = new RegExp(`(?:^|[^\\p{L}])${escaped}(?:$|[^\\p{L}])`, 'iu')
      if (pattern.test(lower)) {
        if (!knownServices.has(serviceName)) {
          violations.push('HALLUCINATED_SERVICE_NAME')
          break
        }
      }
    }

    return violations
  }

  /**
   * Detects sentences where the model asserts a completed booking (past tense) without
   * a real appointment having been created. Skips questions ("?") and conditional clauses
   * ("чтобы", "если бы") to avoid false positives on offers like "хотите, чтобы я записала вас?".
   * Does NOT match future/present: "записываю", "записать", "могу записать".
   */
  private detectsCompletedBookingClaim(text: string): boolean {
    const segments = text.split(/(?<=[.!?…])\s+|\n+/)
    for (const seg of segments) {
      const s = seg.toLowerCase().trim()
      if (!s) continue
      if (s.endsWith('?')) continue
      if (/\bчтобы\b/.test(s) || /\bесли бы\b/.test(s)) continue
      if (
        /записал[аи]?\s+вас/.test(s) ||
        /вас\s+записал[аи]?/.test(s) ||
        /\bвы\s+записан[ыа]\b/.test(s) ||
        /\bты\s+записан[аы]\b/.test(s) ||
        /\bзаписан[ыа]\b/.test(s) ||
        /запись\s+(оформлена|создана|подтверждена|зарегистрирована|сделана|готова)/.test(s) ||
        /забронировал[аи]?\s+(вас|для\s+вас)/.test(s)
      ) {
        return true
      }
    }
    return false
  }

  private fallback(violations: string[]): string {
    if (violations.includes('SYSTEM_PROMPT_LEAK')) {
      return 'Дайте секунду, уточню для вас 😊'
    }
    if (violations.includes('MEDICAL_ADVICE')) {
      return 'Это лучше уточнить у мастера на консультации — они подберут оптимальный вариант именно для вас.'
    }
    if (violations.includes('EMPTY_RESPONSE')) {
      return 'Дайте секунду, уточню для вас.'
    }
    if (violations.includes('GHOST_BOOKING_CLAIM')) {
      return 'Чтобы оформить запись, подтвердите детали выше.'
    }
    if (violations.includes('GHOST_RESCHEDULE_CLAIM')) {
      return 'Чтобы перенести запись, подтвердите новое время.'
    }
    if (violations.includes('GHOST_CANCEL_CLAIM')) {
      return 'Чтобы отменить запись, подтвердите действие.'
    }
    if (
      violations.includes('HALLUCINATED_TIME_SLOTS') ||
      violations.includes('HALLUCINATED_MASTER_NAME') ||
      violations.includes('HALLUCINATED_SERVICE_NAME')
    ) {
      return 'Секундочку, уточню актуальное расписание и вернусь к вам с точными данными.'
    }
    return 'Дайте секунду, уточню для вас 😊'
  }
}

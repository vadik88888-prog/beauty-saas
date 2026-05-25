import type { ValidationResult, ToolResult } from '@/lib/ai/administrator/types'

const SYSTEM_PROMPT_LEAKS = [
  'system prompt', 'these instructions', 'эти инструкции', 'системный промпт',
  'CRITICAL RULES', 'BOOKING FLOW', 'SAFETY RULES', 'TONE', '# IDENTITY',
]

const MEDICAL_PATTERNS = [
  'вы должны обратиться к врачу', 'у вас', 'ваш диагноз', 'вам нужно лечение',
  'рекомендую препарат', 'принимайте', 'это симптомы', 'медицинский совет',
]

const COMPETITOR_WORDS: string[] = [
  // Extend this list with known local competitor names if needed
]

export class ResponseValidator {
  validate(
    response: string,
    context: { toolResults?: ToolResult[] }
  ): ValidationResult {
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

    if (context.toolResults && this.containsInventedData(response, context.toolResults)) {
      violations.push('POTENTIAL_HALLUCINATION')
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

  // Heuristic: if response contains a price-like number that wasn't in any tool result,
  // flag it as potential hallucination (soft check — only violations POTENTIAL_HALLUCINATION)
  private containsInventedData(text: string, toolResults: ToolResult[]): boolean {
    if (!toolResults.length) return false

    // Extract prices from tool results (any number followed by currency symbols)
    const toolResultText = JSON.stringify(toolResults).toLowerCase()

    // Find price patterns in the response (e.g. "3500 руб", "35$", "€50")
    const pricePattern = /\b(\d{2,6})\s*(руб|rub|byn|usd|\$|€|₽|бел)/gi
    const responsePrices = [...text.matchAll(pricePattern)].map(m => m[1])

    // If any price in response isn't in tool results, flag it
    for (const price of responsePrices) {
      if (!toolResultText.includes(price)) {
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
    return 'Дайте секунду, уточню для вас 😊'
  }
}

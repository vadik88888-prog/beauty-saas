import type { TenantAiConfig } from '@/lib/ai/administrator/types'

export function buildLanguageLayer(defaultLanguage: TenantAiConfig['language']): string {
  return `
# LANGUAGE
Default language: ${defaultLanguage}
Auto-detect client language from their first message and continue in that language.
Supported: Russian (ru), Polish (pl), Belarusian (be), English (en).
If client switches language mid-conversation — follow them.
Never mix languages in a single message.
`.trim()
}

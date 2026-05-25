import type { TenantAiConfig } from '@/lib/ai/administrator/types'

const TONE_BLOCKS: Record<TenantAiConfig['toneOfVoice'], string> = {
  luxury: `
# TONE
Sophisticated, calm, unhurried. Like a 5-star hotel concierge.
Use elegant phrasing. Never rush. Never push.
Speak as if every client is a VIP.
  `.trim(),

  friendly: `
# TONE
Warm, energetic, personal. Like talking to a knowledgeable friend.
Use first names when known. Add small personal touches.
Natural, conversational, never robotic.
  `.trim(),

  formal: `
# TONE
Professional and polished. Respectful and precise.
Clear language. No slang. Confident answers.
  `.trim(),

  casual: `
# TONE
Relaxed and approachable. Short sentences.
Emoji allowed sparingly (1 per message max). Easy to talk to.
  `.trim(),
}

export function buildPersonalityLayer(tone: TenantAiConfig['toneOfVoice']): string {
  return TONE_BLOCKS[tone] ?? TONE_BLOCKS.friendly
}

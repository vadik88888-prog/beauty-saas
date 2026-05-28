import OpenAI from 'openai'
import { createAdminClient } from '@/lib/supabase/admin'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// Whisper API limit
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024

export type TranscribeResult = { text: string } | { error: 'voice_disabled' | 'too_large' | 'transcription_failed' }

// Распознать аудио через Whisper. Учитывает per-tenant toggle voice_enabled.
// Используется и в bot handler (без JWT) и в /api/ai/transcribe (с JWT).
export async function transcribeAudio(
  audioBlob: Blob,
  fileName: string,
  tenantId: string
): Promise<TranscribeResult> {
  const supabase = createAdminClient()
  const { data: settings } = await supabase
    .from('tenant_ai_settings')
    .select('voice_enabled')
    .eq('tenant_id', tenantId)
    .single()
  if ((settings as { voice_enabled?: boolean } | null)?.voice_enabled === false) {
    return { error: 'voice_disabled' }
  }

  if (audioBlob.size > MAX_AUDIO_BYTES) {
    return { error: 'too_large' }
  }

  try {
    const file = new File([audioBlob], fileName, { type: audioBlob.type || 'audio/ogg' })
    const result = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      language: 'ru',
    })
    return { text: result.text }
  } catch (err) {
    console.error('[transcribe] error:', err)
    return { error: 'transcription_failed' }
  }
}

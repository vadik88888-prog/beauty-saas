import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { transcribeAudio } from '@/lib/ai/transcribe'

export const maxDuration = 60

// Transcribe an audio file via OpenAI Whisper. Auth: TMA JWT (client).
// Bot handler использует transcribeAudio() напрямую — без JWT, с известным tenantId.

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let tenantId: string
  try {
    const jwtSecret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET!)
    const { payload } = await jwtVerify(authHeader.slice(7), jwtSecret)
    tenantId = payload.tenant_id as string
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  const form = await req.formData()
  const file = form.get('audio')
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'No audio file' }, { status: 400 })
  }

  const fileName = (file as File).name || 'voice.ogg'
  const result = await transcribeAudio(file, fileName, tenantId)
  if ('error' in result) {
    const map = { voice_disabled: 403, too_large: 413, transcription_failed: 500 } as const
    return NextResponse.json({ error: result.error }, { status: map[result.error] })
  }
  return NextResponse.json({ text: result.text })
}

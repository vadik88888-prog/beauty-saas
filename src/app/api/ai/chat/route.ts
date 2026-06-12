import { NextRequest, NextResponse, after } from 'next/server'
import { z } from 'zod'
import { jwtVerify } from 'jose'
import { runAdministrator } from '@/lib/ai/administrator'
import type { ApiResponse, AiChatResponse } from '@/types/api'

export const maxDuration = 60

const AttachmentSchema = z.object({
  type: z.literal('image'),
  base64: z.string(),
  mimeType: z.string(),
  name: z.string().optional(),
})

const RequestSchema = z.object({
  message: z.string().min(1).max(2000),
  conversationId: z.string().uuid().optional(),
  attachments: z.array(AttachmentSchema).max(3).optional(),
})

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<AiChatResponse>>> {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const jwtSecret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET!)
    let payload: Awaited<ReturnType<typeof jwtVerify>>['payload']
    try {
      const result = await jwtVerify(authHeader.slice(7), jwtSecret)
      payload = result.payload
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const tenantId = payload.tenant_id as string
    const clientId = payload.sub as string
    const telegramId = payload.telegram_id as number | undefined

    const body = await req.json()
    const parsed = RequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const { message, conversationId, attachments } = parsed.data

    const result = await runAdministrator({
      tenantId,
      clientId,
      message,
      conversationId,
      telegramId,
      attachments,
      waitUntil: after,
    })

    return NextResponse.json({
      data: {
        reply: result.reply,
        conversationId: result.conversationId,
        action: result.action,
        actionData: result.actionData,
        knowledgeSources: result.knowledgeSources,
        suggestedActions: result.suggestedActions,
      },
    })
  } catch (err) {
    console.error('AI chat error:', err)
    if (err && typeof err === 'object' && 'status' in err) {
      console.error('AI chat OpenAI error body:', JSON.stringify({ status: (err as Record<string, unknown>).status, body: (err as Record<string, unknown>).error }))
    }
    return NextResponse.json({ error: 'AI service unavailable' }, { status: 500 })
  }
}

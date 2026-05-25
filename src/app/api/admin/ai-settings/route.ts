import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function getOwnerContext(): Promise<{ tenantId: string; role: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const adminClient = createAdminClient()
  const { data } = await adminClient.from('tenant_users').select('tenant_id, role').eq('user_id', user.id).eq('is_active', true).single()
  if (!data) return null
  const d = data as { tenant_id: string; role: string }
  return { tenantId: d.tenant_id, role: d.role }
}

const AiSettingsSchema = z.object({
  admin_name: z.string().min(1).max(100),
  tone_of_voice: z.enum(['friendly', 'formal', 'playful']),
  custom_instructions: z.string().max(20000).nullable().optional(),
  welcome_message: z.string().max(2000).nullable().optional(),
  temperature: z.number().min(0).max(1).optional(),
  faq_enabled: z.boolean(),
  booking_enabled: z.boolean(),
  max_messages_day: z.number().int().min(1).max(500),
  model: z.enum(['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo']),
  language: z.string().default('ru'),
  // Knowledge base settings
  knowledge_enabled: z.boolean().optional(),
  knowledge_max_results: z.number().int().min(1).max(10).optional(),
  knowledge_min_relevance: z.number().int().min(0).max(100).optional(),
  knowledge_smart_search: z.boolean().optional(),
  knowledge_context_messages: z.number().int().min(1).max(10).optional(),
  knowledge_rerank: z.boolean().optional(),
})

export async function GET() {
  const ctx = await getOwnerContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()
  const { data } = await supabase.from('tenant_ai_settings').select('*').eq('tenant_id', ctx.tenantId).single()
  return NextResponse.json({ data: data ?? null })
}

export async function PUT(req: NextRequest) {
  const ctx = await getOwnerContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const parsed = AiSettingsSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid data', details: parsed.error.flatten() }, { status: 400 })

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('tenant_ai_settings')
    .upsert({ ...parsed.data, tenant_id: ctx.tenantId, updated_at: new Date().toISOString() }, { onConflict: 'tenant_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Server error' }, { status: 500 })
  return NextResponse.json({ data })
}

// FAQ CRUD
export async function PATCH(req: NextRequest) {
  const ctx = await getOwnerContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { action: string; id?: string; question?: string; answer?: string; is_active?: boolean }
  const supabase = createAdminClient()

  if (body.action === 'add_faq') {
    const { data, error } = await supabase
      .from('tenant_faq')
      .insert({ tenant_id: ctx.tenantId, question: body.question!, answer: body.answer!, is_active: true })
      .select()
      .single()
    if (error) return NextResponse.json({ error: 'Server error' }, { status: 500 })
    return NextResponse.json({ data })
  }

  if (body.action === 'delete_faq' && body.id) {
    await supabase.from('tenant_faq').delete().eq('id', body.id).eq('tenant_id', ctx.tenantId)
    return NextResponse.json({ data: { success: true } })
  }

  if (body.action === 'toggle_faq' && body.id) {
    await supabase.from('tenant_faq').update({ is_active: body.is_active }).eq('id', body.id).eq('tenant_id', ctx.tenantId)
    return NextResponse.json({ data: { success: true } })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUsualBooking } from '@/lib/clients/usual-booking'

export async function PATCH(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const jwtSecret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET!)
    const { payload } = await jwtVerify(authHeader.slice(7), jwtSecret)
    const clientId = payload.sub as string

    const body = await req.json() as { phone?: string; first_name?: string; last_name?: string }
    const updates: Record<string, string> = {}
    if (body.phone) updates.phone = body.phone.trim()
    if (body.first_name) updates.first_name = body.first_name.trim()
    if (body.last_name !== undefined) updates.last_name = body.last_name.trim()

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { error } = await supabase.from('clients').update(updates).eq('id', clientId)

    if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.slice(7)
    const jwtSecret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET!)

    const { payload } = await jwtVerify(token, jwtSecret)
    const clientId = payload.sub as string
    const tenantId = payload.tenant_id as string

    const supabase = createAdminClient()
    const [clientRes, aiSettingsRes, usual] = await Promise.all([
      supabase
        .from('clients')
        .select('id, first_name, last_name, telegram_id, telegram_username, phone, loyalty_points, total_visits, is_blocked')
        .eq('id', clientId)
        .single(),
      supabase
        .from('tenant_ai_settings')
        .select('welcome_message, admin_name')
        .eq('tenant_id', tenantId)
        .single(),
      getUsualBooking(clientId, tenantId, supabase),
    ])

    const client = clientRes.data
    if (clientRes.error || !client || (client as { is_blocked: boolean }).is_blocked) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    const aiSettings = aiSettingsRes.data as { welcome_message: string | null; admin_name: string | null } | null

    return NextResponse.json({
      client,
      aiSettings: {
        welcome_message: aiSettings?.welcome_message ?? null,
        admin_name: aiSettings?.admin_name ?? 'Администратор',
      },
      usual,
    })
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }
}

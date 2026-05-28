import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { createAdminClient } from '@/lib/supabase/admin'

// Polled by TMA каждые ~800мс пока AI печатает. Возвращает текущий "live_status"
// (короткая фраза вида "Проверяю расписание Анны…") если он есть.

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let clientId: string
  let tenantId: string
  try {
    const jwtSecret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET!)
    const { payload } = await jwtVerify(authHeader.slice(7), jwtSecret)
    clientId = payload.sub as string
    tenantId = payload.tenant_id as string
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const conversationId = searchParams.get('id')
  if (!conversationId) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data } = await supabase
    .from('conversations')
    .select('live_status, live_status_updated_at, client_id, tenant_id')
    .eq('id', conversationId)
    .single()

  type Row = { live_status: string | null; live_status_updated_at: string | null; client_id: string; tenant_id: string }
  const row = data as Row | null

  // Tenant + client isolation — отдаём status только владельцу диалога
  if (!row || row.client_id !== clientId || row.tenant_id !== tenantId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({
    status: row.live_status,
    updatedAt: row.live_status_updated_at,
  })
}

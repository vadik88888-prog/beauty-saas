import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const jwtSecret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET!)
    const { payload } = await jwtVerify(authHeader.slice(7), jwtSecret)
    const clientId = payload.sub as string
    const tenantId = payload.tenant_id as string

    const conversationId = new URL(req.url).searchParams.get('id')
    if (!conversationId) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const supabase = createAdminClient()

    // Verify conversation belongs to this client
    const { data: conv } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('client_id', clientId)
      .eq('tenant_id', tenantId)
      .single()

    if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { data: messages } = await supabase
      .from('messages')
      .select('role, content, created_at, metadata')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(30)

    return NextResponse.json({ data: messages ?? [] })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

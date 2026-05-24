import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { createAdminClient } from '@/lib/supabase/admin'

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

    const supabase = createAdminClient()
    const { data: client, error } = await supabase
      .from('clients')
      .select('id, first_name, last_name, telegram_id, loyalty_points, total_visits, is_blocked')
      .eq('id', clientId)
      .single()

    if (error || !client || client.is_blocked) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    return NextResponse.json({ client })
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }
}

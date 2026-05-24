import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { jwtVerify } from 'jose'
import { createAdminClient } from '@/lib/supabase/admin'
import { calculateAvailableSlots, groupSlotsByDate } from '@/lib/booking/slots'
import { generateDateRange } from '@/lib/utils/date'

const QuerySchema = z.object({
  serviceId: z.string().uuid(),
  masterId: z.string().uuid().optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export async function GET(req: NextRequest) {
  try {
    // Auth
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const token = authHeader.slice(7)
    const jwtSecret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET!)
    const { payload } = await jwtVerify(token, jwtSecret)
    const tenantId = payload.tenant_id as string

    // Validate query params
    const url = new URL(req.url)
    const query = QuerySchema.safeParse({
      serviceId: url.searchParams.get('serviceId'),
      masterId: url.searchParams.get('masterId') ?? undefined,
      dateFrom: url.searchParams.get('dateFrom'),
      dateTo: url.searchParams.get('dateTo'),
    })

    if (!query.success) {
      return NextResponse.json({ error: 'Invalid params' }, { status: 400 })
    }

    const { serviceId, masterId, dateFrom, dateTo } = query.data
    const supabase = createAdminClient()

    // 1. Get service duration
    const { data: service } = await supabase
      .from('services')
      .select('id, duration_min, is_active')
      .eq('id', serviceId)
      .eq('tenant_id', tenantId)
      .single()

    if (!service || !service.is_active) {
      return NextResponse.json({ error: 'Service not found' }, { status: 404 })
    }

    // 2. Get masters who can perform this service
    let mastersQuery = supabase
      .from('masters')
      .select('id, name, photo_url')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)

    if (masterId) {
      mastersQuery = mastersQuery.eq('id', masterId)
    } else {
      // Only masters who have this service in master_services
      const { data: masterIds } = await supabase
        .from('master_services')
        .select('master_id')
        .eq('service_id', serviceId)

      if (masterIds?.length) {
        mastersQuery = mastersQuery.in('id', masterIds.map(m => m.master_id))
      }
    }

    const { data: masters } = await mastersQuery
    if (!masters?.length) {
      return NextResponse.json({ data: [] })
    }

    const masterIds = masters.map(m => m.id)
    const startDate = new Date(dateFrom)
    const endDate = new Date(dateTo)

    // 3. Fetch working hours, time off, and existing appointments in parallel
    const [whRes, toRes, apptRes] = await Promise.all([
      supabase
        .from('working_hours')
        .select('*')
        .eq('tenant_id', tenantId)
        .in('master_id', masterIds),

      supabase
        .from('time_off')
        .select('*')
        .eq('tenant_id', tenantId)
        .gte('date', dateFrom)
        .lte('date', dateTo),

      supabase
        .from('appointments')
        .select('master_id, starts_at, ends_at')
        .eq('tenant_id', tenantId)
        .in('master_id', masterIds)
        .in('status', ['pending', 'confirmed'])
        .gte('starts_at', `${dateFrom}T00:00:00Z`)
        .lte('starts_at', `${dateTo}T23:59:59Z`),
    ])

    const workingHours = whRes.data ?? []
    const timeOff = toRes.data ?? []
    const appointments = apptRes.data ?? []

    // 4. Calculate slots for each master across the date range
    const dateRange = generateDateRange(startDate, getDaysDiff(startDate, endDate) + 1)
    const allSlots: Array<{
      datetime: string
      masterId: string
      masterName: string
      masterPhotoUrl: string | null
    }> = []

    for (const master of masters) {
      const masterAppts = appointments.filter(a => a.master_id === master.id)

      for (const date of dateRange) {
        const daySlots = calculateAvailableSlots({
          master,
          workingHours,
          timeOff,
          existingAppointments: masterAppts,
          serviceDurationMin: service.duration_min,
          date,
        })

        for (const slot of daySlots) {
          allSlots.push({
            datetime: slot.datetime.toISOString(),
            masterId: slot.masterId,
            masterName: slot.masterName,
            masterPhotoUrl: slot.masterPhotoUrl,
          })
        }
      }
    }

    // Sort by datetime
    allSlots.sort((a, b) => a.datetime.localeCompare(b.datetime))

    return NextResponse.json({ data: allSlots })
  } catch (err) {
    console.error('Slots error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

function getDaysDiff(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24))
}

import { NextRequest, NextResponse } from 'next/server'
import { getTokenFromRequest, isAdmin } from '@/lib/auth'
import { getServiceSupabase } from '@/lib/supabase'
import { detectTerritory } from '@/lib/territory'

export async function GET(req: NextRequest) {
  const token = getTokenFromRequest(req)
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = getServiceSupabase()
  const { searchParams } = new URL(req.url)
  const territory = searchParams.get('territory')
  const status = searchParams.get('status')
  const month = searchParams.get('month') // YYYY-MM

  let query = db.from('jobs').select('*, helpers(name, email)').order('event_date', { ascending: true })

  // Helpers only see their own jobs or available jobs
  if (token.role === 'helper') {
    const type = searchParams.get('type')
    if (type === 'available') {
      // Look up the helper's POV access flag
      const { data: helperRow } = await db
        .from('helpers')
        .select('villages_realty_approved')
        .eq('id', token.id)
        .single()
      const povApproved = !!helperRow?.villages_realty_approved

      let availQuery = db.from('jobs')
        .select('*')
        .eq('status', 'pending')
        .is('helper_id', null)
        .order('event_date', { ascending: true })

      // Hide POV jobs unless this helper has been approved
      if (!povApproved) {
        availQuery = availQuery.neq('type', 'pov')
      }
      query = availQuery
    } else {
      query = db.from('jobs')
        .select('*')
        .eq('helper_id', token.id)
        .order('event_date', { ascending: true })
    }
  } else {
    if (territory && territory !== 'ALL') query = query.eq('territory', territory)
    if (status) query = query.eq('status', status)
    if (month) {
      const start = `${month}-01`
      const end = `${month}-31`
      query = query.gte('event_date', start).lte('event_date', end)
    }
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = getServiceSupabase()
  const body = await req.json()

  const territory = body.territory || detectTerritory(body.address || '')
  const { data, error } = await db.from('jobs').insert({
    setup_date: body.setupDate || null,
    event_date: body.eventDate || null,
    address: body.address,
    customer: body.customer || null,
    details: body.details || null,
    contact: body.contact || null,
    territory,
    type: body.type || 'standard',
    status: 'pending',
    order_num: body.orderNum || null,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

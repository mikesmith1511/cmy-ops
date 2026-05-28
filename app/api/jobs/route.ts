import { NextRequest, NextResponse } from 'next/server'
import { getTokenFromRequest, isAdmin } from '@/lib/auth'
import { getServiceSupabase } from '@/lib/supabase'
import { detectTerritory } from '@/lib/territory'
export const dynamic = 'force-dynamic'
export async function GET(req: NextRequest) {
  const token = getTokenFromRequest(req)
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = getServiceSupabase()
  const { searchParams } = new URL(req.url)
  const territory = searchParams.get('territory')
  const status = searchParams.get('status')
  const month = searchParams.get('month') // YYYY-MM
  const kind = searchParams.get('kind') // 'drop' | 'pick' (admin filter)

  // ===========================================================
  // HELPER VIEW
  // ===========================================================
  if (token.role === 'helper') {
    const type = searchParams.get('type')

    if (type === 'available') {
      // Available Jobs: show ONLY drops (one entry per order).
      // The helper claims via the drop, and picks are auto-assigned to them.
      // We also need to attach the paired pick info so the UI can show both
      // legs in the combined card with checkboxes.
      const { data: helperRow } = await db
        .from('helpers')
        .select('villages_realty_approved')
        .eq('id', token.id)
        .single()
      const povApproved = !!helperRow?.villages_realty_approved

      let availQuery = db.from('jobs')
        .select('*')
        .eq('kind', 'drop')
        .eq('status', 'pending')
        .is('helper_id', null)
        .order('event_date', { ascending: true })

      if (!povApproved) {
        availQuery = availQuery.neq('type', 'pov')
      }

      const { data: drops, error: dropsErr } = await availQuery
      if (dropsErr) return NextResponse.json({ error: dropsErr.message }, { status: 500 })
      if (!drops || drops.length === 0) return NextResponse.json([])

      // Fetch the paired picks so the UI can show both legs
      const pickIds = drops.map((d: any) => d.paired_job_id).filter(Boolean)
      let picks: any[] = []
      if (pickIds.length > 0) {
        const { data: pickRows } = await db
          .from('jobs')
          .select('id, setup_date, event_date, status, helper_id')
          .in('id', pickIds)
        picks = pickRows || []
      }
      const picksById = new Map<number, any>()
      picks.forEach(p => picksById.set(p.id, p))

      // Attach pick metadata to each drop under .pick
      const enriched = drops.map((d: any) => ({
        ...d,
        pick: d.paired_job_id ? picksById.get(d.paired_job_id) || null : null,
      }))

      return NextResponse.json(enriched)
    }

    // My Jobs: return everything the helper owns (drops AND picks).
    // For picks, attach the paired drop's install status so the UI can
    // gate "Mark Picked Up" until the drop has been installed with photo.
    // This works across split-helper scenarios — Helper B's pick can see
    // Helper A's drop status without "owning" the drop row.
    const { data: myJobs, error: myJobsErr } = await db.from('jobs')
      .select('*')
      .eq('helper_id', token.id)
      .order('event_date', { ascending: true })

    if (myJobsErr) return NextResponse.json({ error: myJobsErr.message }, { status: 500 })
    if (!myJobs || myJobs.length === 0) return NextResponse.json([])

    // For every pick row, fetch its paired drop's status + photo_url
    const myPickRows = myJobs.filter((j: any) => j.kind === 'pick' && j.paired_job_id)
    const pairedDropIds = myPickRows.map((p: any) => p.paired_job_id)

    const dropsByPairId = new Map<number, any>()
    if (pairedDropIds.length > 0) {
      const { data: pairedDrops } = await db
        .from('jobs')
        .select('id, status, photo_url')
        .in('id', pairedDropIds)
      ;(pairedDrops || []).forEach((d: any) => dropsByPairId.set(d.id, d))
    }

    const enrichedMyJobs = myJobs.map((j: any) => {
      if (j.kind === 'pick' && j.paired_job_id) {
        const drop = dropsByPairId.get(j.paired_job_id)
        return {
          ...j,
          paired_drop_status: drop?.status || null,
          paired_drop_has_photo: !!drop?.photo_url,
        }
      }
      return j
    })

    return NextResponse.json(enrichedMyJobs)
  }

  // ===========================================================
  // ADMIN VIEW
  // ===========================================================
  let query = db.from('jobs').select('*, helpers!helper_id(name, email)').order('event_date', { ascending: true })
  if (territory && territory !== 'ALL') query = query.eq('territory', territory)
  if (status) query = query.eq('status', status)
  if (kind) query = query.eq('kind', kind)
  if (month) {
    const start = `${month}-01`
    const end = `${month}-31`
    query = query.gte('event_date', start).lte('event_date', end)
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

  // Manual job creation: create both drop and pick rows so the new order
  // matches the data model. Set up_date = drop date, event_date = event,
  // pick's setup_date = event_date (sign comes down on event day).
  const setupDate = body.setupDate || null
  const eventDate = body.eventDate || null
  const baseFields = {
    address: body.address,
    customer: body.customer || null,
    details: body.details || null,
    contact: body.contact || null,
    territory,
    type: body.type || 'standard',
    status: 'pending',
    order_num: body.orderNum || null,
    sync_source: 'manual',
  }

  // Insert drop first
  const { data: dropRow, error: dropErr } = await db.from('jobs').insert({
    ...baseFields,
    kind: 'drop',
    setup_date: setupDate,
    event_date: eventDate,
  }).select().single()

  if (dropErr) return NextResponse.json({ error: dropErr.message }, { status: 500 })

  // Insert pick paired to drop
  const { data: pickRow, error: pickErr } = await db.from('jobs').insert({
    ...baseFields,
    kind: 'pick',
    setup_date: eventDate,
    event_date: eventDate,
    paired_job_id: dropRow.id,
  }).select().single()

  if (pickErr) {
    // Rollback the drop insert if pick failed
    await db.from('jobs').delete().eq('id', dropRow.id)
    return NextResponse.json({ error: pickErr.message }, { status: 500 })
  }

  // Backfill pair link on drop
  await db.from('jobs').update({ paired_job_id: pickRow.id }).eq('id', dropRow.id)

  return NextResponse.json({ ...dropRow, paired_job_id: pickRow.id, pick: pickRow })
}

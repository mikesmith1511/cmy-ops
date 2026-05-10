import { NextRequest, NextResponse } from 'next/server'
import { getTokenFromRequest, isAdmin } from '@/lib/auth'
import { getServiceSupabase } from '@/lib/supabase'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const token = getTokenFromRequest(req)
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = getServiceSupabase()
  const body = await req.json()
  const id = parseInt(params.id)

  // ===========================================================
  // HELPER ACTIONS
  // ===========================================================
  if (token.role === 'helper') {
    const { data: job } = await db.from('jobs').select('*').eq('id', id).single()
    if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // ---------------------------------------------------------
    // CLAIM: helper claims a job. Always called against a DROP id.
    // body.legs is an array: ['drop'], ['pick'], or ['drop', 'pick'] (default).
    // - If 'drop' included: claim this drop row
    // - If 'pick' included: claim the paired pick row
    // POV check applies to the drop (picks inherit POV-ness from their pair).
    // ---------------------------------------------------------
    if (body.action === 'claim') {
      // Default to claiming both legs unless caller specifies otherwise
      const legs: string[] = Array.isArray(body.legs) && body.legs.length > 0
        ? body.legs
        : ['drop', 'pick']

      // The claim must be initiated against a drop row (Available Jobs only shows drops)
      if (job.kind !== 'drop') {
        return NextResponse.json({
          error: 'Claim must reference a drop, not a pick.'
        }, { status: 400 })
      }

      // POV gating
      if (job.type === 'pov') {
        const { data: helperRow } = await db
          .from('helpers')
          .select('villages_realty_approved')
          .eq('id', token.id)
          .single()
        if (!helperRow?.villages_realty_approved) {
          return NextResponse.json({
            error: 'POV jobs require Villages Realty approval. Contact admin.'
          }, { status: 403 })
        }
      }

      // Check the drop is still claimable
      if (legs.includes('drop')) {
        if (job.helper_id) {
          return NextResponse.json({ error: 'Drop already claimed.' }, { status: 409 })
        }
      }

      // Look up paired pick row if needed
      let pickRow: any = null
      if (legs.includes('pick')) {
        if (!job.paired_job_id) {
          return NextResponse.json({ error: 'No paired pick exists.' }, { status: 400 })
        }
        const { data: p } = await db.from('jobs').select('*').eq('id', job.paired_job_id).single()
        if (!p) return NextResponse.json({ error: 'Paired pick not found.' }, { status: 404 })
        if (p.helper_id) {
          return NextResponse.json({ error: 'Pick already claimed.' }, { status: 409 })
        }
        pickRow = p
      }

      // Apply claims atomically (best effort)
      const updates: any[] = []
      if (legs.includes('drop')) {
        updates.push({ id: job.id, helper_id: token.id, status: 'claimed' })
      }
      if (legs.includes('pick') && pickRow) {
        updates.push({ id: pickRow.id, helper_id: token.id, status: 'claimed' })
      }

      const results: any[] = []
      for (const u of updates) {
        const { id: rowId, ...rest } = u
        const { data, error } = await db.from('jobs').update(rest).eq('id', rowId).select().single()
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        results.push(data)
      }

      return NextResponse.json({ ok: true, claimed: results })
    }

    // ---------------------------------------------------------
    // INSTALLED: helper marks DROP as installed. Photo required.
    // Picks cannot be marked installed.
    // ---------------------------------------------------------
    if (body.action === 'installed') {
      if (job.kind !== 'drop') {
        return NextResponse.json({
          error: 'Only drops can be marked installed. Picks use mark complete.'
        }, { status: 400 })
      }
      if (job.helper_id !== token.id) return NextResponse.json({ error: 'Not your job' }, { status: 403 })
      if (!job.photo_url) {
        return NextResponse.json({
          error: 'Install photo required before marking installed.'
        }, { status: 400 })
      }
      const { data, error } = await db.from('jobs').update({ status: 'installed' }).eq('id', id).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json(data)
    }

    // ---------------------------------------------------------
    // PICKED_UP: helper marks PICK as complete (no photo required).
    // ---------------------------------------------------------
    if (body.action === 'picked_up') {
      if (job.kind !== 'pick') {
        return NextResponse.json({
          error: 'Only picks can use picked_up. Drops use installed.'
        }, { status: 400 })
      }
      if (job.helper_id !== token.id) return NextResponse.json({ error: 'Not your job' }, { status: 403 })
      const { data, error } = await db.from('jobs').update({ status: 'complete' }).eq('id', id).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json(data)
    }

    if (body.action === 'acknowledge_cancellation') {
      if (!isAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      const { data, error } = await db
        .from('jobs')
        .update({ cancellation_acknowledged_at: new Date().toISOString() })
        .eq('id', id)
        .eq('status', 'cancelled')
        .select()
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json(data)
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  // ===========================================================
  // ADMIN ACTIONS - can update anything on either drop or pick
  // ===========================================================
  const updates: any = {}
  if (body.status !== undefined) {
    updates.status = body.status
    // Status transitions involving 'cancelled' reset the ack timestamp:
    //   -> cancelled: flag for admin acknowledgment
    //   -> anything else from cancelled: row is no longer cancelled, ack is irrelevant
    updates.cancellation_acknowledged_at = null
  }
  if (body.helperId !== undefined) updates.helper_id = body.helperId || null
  if (body.setupDate !== undefined) updates.setup_date = body.setupDate
  if (body.eventDate !== undefined) updates.event_date = body.eventDate
  if (body.details !== undefined) updates.details = body.details

  const { data, error } = await db.from('jobs').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = getServiceSupabase()
  const id = parseInt(params.id)

  // Look up the job to get its pair, delete both
  const { data: job } = await db.from('jobs').select('id, paired_job_id').eq('id', id).single()
  if (job?.paired_job_id) {
    await db.from('jobs').delete().eq('id', job.paired_job_id)
  }
  const { error } = await db.from('jobs').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

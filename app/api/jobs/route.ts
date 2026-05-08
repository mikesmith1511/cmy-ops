import { NextRequest, NextResponse } from 'next/server'
import { getTokenFromRequest, isAdmin } from '@/lib/auth'
import { getServiceSupabase } from '@/lib/supabase'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const token = getTokenFromRequest(req)
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = getServiceSupabase()
  const body = await req.json()
  const id = parseInt(params.id)

  // Helpers can only update their own jobs (claim or mark installed)
  if (token.role === 'helper') {
    const { data: job } = await db.from('jobs').select('*').eq('id', id).single()
    if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Claim: job must be unclaimed
    if (body.action === 'claim') {
      if (job.helper_id) return NextResponse.json({ error: 'Job already claimed' }, { status: 409 })
      if (job.type === 'pov') return NextResponse.json({ error: 'Cannot claim POV jobs' }, { status: 403 })
      const { data, error } = await db.from('jobs').update({ helper_id: token.id, status: 'claimed' }).eq('id', id).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json(data)
    }

    // Mark installed - REQUIRES a photo to be uploaded first
    if (body.action === 'installed') {
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

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  // Admin can update anything
  const updates: any = {}
  if (body.status !== undefined) updates.status = body.status
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
  const { error } = await db.from('jobs').delete().eq('id', parseInt(params.id))
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

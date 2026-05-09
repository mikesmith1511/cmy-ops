// app/api/inventory/events/route.ts
// GET /api/inventory/events — paginated audit log with filters
//
// Query params (all optional):
//   piece_id, set_id, job_id, helper_id, event_type
//   since (ISO datetime), until (ISO datetime)
//   limit (default 50, max 200)
//   cursor (id to paginate before — keyset pagination)

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getServiceSupabase } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const user = requireAuth(req)
  if (user instanceof NextResponse) return user

  const sp = req.nextUrl.searchParams
  const pieceId = sp.get('piece_id')
  const setId = sp.get('set_id')
  const jobId = sp.get('job_id')
  const helperId = sp.get('helper_id')
  const eventType = sp.get('event_type')
  const since = sp.get('since')
  const until = sp.get('until')
  const limit = Math.min(parseInt(sp.get('limit') ?? '50', 10) || 50, 200)
  const cursor = sp.get('cursor') // id to paginate before

  const db = getServiceSupabase()
  let q = db
    .from('inventory_events')
    .select(
      'id, piece_id, set_id, job_id, helper_id, event_type, from_state, to_state, metadata, created_at, helpers(id, name, email)'
    )
    .order('id', { ascending: false })
    .limit(limit)

  if (pieceId) q = q.eq('piece_id', parseInt(pieceId, 10))
  if (setId) q = q.eq('set_id', parseInt(setId, 10))
  if (jobId) q = q.eq('job_id', parseInt(jobId, 10))
  if (helperId) q = q.eq('helper_id', parseInt(helperId, 10))
  if (eventType) q = q.eq('event_type', eventType)
  if (since) q = q.gte('created_at', since)
  if (until) q = q.lte('created_at', until)
  if (cursor) q = q.lt('id', parseInt(cursor, 10))

  const { data, error } = await q
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const events = data ?? []
  const nextCursor = events.length === limit ? events[events.length - 1].id : null

  return NextResponse.json({
    events,
    next_cursor: nextCursor,
    count: events.length,
  })
}

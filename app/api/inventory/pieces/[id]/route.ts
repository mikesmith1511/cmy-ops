// app/api/inventory/pieces/[id]/route.ts
// GET    /api/inventory/pieces/:id          — fetch piece with full event history
// PATCH  /api/inventory/pieces/:id          — update editable fields (admin only)
// DELETE /api/inventory/pieces/:id          — retire the piece (admin only) — soft, sets status='retired'

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getServiceSupabase } from '@/lib/supabase'
import { logInventoryEvent, isValidCondition } from '@/lib/inventory'

interface Params {
  params: { id: string }
}

export async function GET(req: NextRequest, { params }: Params) {
  const user = requireAuth(req)
  if (user instanceof NextResponse) return user

  const pieceId = parseInt(params.id, 10)
  if (isNaN(pieceId)) {
    return NextResponse.json({ error: 'Invalid piece id' }, { status: 400 })
  }

  const db = getServiceSupabase()
  const [pieceRes, eventsRes] = await Promise.all([
    db.from('inventory_pieces').select('*').eq('id', pieceId).single(),
    db
      .from('inventory_events')
      .select('*')
      .eq('piece_id', pieceId)
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  if (pieceRes.error || !pieceRes.data) {
    return NextResponse.json({ error: 'Piece not found' }, { status: 404 })
  }
  if (eventsRes.error) {
    return NextResponse.json({ error: eventsRes.error.message }, { status: 500 })
  }

  return NextResponse.json({
    piece: pieceRes.data,
    events: eventsRes.data ?? [],
  })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = requireAuth(req, { adminOnly: true })
  if (user instanceof NextResponse) return user

  const pieceId = parseInt(params.id, 10)
  if (isNaN(pieceId)) {
    return NextResponse.json({ error: 'Invalid piece id' }, { status: 400 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Only certain fields are admin-editable. Status changes go through scan
  // routes (Phase 2), not this PATCH — except for `damaged` and back-from-damage.
  const allowed = ['label', 'type', 'territory', 'set_id', 'condition', 'notes']
  const updates: Record<string, any> = {}
  for (const k of allowed) {
    if (k in body) updates[k] = body[k]
  }

  if ('condition' in updates && !isValidCondition(updates.condition)) {
    return NextResponse.json(
      { error: 'condition must be good, worn, needs_repair, or damaged' },
      { status: 400 }
    )
  }
  if ('territory' in updates && updates.territory) {
    updates.territory = String(updates.territory).toUpperCase()
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const db = getServiceSupabase()

  // Capture pre-update state for the audit log
  const { data: before, error: beforeErr } = await db
    .from('inventory_pieces')
    .select('*')
    .eq('id', pieceId)
    .single()
  if (beforeErr || !before) {
    return NextResponse.json({ error: 'Piece not found' }, { status: 404 })
  }

  // If condition is changing TO 'damaged', also flip status to 'damaged'.
  // If condition is changing FROM 'damaged' to something good, status goes back to 'in_stock'.
  // (Only safe to auto-flip when piece isn't currently scheduled or checked out.)
  if ('condition' in updates) {
    const newCond = updates.condition
    const oldCond = before.condition
    if (newCond === 'damaged' && before.status !== 'retired') {
      updates.status = 'damaged'
    } else if (
      oldCond === 'damaged' &&
      newCond !== 'damaged' &&
      before.status === 'damaged'
    ) {
      updates.status = 'in_stock'
    }
  }

  const { data, error } = await db
    .from('inventory_pieces')
    .update(updates)
    .eq('id', pieceId)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Compute the diff for the audit log
  const changes: Record<string, { from: any; to: any }> = {}
  for (const k of Object.keys(updates)) {
    if ((before as any)[k] !== (data as any)[k]) {
      changes[k] = { from: (before as any)[k], to: (data as any)[k] }
    }
  }

  // Special-case event types for common changes
  let eventType: any = 'state_change'
  if ('set_id' in updates) {
    eventType = updates.set_id ? 'set_assigned' : 'set_unassigned'
  } else if (changes.condition?.to === 'damaged') {
    eventType = 'marked_damaged'
  } else if (changes.condition?.from === 'damaged' && changes.condition?.to !== 'damaged') {
    eventType = 'marked_repaired'
  } else if ('notes' in updates) {
    eventType = 'note_added'
  }

  await logInventoryEvent({
    pieceId,
    setId: data.set_id,
    helperId: user.id,
    eventType,
    fromState: changes.status?.from ?? null,
    toState: changes.status?.to ?? null,
    metadata: { changes },
  })

  return NextResponse.json({ piece: data })
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const user = requireAuth(req, { adminOnly: true })
  if (user instanceof NextResponse) return user

  const pieceId = parseInt(params.id, 10)
  if (isNaN(pieceId)) {
    return NextResponse.json({ error: 'Invalid piece id' }, { status: 400 })
  }

  const db = getServiceSupabase()

  const { data: before, error: beforeErr } = await db
    .from('inventory_pieces')
    .select('*')
    .eq('id', pieceId)
    .single()
  if (beforeErr || !before) {
    return NextResponse.json({ error: 'Piece not found' }, { status: 404 })
  }

  // Refuse to retire a piece that's currently on a job. The admin should
  // first close out the job (or override the assignment) to avoid losing
  // track of physical inventory.
  if (before.status === 'checked_out' || before.status === 'overdue') {
    return NextResponse.json(
      {
        error: 'Cannot retire a piece that is currently checked out',
        current_status: before.status,
        current_job_id: before.current_job_id,
      },
      { status: 409 }
    )
  }

  const { data, error } = await db
    .from('inventory_pieces')
    .update({ status: 'retired', set_id: null, current_job_id: null })
    .eq('id', pieceId)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await logInventoryEvent({
    pieceId,
    setId: before.set_id,
    helperId: user.id,
    eventType: 'retired',
    fromState: before.status,
    toState: 'retired',
    metadata: { previous_set_id: before.set_id, barcode: before.barcode },
  })

  return NextResponse.json({ piece: data })
}

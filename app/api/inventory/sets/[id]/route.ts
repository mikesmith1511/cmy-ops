// app/api/inventory/sets/[id]/route.ts
// GET    /api/inventory/sets/:id  — fetch a set with all its pieces
// PATCH  /api/inventory/sets/:id  — update set metadata (admin only)
// DELETE /api/inventory/sets/:id  — soft-delete: active=false, unlink pieces (admin only)

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getServiceSupabase } from '@/lib/supabase'
import { logInventoryEvent } from '@/lib/inventory'

interface Params {
  params: { id: string }
}

export async function GET(req: NextRequest, { params }: Params) {
  const user = requireAuth(req)
  if (user instanceof NextResponse) return user

  const setId = parseInt(params.id, 10)
  if (isNaN(setId)) {
    return NextResponse.json({ error: 'Invalid set id' }, { status: 400 })
  }

  const db = getServiceSupabase()

  const [setRes, piecesRes] = await Promise.all([
    db.from('inventory_sets').select('*').eq('id', setId).single(),
    db
      .from('inventory_pieces')
      .select('*')
      .eq('set_id', setId)
      .order('label', { ascending: true }),
  ])

  if (setRes.error || !setRes.data) {
    return NextResponse.json({ error: 'Set not found' }, { status: 404 })
  }
  if (piecesRes.error) {
    return NextResponse.json({ error: piecesRes.error.message }, { status: 500 })
  }

  return NextResponse.json({
    set: setRes.data,
    pieces: piecesRes.data ?? [],
  })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = requireAuth(req, { adminOnly: true })
  if (user instanceof NextResponse) return user

  const setId = parseInt(params.id, 10)
  if (isNaN(setId)) {
    return NextResponse.json({ error: 'Invalid set id' }, { status: 400 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Whitelist of editable fields. Anything else is ignored.
  const allowed = [
    'name',
    'territory',
    'category',
    'occasion',
    'theme',
    'colors',
    'description',
    'preview_image_url',
    'active',
  ]
  const updates: Record<string, any> = {}
  for (const k of allowed) {
    if (k in body) updates[k] = body[k]
  }

  if (updates.territory) {
    updates.territory = String(updates.territory).toUpperCase()
  }
  if (updates.name && typeof updates.name === 'string') {
    updates.name = updates.name.trim()
    if (!updates.name) {
      return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 })
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const db = getServiceSupabase()

  // Capture old state for the audit log
  const { data: before, error: beforeErr } = await db
    .from('inventory_sets')
    .select('*')
    .eq('id', setId)
    .single()
  if (beforeErr || !before) {
    return NextResponse.json({ error: 'Set not found' }, { status: 404 })
  }

  const { data, error } = await db
    .from('inventory_sets')
    .update(updates)
    .eq('id', setId)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await logInventoryEvent({
    setId,
    helperId: user.id,
    eventType: 'state_change',
    metadata: { changes: updates, before },
  })

  return NextResponse.json({ set: data })
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const user = requireAuth(req, { adminOnly: true })
  if (user instanceof NextResponse) return user

  const setId = parseInt(params.id, 10)
  if (isNaN(setId)) {
    return NextResponse.json({ error: 'Invalid set id' }, { status: 400 })
  }

  const db = getServiceSupabase()

  // Verify the set exists and grab the piece list for logging.
  const { data: setRow, error: setErr } = await db
    .from('inventory_sets')
    .select('*')
    .eq('id', setId)
    .single()
  if (setErr || !setRow) {
    return NextResponse.json({ error: 'Set not found' }, { status: 404 })
  }

  const { data: pieces, error: piecesErr } = await db
    .from('inventory_pieces')
    .select('id, label, status')
    .eq('set_id', setId)
  if (piecesErr) {
    return NextResponse.json({ error: piecesErr.message }, { status: 500 })
  }

  // Soft-delete the set: active=false. Unlink all pieces (set_id=null).
  // Pieces themselves stay alive — they can be reassigned to other sets later.
  const [deactivateRes, unlinkRes] = await Promise.all([
    db.from('inventory_sets').update({ active: false }).eq('id', setId),
    db.from('inventory_pieces').update({ set_id: null }).eq('set_id', setId),
  ])

  if (deactivateRes.error) {
    return NextResponse.json({ error: deactivateRes.error.message }, { status: 500 })
  }
  if (unlinkRes.error) {
    return NextResponse.json({ error: unlinkRes.error.message }, { status: 500 })
  }

  // Log the set retirement
  await logInventoryEvent({
    setId,
    helperId: user.id,
    eventType: 'retired',
    metadata: { unlinked_piece_ids: (pieces ?? []).map((p) => p.id), set_name: setRow.name },
  })

  // Log each piece unassignment so it shows in piece-level history
  for (const p of pieces ?? []) {
    await logInventoryEvent({
      pieceId: p.id,
      setId: null,
      helperId: user.id,
      eventType: 'set_unassigned',
      metadata: { from_set_id: setId, reason: 'set_soft_deleted' },
    })
  }

  return NextResponse.json({
    ok: true,
    set_id: setId,
    unlinked_pieces: (pieces ?? []).length,
  })
}

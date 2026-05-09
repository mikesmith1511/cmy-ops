// app/api/inventory/pieces/route.ts
// GET  /api/inventory/pieces  — list pieces with filters
// POST /api/inventory/pieces  — create one piece (admin only)

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getServiceSupabase } from '@/lib/supabase'
import {
  logInventoryEvent,
  isValidStatus,
  isValidCondition,
  parseTerritoriesParam,
} from '@/lib/inventory'

export async function GET(req: NextRequest) {
  const user = requireAuth(req)
  if (user instanceof NextResponse) return user

  const sp = req.nextUrl.searchParams
  const territories = parseTerritoriesParam(sp.get('territory'))
  const status = sp.get('status')
  const setId = sp.get('set_id')
  const type = sp.get('type')
  const limit = Math.min(parseInt(sp.get('limit') ?? '500', 10) || 500, 1000)

  const db = getServiceSupabase()
  let q = db
    .from('inventory_pieces')
    .select('*')
    .order('id', { ascending: true })
    .limit(limit)

  if (territories && territories.length > 0) q = q.in('territory', territories)
  if (status && isValidStatus(status)) q = q.eq('status', status)
  if (type) q = q.eq('type', type)
  if (setId) {
    if (setId === 'null') q = q.is('set_id', null)
    else q = q.eq('set_id', parseInt(setId, 10))
  }

  const { data, error } = await q
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ pieces: data ?? [] })
}

export async function POST(req: NextRequest) {
  const user = requireAuth(req, { adminOnly: true })
  if (user instanceof NextResponse) return user

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const {
    barcode,
    label,
    type,
    territory = 'WW',
    set_id = null,
    condition = 'good',
    notes = null,
  } = body

  if (!barcode || typeof barcode !== 'string' || !barcode.trim()) {
    return NextResponse.json({ error: 'barcode is required' }, { status: 400 })
  }
  if (!isValidCondition(condition)) {
    return NextResponse.json(
      { error: 'condition must be good, worn, needs_repair, or damaged' },
      { status: 400 }
    )
  }

  const db = getServiceSupabase()

  // Reject duplicate barcodes with a clean message instead of letting the
  // unique constraint throw a generic 500.
  const { data: existing } = await db
    .from('inventory_pieces')
    .select('id')
    .eq('barcode', barcode.trim())
    .maybeSingle()
  if (existing) {
    return NextResponse.json(
      { error: 'A piece with this barcode already exists', existing_id: existing.id },
      { status: 409 }
    )
  }

  const { data, error } = await db
    .from('inventory_pieces')
    .insert({
      barcode: barcode.trim(),
      label: label ?? null,
      type: type ?? null,
      territory: String(territory).toUpperCase(),
      status: 'in_stock',
      set_id,
      condition,
      notes,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await logInventoryEvent({
    pieceId: data.id,
    setId: data.set_id,
    helperId: user.id,
    eventType: 'created',
    toState: 'in_stock',
    metadata: { barcode: data.barcode, label: data.label, type: data.type },
  })

  return NextResponse.json({ piece: data }, { status: 201 })
}

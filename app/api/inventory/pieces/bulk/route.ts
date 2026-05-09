// app/api/inventory/pieces/bulk/route.ts
// POST /api/inventory/pieces/bulk — create N pieces in one shot (admin only)
//
// Body example:
//   {
//     "count": 12,
//     "barcode_prefix": "HBD-PINK-LG-",   // pieces will be HBD-PINK-LG-001, -002, ...
//     "barcode_start": 1,                 // optional, default 1
//     "barcode_pad": 3,                   // optional, default 3 → "001"
//     "label_template": "Pink HBD Letter {n}",  // optional, {n} replaced with index
//     "type": "letter",
//     "territory": "WW",
//     "set_id": 5,                        // optional
//     "condition": "good"
//   }

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getServiceSupabase } from '@/lib/supabase'
import { logInventoryEvent, isValidCondition } from '@/lib/inventory'

export async function POST(req: NextRequest) {
  const user = requireAuth(req, { adminOnly: true })
  if (user instanceof NextResponse) return user

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const count = parseInt(body.count, 10)
  const barcode_prefix: string = body.barcode_prefix
  const barcode_start = parseInt(body.barcode_start ?? '1', 10) || 1
  const barcode_pad = parseInt(body.barcode_pad ?? '3', 10) || 3
  const label_template: string | null = body.label_template ?? null
  const type: string | null = body.type ?? null
  const territory = String(body.territory ?? 'WW').toUpperCase()
  const set_id: number | null = body.set_id ?? null
  const condition = body.condition ?? 'good'

  if (!count || count < 1 || count > 200) {
    return NextResponse.json(
      { error: 'count must be between 1 and 200' },
      { status: 400 }
    )
  }
  if (!barcode_prefix || typeof barcode_prefix !== 'string') {
    return NextResponse.json({ error: 'barcode_prefix is required' }, { status: 400 })
  }
  if (!isValidCondition(condition)) {
    return NextResponse.json(
      { error: 'condition must be good, worn, needs_repair, or damaged' },
      { status: 400 }
    )
  }

  // Build the rows
  const rows = []
  for (let i = 0; i < count; i++) {
    const n = barcode_start + i
    const barcode = `${barcode_prefix}${String(n).padStart(barcode_pad, '0')}`
    const label = label_template ? label_template.replace(/\{n\}/g, String(n)) : null
    rows.push({
      barcode,
      label,
      type,
      territory,
      status: 'in_stock' as const,
      set_id,
      condition,
    })
  }

  const db = getServiceSupabase()

  // Pre-flight: check if any of these barcodes already exist.
  // Better to fail fast with a clean message than partially insert.
  const barcodes = rows.map((r) => r.barcode)
  const { data: existing, error: existingErr } = await db
    .from('inventory_pieces')
    .select('barcode')
    .in('barcode', barcodes)
  if (existingErr) {
    return NextResponse.json({ error: existingErr.message }, { status: 500 })
  }
  if (existing && existing.length > 0) {
    return NextResponse.json(
      {
        error: 'Some barcodes already exist',
        conflicting_barcodes: existing.map((e: any) => e.barcode),
      },
      { status: 409 }
    )
  }

  // Bulk insert
  const { data, error } = await db.from('inventory_pieces').insert(rows).select()
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Log a single bulk-creation event referencing all created pieces.
  // Plus one per-piece 'created' event for piece-level history pages.
  const createdIds = (data ?? []).map((d: any) => d.id)
  await logInventoryEvent({
    setId: set_id,
    helperId: user.id,
    eventType: 'created',
    toState: 'in_stock',
    metadata: {
      bulk: true,
      count: createdIds.length,
      piece_ids: createdIds,
      barcode_prefix,
      type,
      territory,
    },
  })

  // Per-piece events (so individual piece histories show their creation)
  await Promise.all(
    (data ?? []).map((p: any) =>
      logInventoryEvent({
        pieceId: p.id,
        setId: p.set_id,
        helperId: user.id,
        eventType: 'created',
        toState: 'in_stock',
        metadata: { bulk: true, barcode: p.barcode },
      })
    )
  )

  return NextResponse.json(
    {
      created: data?.length ?? 0,
      pieces: data ?? [],
    },
    { status: 201 }
  )
}

// app/api/inventory/print/bulk/route.ts
//
// Bulk-print endpoint. Takes a JSON body of piece_ids and returns one big
// ZPL stream that prints every label in sequence. Useful when a shipment
// arrives and you need to label 50 pieces at once.
//
// POST /api/inventory/print/bulk
//   body: { piece_ids: [123, 124, 125, ...], copies_each?: 1 }
//   returns: ZPL as text/plain (one ^XA...^XZ block per piece, concatenated)

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getServiceSupabase } from '@/lib/supabase'
import { generateZplBatch } from '@/lib/zpl'
import { buildQrUrl } from '@/lib/qr'

export async function POST(req: NextRequest) {
  const user = requireAuth(req, { adminOnly: true })
  if (user instanceof NextResponse) return user

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const pieceIds: number[] = Array.isArray(body.piece_ids) ? body.piece_ids : []
  const copiesEach = Math.max(1, Math.min(parseInt(body.copies_each || '1', 10) || 1, 10))

  if (pieceIds.length === 0) {
    return NextResponse.json({ error: 'piece_ids required' }, { status: 400 })
  }
  if (pieceIds.length > 200) {
    return NextResponse.json(
      { error: 'Maximum 200 pieces per batch' },
      { status: 400 }
    )
  }

  const db = getServiceSupabase()
  const { data: pieces, error } = await db
    .from('inventory_pieces')
    .select('id, barcode, label, qr_token')
    .in('id', pieceIds)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!pieces || pieces.length === 0) {
    return NextResponse.json({ error: 'No pieces found' }, { status: 404 })
  }

  const inputs = pieces.map(p => ({
    qrPayload: buildQrUrl(p.barcode, p.qr_token),
    labelName: p.label || p.barcode,
    sku: p.barcode,
    copies: copiesEach,
  }))

  const zpl = generateZplBatch(inputs)

  // If requested, return JSON (useful for the UI to show "X labels queued")
  if (req.nextUrl.searchParams.get('json') === '1') {
    return NextResponse.json({
      count: pieces.length,
      copies_each: copiesEach,
      total_labels: pieces.length * copiesEach,
      zpl,
    })
  }

  return new NextResponse(zpl, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

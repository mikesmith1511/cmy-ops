// app/api/inventory/print/[piece_id]/route.ts
//
// Returns ZPL for printing a single piece's sticker.
//
// GET  /api/inventory/print/123              → ZPL as text/plain
// GET  /api/inventory/print/123?json=1       → JSON { zpl, qr_url, ... }
// GET  /api/inventory/print/123?copies=3     → 3 copies in one ZPL stream
//
// The browser-side admin UI calls this, then hands the ZPL string to
// the Zebra Browser Print JavaScript library, which talks to the local
// Zebra GX430T over USB. We never touch the printer directly from the
// server — that's not how Browser Print works.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getServiceSupabase } from '@/lib/supabase'
import { generateZpl } from '@/lib/zpl'
import { buildQrUrl } from '@/lib/qr'

interface Params {
  params: { piece_id: string }
}

export async function GET(req: NextRequest, { params }: Params) {
  const user = requireAuth(req, { adminOnly: true })
  if (user instanceof NextResponse) return user

  const pieceId = parseInt(params.piece_id, 10)
  if (isNaN(pieceId)) {
    return NextResponse.json({ error: 'Invalid piece id' }, { status: 400 })
  }

  const sp = req.nextUrl.searchParams
  const wantJson = sp.get('json') === '1'
  const copies = Math.max(1, Math.min(parseInt(sp.get('copies') || '1', 10) || 1, 50))

  const db = getServiceSupabase()
  const { data: piece, error } = await db
    .from('inventory_pieces')
    .select('id, barcode, label, qr_token')
    .eq('id', pieceId)
    .single()

  if (error || !piece) {
    return NextResponse.json({ error: 'Piece not found' }, { status: 404 })
  }

  const qrUrl = buildQrUrl(piece.barcode, piece.qr_token)

  const zpl = generateZpl({
    qrPayload: qrUrl,
    labelName: piece.label || piece.barcode,
    sku: piece.barcode,
    copies,
  })

  if (wantJson) {
    return NextResponse.json({
      piece_id: piece.id,
      barcode: piece.barcode,
      label: piece.label,
      qr_url: qrUrl,
      copies,
      zpl,
    })
  }

  // Return ZPL as plain text. Zebra Browser Print expects to receive raw ZPL.
  return new NextResponse(zpl, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

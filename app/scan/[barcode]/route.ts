// app/scan/[barcode]/route.ts
//
// The QR scan endpoint. This is what every sticker URL points to.
//
// Flow:
//   1. Look up the piece by barcode
//   2. Validate the ?t= token matches qr_token in DB (anti-forgery)
//   3. Branch by auth state:
//      - Authenticated staff (helper or admin) → redirect to /admin?scan=<id>
//        which the admin UI will read and open the piece detail panel
//      - Unauthenticated customer / invalid token / unknown barcode →
//        302 redirect to cardmyyard.com with UTM params (marketing win)
//
// Why a route handler (route.ts) instead of a page (page.tsx)?
//   We want pure server-side redirects. No React, no flash of content,
//   no SEO indexing of internal piece IDs. Just HTTP 302.

import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { getAuthedUser } from '@/lib/auth'
import { getMarketingRedirectUrl } from '@/lib/qr'
import { logInventoryEvent } from '@/lib/inventory'

interface Params {
  params: { barcode: string }
}

export async function GET(req: NextRequest, { params }: Params) {
  const { barcode } = params
  const token = req.nextUrl.searchParams.get('t') || ''

  // Always-honored fallback: any failure path redirects the customer to
  // the marketing site. We never throw or render an error to a scanner —
  // worst case, they land on cardmyyard.com.
  const marketingFallback = () =>
    NextResponse.redirect(getMarketingRedirectUrl(barcode), 302)

  if (!barcode) return marketingFallback()

  const db = getServiceSupabase()

  // Look up the piece. We select only what we need to keep this fast.
  const { data: piece, error } = await db
    .from('inventory_pieces')
    .select('id, barcode, qr_token, status, set_id, territory')
    .eq('barcode', barcode)
    .maybeSingle()

  if (error || !piece) {
    // Unknown barcode — could be a sticker from a different system,
    // a typo, or a forged URL. Either way, send them to marketing.
    return marketingFallback()
  }

  // Validate token. Constant-time-ish comparison via length check first
  // to short-circuit obviously wrong values.
  if (!token || token.length !== piece.qr_token.length || token !== piece.qr_token) {
    return marketingFallback()
  }

  // Token valid. Now check auth state.
  const user = getAuthedUser(req)

  if (!user) {
    // Customer scanned a real, valid sticker but isn't logged in as staff.
    // This is the most common case — neighbors, party guests, curious kids.
    // Send them to the marketing site with the sign_id in UTM so we know
    // which physical sign drove the scan.
    return marketingFallback()
  }

  // Authenticated staff member. Log the scan event and route them to admin
  // with a query param indicating which piece to focus on.
  // (Future Phase 2C will build a dedicated /scan UI for in-field check-in/out.)
  await logInventoryEvent({
    pieceId: piece.id,
    setId: piece.set_id,
    helperId: user.id,
    eventType: 'state_change',
    metadata: {
      scan: true,
      via: 'qr',
      current_status: piece.status,
      user_role: user.role,
    },
  })

  // Redirect to admin with focus param. Admin UI can pick this up to
  // pre-select the piece and scroll to it.
  const adminUrl = new URL('/admin', req.url)
  adminUrl.searchParams.set('scan', String(piece.id))
  adminUrl.hash = `piece-${piece.id}`
  return NextResponse.redirect(adminUrl, 302)
}

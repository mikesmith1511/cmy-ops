// app/api/inventory/sets/route.ts
// GET  /api/inventory/sets       — list sets with filters
// POST /api/inventory/sets       — create a new set (admin only)

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getServiceSupabase } from '@/lib/supabase'
import { logInventoryEvent, parseTerritoriesParam } from '@/lib/inventory'

export async function GET(req: NextRequest) {
  const user = requireAuth(req)
  if (user instanceof NextResponse) return user

  const sp = req.nextUrl.searchParams
  const territories = parseTerritoriesParam(sp.get('territory'))
  const category = sp.get('category')
  const occasion = sp.get('occasion')
  const includeInactive = sp.get('include_inactive') === 'true'

  const db = getServiceSupabase()
  let q = db.from('inventory_sets').select('*').order('name', { ascending: true })

  if (!includeInactive) q = q.eq('active', true)
  if (territories && territories.length > 0) q = q.in('territory', territories)
  if (category) q = q.eq('category', category)
  if (occasion) q = q.contains('occasion', [occasion])

  const { data, error } = await q
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ sets: data ?? [] })
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
    name,
    territory = 'WW',
    category,
    occasion,
    theme,
    colors,
    description,
    preview_image_url,
  } = body

  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const db = getServiceSupabase()
  const { data, error } = await db
    .from('inventory_sets')
    .insert({
      name: name.trim(),
      territory: String(territory).toUpperCase(),
      category: category ?? null,
      occasion: Array.isArray(occasion) ? occasion : null,
      theme: theme ?? null,
      colors: Array.isArray(colors) ? colors : null,
      description: description ?? null,
      preview_image_url: preview_image_url ?? null,
      piece_count: 0,
      active: true,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await logInventoryEvent({
    setId: data.id,
    helperId: user.id,
    eventType: 'created',
    metadata: { name: data.name, territory: data.territory },
  })

  return NextResponse.json({ set: data }, { status: 201 })
}

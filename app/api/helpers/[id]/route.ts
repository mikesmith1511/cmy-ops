import { NextRequest, NextResponse } from 'next/server'
import { isAdmin } from '@/lib/auth'
import { getServiceSupabase } from '@/lib/supabase'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = getServiceSupabase()
  const body = await req.json()
  const updates: any = {}
  if (body.approved !== undefined) updates.approved = body.approved
  if (body.payOverride !== undefined) updates.pay_override = body.payOverride || null
  if (body.territory !== undefined) updates.territory = body.territory
  if (body.villagesRealtyApproved !== undefined) updates.villages_realty_approved = body.villagesRealtyApproved
  const { data, error } = await db.from('helpers').update(updates).eq('id', parseInt(params.id)).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = getServiceSupabase()
  const { error } = await db.from('helpers').delete().eq('id', parseInt(params.id))
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

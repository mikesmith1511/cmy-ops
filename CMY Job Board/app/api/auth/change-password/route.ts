import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getTokenFromRequest } from '@/lib/auth'
import { getServiceSupabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const token = getTokenFromRequest(req)
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { currentPassword, newPassword } = await req.json()
  if (!newPassword || newPassword.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }
  if (token.role === 'helper') {
    const db = getServiceSupabase()
    const { data: helper } = await db.from('helpers').select('password_hash').eq('id', token.id).single()
    if (!helper) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const valid = await bcrypt.compare(currentPassword, helper.password_hash)
    if (!valid) return NextResponse.json({ error: 'Current password incorrect' }, { status: 401 })
    const hash = await bcrypt.hash(newPassword, 12)
    await db.from('helpers').update({ password_hash: hash }).eq('id', token.id)
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'Admin password changes must be done via Vercel environment variables' }, { status: 400 })
}

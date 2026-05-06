import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { signToken } from '@/lib/auth'
import { getServiceSupabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { email, password, role } = await req.json()

  if (role === 'admin') {
    const adminEmail = process.env.ADMIN_EMAIL
    const adminHash = process.env.ADMIN_PASSWORD_HASH
    if (!adminEmail || !adminHash) {
      return NextResponse.json({ error: 'Admin not configured' }, { status: 500 })
    }
    if (email.toLowerCase() !== adminEmail.toLowerCase()) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }
    const valid = await bcrypt.compare(password, adminHash)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }
    const token = signToken({ role: 'admin', email: adminEmail })
    const res = NextResponse.json({ ok: true, role: 'admin' })
    res.cookies.set('cmy_session', token, {
      httpOnly: true, secure: true, sameSite: 'strict', maxAge: 60 * 60 * 8
    })
    return res
  }

  if (role === 'helper') {
    const db = getServiceSupabase()
    const { data: helper, error } = await db
      .from('helpers')
      .select('*')
      .eq('email', email.toLowerCase())
      .single()
    if (error || !helper) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }
    const valid = await bcrypt.compare(password, helper.password_hash)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }
    const token = signToken({ role: 'helper', id: helper.id, email: helper.email, name: helper.name })
    const res = NextResponse.json({
      ok: true, role: 'helper',
      helper: { id: helper.id, name: helper.name, email: helper.email, territory: helper.territory, approved: helper.approved }
    })
    res.cookies.set('cmy_session', token, {
      httpOnly: true, secure: true, sameSite: 'strict', maxAge: 60 * 60 * 8
    })
    return res
  }

  return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
}

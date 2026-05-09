import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { signToken } from '@/lib/auth'
import { getServiceSupabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { email, password, role } = await req.json()

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
  }

  if (role !== 'admin' && role !== 'helper') {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

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

  // Enforce that the requested login role matches the helper's actual role.
  // Prevents a helper from logging in via the admin form and vice versa.
  if (helper.role !== role) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  // Helpers must be approved before they can log in. Admins bypass this check.
  if (helper.role === 'helper' && !helper.approved) {
    return NextResponse.json({ error: 'Account pending approval' }, { status: 403 })
  }

  const token = signToken({
    id: helper.id,
    email: helper.email,
    role: helper.role,
    name: helper.name,
    territory: helper.territory,
  })

  const res = NextResponse.json({
    ok: true,
    role: helper.role,
    user: {
      id: helper.id,
      name: helper.name,
      email: helper.email,
      role: helper.role,
      territory: helper.territory,
      approved: helper.approved,
    },
  })

  res.cookies.set('cmy_session', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 60 * 60 * 8,
  })

  return res
}

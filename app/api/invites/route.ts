import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { isAdmin } from '@/lib/auth'
import { getServiceSupabase } from '@/lib/supabase'
export const dynamic = 'force-dynamic'
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = getServiceSupabase()
  const { data, error } = await db.from('invites').select('*').order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const db = getServiceSupabase()
  const body = await req.json()

  // Generate invite (admin only)
  if (body.action === 'create') {
    if (!isAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const code = generateCode()
    const { data, error } = await db.from('invites').insert({
      code, name: body.name || null, email: body.email || null, territory: body.territory || 'WW'
    }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  // Validate invite code (public — helpers use this during signup)
  if (body.action === 'validate') {
    const { data, error } = await db.from('invites')
      .select('*').eq('code', body.code.toUpperCase()).eq('used', false).single()
    if (error || !data) return NextResponse.json({ error: 'Invalid or used invite code' }, { status: 404 })
    return NextResponse.json({ valid: true, territory: data.territory, name: data.name, email: data.email })
  }

  // Complete signup (public — helpers use this)
  if (body.action === 'signup') {
    const { code, name, email, phone, password } = body
    if (!code || !name || !email || !password) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }

    // Validate invite
    const { data: invite } = await db.from('invites')
      .select('*').eq('code', code.toUpperCase()).eq('used', false).single()
    if (!invite) return NextResponse.json({ error: 'Invalid or used invite code' }, { status: 400 })

    // Check email not taken
    const { data: existing } = await db.from('helpers').select('id').eq('email', email.toLowerCase()).single()
    if (existing) return NextResponse.json({ error: 'An account with that email already exists' }, { status: 409 })

    const passwordHash = await bcrypt.hash(password, 12)
    const { data: helper, error: helperError } = await db.from('helpers').insert({
      name, email: email.toLowerCase(), phone: phone || null,
      territory: invite.territory, password_hash: passwordHash,
      invite_code: code.toUpperCase(), approved: false
    }).select('id, name, email, territory, approved').single()

    if (helperError) return NextResponse.json({ error: helperError.message }, { status: 500 })

    // Mark invite used
    await db.from('invites').update({ used: true, used_by: email, used_at: new Date().toISOString() }).eq('code', code.toUpperCase())

    return NextResponse.json({ ok: true, helper })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}

export async function DELETE(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  if (!code) return NextResponse.json({ error: 'Code required' }, { status: 400 })
  const db = getServiceSupabase()
  await db.from('invites').delete().eq('code', code)
  return NextResponse.json({ ok: true })
}

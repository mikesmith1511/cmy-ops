import { NextRequest, NextResponse } from 'next/server'
import { getTokenFromRequest } from '@/lib/auth'
import { getServiceSupabase } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const token = getTokenFromRequest(req)
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Base response
  const base: any = { role: token.role, email: token.email, id: token.id, name: token.name }

  // For helper role, fetch live approval status from DB
  // (admin can flip approved at any time; we don't want stale token data)
  if (token.role === 'helper' && token.id) {
    const db = getServiceSupabase()
    const { data, error } = await db
      .from('helpers')
      .select('approved, territory, pay_override')
      .eq('id', token.id)
      .single()
    if (!error && data) {
      base.approved = data.approved
      base.territory = data.territory
      base.pay_override = data.pay_override
    }
  }

  return NextResponse.json(base)
}
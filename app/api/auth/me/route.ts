import { NextRequest, NextResponse } from 'next/server'
import { getTokenFromRequest } from '@/lib/auth'
import { getServiceSupabase } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const token = getTokenFromRequest(req)
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const base: any = { role: token.role, email: token.email, id: token.id, name: token.name }

  if (token.role === 'helper' && token.id) {
    const db = getServiceSupabase()
    const { data, error } = await db
      .from('helpers')
      .select('approved, territory, pay_override, villages_realty_approved')
      .eq('id', token.id)
      .single()
    if (!error && data) {
      base.approved = data.approved
      base.territory = data.territory
      base.pay_override = data.pay_override
      base.villages_realty_approved = data.villages_realty_approved
    }
  }

  return NextResponse.json(base)
}

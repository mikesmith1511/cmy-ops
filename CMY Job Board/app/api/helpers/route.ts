import { NextRequest, NextResponse } from 'next/server'
import { isAdmin } from '@/lib/auth'
import { getServiceSupabase } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = getServiceSupabase()
  const { data, error } = await db
    .from('helpers')
    .select('id, name, email, phone, territory, approved, pay_override, jobs_done, invite_code, created_at, updated_at')
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

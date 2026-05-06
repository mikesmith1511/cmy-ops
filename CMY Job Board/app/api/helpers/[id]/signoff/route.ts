import { NextRequest, NextResponse } from 'next/server'
import { isAdmin, getTokenFromRequest } from '@/lib/auth'
import { getServiceSupabase } from '@/lib/supabase'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const token = getTokenFromRequest(req)
  const db = getServiceSupabase()
  const { moduleId } = await req.json()
  const { data, error } = await db.from('training_completions')
    .upsert({
      helper_id: parseInt(params.id),
      module_id: moduleId,
      signed_off_at: new Date().toISOString(),
      signed_off_by: token?.email || 'admin'
    }, { onConflict: 'helper_id,module_id' })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

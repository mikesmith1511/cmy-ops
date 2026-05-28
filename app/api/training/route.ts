import { NextRequest, NextResponse } from 'next/server'
import { getTokenFromRequest, isAdmin } from '@/lib/auth'
import { getServiceSupabase } from '@/lib/supabase'
export const dynamic = 'force-dynamic'
export async function GET(req: NextRequest) {
  const token = getTokenFromRequest(req)
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = getServiceSupabase()

  const { data: modules, error } = await db
    .from('training_modules')
    .select('*')
    .order('sort_order', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // If helper, include their completion status
  if (token.role === 'helper') {
    const { data: completions } = await db
      .from('training_completions')
      .select('*')
      .eq('helper_id', token.id)
    return NextResponse.json({ modules, completions: completions || [] })
  }

  // Admin — get all completions grouped by helper
  const { data: completions } = await db.from('training_completions').select('*')
  return NextResponse.json({ modules, completions: completions || [] })
}

export async function POST(req: NextRequest) {
  const token = getTokenFromRequest(req)
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = getServiceSupabase()
  const body = await req.json()

  // Admin: create module
  if (body.action === 'create' && isAdmin(req)) {
    const { data, error } = await db.from('training_modules').insert({
      title: body.title, description: body.description || null,
      video_url: body.videoUrl || null, required: body.required !== false,
      sort_order: body.sortOrder || 0
    }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  // Helper: mark module complete
  if (body.action === 'complete' && token.role === 'helper') {
    const { data, error } = await db.from('training_completions')
      .upsert({ helper_id: token.id, module_id: body.moduleId, completed_at: new Date().toISOString() }, { onConflict: 'helper_id,module_id' })
      .select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  return NextResponse.json({ error: 'Invalid action or unauthorized' }, { status: 400 })
}

export async function DELETE(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })
  const db = getServiceSupabase()
  await db.from('training_modules').delete().eq('id', parseInt(id))
  return NextResponse.json({ ok: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { getTokenFromRequest } from '@/lib/auth'
import { getServiceSupabase } from '@/lib/supabase'

// =============================================================
// POST /api/jobs/[id]/photo
//
// Accepts multipart/form-data with field 'photo' (image file).
// Uploads to Supabase Storage 'job-photos' bucket, then writes the
// public URL to jobs.photo_url and timestamps photo_uploaded_at.
//
// Auth:
//   - Helpers: can only upload to jobs they've claimed
//   - Admin: can upload to any job
// =============================================================

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const token = getTokenFromRequest(req)
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const jobId = parseInt(params.id)
  if (isNaN(jobId)) return NextResponse.json({ error: 'Invalid job id' }, { status: 400 })

  const db = getServiceSupabase()

  // Verify the job exists and the caller has rights
  const { data: job, error: jobErr } = await db.from('jobs').select('*').eq('id', jobId).single()
  if (jobErr || !job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  if (token.role === 'helper' && job.helper_id !== token.id) {
    return NextResponse.json({ error: 'Not your job' }, { status: 403 })
  }

  // Parse the uploaded file from multipart form data
  let file: File | null = null
  try {
    const form = await req.formData()
    const f = form.get('photo')
    if (f instanceof File) file = f
  } catch (e: any) {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }
  if (!file) return NextResponse.json({ error: 'No photo file provided' }, { status: 400 })

  // Basic validation
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'File must be an image' }, { status: 400 })
  }
  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large (max 20MB)' }, { status: 400 })
  }

  // Build a unique storage path
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const safeExt = /^[a-z0-9]+$/.test(ext) ? ext : 'jpg'
  const rand = Math.random().toString(36).substring(2, 12)
  const path = `jobs/${jobId}-${Date.now()}-${rand}.${safeExt}`

  // Upload to Supabase Storage
  const buf = Buffer.from(await file.arrayBuffer())
  const { error: upErr } = await db.storage.from('job-photos').upload(path, buf, {
    contentType: file.type,
    upsert: false,
  })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  // Get the public URL (bucket is public)
  const { data: pub } = db.storage.from('job-photos').getPublicUrl(path)
  const photoUrl = pub.publicUrl

  // Save URL + timestamp on the job
  const { data: updated, error: updErr } = await db
    .from('jobs')
    .update({ photo_url: photoUrl, photo_uploaded_at: new Date().toISOString() })
    .eq('id', jobId)
    .select()
    .single()

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, photo_url: photoUrl, job: updated })
}

// =============================================================
// DELETE /api/jobs/[id]/photo
// Admin only. Removes the photo URL from the job (does NOT delete
// the file from storage; that can be a periodic cleanup task).
// =============================================================
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const token = getTokenFromRequest(req)
  if (!token || token.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const jobId = parseInt(params.id)
  if (isNaN(jobId)) return NextResponse.json({ error: 'Invalid job id' }, { status: 400 })

  const db = getServiceSupabase()
  const { data, error } = await db
    .from('jobs')
    .update({ photo_url: null, photo_uploaded_at: null })
    .eq('id', jobId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, job: data })
}

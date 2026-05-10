import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

// =============================================================
// POST /api/sync/jobs
//
// Accepts a payload of jobs from the Apps Script bridge and
// upserts them into the jobs table.
//
// Auth: requires x-sync-key header matching SYNC_API_KEY env var.
//
// Behavior:
//   - Upserts by dedup_key (preserves helper_id and status)
//   - Updates data fields (address, customer, details, etc.)
//   - Soft-deletes (status='cancelled') any sync-sourced jobs
//     whose dedup_key isn't in the incoming payload
//   - Manual-entry jobs are never touched by sync
//
// Payload shape:
// {
//   "jobs": [
//     {
//       "dedup_key": "ord:2814054",  // required
//       "setup_date": "2026-06-02",
//       "event_date": "2026-06-03",
//       "address": "868 Livingston Loop The Villages, FL 32162",
//       "customer": "Mike Cullipher",
//       "details": "Package: HAPPY BIRTHDAY...",
//       "contact": "cullie@aol.com (919) 656-6522",
//       "territory": "The Villages",
//       "type": "standard",
//       "order_num": "2814054"
//     }
//   ]
// }
// =============================================================

export async function POST(req: NextRequest) {
  // 1. Auth
  const providedKey = req.headers.get('x-sync-key')
  const expectedKey = process.env.SYNC_API_KEY
  if (!expectedKey) {
    return NextResponse.json(
      { error: 'SYNC_API_KEY not configured on server' },
      { status: 500 }
    )
  }
  if (!providedKey || providedKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Parse body
  let body: { jobs?: any[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const incoming = Array.isArray(body.jobs) ? body.jobs : []
  if (incoming.length === 0) {
    return NextResponse.json({
      synced: 0,
      cancelled: 0,
      message: 'Empty payload, nothing to sync'
    })
  }

  const db = getServiceSupabase()
  const now = new Date().toISOString()

  // 3. Build the upsert payload
  // For each incoming job, we need to be careful:
  //   - If a row with this dedup_key exists AND has a helper_id, we keep helper_id and status as-is
  //   - We always update data fields
  //   - We always set last_sync_at and sync_source='sheet'
  //
  // Supabase upsert with on_conflict gives us an all-or-nothing replace,
  // which would clobber helper_id. So instead we do a fetch-then-update/insert
  // for each row. That's slower but correct.

  let inserted = 0
  let updated = 0
  let errored = 0
  const errors: string[] = []

  // Get all existing rows for the incoming dedup_keys in one query
  const incomingKeys = incoming.map((j: any) => j.dedup_key).filter(Boolean)
  const { data: existingRows, error: fetchError } = await db
    .from('jobs')
    .select('id, dedup_key, helper_id, status')
    .in('dedup_key', incomingKeys)

  if (fetchError) {
    return NextResponse.json(
      { error: 'Fetch existing failed: ' + fetchError.message },
      { status: 500 }
    )
  }

  const existingMap = new Map<string, { id: number; helper_id: number | null; status: string }>()
  ;(existingRows || []).forEach((row) => {
    if (row.dedup_key) existingMap.set(row.dedup_key, row)
  })

  for (const job of incoming) {
    if (!job.dedup_key) {
      errored++
      errors.push('Skipped row with no dedup_key: ' + JSON.stringify(job).substring(0, 100))
      continue
    }

    const existing = existingMap.get(job.dedup_key)

    // Common data-field payload
    const dataFields = {
      setup_date: job.setup_date || null,
      event_date: job.event_date || null,
      address: job.address || '',
      customer: job.customer || null,
      details: job.details || null,
      contact: job.contact || null,
      territory: job.territory || 'WW',
      type: job.type || 'standard',
      kind: job.kind || 'drop',
      order_num: job.order_num || null,
      sync_source: 'sheet',
      last_sync_at: now,
    }

    if (existing) {
      // Update existing - DO NOT touch helper_id or status
      const { error } = await db
        .from('jobs')
        .update(dataFields)
        .eq('id', existing.id)
      if (error) {
        errored++
        errors.push(`Update failed for ${job.dedup_key}: ${error.message}`)
      } else {
        updated++
      }
    } else {
      // Insert new
      const { error } = await db.from('jobs').insert({
        ...dataFields,
        dedup_key: job.dedup_key,
        status: 'pending',
      })
      if (error) {
        errored++
        errors.push(`Insert failed for ${job.dedup_key}: ${error.message}`)
      } else {
        inserted++
      }
    }
  }

  // 4. Link drop/pick pairs by matching dedup_key prefixes
  // After inserts, any newly-created drop+pick pair will have null paired_job_id.
  // Match them by stripping the 'drop:' / 'pick:' prefix and finding the partner.
  let paired = 0
  try {
    const { data: unpairedRows, error: unpairedErr } = await db
      .from('jobs')
      .select('id, dedup_key, kind, paired_job_id')
      .is('paired_job_id', null)

    if (!unpairedErr && unpairedRows && unpairedRows.length > 0) {
      // Build lookup: bareKey -> {drop?: id, pick?: id}
      const byBare = new Map<string, { drop?: number; pick?: number }>()
      for (const r of unpairedRows) {
        if (!r.dedup_key) continue
        const m = r.dedup_key.match(/^(drop|pick):(.+)$/)
        if (!m) continue
        const [, kind, bare] = m
        const slot = byBare.get(bare) || {}
        if (kind === 'drop') slot.drop = r.id
        else if (kind === 'pick') slot.pick = r.id
        byBare.set(bare, slot)
      }

      // For each pair where both legs exist, link them bidirectionally
      const pairUpdates: { id: number; paired_job_id: number }[] = []
      byBare.forEach(({ drop, pick }) => {
        if (drop && pick) {
          pairUpdates.push({ id: drop, paired_job_id: pick })
          pairUpdates.push({ id: pick, paired_job_id: drop })
        }
      })

      // Apply updates (sequential to keep things simple)
      for (const u of pairUpdates) {
        await db.from('jobs').update({ paired_job_id: u.paired_job_id }).eq('id', u.id)
      }
      paired = pairUpdates.length / 2 // count of pairs, not individual updates
    }
  } catch (e: any) {
    errors.push('Pair linking failed: ' + (e?.message || 'unknown'))
  }

  // 5. Soft-cancel any sheet-sourced jobs that weren't in the payload
  // Only cancel rows where:
  //   - sync_source = 'sheet' (we never touch manual rows)
  //   - status is still 'pending' (don't unclaim active jobs)
  //   - dedup_key is NOT in the incoming list
  // Build the not-in clause carefully - Supabase has a query length limit.
  let cancelled = 0
  if (incomingKeys.length > 0) {
    // First, find candidates to cancel
    const { data: cancelCandidates, error: candErr } = await db
      .from('jobs')
      .select('id, dedup_key')
      .eq('sync_source', 'sheet')
      .eq('status', 'pending')
      .not('dedup_key', 'in', `(${incomingKeys.map((k) => `"${k.replace(/"/g, '\\"')}"`).join(',')})`)

    if (candErr) {
      errors.push('Cancel sweep candidate query failed: ' + candErr.message)
    } else if (cancelCandidates && cancelCandidates.length > 0) {
      const idsToCancel = cancelCandidates.map((r) => r.id)
      const { error: updErr } = await db
        .from('jobs')
        .update({ status: 'cancelled', cancellation_acknowledged_at: null, last_sync_at: now })
        .in('id', idsToCancel)
      if (updErr) {
        errors.push('Cancel sweep update failed: ' + updErr.message)
      } else {
        cancelled = idsToCancel.length
      }
    }
  }

  return NextResponse.json({
    synced: inserted + updated,
    inserted,
    updated,
    paired,
    cancelled,
    errored,
    errors: errors.slice(0, 10), // limit error log size in response
    timestamp: now,
  })
}

export async function GET(req: NextRequest) {
  // Health check / config verifier
  const providedKey = req.headers.get('x-sync-key')
  const expectedKey = process.env.SYNC_API_KEY
  if (!providedKey || providedKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getServiceSupabase()
  const { count: totalJobs } = await db
    .from('jobs')
    .select('*', { count: 'exact', head: true })
  const { count: sheetJobs } = await db
    .from('jobs')
    .select('*', { count: 'exact', head: true })
    .eq('sync_source', 'sheet')
  const { count: pendingJobs } = await db
    .from('jobs')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')

  return NextResponse.json({
    status: 'ok',
    totalJobs,
    sheetJobs,
    pendingJobs,
    timestamp: new Date().toISOString(),
  })
}

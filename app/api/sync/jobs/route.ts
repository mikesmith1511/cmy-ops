import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

// =============================================================
// POST /api/sync/jobs — v2 (Sprint 2 ironclad)
//
// Accepts a payload of jobs from the Apps Script bridge and
// upserts them into the jobs table.
//
// Auth: requires x-sync-key header matching SYNC_API_KEY env var.
// Idempotency: optional x-request-id header. If the same request_id
//   is seen within 24h, the cached response is returned without
//   re-running anything.
//
// Behavior:
//   - Inserts new rows (atomic via UNIQUE INDEX on dedup_key)
//   - Updates existing rows (data fields only; preserves helper_id, status)
//   - Cancels sheet-sourced 'pending' rows missing from payload
//     (race-safe: includes status='pending' in UPDATE WHERE clause)
//   - Records cancellation history (cancelled_at, cancelled_reason)
//   - Pair-links drop/pick rows scoped to this run's dedup_keys only
//   - Logs every failure to sync_errors table
//   - Caches the response under request_id for 24h retry-safety
//
// Payload shape:
// {
//   "jobs": [
//     {
//       "dedup_key": "drop:ord:2814054",
//       "kind": "drop",
//       "setup_date": "2026-06-02",
//       "event_date": "2026-06-03",
//       "address": "868 Livingston Loop The Villages, FL 32162",
//       "customer": "Mike Cullipher",
//       "details": "Package: HAPPY BIRTHDAY...",
//       "contact": "cullie@aol.com (919) 656-6522",
//       "territory": "WW",
//       "type": "standard",
//       "order_num": "2814054"
//     }
//   ]
// }
// =============================================================

// ── CONSTANTS ──────────────────────────────────────────────
const IDEMPOTENCY_WINDOW_HOURS = 24
const EXISTENCE_BATCH_SIZE = 200    // chunk size for the "fetch existing" query
const MAX_PAYLOAD_JOBS = 5000        // sanity bound
const ALLOWED_STATUSES = ['pending', 'claimed', 'installed', 'complete', 'cancelled'] as const
const ALLOWED_TERRITORIES = ['WW', 'TV', 'CL', 'UK'] as const
const ALLOWED_TYPES = ['standard', 'pov', 'custom'] as const
const ALLOWED_KINDS = ['drop', 'pick'] as const

// ── TYPES ──────────────────────────────────────────────────
type IncomingJob = {
  dedup_key: string
  kind?: 'drop' | 'pick'
  setup_date?: string | null
  event_date?: string | null
  address?: string
  customer?: string | null
  details?: string | null
  contact?: string | null
  territory?: string
  type?: string
  order_num?: string | null
}

type SyncResult = {
  ok: true
  request_id: string | null
  cached: boolean
  inserted: number
  updated: number
  unchanged: number
  paired: number
  cancelled: number
  errored: number
  error_count: number
  timestamp: string
}

// ── HELPERS ────────────────────────────────────────────────
function isValidJob(j: any): j is IncomingJob {
  if (!j || typeof j !== 'object') return false
  if (typeof j.dedup_key !== 'string' || !j.dedup_key.trim()) return false
  if (typeof j.address !== 'string' || !j.address.trim()) return false
  if (j.kind && !ALLOWED_KINDS.includes(j.kind)) return false
  if (j.territory && !ALLOWED_TERRITORIES.includes(j.territory)) return false
  if (j.type && !ALLOWED_TYPES.includes(j.type)) return false
  return true
}

function normalizeJob(j: IncomingJob) {
  return {
    setup_date: j.setup_date || null,
    event_date: j.event_date || null,
    address: (j.address || '').trim(),
    customer: j.customer || null,
    details: j.details || null,
    contact: j.contact || null,
    territory: (j.territory || 'UK') as typeof ALLOWED_TERRITORIES[number],
    type: (j.type || 'standard') as typeof ALLOWED_TYPES[number],
    kind: (j.kind || 'drop') as typeof ALLOWED_KINDS[number],
    order_num: j.order_num || null,
  }
}

async function logSyncError(
  db: ReturnType<typeof getServiceSupabase>,
  args: {
    request_id: string | null
    dedup_key: string | null
    phase: 'validate' | 'insert' | 'update' | 'cancel' | 'pair' | 'auth' | 'unknown'
    error_code?: string
    error_msg: string
    payload?: any
  }
) {
  try {
    await db.from('sync_errors').insert({
      request_id: args.request_id,
      dedup_key: args.dedup_key,
      phase: args.phase,
      error_code: args.error_code || null,
      error_msg: args.error_msg,
      payload: args.payload || null,
    })
  } catch (e) {
    // Logging failed — fall back to console so Vercel logs catch it
    console.error('[sync] Failed to log error:', e, 'original:', args)
  }
}

// Chunk an array into smaller arrays.
// Used so the "fetch existing" query doesn't exceed PostgREST URL limits
// when syncing thousands of jobs.
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// =============================================================
// MAIN HANDLER
// =============================================================

export async function POST(req: NextRequest) {
  const now = new Date().toISOString()

  // ── 1. AUTH ────────────────────────────────────────────────
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

  // ── 2. IDEMPOTENCY CHECK ───────────────────────────────────
  const requestId = req.headers.get('x-request-id')
  const db = getServiceSupabase()

  if (requestId) {
    const cutoff = new Date(Date.now() - IDEMPOTENCY_WINDOW_HOURS * 3600 * 1000).toISOString()
    const { data: prior } = await db
      .from('sync_requests')
      .select('result_json, completed_at')
      .eq('request_id', requestId)
      .gte('received_at', cutoff)
      .maybeSingle()

    if (prior && prior.completed_at && prior.result_json) {
      // Replay the cached result
      return NextResponse.json({
        ...(prior.result_json as object),
        cached: true,
      })
    }

    // Record receipt (idempotent insert; if the row already exists from a
    // concurrent retry, that retry will pick up our completed result later)
    await db
      .from('sync_requests')
      .upsert(
        { request_id: requestId, received_at: now },
        { onConflict: 'request_id', ignoreDuplicates: true }
      )
  }

  // ── 3. PARSE & VALIDATE PAYLOAD ────────────────────────────
  let body: { jobs?: any[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const rawIncoming = Array.isArray(body.jobs) ? body.jobs : []
  if (rawIncoming.length === 0) {
    return NextResponse.json({
      ok: true,
      request_id: requestId,
      cached: false,
      inserted: 0,
      updated: 0,
      unchanged: 0,
      paired: 0,
      cancelled: 0,
      errored: 0,
      error_count: 0,
      timestamp: now,
      message: 'Empty payload, nothing to sync',
    })
  }
  if (rawIncoming.length > MAX_PAYLOAD_JOBS) {
    return NextResponse.json(
      { error: `Payload exceeds ${MAX_PAYLOAD_JOBS} jobs. Split into smaller batches.` },
      { status: 413 }
    )
  }

  // Filter to valid jobs only; log any that fail validation
  const incoming: IncomingJob[] = []
  let validationErrors = 0
  for (const raw of rawIncoming) {
    if (isValidJob(raw)) {
      incoming.push(raw)
    } else {
      validationErrors++
      await logSyncError(db, {
        request_id: requestId,
        dedup_key: raw?.dedup_key || null,
        phase: 'validate',
        error_msg: 'Invalid job shape (missing dedup_key, address, or bad enum value)',
        payload: raw,
      })
    }
  }

  // ── 4. FETCH EXISTING ROWS (chunked to avoid URL-length limits) ─
  const incomingKeys = incoming.map((j) => j.dedup_key)
  const existingMap = new Map<
    string,
    { id: number; helper_id: number | null; status: string; kind: string }
  >()

  for (const keyChunk of chunk(incomingKeys, EXISTENCE_BATCH_SIZE)) {
    const { data: existingRows, error: fetchError } = await db
      .from('jobs')
      .select('id, dedup_key, helper_id, status, kind')
      .in('dedup_key', keyChunk)

    if (fetchError) {
      await logSyncError(db, {
        request_id: requestId,
        dedup_key: null,
        phase: 'unknown',
        error_code: fetchError.code,
        error_msg: 'Existence-check fetch failed: ' + fetchError.message,
      })
      return NextResponse.json(
        { error: 'Existence-check failed', detail: fetchError.message },
        { status: 500 }
      )
    }

    ;(existingRows || []).forEach((row) => {
      if (row.dedup_key) existingMap.set(row.dedup_key, row)
    })
  }

  // ── 5. INSERT / UPDATE LOOP ───────────────────────────────
  let inserted = 0
  let updated = 0
  let unchanged = 0
  let errored = 0

  for (const job of incoming) {
    const fields = normalizeJob(job)
    const existing = existingMap.get(job.dedup_key)

    if (existing) {
      // Update path: preserve helper_id, status, and any other operational state.
      // We only touch data fields and the sync metadata.
      const { error, count } = await db
        .from('jobs')
        .update({
          ...fields,
          sync_source: 'sheet',
          last_sync_at: now,
        })
        .eq('id', existing.id)
        .select('id', { count: 'exact', head: true })

      if (error) {
        errored++
        await logSyncError(db, {
          request_id: requestId,
          dedup_key: job.dedup_key,
          phase: 'update',
          error_code: error.code,
          error_msg: error.message,
          payload: job,
        })
      } else if ((count ?? 0) === 0) {
        // Row disappeared between our fetch and our update — log it
        unchanged++
      } else {
        updated++
      }
    } else {
      // Insert path: rely on the new UNIQUE INDEX on dedup_key.
      // upsert with ignoreDuplicates handles the race where two concurrent
      // sync runs both reach this point with the same dedup_key.
      const { data: insertData, error } = await db
        .from('jobs')
        .upsert(
          {
            ...fields,
            dedup_key: job.dedup_key,
            status: 'pending',
            sync_source: 'sheet',
            last_sync_at: now,
          },
          { onConflict: 'dedup_key', ignoreDuplicates: true }
        )
        .select('id')

      if (error) {
        errored++
        await logSyncError(db, {
          request_id: requestId,
          dedup_key: job.dedup_key,
          phase: 'insert',
          error_code: error.code,
          error_msg: error.message,
          payload: job,
        })
      } else if (insertData && insertData.length > 0) {
        inserted++
      } else {
        // ignoreDuplicates returned nothing: another concurrent run beat us.
        // Treat as unchanged.
        unchanged++
      }
    }
  }

  // ── 6. PAIR-LINK DROP/PICK PAIRS (scoped to this run's keys) ──
  // Old code scanned the entire jobs table. New code only looks at rows
  // we just touched, plus their potential partners.
  let paired = 0
  try {
    // Build the set of "bare keys" we just synced (strip drop:/pick: prefix)
    const bareKeys = new Set<string>()
    for (const k of incomingKeys) {
      const m = k.match(/^(drop|pick):(.+)$/)
      if (m) bareKeys.add(m[2])
    }

    if (bareKeys.size > 0) {
      // Build the lookup keys we need to check: each bare key in both prefixed forms
      const lookupKeys: string[] = []
      bareKeys.forEach((b) => {
        lookupKeys.push('drop:' + b)
        lookupKeys.push('pick:' + b)
      })

      // Fetch only the rows for THIS run (in chunks)
      const allRows: Array<{
        id: number
        dedup_key: string | null
        kind: string
        paired_job_id: number | null
      }> = []
      for (const lkChunk of chunk(lookupKeys, EXISTENCE_BATCH_SIZE)) {
        const { data, error } = await db
          .from('jobs')
          .select('id, dedup_key, kind, paired_job_id')
          .in('dedup_key', lkChunk)
        if (error) {
          await logSyncError(db, {
            request_id: requestId,
            dedup_key: null,
            phase: 'pair',
            error_code: error.code,
            error_msg: 'Pair-lookup fetch failed: ' + error.message,
          })
          continue
        }
        if (data) allRows.push(...data)
      }

      // Group by bare key
      const byBare = new Map<string, { drop?: { id: number; paired_job_id: number | null }; pick?: { id: number; paired_job_id: number | null } }>()
      for (const r of allRows) {
        if (!r.dedup_key) continue
        const m = r.dedup_key.match(/^(drop|pick):(.+)$/)
        if (!m) continue
        const [, kind, bare] = m
        const slot = byBare.get(bare) || {}
        const partial = { id: r.id, paired_job_id: r.paired_job_id }
        if (kind === 'drop') slot.drop = partial
        else if (kind === 'pick') slot.pick = partial
        byBare.set(bare, slot)
      }

      // Update pairs that are missing the link
      const pairUpdates: { id: number; paired_job_id: number }[] = []
      byBare.forEach(({ drop, pick }) => {
        if (drop && pick) {
          if (drop.paired_job_id !== pick.id) pairUpdates.push({ id: drop.id, paired_job_id: pick.id })
          if (pick.paired_job_id !== drop.id) pairUpdates.push({ id: pick.id, paired_job_id: drop.id })
        }
      })

      for (const u of pairUpdates) {
        const { error } = await db.from('jobs').update({ paired_job_id: u.paired_job_id }).eq('id', u.id)
        if (error) {
          await logSyncError(db, {
            request_id: requestId,
            dedup_key: null,
            phase: 'pair',
            error_code: error.code,
            error_msg: `Pair-link update failed for job ${u.id}: ${error.message}`,
          })
        }
      }
      paired = pairUpdates.length / 2
    }
  } catch (e: any) {
    await logSyncError(db, {
      request_id: requestId,
      dedup_key: null,
      phase: 'pair',
      error_msg: 'Pair-link exception: ' + (e?.message || 'unknown'),
    })
  }

  // ── 7. CANCEL SWEEP (race-safe, with audit trail) ───────────
  // Find sheet-sourced 'pending' rows whose dedup_keys are NOT in this payload.
  // Use a SINGLE UPDATE with status='pending' in the WHERE clause so that
  // any row claimed by a helper between query and update is left alone.
  let cancelled = 0
  if (incomingKeys.length > 0) {
    try {
      // Step 1: fetch candidate rows in one go (no chunking needed because
      // the result set is bounded by how many sheet rows you have, not by
      // how many you're syncing).
      // We need the FULL set of sheet-sourced pending rows, then filter
      // out the ones whose dedup_keys ARE in the payload.
      const { data: allSheetPending, error: candErr } = await db
        .from('jobs')
        .select('id, dedup_key')
        .eq('sync_source', 'sheet')
        .eq('status', 'pending')

      if (candErr) {
        await logSyncError(db, {
          request_id: requestId,
          dedup_key: null,
          phase: 'cancel',
          error_code: candErr.code,
          error_msg: 'Cancel-sweep fetch failed: ' + candErr.message,
        })
      } else if (allSheetPending && allSheetPending.length > 0) {
        const incomingSet = new Set(incomingKeys)
        const idsToCancel = allSheetPending
          .filter((r) => r.dedup_key && !incomingSet.has(r.dedup_key))
          .map((r) => r.id)

        if (idsToCancel.length > 0) {
          // Step 2: race-safe UPDATE — include status='pending' so a
          // concurrent claim wins instead of being clobbered.
          // Chunk to keep the IN clause manageable.
          for (const idChunk of chunk(idsToCancel, EXISTENCE_BATCH_SIZE)) {
            const { error: updErr, count } = await db
              .from('jobs')
              .update({
                status: 'cancelled',
                cancelled_at: now,
                cancelled_reason: 'removed_from_sheet',
                last_sync_at: now,
              })
              .in('id', idChunk)
              .eq('status', 'pending') // <-- the race-safety clause
              .eq('sync_source', 'sheet')
              .select('id', { count: 'exact', head: true })

            if (updErr) {
              await logSyncError(db, {
                request_id: requestId,
                dedup_key: null,
                phase: 'cancel',
                error_code: updErr.code,
                error_msg: 'Cancel-sweep update failed: ' + updErr.message,
              })
            } else {
              cancelled += count ?? 0
            }
          }
        }
      }
    } catch (e: any) {
      await logSyncError(db, {
        request_id: requestId,
        dedup_key: null,
        phase: 'cancel',
        error_msg: 'Cancel-sweep exception: ' + (e?.message || 'unknown'),
      })
    }
  }

  // ── 8. COUNT ERRORS RECORDED FOR THIS REQUEST ─────────────
  let error_count = errored + validationErrors
  if (requestId) {
    const { count } = await db
      .from('sync_errors')
      .select('id', { count: 'exact', head: true })
      .eq('request_id', requestId)
    if (typeof count === 'number') error_count = count
  }

  // ── 9. BUILD RESULT ───────────────────────────────────────
  const result: SyncResult = {
    ok: true,
    request_id: requestId,
    cached: false,
    inserted,
    updated,
    unchanged,
    paired,
    cancelled,
    errored: errored + validationErrors,
    error_count,
    timestamp: now,
  }

  // ── 10. CACHE RESULT FOR IDEMPOTENCY REPLAY ───────────────
  if (requestId) {
    await db
      .from('sync_requests')
      .update({
        completed_at: now,
        result_json: result,
        job_count: incoming.length,
      })
      .eq('request_id', requestId)
  }

  return NextResponse.json(result)
}

// =============================================================
// GET /api/sync/jobs — health check
// =============================================================
export async function GET(req: NextRequest) {
  const providedKey = req.headers.get('x-sync-key')
  const expectedKey = process.env.SYNC_API_KEY
  if (!providedKey || providedKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getServiceSupabase()
  const [totals, sheetTotals, pendingTotals, recentErrors] = await Promise.all([
    db.from('jobs').select('*', { count: 'exact', head: true }),
    db.from('jobs').select('*', { count: 'exact', head: true }).eq('sync_source', 'sheet'),
    db.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    db
      .from('sync_errors')
      .select('id', { count: 'exact', head: true })
      .gte('occurred_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString()),
  ])

  return NextResponse.json({
    status: 'ok',
    totalJobs: totals.count ?? 0,
    sheetJobs: sheetTotals.count ?? 0,
    pendingJobs: pendingTotals.count ?? 0,
    errorsLast24h: recentErrors.count ?? 0,
    timestamp: new Date().toISOString(),
  })
}

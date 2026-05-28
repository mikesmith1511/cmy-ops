// =============================================================
// CMY Reports API — v2
// =============================================================
// GET /api/reports?from=&to=&basis=&territories=&helpers=&statuses=
//   &kinds=&types=
//
// All filters optional. Defaults applied per business rules:
//   - basis    = 'event_date'     (filter window applies to this date col)
//   - statuses = 'complete'       (default to completed work)
//   - kinds    = 'drop,pick'      (both legs)
//   - types    = (none, all)
//   - from/to  = (none, full range)
//
// Returns:
//   {
//     filters: { ...echoed back },
//     totals:  { jobs, completed, drops, picks, revenue, helpers, ... },
//     byHelper:     [{ id, name, ..., completed, earnings, ... }],
//     byTerritory:  [{ code, total, completed, revenue, helpers, ... }],
//     cross:        { helpers, territories, matrix },
//     jobs:         [...raw filtered rows for export]
//   }
// =============================================================

import { NextRequest, NextResponse } from 'next/server'
import { isAdmin } from '@/lib/auth'
import { getServiceSupabase } from '@/lib/supabase'
import { computeJobPay, payScaleForAddress, JobKind } from '@/lib/pay'

type DateBasis = 'event_date' | 'setup_date' | 'created_at' | 'updated_at'
const VALID_BASIS: DateBasis[] = ['event_date', 'setup_date', 'created_at', 'updated_at']

const DEFAULT_STATUSES = ['complete']
const DEFAULT_KINDS    = ['drop', 'pick']
const TERRITORY_CODES  = ['WW', 'TV', 'CL']

function parseCsv(v: string | null): string[] {
  if (!v) return []
  return v.split(',').map(s => s.trim()).filter(Boolean)
}

function parseIntCsv(v: string | null): number[] {
  return parseCsv(v).map(s => parseInt(s, 10)).filter(n => !isNaN(n))
}

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getServiceSupabase()
  const { searchParams } = new URL(req.url)

  // ── PARSE FILTERS ─────────────────────────────────────────
  const from        = searchParams.get('from')   // ISO YYYY-MM-DD
  const to          = searchParams.get('to')
  const basisRaw    = (searchParams.get('basis') || 'event_date') as DateBasis
  const basis: DateBasis = VALID_BASIS.includes(basisRaw) ? basisRaw : 'event_date'

  const territories = parseCsv(searchParams.get('territories'))
  const helperIds   = parseIntCsv(searchParams.get('helpers'))
  const statuses    = parseCsv(searchParams.get('statuses'))
                       .length > 0
                       ? parseCsv(searchParams.get('statuses'))
                       : DEFAULT_STATUSES
  const kinds       = parseCsv(searchParams.get('kinds'))
                       .length > 0
                       ? parseCsv(searchParams.get('kinds'))
                       : DEFAULT_KINDS
  const types       = parseCsv(searchParams.get('types'))

  const filters = {
    from, to, basis,
    territories, helpers: helperIds, statuses, kinds, types,
  }

  // ── FETCH HELPERS (all, for joining names + overrides) ──
  const { data: helpers, error: hErr } = await db
    .from('helpers')
    .select('id, name, email, territory, pay_override, approved')

  if (hErr) {
    return NextResponse.json({ error: hErr.message }, { status: 500 })
  }

  const helpersById = new Map<number, any>()
  ;(helpers || []).forEach(h => helpersById.set(h.id, h))

  // ── BUILD JOBS QUERY ─────────────────────────────────────
  let q = db.from('jobs').select('*')

  if (from) q = q.gte(basis, from)
  if (to)   q = q.lte(basis, to)
  if (statuses.length > 0)     q = q.in('status', statuses)
  if (kinds.length > 0)        q = q.in('kind', kinds)
  if (territories.length > 0)  q = q.in('territory', territories)
  if (types.length > 0)        q = q.in('type', types)
  if (helperIds.length > 0)    q = q.in('helper_id', helperIds)

  const { data: jobs, error: jErr } = await q
  if (jErr) {
    return NextResponse.json({ error: jErr.message }, { status: 500 })
  }
  const allJobs = jobs || []

  // ── COMPUTE PER-JOB PAY ──────────────────────────────────
  const enrichedJobs = allJobs.map((j: any) => {
    const helper = j.helper_id ? helpersById.get(j.helper_id) : null
    const pay = computeJobPay(
      j.address,
      j.kind as JobKind,
      helper?.pay_override
    )
    return {
      ...j,
      helper_name: helper?.name || null,
      helper_email: helper?.email || null,
      pay_scale: payScaleForAddress(j.address),
      pay,
    }
  })

  // ── AGGREGATE BY HELPER ──────────────────────────────────
  const helperAgg = new Map<number, any>()

  for (const j of enrichedJobs) {
    if (!j.helper_id) continue
    const agg = helperAgg.get(j.helper_id) || {
      id: j.helper_id,
      name: j.helper_name,
      email: j.helper_email,
      territory: helpersById.get(j.helper_id)?.territory || null,
      jobs: 0,
      drops: 0,
      picks: 0,
      completed: 0,
      pending: 0,
      claimed: 0,
      installed: 0,
      cancelled: 0,
      earnings: 0,
      byTerritory: {} as Record<string, { jobs: number; earnings: number }>,
    }
    agg.jobs += 1
    if (j.kind === 'drop') agg.drops += 1
    if (j.kind === 'pick') agg.picks += 1

    const statusKey = (j.status as string) || 'unknown'
    if (statusKey === 'complete')   agg.completed += 1
    if (statusKey === 'pending')    agg.pending += 1
    if (statusKey === 'claimed')    agg.claimed += 1
    if (statusKey === 'installed')  agg.installed += 1
    if (statusKey === 'cancelled')  agg.cancelled += 1
    agg.earnings += j.pay

    const t = j.territory || 'UK'
    if (!agg.byTerritory[t]) agg.byTerritory[t] = { jobs: 0, earnings: 0 }
    agg.byTerritory[t].jobs += 1
    agg.byTerritory[t].earnings += j.pay

    helperAgg.set(j.helper_id, agg)
  }

  const byHelper = Array.from(helperAgg.values()).map(a => ({
    ...a,
    avgPerJob: a.jobs > 0 ? +(a.earnings / a.jobs).toFixed(2) : 0,
    completionRate: a.jobs > 0 ? +(a.completed / a.jobs).toFixed(3) : 0,
  })).sort((x, y) => y.earnings - x.earnings)

  // ── AGGREGATE BY TERRITORY ───────────────────────────────
  const terrAgg = new Map<string, any>()
  for (const j of enrichedJobs) {
    const t = j.territory || 'UK'
    const agg = terrAgg.get(t) || {
      code: t,
      total: 0,
      drops: 0, picks: 0,
      completed: 0, pending: 0, claimed: 0, installed: 0, cancelled: 0,
      revenue: 0,
      uniqueHelpers: new Set<number>(),
    }
    agg.total += 1
    if (j.kind === 'drop') agg.drops += 1
    if (j.kind === 'pick') agg.picks += 1
    const sk = (j.status as string) || 'unknown'
    if (sk === 'complete')   agg.completed += 1
    if (sk === 'pending')    agg.pending += 1
    if (sk === 'claimed')    agg.claimed += 1
    if (sk === 'installed')  agg.installed += 1
    if (sk === 'cancelled')  agg.cancelled += 1
    agg.revenue += j.pay
    if (j.helper_id) agg.uniqueHelpers.add(j.helper_id)
    terrAgg.set(t, agg)
  }

  const byTerritory = TERRITORY_CODES
    .map(code => terrAgg.get(code) || {
      code, total: 0, drops: 0, picks: 0,
      completed: 0, pending: 0, claimed: 0, installed: 0, cancelled: 0,
      revenue: 0, uniqueHelpers: new Set<number>(),
    })
    .concat(Array.from(terrAgg.values()).filter(t => !TERRITORY_CODES.includes(t.code)))
    .map(t => ({
      ...t,
      helpers: t.uniqueHelpers.size,
      uniqueHelpers: undefined, // strip Set before JSON
    }))

  // ── CROSS-TAB: HELPER × TERRITORY ────────────────────────
  const allHelperIds = Array.from(helperAgg.keys())
  const crossHelpers = allHelperIds.map(id => ({
    id,
    name: helpersById.get(id)?.name || `Helper #${id}`,
  })).sort((a, b) => a.name.localeCompare(b.name))

  const matrix: Record<string, Record<string, { jobs: number; earnings: number }>> = {}
  for (const id of allHelperIds) {
    matrix[id] = {}
    const agg = helperAgg.get(id)
    for (const t of TERRITORY_CODES) {
      matrix[id][t] = agg.byTerritory[t] || { jobs: 0, earnings: 0 }
    }
  }

  // ── TOTALS ───────────────────────────────────────────────
  const totals = {
    jobs:      enrichedJobs.length,
    drops:     enrichedJobs.filter(j => j.kind === 'drop').length,
    picks:     enrichedJobs.filter(j => j.kind === 'pick').length,
    completed: enrichedJobs.filter(j => j.status === 'complete').length,
    pending:   enrichedJobs.filter(j => j.status === 'pending').length,
    claimed:   enrichedJobs.filter(j => j.status === 'claimed').length,
    installed: enrichedJobs.filter(j => j.status === 'installed').length,
    cancelled: enrichedJobs.filter(j => j.status === 'cancelled').length,
    revenue:   +enrichedJobs.reduce((sum, j) => sum + j.pay, 0).toFixed(2),
    helpers:   allHelperIds.length,
    helpersTotal: (helpers || []).length,
    avgJobsPerHelper: allHelperIds.length > 0
      ? +(enrichedJobs.length / allHelperIds.length).toFixed(2)
      : 0,
  }

  return NextResponse.json({
    filters,
    totals,
    byHelper,
    byTerritory,
    cross: {
      helpers: crossHelpers,
      territories: TERRITORY_CODES,
      matrix,
    },
    jobs: enrichedJobs,
  })
}

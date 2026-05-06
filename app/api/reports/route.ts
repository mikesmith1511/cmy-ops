import { NextRequest, NextResponse } from 'next/server'
import { isAdmin } from '@/lib/auth'
import { getServiceSupabase } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = getServiceSupabase()
  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  // Get all helpers
  const { data: helpers } = await db
    .from('helpers')
    .select('id, name, email, territory, pay_override, jobs_done, approved')

  // Get completed jobs in date range
  let jobsQuery = db.from('jobs').select('*').eq('status', 'complete').not('helper_id', 'is', null)
  if (from) jobsQuery = jobsQuery.gte('event_date', from)
  if (to) jobsQuery = jobsQuery.lte('event_date', to)
  const { data: jobs } = await jobsQuery

  // Get settings (stored in a simple key-value table, or use defaults)
  const defaultRate = 40

  // Build comp summary
  const summary = (helpers || []).map(h => {
    const helperJobs = (jobs || []).filter(j => j.helper_id === h.id)
    const rate = h.pay_override || defaultRate
    return {
      id: h.id,
      name: h.name,
      email: h.email,
      territory: h.territory,
      jobsCompleted: helperJobs.length,
      rate,
      totalComp: helperJobs.length * rate
    }
  }).filter(r => r.jobsCompleted > 0)

  // Territory breakdown
  const territories = ['WW', 'TV', 'CL'].map(t => ({
    territory: t,
    total: (jobs || []).filter(j => j.territory === t).length
  }))

  // Monthly volume (all jobs)
  const { data: allJobs } = await db.from('jobs').select('event_date, territory, status')
  const monthly: Record<string, number> = {}
  ;(allJobs || []).forEach(j => {
    const m = j.event_date?.slice(0, 7) || 'Unknown'
    monthly[m] = (monthly[m] || 0) + 1
  })

  return NextResponse.json({ summary, territories, monthly })
}

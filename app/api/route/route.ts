import { NextRequest, NextResponse } from 'next/server'
import { getTokenFromRequest } from '@/lib/auth'
import { getServiceSupabase } from '@/lib/supabase'

const HOME_OFFICE = '711 S Hwy 27, Clermont, FL 34714'

// POST /api/route
// Body: { jobIds: number[] }
// Returns: { ok: true, route: { stops, totalMiles, mapsUrl, optimized } }
//
// Uses Google Maps Directions API with optimize:true to compute optimal
// stop ordering. Falls back to manual Google Maps URL if no API key configured.
export async function POST(req: NextRequest) {
  const token = getTokenFromRequest(req)
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const jobIds: number[] = Array.isArray(body?.jobIds) ? body.jobIds : []
  if (!jobIds.length) return NextResponse.json({ error: 'No jobs provided' }, { status: 400 })

  // Fetch the jobs from DB
  const db = getServiceSupabase()
  const { data: jobsData, error } = await db
    .from('jobs')
    .select('id, address, event_date, setup_date, status, territory, type, helper_id')
    .in('id', jobIds)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const jobs = jobsData || []
  if (jobs.length === 0) return NextResponse.json({ error: 'No matching jobs' }, { status: 404 })

  // For helpers: only allow routing on jobs they actually claimed
  if (token.role === 'helper') {
    const notMine = jobs.filter((j: any) => j.helper_id !== token.id)
    if (notMine.length > 0) {
      return NextResponse.json({ error: 'Some jobs are not yours to route' }, { status: 403 })
    }
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY

  // FALLBACK: no API key, return non-optimized route with Google Maps URL
  if (!apiKey) {
    const stops = jobs.map((j: any, i: number) => ({ ...j, order: i + 1 }))
    const waypoints = jobs.map((j: any) => encodeURIComponent(j.address)).join('/')
    const mapsUrl = `https://www.google.com/maps/dir/${encodeURIComponent(HOME_OFFICE)}/${waypoints}/${encodeURIComponent(HOME_OFFICE)}`
    return NextResponse.json({
      ok: true,
      route: {
        stops,
        totalMiles: null,
        mapsUrl,
        optimized: false,
        message: 'Route built without optimization. Add GOOGLE_MAPS_API_KEY env var for optimal stop ordering.'
      }
    })
  }

  // OPTIMIZATION: call Google Directions API with optimize:true
  try {
    const origin = encodeURIComponent(HOME_OFFICE)
    const destination = encodeURIComponent(HOME_OFFICE)
    const waypointsParam = 'optimize:true|' + jobs.map((j: any) => encodeURIComponent(j.address)).join('|')

    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&waypoints=${waypointsParam}&key=${apiKey}`

    const resp = await fetch(url)
    const data = await resp.json()

    if (data.status !== 'OK' || !data.routes?.[0]) {
      // API failed - fall back to non-optimized
      const stops = jobs.map((j: any, i: number) => ({ ...j, order: i + 1 }))
      const waypoints = jobs.map((j: any) => encodeURIComponent(j.address)).join('/')
      const mapsUrl = `https://www.google.com/maps/dir/${encodeURIComponent(HOME_OFFICE)}/${waypoints}/${encodeURIComponent(HOME_OFFICE)}`
      return NextResponse.json({
        ok: true,
        route: {
          stops,
          totalMiles: null,
          mapsUrl,
          optimized: false,
          message: `Google Maps API returned: ${data.status}. Route shown in original order.`
        }
      })
    }

    const r = data.routes[0]
    const order: number[] = r.waypoint_order || jobs.map((_: any, i: number) => i)
    const orderedJobs = order.map((idx: number, i: number) => ({
      ...jobs[idx],
      order: i + 1
    }))

    // Total distance in meters across all legs
    let totalMeters = 0
    for (const leg of r.legs || []) {
      totalMeters += leg.distance?.value || 0
    }
    const totalMiles = totalMeters / 1609.344

    // Build the human-clickable Google Maps URL with optimized order
    const orderedAddresses = orderedJobs.map((j: any) => encodeURIComponent(j.address)).join('/')
    const mapsUrl = `https://www.google.com/maps/dir/${origin}/${orderedAddresses}/${destination}`

    return NextResponse.json({
      ok: true,
      route: {
        stops: orderedJobs,
        totalMiles,
        mapsUrl,
        optimized: true,
        message: null
      }
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Route optimization failed' }, { status: 500 })
  }
}

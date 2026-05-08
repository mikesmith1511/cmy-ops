import { NextRequest, NextResponse } from 'next/server'
import { getTokenFromRequest } from '@/lib/auth'
import { getServiceSupabase } from '@/lib/supabase'

const HOME_OFFICE = '711 S Hwy 27, Clermont, FL 34714'

// =============================================================
// POST /api/route
//
// Body:
//   { date?: string }    // YYYY-MM-DD; if omitted, auto-pick next setup_date with claimed jobs
//
// Returns:
//   { ok: true, route: {
//       date,
//       drops: [{...job, order, segment: 'drop'}],
//       pickups: [{...job, order, segment: 'pickup'}],
//       totalMiles,
//       mapsUrl,
//       optimized,
//       routeType,        // 'drops-only' | 'pickups-only' | 'mixed'
//       message
//   } }
//
// Routing geometry rules (per Mike's spec):
//   - Drop-only:    office -> drops in optimized order. Ends at last drop.
//   - Pickup-only:  furthest pickup -> work back to office. Ends at office.
//   - Mixed:        office -> optimized drops -> optimized pickups -> office.
//
// LIMITATION: Currently assumes pickup_date = event_date + 1.
// Multi-day rentals will route pickups one day early. TODO: add days_rented column.
// =============================================================

export async function POST(req: NextRequest) {
  const token = getTokenFromRequest(req)
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (token.role !== 'helper') return NextResponse.json({ error: 'Helper only' }, { status: 403 })

  let body: any = {}
  try { body = await req.json() } catch {}
  const requestedDate: string | undefined = body?.date

  const db = getServiceSupabase()

  // Get all this helper's claimed/installed jobs
  const { data: allJobs, error } = await db
    .from('jobs')
    .select('id, address, event_date, setup_date, status, territory, type, helper_id')
    .eq('helper_id', token.id)
    .in('status', ['claimed', 'installed'])
    .order('event_date', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const jobs = allJobs || []

  // Compute pickup_date = event_date + 1 (TODO: refine for multi-day rentals)
  function pickupDate(j: any): string | null {
    if (!j.event_date) return null
    const d = new Date(j.event_date + 'T12:00:00')
    if (isNaN(d.getTime())) return null
    d.setDate(d.getDate() + 1)
    return d.toISOString().substring(0, 10)
  }

  // For each job, attach its pickup_date for filtering convenience
  const jobsWithPickup = jobs.map((j: any) => ({ ...j, _pickup_date: pickupDate(j) }))

  // Determine route date
  let routeDate = requestedDate
  if (!routeDate) {
    // Auto-pick: NEXT date (today or future) that has claimed drops OR installed pickups
    const today = new Date().toISOString().substring(0, 10)
    const candidateDates = new Set<string>()
    for (const j of jobsWithPickup) {
      if (j.status === 'claimed' && j.setup_date && j.setup_date >= today) candidateDates.add(j.setup_date)
      if (j.status === 'installed' && j._pickup_date && j._pickup_date >= today) candidateDates.add(j._pickup_date)
    }
    if (candidateDates.size === 0) {
      return NextResponse.json({
        ok: true,
        route: {
          date: today,
          drops: [],
          pickups: [],
          totalMiles: 0,
          mapsUrl: null,
          optimized: false,
          routeType: 'empty',
          message: 'No upcoming drops or pickups found.'
        }
      })
    }
    routeDate = Array.from(candidateDates).sort()[0]
  }

  // Filter jobs for the route date
  const drops = jobsWithPickup.filter((j: any) => j.status === 'claimed' && j.setup_date === routeDate)
  const pickups = jobsWithPickup.filter((j: any) => j.status === 'installed' && j._pickup_date === routeDate)

  if (drops.length === 0 && pickups.length === 0) {
    return NextResponse.json({
      ok: true,
      route: {
        date: routeDate,
        drops: [],
        pickups: [],
        totalMiles: 0,
        mapsUrl: null,
        optimized: false,
        routeType: 'empty',
        message: `No drops or pickups on ${routeDate}.`
      }
    })
  }

  // Determine route type
  const routeType = drops.length > 0 && pickups.length > 0
    ? 'mixed'
    : drops.length > 0
    ? 'drops-only'
    : 'pickups-only'

  const apiKey = process.env.GOOGLE_MAPS_API_KEY

  // FALLBACK: no API key, return jobs in original order with simple Google Maps URL
  if (!apiKey) {
    const orderedDrops = drops.map((j: any, i: number) => ({ ...j, order: i + 1, segment: 'drop' as const }))
    const orderedPickups = pickups.map((j: any, i: number) => ({ ...j, order: drops.length + i + 1, segment: 'pickup' as const }))
    const mapsUrl = buildMapsUrl(routeType, orderedDrops, orderedPickups)
    return NextResponse.json({
      ok: true,
      route: {
        date: routeDate,
        drops: orderedDrops,
        pickups: orderedPickups,
        totalMiles: null,
        mapsUrl,
        optimized: false,
        routeType,
        message: 'Route built without optimization. Add GOOGLE_MAPS_API_KEY env var for optimal stop ordering.'
      }
    })
  }

  // OPTIMIZATION: determine optimal order within each segment, then make ONE
  // final Directions API call with all stops in our chosen order so EVERY leg
  // gets measured (including the handoff between drops and pickups).
  let totalMiles = 0
  let optimizedDrops: any[] = []
  let optimizedPickups: any[] = []
  let segmentMessages: string[] = []

  // --- STEP 1: Determine optimal DROP order ---
  if (drops.length > 0) {
    if (drops.length === 1) {
      optimizedDrops = drops.map((j: any) => ({ ...j, order: 1, segment: 'drop' as const }))
    } else {
      // Use Directions API to optimize: origin=office, destination=last drop, others as waypoints
      // We don't use the totalMiles from this call - just the order
      const result = await callDirectionsAPI(HOME_OFFICE, drops[drops.length - 1].address, drops.slice(0, -1).map((j: any) => j.address), apiKey)
      if (result) {
        const orderedSlice = result.waypoint_order.map((idx: number) => drops[idx])
        optimizedDrops = [...orderedSlice, drops[drops.length - 1]].map((j: any, i: number) => ({ ...j, order: i + 1, segment: 'drop' as const }))
      } else {
        optimizedDrops = drops.map((j: any, i: number) => ({ ...j, order: i + 1, segment: 'drop' as const }))
        segmentMessages.push('Drop optimization unavailable; using original order.')
      }
    }
  }

  // --- STEP 2: Determine optimal PICKUP order (furthest first, then optimized back) ---
  if (pickups.length > 0) {
    if (pickups.length === 1) {
      optimizedPickups = pickups.map((j: any) => ({ ...j, order: drops.length + 1, segment: 'pickup' as const }))
    } else {
      // Find furthest pickup from office
      const distances: number[] = []
      for (const p of pickups) {
        const d = await fetchSingleDistance(HOME_OFFICE, p.address, apiKey)
        distances.push(d ?? 0)
      }
      const furthestIdx = distances.indexOf(Math.max(...distances))
      const furthest = pickups[furthestIdx]
      const remaining = pickups.filter((_p: any, i: number) => i !== furthestIdx)

      // Optimize: furthest -> remaining waypoints -> office
      const result = await callDirectionsAPI(furthest.address, HOME_OFFICE, remaining.map((j: any) => j.address), apiKey)
      if (result) {
        const orderedRemaining = result.waypoint_order.map((idx: number) => remaining[idx])
        optimizedPickups = [furthest, ...orderedRemaining].map((j: any, i: number) => ({
          ...j, order: drops.length + i + 1, segment: 'pickup' as const
        }))
      } else {
        optimizedPickups = pickups.map((j: any, i: number) => ({ ...j, order: drops.length + i + 1, segment: 'pickup' as const }))
        segmentMessages.push('Pickup optimization unavailable; using original order.')
      }
    }
  }

  // --- STEP 3: Now compute TOTAL mileage with all legs in the determined order ---
  // This call ensures every transition (office->drop1, drop->drop, drop->pickup handoff,
  // pickup->pickup, pickup->office) is captured.
  totalMiles = await computeTotalRouteMiles(routeType, optimizedDrops, optimizedPickups, apiKey)
  if (totalMiles === 0 && (optimizedDrops.length > 0 || optimizedPickups.length > 0)) {
    segmentMessages.push('Total mileage calculation unavailable.')
  }

  // Build the final maps URL
  const mapsUrl = buildMapsUrl(routeType, optimizedDrops, optimizedPickups)

  return NextResponse.json({
    ok: true,
    route: {
      date: routeDate,
      drops: optimizedDrops,
      pickups: optimizedPickups,
      totalMiles,
      mapsUrl,
      optimized: true,
      routeType,
      message: segmentMessages.length ? segmentMessages.join(' ') : null
    }
  })
}

// =============================================================
// Helper: build a Google Maps URL given the route type and ordered segments
// =============================================================
function buildMapsUrl(routeType: string, drops: any[], pickups: any[]): string {
  const enc = (s: string) => encodeURIComponent(s)
  const office = enc(HOME_OFFICE)

  if (routeType === 'drops-only') {
    // office -> drop1 -> drop2 -> ... (ends at last drop, no return)
    const stops = drops.map((j: any) => enc(j.address)).join('/')
    return `https://www.google.com/maps/dir/${office}/${stops}`
  }

  if (routeType === 'pickups-only') {
    // furthest pickup -> ... -> office
    const stops = pickups.map((j: any) => enc(j.address)).join('/')
    return `https://www.google.com/maps/dir/${stops}/${office}`
  }

  // mixed: office -> drops -> pickups -> office
  const dropStops = drops.map((j: any) => enc(j.address)).join('/')
  const pickupStops = pickups.map((j: any) => enc(j.address)).join('/')
  return `https://www.google.com/maps/dir/${office}/${dropStops}/${pickupStops}/${office}`
}

// =============================================================
// Helper: compute total miles for the full ordered route, including
// office endpoints and the drop->pickup handoff. Uses optimize:false
// so it respects the order we already determined.
// =============================================================
async function computeTotalRouteMiles(
  routeType: string,
  drops: any[],
  pickups: any[],
  apiKey: string
): Promise<number> {
  let origin: string, destination: string, waypoints: string[]

  if (routeType === 'drops-only') {
    if (drops.length === 0) return 0
    origin = HOME_OFFICE
    destination = drops[drops.length - 1].address
    waypoints = drops.slice(0, -1).map((j: any) => j.address)
  } else if (routeType === 'pickups-only') {
    if (pickups.length === 0) return 0
    origin = pickups[0].address // furthest first
    destination = HOME_OFFICE
    waypoints = pickups.slice(1).map((j: any) => j.address)
  } else {
    // mixed: office -> drops -> pickups -> office
    origin = HOME_OFFICE
    destination = HOME_OFFICE
    waypoints = [...drops.map((j: any) => j.address), ...pickups.map((j: any) => j.address)]
  }

  // Single segment with no intermediate waypoints
  if (waypoints.length === 0) {
    const dist = await fetchSingleDistance(origin, destination, apiKey)
    return dist ?? 0
  }

  // Multi-stop with optimize:false (we already chose the order)
  const o = encodeURIComponent(origin)
  const d = encodeURIComponent(destination)
  const wp = waypoints.map(encodeURIComponent).join('|')
  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${o}&destination=${d}&waypoints=${wp}&key=${apiKey}`

  try {
    const resp = await fetch(url)
    const data = await resp.json()
    if (data.status !== 'OK' || !data.routes?.[0]) return 0
    let totalMeters = 0
    for (const leg of data.routes[0].legs || []) totalMeters += leg.distance?.value || 0
    return totalMeters / 1609.344
  } catch (e) {
    return 0
  }
}

// =============================================================
// Helper: call Directions API and return optimized waypoint order + total miles
// =============================================================
async function callDirectionsAPI(
  origin: string,
  destination: string,
  waypoints: string[],
  apiKey: string
): Promise<{ waypoint_order: number[]; totalMiles: number } | null> {
  if (waypoints.length === 0) {
    // No waypoints, just origin -> destination
    const dist = await fetchSingleDistance(origin, destination, apiKey)
    if (dist === null) return null
    return { waypoint_order: [], totalMiles: dist }
  }

  const o = encodeURIComponent(origin)
  const d = encodeURIComponent(destination)
  const wp = 'optimize:true|' + waypoints.map(encodeURIComponent).join('|')
  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${o}&destination=${d}&waypoints=${wp}&key=${apiKey}`

  try {
    const resp = await fetch(url)
    const data = await resp.json()
    if (data.status !== 'OK' || !data.routes?.[0]) return null
    const r = data.routes[0]
    let totalMeters = 0
    for (const leg of r.legs || []) totalMeters += leg.distance?.value || 0
    return {
      waypoint_order: r.waypoint_order || waypoints.map((_w: string, i: number) => i),
      totalMiles: totalMeters / 1609.344
    }
  } catch (e) {
    return null
  }
}

// =============================================================
// Helper: get driving distance (miles) between two addresses
// =============================================================
async function fetchSingleDistance(origin: string, destination: string, apiKey: string): Promise<number | null> {
  const o = encodeURIComponent(origin)
  const d = encodeURIComponent(destination)
  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${o}&destination=${d}&key=${apiKey}`

  try {
    const resp = await fetch(url)
    const data = await resp.json()
    if (data.status !== 'OK' || !data.routes?.[0]) return null
    const r = data.routes[0]
    let totalMeters = 0
    for (const leg of r.legs || []) totalMeters += leg.distance?.value || 0
    return totalMeters / 1609.344
  } catch (e) {
    return null
  }
}

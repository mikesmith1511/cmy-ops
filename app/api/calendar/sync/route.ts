// app/api/calendar/sync/route.ts
// Webhook endpoint called by the jobs Postgres trigger.
// Authenticated via CALENDAR_SYNC_SECRET header.

import { NextRequest, NextResponse } from 'next/server';
import { syncJobToCalendar } from '@/lib/calendar-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const expected = process.env.CALENDAR_SYNC_SECRET;
  const provided = req.headers.get('x-sync-secret');
  if (!expected) {
    return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 });
  }
  if (provided !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: { job_id?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const jobId = Number(body.job_id);
  if (!Number.isFinite(jobId) || jobId <= 0) {
    return NextResponse.json({ error: 'missing_or_invalid_job_id' }, { status: 400 });
  }

  try {
    const result = await syncJobToCalendar(jobId);
    return NextResponse.json({ ok: true, result });
  } catch (err: any) {
    console.error('[calendar/sync] error:', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'sync_failed' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: 'calendar/sync',
    needs: 'POST { job_id } with x-sync-secret header',
  });
}

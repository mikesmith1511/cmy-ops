// app/api/calendar/backfill/route.ts
// One-time endpoint: walks all active (non-cancelled) jobs and ensures
// they have calendar events.

import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { syncJobToCalendar } from '@/lib/calendar-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const expected = process.env.CALENDAR_SYNC_SECRET;
  const provided = req.headers.get('x-sync-secret');
  if (!expected || provided !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = getServiceSupabase();

  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('id, state, status, event_date')
    .neq('status', 'cancelled')
    .order('event_date', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const summary = {
    total: jobs?.length ?? 0,
    created: 0,
    updated: 0,
    deleted: 0,
    skipped: 0,
    failed: 0,
    errors: [] as Array<{ jobId: number; error: string }>,
  };

  for (const job of jobs ?? []) {
    try {
      const result = await syncJobToCalendar(job.id);
      if      (result.action === 'created') summary.created++;
      else if (result.action === 'updated') summary.updated++;
      else if (result.action === 'deleted') summary.deleted++;
      else                                  summary.skipped++;
    } catch (err: any) {
      summary.failed++;
      summary.errors.push({ jobId: job.id, error: err?.message || String(err) });
      console.error(`[backfill] job ${job.id} failed:`, err);
    }
  }

  return NextResponse.json({ ok: true, summary });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: 'calendar/backfill',
    needs: 'POST with x-sync-secret header',
  });
}

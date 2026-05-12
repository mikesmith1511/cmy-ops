// lib/calendar-sync.ts
// Translates CMY job state into Google Calendar event create/update/delete.

import { getServiceSupabase } from './supabase';
import {
  createEvent,
  updateEvent,
  deleteEvent,
  COLOR_IDS,
  type CalendarEventInput,
} from './google-calendar';

type JobRow = {
  id: number;
  setup_date: string | null;
  event_date: string;
  address: string;
  customer: string | null;
  details: string | null;
  contact: string | null;
  territory: string;
  type: string;
  state: 'unassigned' | 'assigned' | 'deployed' | 'done';
  status: string;
  helper_id: number | null;
  kind: 'drop' | 'pick';
  rep_name: string | null;
  order_num: string | null;
  gcal_event_id: string | null;
};

type HelperRow = { id: number; name: string };

const SYNC_RESULT = {
  CREATED: 'created',
  UPDATED: 'updated',
  DELETED: 'deleted',
  SKIPPED: 'skipped',
} as const;

export type SyncResult = {
  jobId: number;
  action: typeof SYNC_RESULT[keyof typeof SYNC_RESULT];
  eventId?: string;
  reason?: string;
};

// Sync a single job to its Google Calendar event.
// Returns what action was taken.
export async function syncJobToCalendar(jobId: number): Promise<SyncResult> {
  const supabase = getServiceSupabase();

  // Load the job
  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .single<JobRow>();

  if (jobErr || !job) {
    return { jobId, action: SYNC_RESULT.SKIPPED, reason: 'job_not_found' };
  }

  // Cancelled jobs: delete event if one exists, then bail
  if (job.status === 'cancelled') {
    if (job.gcal_event_id) {
      await deleteEvent(job.gcal_event_id);
      await supabase
        .from('jobs')
        .update({ gcal_event_id: null })
        .eq('id', jobId);
      return { jobId, action: SYNC_RESULT.DELETED, reason: 'cancelled' };
    }
    return { jobId, action: SYNC_RESULT.SKIPPED, reason: 'cancelled_no_event' };
  }

  // Look up helper name if assigned
  let helperName: string | null = null;
  if (job.helper_id) {
    const { data: helper } = await supabase
      .from('helpers')
      .select('id, name')
      .eq('id', job.helper_id)
      .single<HelperRow>();
    helperName = helper?.name ?? null;
  }

  // Build the event payload
  const eventInput = buildEventInput(job, helperName);

  // Create or update
  if (job.gcal_event_id) {
    await updateEvent(job.gcal_event_id, eventInput);
    return { jobId, action: SYNC_RESULT.UPDATED, eventId: job.gcal_event_id };
  } else {
    const eventId = await createEvent(eventInput);
    await supabase
      .from('jobs')
      .update({ gcal_event_id: eventId })
      .eq('id', jobId);
    return { jobId, action: SYNC_RESULT.CREATED, eventId };
  }
}

// Build the calendar event payload from a job row.
// Title format: "[DROP] WW: 1363 Alred Ct — Frank D."
// or:           "[PICK] TV: 905 Maple Ln — UNASSIGNED"
function buildEventInput(job: JobRow, helperName: string | null): CalendarEventInput {
  const kindTag = job.kind === 'drop' ? '[DROP]' : '[PICK]';
  const territoryTag = job.territory || 'WW';
  const addressShort = (job.address || '').split(',')[0].trim() || '(no address)';

  let statusTag: string;
  let colorId: string;
  switch (job.state) {
    case 'unassigned':
      statusTag = 'UNASSIGNED';
      colorId = COLOR_IDS.RED;
      break;
    case 'assigned':
      statusTag = helperName ? shortName(helperName) : 'CLAIMED';
      colorId = COLOR_IDS.YELLOW;
      break;
    case 'deployed':
      statusTag = `DEPLOYED${helperName ? ' (' + shortName(helperName) + ')' : ''}`;
      colorId = COLOR_IDS.BLUE;
      break;
    case 'done':
      statusTag = 'DONE';
      colorId = COLOR_IDS.GREEN;
      break;
  }

  const title = `${kindTag} ${territoryTag}: ${addressShort} — ${statusTag}`;

  // The event's calendar date depends on kind.
  // drop = setup_date (install day)
  // pick = event_date + 1 day, but we use what the job row has if available
  const eventDate = job.kind === 'drop'
    ? (job.setup_date || job.event_date)
    : job.event_date;

  const description = buildDescription(job, helperName);

  return {
    title,
    description,
    date: normalizeDate(eventDate),
    colorId,
  };
}

function buildDescription(job: JobRow, helperName: string | null): string {
  const lines: string[] = [];
  lines.push(`Address: ${job.address || '(none)'}`);
  if (job.customer)  lines.push(`Customer: ${job.customer}`);
  if (job.rep_name)  lines.push(`Rep: ${job.rep_name}`);
  if (job.contact)   lines.push(`Contact: ${job.contact}`);
  if (helperName)    lines.push(`Helper: ${helperName}`);
  if (job.order_num) lines.push(`Order #: ${job.order_num}`);
  lines.push(`Event date: ${job.event_date}`);
  lines.push(`Kind: ${job.kind.toUpperCase()}`);
  lines.push(`State: ${job.state}`);
  if (job.details) {
    lines.push('');
    lines.push('Details:');
    lines.push(job.details);
  }
  // Deep link back to the job in cmy-ops
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cmy-ops.vercel.app';
  lines.push('');
  lines.push(`Open in CMY Ops: ${baseUrl}/jobs/${job.id}`);
  return lines.join('\n');
}

// "Frank DiPietro" -> "Frank D."
// "Shelby" -> "Shelby"
function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return parts[0] + ' ' + parts[parts.length - 1].charAt(0) + '.';
}

// Force YYYY-MM-DD
function normalizeDate(d: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const parsed = new Date(d);
  if (isNaN(parsed.getTime())) throw new Error('Invalid date: ' + d);
  return parsed.toISOString().slice(0, 10);
}

// lib/google-calendar.ts
// Thin wrapper around Google Calendar v3 API for CMY job event sync.
// Uses a service account JWT (no OAuth user flow needed).

import { google } from 'googleapis';

const SERVICE_ACCOUNT_EMAIL = process.env.GCAL_SERVICE_ACCOUNT_EMAIL!;
const PRIVATE_KEY = (process.env.GCAL_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const CALENDAR_ID = process.env.GCAL_CALENDAR_ID!;

if (!SERVICE_ACCOUNT_EMAIL || !PRIVATE_KEY || !CALENDAR_ID) {
  console.warn('[google-calendar] Missing one of GCAL_SERVICE_ACCOUNT_EMAIL / GCAL_SERVICE_ACCOUNT_PRIVATE_KEY / GCAL_CALENDAR_ID');
}

// Google Calendar built-in colorIds — only certain values are valid.
// Reference: https://developers.google.com/calendar/api/v3/reference/colors
export const COLOR_IDS = {
  RED: '11',     // Tomato — unassigned
  YELLOW: '5',   // Banana — assigned
  BLUE: '9',     // Blueberry — deployed
  GREEN: '10',   // Basil — done
} as const;

export type CalendarEventInput = {
  title: string;
  description: string;
  date: string;           // YYYY-MM-DD
  colorId: string;
};

function getAuthClient() {
  return new google.auth.JWT({
    email: SERVICE_ACCOUNT_EMAIL,
    key: PRIVATE_KEY,
    scopes: ['https://www.googleapis.com/auth/calendar.events'],
  });
}

function getCalendar() {
  return google.calendar({ version: 'v3', auth: getAuthClient() });
}

export async function createEvent(input: CalendarEventInput): Promise<string> {
  const calendar = getCalendar();
  const res = await calendar.events.insert({
    calendarId: CALENDAR_ID,
    requestBody: {
      summary: input.title,
      description: input.description,
      start: { date: input.date },
      end:   { date: input.date },
      colorId: input.colorId,
      reminders: { useDefault: false },
    },
  });
  if (!res.data.id) throw new Error('Google Calendar did not return an event id');
  return res.data.id;
}

export async function updateEvent(eventId: string, input: CalendarEventInput): Promise<void> {
  const calendar = getCalendar();
  await calendar.events.patch({
    calendarId: CALENDAR_ID,
    eventId,
    requestBody: {
      summary: input.title,
      description: input.description,
      start: { date: input.date },
      end:   { date: input.date },
      colorId: input.colorId,
    },
  });
}

export async function deleteEvent(eventId: string): Promise<void> {
  const calendar = getCalendar();
  try {
    await calendar.events.delete({
      calendarId: CALENDAR_ID,
      eventId,
    });
  } catch (err: any) {
    if (err?.response?.status === 410 || err?.code === 410) return;
    throw err;
  }
}

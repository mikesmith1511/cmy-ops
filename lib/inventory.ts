// lib/inventory.ts
// Shared helpers for inventory API routes.
// Imported by every route under app/api/inventory/*

import { getServiceSupabase } from '@/lib/supabase'

export type PieceStatus =
  | 'in_stock'
  | 'scheduled'
  | 'checked_out'
  | 'overdue'
  | 'damaged'
  | 'retired'

export type PieceCondition = 'good' | 'worn' | 'needs_repair' | 'damaged'

export type InventoryEventType =
  | 'created'
  | 'scanned_out'
  | 'scanned_in'
  | 'reserved'
  | 'unreserved'
  | 'marked_damaged'
  | 'marked_repaired'
  | 'retired'
  | 'state_change'
  | 'note_added'
  | 'set_assigned'
  | 'set_unassigned'
  | 'piece_missing'

export interface LogEventParams {
  pieceId?: number | null
  setId?: number | null
  jobId?: number | null
  helperId?: number | null
  eventType: InventoryEventType
  fromState?: string | null
  toState?: string | null
  metadata?: Record<string, any>
}

/**
 * Logs an event to inventory_events. Should be called inside any route
 * that mutates inventory state. Failures are logged but never thrown —
 * we don't want audit-log issues to break user-facing operations.
 */
export async function logInventoryEvent(params: LogEventParams): Promise<void> {
  const db = getServiceSupabase()
  const { error } = await db.from('inventory_events').insert({
    piece_id: params.pieceId ?? null,
    set_id: params.setId ?? null,
    job_id: params.jobId ?? null,
    helper_id: params.helperId ?? null,
    event_type: params.eventType,
    from_state: params.fromState ?? null,
    to_state: params.toState ?? null,
    metadata: params.metadata ?? {},
  })
  if (error) {
    console.error('[inventory_events] log failed:', error, 'params:', params)
  }
}

/**
 * Validates that a string is a known PieceStatus.
 */
export function isValidStatus(s: any): s is PieceStatus {
  return [
    'in_stock',
    'scheduled',
    'checked_out',
    'overdue',
    'damaged',
    'retired',
  ].includes(s)
}

/**
 * Validates that a string is a known PieceCondition.
 */
export function isValidCondition(c: any): c is PieceCondition {
  return ['good', 'worn', 'needs_repair', 'damaged'].includes(c)
}

/**
 * Returns the territories list from a request searchParam, or null if not specified.
 */
export function parseTerritoriesParam(param: string | null): string[] | null {
  if (!param) return null
  return param.split(',').map((t) => t.trim().toUpperCase()).filter(Boolean)
}

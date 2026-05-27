// =============================================================
// CMY Pay Rate Configuration
// =============================================================
// Single source of truth for helper pay computation. Matches the
// Apps Script CONFIG.PRICING block exactly. When rates change,
// update here AND in the Apps Script CONFIG so they stay in sync.
//
// Two pay scales:
//   - villages: jobs in Villages-area cities (Lady Lake, Middleton,
//     The Villages). Higher per-pickup rate because pickups in
//     Villages take longer (golf carts, gate codes, etc).
//   - standard: every other city.
//
// Pay differs by KIND (drop vs pick) AND by SCALE.
// =============================================================

export const PAY_RATES = {
  villages: { drop: 20, pick: 20 },
  standard: { drop: 20, pick: 10 },
} as const

export type PayScale = keyof typeof PAY_RATES
export type JobKind  = 'drop' | 'pick'

// Cities that trigger villages pay scale. Case-insensitive substring match.
const VILLAGES_PAY_CITIES = [
  'the villages',
  'villages',
  'middleton',
  'lady lake',
]

/**
 * Determine pay scale for a job from its address string.
 * Used because territory alone (WW) doesn't tell us pay scale —
 * WW territory contains both Villages-pay AND standard-pay cities.
 */
export function payScaleForAddress(address: string | null | undefined): PayScale {
  if (!address) return 'standard'
  const lower = address.toLowerCase()
  for (const city of VILLAGES_PAY_CITIES) {
    if (lower.includes(city)) return 'villages'
  }
  return 'standard'
}

/**
 * Compute pay for a single job row.
 * If helper has a pay_override, that overrides the computed rate
 * for THIS LEG (drop or pick) — same override applies to both.
 *
 * Pass helperPayOverride as null/undefined to use standard rates.
 */
export function computeJobPay(
  address: string | null | undefined,
  kind: JobKind | null | undefined,
  helperPayOverride?: number | null | undefined
): number {
  if (helperPayOverride != null && helperPayOverride > 0) {
    return Number(helperPayOverride)
  }
  if (!kind) return 0
  const scale = payScaleForAddress(address)
  return PAY_RATES[scale][kind] || 0
}

/**
 * Pretty label for a pay scale (for UI display).
 */
export function payScaleLabel(scale: PayScale): string {
  return scale === 'villages' ? 'Villages' : 'Standard'
}

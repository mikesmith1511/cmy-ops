// lib/qr.ts
// QR/scan URL construction helpers.
// All values driven by env vars so multi-tenant deploys can configure their own
// branding (sticker domain + customer redirect target) without code changes.

/**
 * Returns the base domain stickers point at.
 * Defaults to the Vercel deployment if no custom domain is configured.
 *
 * Env: NEXT_PUBLIC_QR_DOMAIN (e.g. "https://assetlane.app")
 */
export function getQrDomain(): string {
  const env = process.env.NEXT_PUBLIC_QR_DOMAIN
  if (env) return env.replace(/\/$/, '') // strip trailing slash
  // Fallback: Vercel auto-injects this for the current deployment
  if (process.env.NEXT_PUBLIC_VERCEL_URL) {
    return `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
  }
  return 'https://cmy-ops.vercel.app'
}

/**
 * Returns the URL customers (unauthenticated scanners) get redirected to,
 * with UTM params appended so analytics can attribute scan-driven visits.
 *
 * Env: NEXT_PUBLIC_MARKETING_REDIRECT_URL (e.g. "https://www.cardmyyard.com")
 * Env: NEXT_PUBLIC_QR_UTM_PARAMS (raw query string, optional)
 */
export function getMarketingRedirectUrl(barcode?: string): string {
  const base =
    process.env.NEXT_PUBLIC_MARKETING_REDIRECT_URL ||
    'https://www.cardmyyard.com'

  const utm =
    process.env.NEXT_PUBLIC_QR_UTM_PARAMS ||
    'utm_source=yard_sign&utm_medium=qr&utm_campaign=cmy_ops'

  // Append sign_id so we can track which physical sign drove which scan
  const params = new URLSearchParams(utm)
  if (barcode) params.set('sign_id', barcode)

  const sep = base.includes('?') ? '&' : '?'
  return `${base}${sep}${params.toString()}`
}

/**
 * Builds the full URL that gets encoded into a piece's QR sticker.
 * Format: {domain}/scan/{barcode}?t={token}
 */
export function buildQrUrl(barcode: string, qrToken: string): string {
  const domain = getQrDomain()
  return `${domain}/scan/${encodeURIComponent(barcode)}?t=${encodeURIComponent(qrToken)}`
}

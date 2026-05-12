import type { Config } from 'tailwindcss'

const config: Config = {
  // Dark mode: respects iPhone/system setting. To force dark on body, add
  // class="dark" to <html>. We're using 'media' so the OS toggle drives it.
  darkMode: 'media',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // ── CMY BRAND ──────────────────────────────────────
        // Pulled from cardmyyard.com homepage. Orange = action,
        // green = identity, navy = structure.

        // Primary action — used on every "tap me" button
        // (claim job, mark installed, upload photo, etc.)
        'brand-orange': {
          50:  '#FEF1E8',
          100: '#FDDCC4',
          200: '#FBB988',
          300: '#F89048',
          400: '#F07C2D',
          500: '#EA6B2F', // primary CTA
          600: '#C95217', // pressed/active state
          700: '#A33F0E',
          800: '#7C2F0A',
          900: '#532008',
        },

        // Brand identity — logo, headers, success moments
        'brand-green': {
          50:  '#E8F7ED',
          100: '#C8EBD2',
          200: '#92D7A6',
          300: '#5BC079',
          400: '#36B25E',
          500: '#1FA84A', // brand identity
          600: '#178A3D',
          700: '#10692E',
          800: '#0A4D22',
          900: '#053316',
        },

        // Structure — navbar, headings, badges
        'brand-navy': {
          50:  '#EBEDF4',
          100: '#CCD1E2',
          200: '#99A3C5',
          300: '#6675A8',
          400: '#3F4F8C',
          500: '#293873',
          600: '#1E2A55', // primary navy
          700: '#162042',
          800: '#0F1730',
          900: '#080D1C',
        },

        // ── NEUTRALS ──────────────────────────────────────
        // Warm, slightly cream-tinted whites so it doesn't feel like a
        // hospital. Dark mode neutrals are deep with subtle warmth.
        'surface': {
          // Light mode
          50:  '#FFFFFF',           // pure white card backgrounds
          100: '#F7F5F0',           // page background (warm cream)
          200: '#E8E4DA',           // borders, dividers
          300: '#CFC9BC',           // muted accents
          // Dark mode (matches brand-navy depth)
          900: '#1A1A1A',           // card surface (dark)
          950: '#0B0B0B',           // page background (dark)
        },

        // ── SEMANTIC ──────────────────────────────────────
        // For app states — kept visually distinct from brand colors
        // so users don't confuse a status badge with a tap target.
        'state-pending':    '#6B6660',   // neutral, "waiting"
        'state-claimed':    '#2D3B6B',   // navy variant
        'state-installed':  '#1FA84A',   // green — success
        'state-complete':   '#6B6660',   // dim — done, no action needed
        'state-cancelled':  '#A8424B',   // muted red — distinct from orange CTA
        'alert-error':      '#DC2626',   // urgent — never used for tap targets
        'alert-warning':    '#E8B330',   // CMY's yellow accent
      },

      // Font stack — keep your current DM Sans / DM Mono pairing
      fontFamily: {
        sans:  ['"DM Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        mono:  ['"DM Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },

      // Spacing scale — Tailwind defaults are great, just adding a few
      // helper-portal-specific sizes for thumb-friendly tap targets.
      spacing: {
        'tap': '2.75rem',  // 44px — Apple HIG minimum tap target
        'tap-lg': '3.5rem', // 56px — comfortable one-thumb hit
      },

      // Border radius — soften everything slightly to feel more "consumer
      // app" and less "enterprise dashboard"
      borderRadius: {
        'card': '0.75rem',
        'btn':  '0.625rem',
      },

      // Custom shadows for cards
      boxShadow: {
        'card':  '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.06)',
      },
    },
  },
  plugins: [],
}

export default config
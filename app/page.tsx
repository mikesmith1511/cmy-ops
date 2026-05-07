'use client'

import Link from 'next/link'

const S = {
  bg: '#0f0f0f',
  surface: '#1a1a1a',
  border: '#2e2e2e',
  accent: '#f5c842',
  accent2: '#e8a020',
  text: '#e8e8e8',
  muted: '#888',
}

export default function Home() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: S.bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <div style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
        <div
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 13,
            letterSpacing: '0.15em',
            color: S.accent,
            marginBottom: 8,
          }}
        >
          CMY // OPS PLATFORM
        </div>

        <h1
          style={{
            fontSize: 32,
            fontWeight: 700,
            color: S.text,
            margin: '0 0 12px 0',
            letterSpacing: '-0.02em',
          }}
        >
          Welcome
        </h1>

        <p style={{ color: S.muted, fontSize: 15, lineHeight: 1.5, marginBottom: 32 }}>
          Choose how you'd like to sign in.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Link
            href="/helper"
            style={{
              display: 'block',
              background: S.accent,
              color: '#0f0f0f',
              padding: '16px 24px',
              borderRadius: 10,
              fontSize: 16,
              fontWeight: 700,
              textDecoration: 'none',
              border: 'none',
              cursor: 'pointer',
              transition: 'background 0.15s',
            }}
          >
            I&apos;m a Helper
          </Link>

          <Link
            href="/admin"
            style={{
              display: 'block',
              background: S.surface,
              color: S.text,
              padding: '16px 24px',
              borderRadius: 10,
              fontSize: 16,
              fontWeight: 600,
              textDecoration: 'none',
              border: `1px solid ${S.border}`,
              cursor: 'pointer',
              transition: 'background 0.15s',
            }}
          >
            I&apos;m an Admin
          </Link>
        </div>

        <div
          style={{
            marginTop: 40,
            paddingTop: 24,
            borderTop: `1px solid ${S.border}`,
            fontSize: 12,
            color: S.muted,
          }}
        >
          Card My Yard &middot; Wildwood, Tavares, Clermont
        </div>
      </div>
    </div>
  )
}
// lib/auth.ts
import jwt from 'jsonwebtoken'
import { NextRequest, NextResponse } from 'next/server'

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-this'

// ─── EXISTING (unchanged) ────────────────────────────────────────────────

export function signToken(payload: object, expiresIn = '8h') {
  return jwt.sign(payload, JWT_SECRET, { expiresIn } as any)
}

export function verifyToken(token: string) {
  try {
    return jwt.verify(token, JWT_SECRET) as any
  } catch {
    return null
  }
}

export function getTokenFromRequest(req: NextRequest) {
  const cookie = req.cookies.get('cmy_session')?.value
  if (cookie) return verifyToken(cookie)
  const auth = req.headers.get('authorization')
  if (auth?.startsWith('Bearer ')) return verifyToken(auth.slice(7))
  return null
}

export function isAdmin(req: NextRequest) {
  const token = getTokenFromRequest(req)
  return token?.role === 'admin'
}

export function getHelperFromRequest(req: NextRequest) {
  const token = getTokenFromRequest(req)
  if (token?.role === 'helper') return token
  return null
}

// ─── NEW (added for inventory work) ──────────────────────────────────────

// Returns the authenticated user (helper OR admin), or null if not logged in.
// Use this for anything any logged-in staff can do.
export function getAuthedUser(req: NextRequest) {
  const token = getTokenFromRequest(req)
  if (!token?.id) return null
  return token as {
    id: number
    email: string
    role: 'admin' | 'helper'
    territory?: string
  }
}

// Returns the authenticated user only if they're an admin, else null.
// Use this to gate admin-only routes.
export function requireAdmin(req: NextRequest) {
  const user = getAuthedUser(req)
  if (!user || user.role !== 'admin') return null
  return user
}

// Convenience wrapper for routes.
// Returns either the authed user (typed) or a NextResponse to return immediately.
//
// Usage:
//   const user = requireAuth(req, { adminOnly: true })
//   if (user instanceof NextResponse) return user
//   // ... user is now guaranteed authed (and admin if adminOnly: true)
export function requireAuth(req: NextRequest, opts?: { adminOnly?: boolean }) {
  const user = getAuthedUser(req)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (opts?.adminOnly && user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }
  return user
}

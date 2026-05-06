import jwt from 'jsonwebtoken'
import { NextRequest } from 'next/server'

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-this'

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

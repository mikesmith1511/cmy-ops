import { NextRequest, NextResponse } from 'next/server'
import { getTokenFromRequest } from '@/lib/auth'
export async function GET(req: NextRequest) {
  const token = getTokenFromRequest(req)
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ role: token.role, email: token.email, id: token.id, name: token.name })
}

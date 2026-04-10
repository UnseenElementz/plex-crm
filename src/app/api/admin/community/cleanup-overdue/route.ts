import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { removeOverdueCustomersFromCommunity } from '@/lib/communityAccess'

function isAuthorized(request: Request) {
  if (cookies().get('admin_session')?.value === '1') return true
  if (String(request.headers.get('x-vercel-cron') || '').trim()) return true

  const secret = String(process.env.CRON_SECRET || '').trim()
  if (!secret) return false

  const authHeader = String(request.headers.get('authorization') || '').trim()
  return authHeader === `Bearer ${secret}`
}

export async function GET(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const result = await removeOverdueCustomersFromCommunity()
    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to clean overdue community access' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

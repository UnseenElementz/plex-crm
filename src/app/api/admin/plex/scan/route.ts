import { NextResponse } from 'next/server'
import { scanPlexSessions } from '@/lib/plexSessionMonitor'

function isAuthorized(request: Request) {
  const secret = String(process.env.CRON_SECRET || '').trim()
  if (!secret) return false
  const auth = String(request.headers.get('authorization') || '').trim()
  return auth === `Bearer ${secret}`
}

export async function GET(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = await scanPlexSessions()
    return NextResponse.json({
      ok: true,
      scanned_at: payload.fetched_at,
      active_sessions: payload.total,
      flagged_sessions: payload.flagged,
      over_streaming: payload.summary?.overLimitSessions || 0,
      over_downloading: payload.summary?.overDownloadSessions || 0,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to scan Plex sessions' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

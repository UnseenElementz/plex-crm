import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { scanPlexSessions } from '@/lib/plexSessionMonitor'

export async function GET() {
  try {
    if (cookies().get('admin_session')?.value !== '1') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = await scanPlexSessions()
    return NextResponse.json(payload)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to load Plex sessions' }, { status: 500 })
  }
}

export const runtime = 'nodejs'

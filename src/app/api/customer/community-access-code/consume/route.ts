import { NextResponse } from 'next/server'
import { consumeCommunityAccessCode } from '@/lib/communityAccess'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const code = String(body?.code || '').trim().toUpperCase()
    const email = String(body?.email || '').trim().toLowerCase()

    if (!code || !email) {
      return NextResponse.json({ error: 'Code and email are required' }, { status: 400 })
    }

    const result = await consumeCommunityAccessCode({ code, email })
    return NextResponse.json({ ok: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to consume access code' }, { status: 400 })
  }
}

export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { addAuditLog } from '@/lib/moderation'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const email = String(body?.email || '').trim().toLowerCase()
    const ipHeader = request.headers.get('x-forwarded-for') || ''
    const ip = ipHeader.split(',')[0].trim() || 'unknown'

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'email required' }, { status: 400 })
    }

    await addAuditLog({
      action: 'ip_seen',
      email,
      details: { ip },
    })

    return NextResponse.json({ ok: true, ip, email })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 })
  }
}

export const runtime = 'nodejs'

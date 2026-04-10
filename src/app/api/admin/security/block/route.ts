import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { addAuditLog, getSecurityOverview, persistBlockedIpsSnapshot } from '@/lib/moderation'

export async function POST(request: Request) {
  try {
    if (cookies().get('admin_session')?.value !== '1') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { ip } = await request.json().catch(() => ({}))
    const cleanIp = String(ip || '').trim()
    if (!cleanIp) return NextResponse.json({ error: 'ip required' }, { status: 400 })

    await addAuditLog({
      action: 'ip_block',
      details: { ip: cleanIp, reason: 'Manual admin block' },
    })

    const overview = await getSecurityOverview()
    await persistBlockedIpsSnapshot(overview.blockedIps)
    return NextResponse.json({ ok: true, blocked_ips: overview.blockedIps })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    if (cookies().get('admin_session')?.value !== '1') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const url = new URL(request.url)
    const cleanIp = String(url.searchParams.get('ip') || '').trim()
    if (!cleanIp) return NextResponse.json({ error: 'ip required' }, { status: 400 })

    await addAuditLog({
      action: 'ip_unblock',
      details: { ip: cleanIp, reason: 'Manual admin unblock' },
    })

    const overview = await getSecurityOverview()
    await persistBlockedIpsSnapshot(overview.blockedIps)
    return NextResponse.json({ ok: true, blocked_ips: overview.blockedIps })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 })
  }
}

export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { addAuditLog, getRequestIpContext, getSecurityOverview, persistBlockedIpsSnapshot } from '@/lib/moderation'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const email = String(body?.email || '').trim().toLowerCase()
    const source = String(body?.source || '').trim() || 'portal'
    const extraDetails =
      body?.details && typeof body.details === 'object' && !Array.isArray(body.details)
        ? body.details
        : {}
    const shouldBlock = Boolean(body?.block)
    const blockReason = String(body?.reason || 'Banned customer access attempt').trim() || 'Banned customer access attempt'
    const context = getRequestIpContext(request, source)

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'email required' }, { status: 400 })
    }

    await addAuditLog({
      action: 'ip_seen',
      email,
      details: {
        ip: context.ip,
        source: context.source,
        user_agent: context.userAgent,
        country: context.country,
        region: context.region,
        city: context.city,
        postal_code: context.postalCode,
        latitude: context.latitude,
        longitude: context.longitude,
        ...extraDetails,
      },
    })

    if (shouldBlock && context.ip !== 'unknown') {
      await addAuditLog({
        action: 'ip_block',
        email,
        details: {
          ip: context.ip,
          reason: blockReason,
          source: context.source,
        },
      })
      const overview = await getSecurityOverview()
      await persistBlockedIpsSnapshot(overview.blockedIps)
    }

    return NextResponse.json({ ok: true, ip: context.ip, email, source: context.source, blocked: shouldBlock && context.ip !== 'unknown' })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 })
  }
}

export const runtime = 'nodejs'

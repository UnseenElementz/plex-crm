import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSecurityOverview } from '@/lib/moderation'

export async function GET() {
  try {
    if (cookies().get('admin_session')?.value !== '1') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const overview = await getSecurityOverview()
    return NextResponse.json({
      ip_logs: overview.ipLogs,
      blocked_ips: overview.blockedIps,
      banned_customers: overview.bannedCustomers,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 })
  }
}

export const runtime = 'nodejs'

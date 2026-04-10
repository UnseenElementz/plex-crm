import { NextResponse } from 'next/server'
import { getPortalInviteStatus } from '@/lib/referrals'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const email = String(body?.email || '').trim().toLowerCase()
    const referralCode = String(body?.referralCode || '').trim().toUpperCase()
    const status = await getPortalInviteStatus({ email, referralCode })

    if (!status.ok) {
      return NextResponse.json(status, { status: 400 })
    }

    return NextResponse.json(status)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to validate invite access' }, { status: 500 })
  }
}

export const runtime = 'nodejs'

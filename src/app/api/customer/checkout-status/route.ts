import { NextResponse } from 'next/server'
import { getCommunityCheckoutEligibility } from '@/lib/communityGate'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const email = String(body?.email || '').trim().toLowerCase()
    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 })
    }

    const status = await getCommunityCheckoutEligibility(email)
    return NextResponse.json({
      ok: true,
      allowed: status.allowed,
      reason: status.reason,
      atCapacity: status.atCapacity,
      activeCustomerCount: status.activeCustomerCount,
      customerLimit: status.customerLimit,
      pendingInviteAccess: status.pendingInviteAccess,
      newJoin: status.newJoin,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to check checkout status' }, { status: 500 })
  }
}

export const runtime = 'nodejs'

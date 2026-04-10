import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { manuallyLinkReferralToCustomer } from '@/lib/referrals'

export async function POST(request: Request) {
  try {
    if (cookies().get('admin_session')?.value !== '1') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const customerId = String(body?.customerId || '').trim()
    const referrerCustomerId = String(body?.referrerCustomerId || '').trim()

    if (!customerId || !referrerCustomerId) {
      return NextResponse.json({ error: 'Customer and referral account are required' }, { status: 400 })
    }

    const result = await manuallyLinkReferralToCustomer({ customerId, referrerCustomerId })
    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to link referral' }, { status: 400 })
  }
}

export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { unlinkReferralFromCustomer } from '@/lib/referrals'

export async function POST(request: Request) {
  try {
    if (cookies().get('admin_session')?.value !== '1') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const customerId = String(body?.customerId || '').trim()

    if (!customerId) {
      return NextResponse.json({ error: 'Customer is required' }, { status: 400 })
    }

    const result = await unlinkReferralFromCustomer({ customerId })
    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to unlink referral' }, { status: 400 })
  }
}

export const runtime = 'nodejs'

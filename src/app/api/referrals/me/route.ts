import { NextResponse } from 'next/server'
import { claimReferralCodeForCustomer, getReferralDashboard } from '@/lib/referrals'
import { createServiceClient, getRequester } from '@/lib/serverSupabase'

function resolveBaseUrl(request: Request) {
  const canonicalHost = String(process.env.NEXT_PUBLIC_CANONICAL_HOST || '').trim()
  if (canonicalHost) return canonicalHost.startsWith('http') ? canonicalHost : `https://${canonicalHost}`

  const origin = String(request.headers.get('origin') || '').trim()
  if (origin) return origin

  const host = String(request.headers.get('x-forwarded-host') || request.headers.get('host') || '').trim()
  const proto = String(request.headers.get('x-forwarded-proto') || 'https').trim() || 'https'
  if (host) return `${proto}://${host}`
  return 'https://plex-crm.vercel.app'
}

export async function GET(request: Request) {
  try {
    const requester = await getRequester(request)
    if (!requester.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const service = createServiceClient()
    if (!service) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
    }

    const dashboard = await getReferralDashboard(requester.email, resolveBaseUrl(request))
    return NextResponse.json(dashboard)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to load referrals' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const requester = await getRequester(request)
    if (!requester.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const referralCode = String(body?.referralCode || '').trim()
    if (!referralCode) {
      return NextResponse.json({ error: 'Referral code is required' }, { status: 400 })
    }

    const result = await claimReferralCodeForCustomer(requester.email, referralCode)
    const dashboard = await getReferralDashboard(requester.email, resolveBaseUrl(request))
    return NextResponse.json({ ok: true, result, dashboard })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to claim referral code' }, { status: 400 })
  }
}

export const runtime = 'nodejs'

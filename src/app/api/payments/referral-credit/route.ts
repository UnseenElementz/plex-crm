import { NextResponse } from 'next/server'
import { calculatePrice, type Plan } from '@/lib/pricing'
import { createClient } from '@supabase/supabase-js'
import { applySuccessfulPayment } from '@/lib/payments'
import { getReferralDiscountSnapshot } from '@/lib/referrals'
import { getRequester } from '@/lib/serverSupabase'

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

async function readPricingConfig() {
  const supabase = svc()
  if (!supabase) return null
  const { data } = await supabase.from('admin_settings').select('*').eq('id', 1).maybeSingle()
  const row: any = data || null
  if (!row) return null
  return {
    yearly_price: Number(row.yearly_price) || 85,
    stream_yearly_price: Number(row.stream_yearly_price) || 20,
    movies_only_price: Number(row.movies_only_price) || 60,
    tv_only_price: Number(row.tv_only_price) || 60,
    downloads_price: Number(row.downloads_price) || 20,
  }
}

async function readPaymentLock() {
  const supabase = svc()
  if (!supabase) return false
  const { data } = await supabase.from('admin_settings').select('payment_lock').eq('id', 1).maybeSingle()
  return Boolean((data as any)?.payment_lock)
}

export async function POST(request: Request) {
  try {
    const requester = await getRequester(request)
    if (!requester.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const plan = String(body?.plan || 'yearly').trim() as Plan
    const streams = Math.max(1, Number(body?.streams || 1))
    const downloads = Boolean(body?.downloads)

    const supabase = svc()
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
    }

    const paymentLock = await readPaymentLock()
    if (paymentLock) {
      const { data: customer } = await supabase
        .from('customers')
        .select('next_payment_date,subscription_status')
        .eq('email', requester.email)
        .maybeSingle()
      const due = (customer as any)?.next_payment_date ? new Date((customer as any).next_payment_date) : null
      const now = new Date()
      const isActive = String((customer as any)?.subscription_status || '').toLowerCase() === 'active'
      const beforeDue = due ? now < due : false
      if (!customer || !isActive || !beforeDue) {
        return NextResponse.json({ error: 'Payments are locked for new or expired customers' }, { status: 403 })
      }
    }

    const pricingConfig = await readPricingConfig()
    const baseAmount = calculatePrice(plan, streams, pricingConfig, downloads)
    const discount = await getReferralDiscountSnapshot(requester.email, baseAmount)

    if (discount.creditToUse <= 0 || discount.payableAmount > 0) {
      return NextResponse.json({ error: 'Referral credit does not fully cover this renewal yet.' }, { status: 400 })
    }

    const result = await applySuccessfulPayment({
      customerEmail: requester.email,
      plan,
      streams,
      downloads,
      amount: 0,
      creditUsed: discount.creditToUse,
      paymentMethod: 'Referral Credit',
      paymentOrderId: `credit-${Date.now()}-${requester.email}`,
    })

    return NextResponse.json({
      ok: true,
      result,
      creditUsed: discount.creditToUse,
      nextDue: result.nextDue,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to apply referral credit' }, { status: 500 })
  }
}

export const runtime = 'nodejs'

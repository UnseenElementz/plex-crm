import { NextResponse } from 'next/server'
import paypal from '@paypal/checkout-server-sdk'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { applySuccessfulPayment, parsePayPalCustomId } from '@/lib/payments'
import { type Plan } from '@/lib/pricing'
const sanitize = (v?: string) => (v || '').trim().replace(/^['"]|['"]$/g, '')

function client() {
  const clientId = sanitize(process.env.PAYPAL_CLIENT_ID)
  const clientSecret = sanitize(process.env.PAYPAL_CLIENT_SECRET)
  
  if (!clientId || !clientSecret) {
    throw new Error('PayPal credentials not configured')
  }
  
  const env = process.env.PAYPAL_ENV === 'live'
    ? new paypal.core.LiveEnvironment(clientId, clientSecret)
    : new paypal.core.SandboxEnvironment(clientId, clientSecret)
  return new paypal.core.PayPalHttpClient(env)
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      orderId,
      customerEmail,
      plan: requestedPlan,
      streams: requestedStreams,
      downloads: requestedDownloads,
    } = body || {}
    
    if (!orderId || typeof orderId !== 'string') {
      return NextResponse.json({ error: 'Valid orderId required' }, { status: 400 })
    }
    
    // Enforce payment lock eligibility
    try {
      const jar = cookies()
      const raw = jar.get('admin_settings')?.value
      const cookieSettings = raw ? JSON.parse(decodeURIComponent(raw)) : {}
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string
      let paymentLock = Boolean(cookieSettings?.payment_lock)
      let s: any = null
      if (supabaseUrl && supabaseServiceKey) {
        s = createClient(supabaseUrl, supabaseServiceKey)
        try {
          const { data: settings } = await s.from('admin_settings').select('payment_lock').single()
          if (settings && typeof settings.payment_lock === 'boolean') paymentLock = settings.payment_lock
        } catch {}
      }
      if (paymentLock && customerEmail && s) {
        const { data: customer } = await s.from('customers').select('id, next_payment_date, subscription_status').eq('email', customerEmail).single()
        const due = customer?.next_payment_date ? new Date(customer.next_payment_date) : null
        const now = new Date()
        const isActive = (customer?.subscription_status || 'active') === 'active'
        const beforeDue = due ? now < due : false
        const hasSubscription = Boolean(customer)
        const eligible = hasSubscription && isActive && beforeDue
        if (!eligible) {
          return NextResponse.json({ error: 'Payments are locked for new or expired customers' }, { status: 403 })
        }
      }
    } catch {}

    const c = client()
    const req = new paypal.orders.OrdersCaptureRequest(orderId)
    req.requestBody({})
    
    let res: any
    try {
      res = await c.execute(req)
    } catch (e: any) {
      const envBase = process.env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'
      const altBase = process.env.PAYPAL_ENV === 'live' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com'
      const clientId = sanitize(process.env.PAYPAL_CLIENT_ID as string)
      const clientSecret = sanitize(process.env.PAYPAL_CLIENT_SECRET as string)

      async function captureWith(base: string){
        if (!clientId || !clientSecret) return null
        const tokenRes = await fetch(base + '/v1/oauth2/token', {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: 'grant_type=client_credentials'
        })
        const raw = await tokenRes.text()
        let token: any = null
        try{ token = JSON.parse(raw) }catch{}
        if (!tokenRes.ok || !token?.access_token) return null
        const capRes = await fetch(base + `/v2/checkout/orders/${orderId}/capture`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({})
        })
        const cap = await capRes.json().catch(()=>null)
        if (!capRes.ok || !cap) return null
        return { result: cap }
      }

      let cap = await captureWith(envBase)
      if (!cap) cap = await captureWith(altBase)
      if (!cap) {
        if (e && e.statusCode === 422) {
          const get = new paypal.orders.OrdersGetRequest(orderId)
          const got = await c.execute(get).catch(()=>null)
          if (got && got.result && (got.result.status === 'COMPLETED' || got.result.status === 'APPROVED')) {
            res = got
          } else {
            throw e
          }
        } else {
          throw e
        }
      } else {
        res = cap
      }
    }
    if (!res.result) {
      throw new Error('Invalid PayPal response')
    }
    
    const orderPurchaseUnit = res.result?.purchase_units?.[0] || {}
    const parsedCustomId = parsePayPalCustomId(orderPurchaseUnit?.custom_id)
    const resolvedEmail = String(parsedCustomId?.email || customerEmail || '').trim().toLowerCase()
    const resolvedPlan = (parsedCustomId?.plan || requestedPlan || 'yearly') as Plan
    const resolvedStreams = Math.max(1, Number(parsedCustomId?.streams || requestedStreams || 1))
    const resolvedDownloads = Boolean(
      parsedCustomId ? parsedCustomId.downloads : requestedDownloads
    )
    const amount = Number(
      (orderPurchaseUnit?.payments?.captures?.[0]?.amount?.value) ||
      (orderPurchaseUnit?.amount?.value) ||
      0
    )

    // Persist payment and update next due date if we have customerEmail
    try {
      if (resolvedEmail) {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string
        if (supabaseUrl && supabaseServiceKey) {
          const s = createClient(supabaseUrl, supabaseServiceKey)
          await applySuccessfulPayment({
            customerEmail: resolvedEmail,
            plan: resolvedPlan,
            streams: resolvedStreams,
            downloads: resolvedDownloads,
            amount,
          })
        }
      }
    } catch {}

    return NextResponse.json({ 
      id: res.result.id,
      status: res.result.status,
      customerEmail: resolvedEmail || null,
      plan: resolvedPlan,
      streams: resolvedStreams,
      downloads: resolvedDownloads,
      details: res.result
    })
    
  } catch (error: any) {
    console.error('PayPal capture order error:', error)
    
    if (error.message === 'PayPal credentials not configured') {
      return NextResponse.json({ 
        error: 'PayPal payment service is not configured. Please contact support.' 
      }, { status: 503 })
    }
    if ((error.statusCode === 401) || String(error?.message || '').includes('invalid_client')) {
      return NextResponse.json({
        error: 'Invalid PayPal credentials. Check PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.'
      }, { status: 503 })
    }
    
    if (error.statusCode === 422) {
      return NextResponse.json({ 
        error: 'Payment could not be processed. Please try a different payment method.' 
      }, { status: 422 })
    }
    
    return NextResponse.json({ 
      error: error.message || 'Failed to capture PayPal order' 
    }, { status: 500 })
  }
}
export const runtime = 'nodejs'

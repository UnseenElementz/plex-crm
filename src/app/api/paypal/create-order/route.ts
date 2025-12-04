import { NextResponse } from 'next/server'
import paypal from '@paypal/checkout-server-sdk'
import { calculatePrice, type Plan } from '@/lib/pricing'
export const runtime = 'nodejs'
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
    let { amount, currency = 'GBP', plan, streams } = body || {}
    if (plan && typeof plan === 'string') {
      const p = plan as Plan
      const s = typeof streams === 'number' ? streams : 1
      amount = calculatePrice(p, s)
    }
    
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return NextResponse.json({ error: 'Valid amount required' }, { status: 400 })
    }

    try {
      const c = client()
      const order = new paypal.orders.OrdersCreateRequest()
      order.prefer('return=representation')
      const purchaseUnit: any = { amount: { currency_code: currency, value: String(Number(amount).toFixed(2)) } }
      const host = (process.env.NEXT_PUBLIC_CANONICAL_HOST || '').replace(/^https?:\/\//,'')
      const returnUrl = host ? `https://${host}/customer` : undefined
      const cancelUrl = host ? `https://${host}/customer` : undefined
      order.requestBody({ intent: 'CAPTURE', purchase_units: [purchaseUnit], application_context: { return_url: returnUrl, cancel_url: cancelUrl, user_action: 'PAY_NOW' } })
      const res = await c.execute(order)
      if (!res.result || !res.result.id) throw new Error('Invalid PayPal response')
      return NextResponse.json({ id: res.result.id, status: res.result.status })
    } catch (sdkErr: any) {
      const clientId = sanitize(process.env.PAYPAL_CLIENT_ID as string)
      const clientSecret = sanitize(process.env.PAYPAL_CLIENT_SECRET as string)
      if (!clientId || !clientSecret) throw sdkErr
      const envBase = process.env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'
      const altBase = process.env.PAYPAL_ENV === 'live' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com'
      const host = (process.env.NEXT_PUBLIC_CANONICAL_HOST || '').replace(/^https?:\/\//,'')
      const return_url = host ? `https://${host}/customer` : undefined
      const cancel_url = host ? `https://${host}/customer` : undefined
      const purchase_units: any[] = [{ amount: { currency_code: currency, value: String(Number(amount).toFixed(2)) } }]

      async function createWith(base: string){
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
        const createRes = await fetch(base + '/v2/checkout/orders', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ intent: 'CAPTURE', purchase_units, application_context: { return_url, cancel_url, user_action: 'PAY_NOW' } })
        })
        const created = await createRes.json().catch(()=>null)
        if (!createRes.ok || !created?.id) return null
        return created
      }

      const primary = await createWith(envBase)
      if (primary) return NextResponse.json({ id: primary.id, status: primary.status || 'CREATED', used: envBase })
      const secondary = await createWith(altBase)
      if (secondary) return NextResponse.json({ id: secondary.id, status: secondary.status || 'CREATED', used: altBase })

      return NextResponse.json({ error: 'PayPal auth failed', envBase, altBase }, { status: 500 })
    }
    
  } catch (error: any) {
    console.error('PayPal create order error:', error)
    
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
    
    return NextResponse.json({ error: error.message || 'Failed to create PayPal order' }, { status: 500 })
  }
}

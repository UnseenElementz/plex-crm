import { NextResponse } from 'next/server'
import paypal from '@paypal/checkout-server-sdk'
import { calculatePrice, type Plan } from '@/lib/pricing'
import { createClient } from '@supabase/supabase-js'
import { getCommunityCheckoutEligibility } from '@/lib/communityGate'
import { parseCustomerNotes } from '@/lib/customerNotes'
import { buildCheckoutReference, buildPayPalCustomId, type PayPalCheckoutMode } from '@/lib/payments'
import { getReferralDiscountSnapshot } from '@/lib/referrals'
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

async function readPricingConfig(){
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return null
  const s = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
  const r = await s.from('admin_settings').select('*').eq('id', 1).maybeSingle()
  const d: any = r.data || null
  if (!d) return null
  return {
    yearly_price: Number(d.yearly_price) || 85,
    stream_yearly_price: Number(d.stream_yearly_price) || 20,
    movies_only_price: Number(d.movies_only_price) || 60,
    tv_only_price: Number(d.tv_only_price) || 60,
    downloads_price: Number(d.downloads_price) || 20,
  }
}

function resolveBaseUrl(request: Request) {
  const canonicalHost = sanitize(process.env.NEXT_PUBLIC_CANONICAL_HOST)
  if (canonicalHost) return canonicalHost.startsWith('http') ? canonicalHost : `https://${canonicalHost}`

  const origin = sanitize(request.headers.get('origin') || '')
  if (origin) return origin

  const host = sanitize(request.headers.get('x-forwarded-host') || request.headers.get('host') || '')
  const proto = sanitize(request.headers.get('x-forwarded-proto') || 'https')
  if (host) return `${proto}://${host}`
  return ''
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const mode = String(body?.mode || 'renewal').trim() as PayPalCheckoutMode
    const normalizedEmail = String(body?.customerEmail || '').trim().toLowerCase()
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string
    let { amount, currency = 'GBP', plan, streams, downloads, customerEmail } = body || {}
    const serviceClient =
      supabaseUrl && supabaseServiceKey
        ? createClient(supabaseUrl, supabaseServiceKey, {
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
          })
        : null
    let currentCustomer: {
      streams?: number | null
      notes?: string | null
      next_payment_date?: string | null
      subscription_status?: string | null
    } | null = null
    if (normalizedEmail && serviceClient) {
      try {
        const result = await serviceClient
          .from('customers')
          .select('streams,notes,next_payment_date,subscription_status')
          .eq('email', normalizedEmail)
          .maybeSingle()
        currentCustomer = result.data || null
      } catch {
        currentCustomer = null
      }
    }
    if (plan && typeof plan === 'string') {
      const p = plan as Plan
      const s = typeof streams === 'number' ? streams : 1
      const cfg = await readPricingConfig()
      amount =
        mode === 'downloads_addon'
          ? Number(cfg?.downloads_price) || 20
          : mode === 'streams_addon'
            ? Math.max(0, Math.max(1, Number(streams || 1)) - Math.max(1, Number(currentCustomer?.streams || 1))) * (Number(cfg?.stream_yearly_price) || 20)
          : calculatePrice(p, s, cfg, downloads)
    }

    const currentNotes = parseCustomerNotes(currentCustomer?.notes || '')

    if (mode === 'downloads_addon' && currentNotes.downloads) {
      return NextResponse.json({ error: 'Downloads are already active on this account. Use the extra-stream add-on if you need more access without changing the plan date.' }, { status: 400 })
    }

    if (mode === 'streams_addon') {
      const currentStreams = Math.max(1, Number(currentCustomer?.streams || 1))
      const requestedStreams = Math.max(1, Number(streams || 1))
      if (requestedStreams <= currentStreams) {
        return NextResponse.json({ error: 'Choose a higher total stream count before paying for an extra stream add-on.' }, { status: 400 })
      }
    }

    const referralDiscount =
      mode === 'renewal' && normalizedEmail && amount
        ? await getReferralDiscountSnapshot(normalizedEmail, Number(amount || 0)).catch(() => null)
        : null

    if (normalizedEmail) {
      const checkoutStatus = await getCommunityCheckoutEligibility(normalizedEmail).catch(() => null)
      if (checkoutStatus && checkoutStatus.newJoin && !checkoutStatus.allowed) {
        const message =
          checkoutStatus.reason === 'capacity_reached'
            ? `The server is currently full at ${checkoutStatus.activeCustomerCount}/${checkoutStatus.customerLimit} active customers. New joins are paused until a slot opens.`
            : 'This account does not currently have access to start a new membership.'
        return NextResponse.json({ error: message, capacityReached: checkoutStatus.reason === 'capacity_reached' }, { status: 403 })
      }

      if (serviceClient) {
        const s = serviceClient
        let paymentLock = false

        try {
          const { data: settings } = await s.from('admin_settings').select('payment_lock').single()
          if (settings && typeof settings.payment_lock === 'boolean') {
            paymentLock = settings.payment_lock
          }
        } catch {}

        if (paymentLock) {
          const { data: customer } = await s
            .from('customers')
            .select('id,next_payment_date,subscription_status')
            .eq('email', normalizedEmail)
            .maybeSingle()
          const due = customer?.next_payment_date ? new Date(customer.next_payment_date) : null
          const now = new Date()
          const isActive = String(customer?.subscription_status || '').trim().toLowerCase() === 'active'
          const beforeDue = due ? now < due : false
          const existingEligible = Boolean(customer) && isActive && beforeDue
          const pendingInviteEligible = Boolean(checkoutStatus?.newJoin && checkoutStatus?.allowed)

          if (!existingEligible && !pendingInviteEligible) {
            return NextResponse.json(
              { error: 'Payments are locked for new or expired customers.' },
              { status: 403 }
            )
          }
        }
      }
    }

    if (referralDiscount) {
      amount = referralDiscount.payableAmount
    }
    
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return NextResponse.json({
        error: 'Referral credit covers the full renewal. Use the credit renewal button in the portal instead.',
        zeroBalance: true,
        creditApplied: referralDiscount?.creditToUse || 0,
      }, { status: 400 })
    }

    try {
      const c = client()
      const order = new paypal.orders.OrdersCreateRequest()
      order.prefer('return=representation')
      const description = buildCheckoutReference({
        mode,
        plan: (plan as Plan) || 'yearly',
        screens: Math.max(1, Number(streams || 1)),
        downloads: Boolean(downloads),
      })
      const purchaseUnit: any = {
        description,
        custom_id: customerEmail ? buildPayPalCustomId({
          email: normalizedEmail,
          plan: (plan as Plan) || 'yearly',
          streams: Math.max(1, Number(streams || 1)),
          downloads: mode === 'downloads_addon' ? true : Boolean(downloads),
          creditUsed: referralDiscount?.creditToUse || 0,
          mode,
        }) : undefined,
        amount: { currency_code: currency, value: String(Number(amount).toFixed(2)) }
      }
      const baseUrl = resolveBaseUrl(request)
      const returnUrl = baseUrl ? `${baseUrl}/customer?paypal=success` : undefined
      const cancelUrl = baseUrl ? `${baseUrl}/customer?paypal=cancelled` : undefined
      order.requestBody({ intent: 'CAPTURE', purchase_units: [purchaseUnit], application_context: { return_url: returnUrl, cancel_url: cancelUrl, user_action: 'PAY_NOW' } })
      const res = await c.execute(order)
      if (!res.result || !res.result.id) throw new Error('Invalid PayPal response')
      const approveUrl = Array.isArray((res.result as any).links)
        ? (res.result as any).links.find((link: any) => link?.rel === 'approve')?.href || ''
        : ''
      console.log('PayPal order created', {
        orderId: res.result.id,
        mode,
        customerEmail: normalizedEmail || null,
        amount: Number(amount || 0),
        currency,
      })
      return NextResponse.json({ id: res.result.id, status: res.result.status, approveUrl })
    } catch (sdkErr: any) {
      const clientId = sanitize(process.env.PAYPAL_CLIENT_ID as string)
      const clientSecret = sanitize(process.env.PAYPAL_CLIENT_SECRET as string)
      if (!clientId || !clientSecret) throw sdkErr
      const envBase = process.env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'
      const altBase = process.env.PAYPAL_ENV === 'live' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com'
      const baseUrl = resolveBaseUrl(request)
      const return_url = baseUrl ? `${baseUrl}/customer?paypal=success` : undefined
      const cancel_url = baseUrl ? `${baseUrl}/customer?paypal=cancelled` : undefined
      const purchase_units: any[] = [{
        description: buildCheckoutReference({
          mode,
          plan: (plan as Plan) || 'yearly',
          screens: Math.max(1, Number(streams || 1)),
          downloads: Boolean(downloads),
        }),
        custom_id: customerEmail ? buildPayPalCustomId({
          email: normalizedEmail,
          plan: (plan as Plan) || 'yearly',
          streams: Math.max(1, Number(streams || 1)),
          downloads: mode === 'downloads_addon' ? true : Boolean(downloads),
          creditUsed: referralDiscount?.creditToUse || 0,
          mode,
        }) : undefined,
        amount: { currency_code: currency, value: String(Number(amount).toFixed(2)) }
      }]

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
      if (primary) {
        const approveUrl = Array.isArray(primary?.links)
          ? primary.links.find((link: any) => link?.rel === 'approve')?.href || ''
          : ''
        return NextResponse.json({ id: primary.id, status: primary.status || 'CREATED', approveUrl, used: envBase })
      }
      const secondary = await createWith(altBase)
      if (secondary) {
        const approveUrl = Array.isArray(secondary?.links)
          ? secondary.links.find((link: any) => link?.rel === 'approve')?.href || ''
          : ''
        return NextResponse.json({ id: secondary.id, status: secondary.status || 'CREATED', approveUrl, used: altBase })
      }

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

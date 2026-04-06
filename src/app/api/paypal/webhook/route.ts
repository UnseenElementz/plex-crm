import { NextResponse } from 'next/server'
import paypal from '@paypal/checkout-server-sdk'
import { applySuccessfulPayment, parsePayPalCustomId } from '@/lib/payments'
import { type Plan } from '@/lib/pricing'

const sanitize = (v?: string) => (v || '').trim().replace(/^['"]|['"]$/g, '')

function client() {
  const clientId = sanitize(process.env.PAYPAL_CLIENT_ID)
  const clientSecret = sanitize(process.env.PAYPAL_CLIENT_SECRET)
  if (!clientId || !clientSecret) throw new Error('PayPal credentials not configured')

  const env = process.env.PAYPAL_ENV === 'live'
    ? new paypal.core.LiveEnvironment(clientId, clientSecret)
    : new paypal.core.SandboxEnvironment(clientId, clientSecret)
  return new paypal.core.PayPalHttpClient(env)
}

export async function POST(request: Request) {
  try {
    const event = await request.json()
    const type = String(event?.event_type || '')
    if (type !== 'PAYMENT.CAPTURE.COMPLETED') return NextResponse.json({ ok: true, skipped: true })

    const capture = event?.resource || {}
    const orderId = String(capture?.supplementary_data?.related_ids?.order_id || '').trim()
    const payerEmail = String(capture?.payer?.email_address || '').trim().toLowerCase()
    const amount = Number(capture?.amount?.value || 0)

    let resolvedEmail = payerEmail
    let resolvedPlan = 'yearly' as Plan
    let resolvedStreams = 1
    let resolvedDownloads = false
    let resolvedCreditUsed = 0

    if (orderId) {
      const c = client()
      const get = new paypal.orders.OrdersGetRequest(orderId)
      const order = await c.execute(get)
      const purchaseUnit = order.result?.purchase_units?.[0] || {}
      const parsed = parsePayPalCustomId(purchaseUnit?.custom_id)
      if (parsed) {
        resolvedEmail = parsed.email
        resolvedPlan = parsed.plan
        resolvedStreams = parsed.streams
        resolvedDownloads = parsed.downloads
        resolvedCreditUsed = parsed.creditUsed
      }
    }

    if (!resolvedEmail) {
      return NextResponse.json({ error: 'customer email missing' }, { status: 400 })
    }

    await applySuccessfulPayment({
      customerEmail: resolvedEmail,
      plan: resolvedPlan,
      streams: resolvedStreams,
      downloads: resolvedDownloads,
      amount,
      creditUsed: resolvedCreditUsed,
      paymentOrderId: orderId,
    })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Webhook failed' }, { status: 500 })
  }
}

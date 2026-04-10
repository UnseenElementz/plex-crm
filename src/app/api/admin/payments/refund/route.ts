import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import paypal from '@paypal/checkout-server-sdk'
import { createClient } from '@supabase/supabase-js'
import { findPayPalLedgerEntry, markPayPalLedgerRefund } from '@/lib/paymentLedger'
import { addAuditLog, syncCustomerDownloads } from '@/lib/moderation'
import { removePlexSharesByEmail } from '@/lib/plex'

const sanitize = (v?: string) => (v || '').trim().replace(/^['"]|['"]$/g, '')
const normalizeEmail = (value?: string | null) => String(value || '').trim().toLowerCase()

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

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
    if (cookies().get('admin_session')?.value !== '1') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const paymentId = String(body?.paymentId || '').trim()
    if (!paymentId) {
      return NextResponse.json({ error: 'paymentId is required' }, { status: 400 })
    }

    const supabase = svc()
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
    }

    const { data: payment, error } = await supabase.from('payments').select('*').eq('id', paymentId).maybeSingle()
    if (error || !payment) {
      return NextResponse.json({ error: error?.message || 'Payment not found' }, { status: 404 })
    }

    const ledger = await findPayPalLedgerEntry({ paymentId })
    if (!ledger?.captureId) {
      return NextResponse.json({
        error: 'This is a legacy payment without a stored PayPal capture ID, so one-click refund is not available.',
      }, { status: 400 })
    }

    if (ledger.refundId) {
      return NextResponse.json({
        ok: true,
        alreadyRefunded: true,
        refundId: ledger.refundId,
        refundStatus: ledger.refundStatus,
      })
    }

    const paypalClient = client()
    const paypalSdk = paypal as any
    const refundRequest = new paypalSdk.payments.CapturesRefundRequest(ledger.captureId)
    refundRequest.requestBody({})
    const refundResponse = await paypalClient.execute(refundRequest)
    const refundId = String(refundResponse?.result?.id || '').trim()
    const refundStatus = String(refundResponse?.result?.status || 'COMPLETED').trim() || 'COMPLETED'
    const refundedAt = String(refundResponse?.result?.create_time || new Date().toISOString())
    const refundAmount = Number(refundResponse?.result?.amount?.value || payment.amount || 0)

    await markPayPalLedgerRefund({
      paymentId,
      captureId: ledger.captureId,
      orderId: ledger.orderId,
      refundId,
      refundAmount,
      refundStatus,
      refundedAt,
    }).catch(() => null)

    await supabase.from('payments').update({ status: 'refunded' }).eq('id', paymentId)

    let customerRecord: { id: string; email: string; name: string } | null = null
    if (payment.customer_id) {
      const { data } = await supabase
        .from('customers')
        .select('id,email,name')
        .eq('id', payment.customer_id)
        .maybeSingle()
      if (data?.id) {
        customerRecord = {
          id: String(data.id),
          email: normalizeEmail(data.email),
          name: String(data.name || '').trim(),
        }
      }
    }

    const fallbackEmail = normalizeEmail(ledger.customerEmail || null)
    if (!customerRecord && fallbackEmail) {
      const { data } = await supabase
        .from('customers')
        .select('id,email,name')
        .eq('email', fallbackEmail)
        .maybeSingle()
      if (data?.id) {
        customerRecord = {
          id: String(data.id),
          email: normalizeEmail(data.email),
          name: String(data.name || '').trim(),
        }
      }
    }

    const customerEmail = customerRecord?.email || fallbackEmail
    const customerName = customerRecord?.name || String(ledger.customerName || '').trim() || customerEmail || 'Unknown customer'

    let plexToken = ''
    const { data: settings } = await supabase
      .from('admin_settings')
      .select('plex_token')
      .eq('id', 1)
      .maybeSingle()
    plexToken = String(settings?.plex_token || '').trim()

    let accessRemoval = {
      removed: [] as Array<{ server_machine_id: string; share_id: string }>,
      failures: [] as Array<{ server_machine_id: string; share_id?: string; status?: number; error: string }>,
      skippedReason: '' as string,
    }

    if (!customerEmail) {
      accessRemoval.skippedReason = 'No customer email was linked to this payment.'
    } else if (!plexToken) {
      accessRemoval.skippedReason = 'Plex token is not configured in admin settings.'
    } else {
      const result = await removePlexSharesByEmail(plexToken, customerEmail)
      accessRemoval = {
        removed: result.removed,
        failures: result.failures,
        skippedReason: '',
      }
    }

    if (customerRecord?.id) {
      await supabase
        .from('customers')
        .update({ subscription_status: 'inactive' })
        .eq('id', customerRecord.id)
    } else if (customerEmail) {
      await supabase
        .from('customers')
        .update({ subscription_status: 'inactive' })
        .eq('email', customerEmail)
    }

    if (customerEmail) {
      await syncCustomerDownloads(customerEmail, false)
    }

    await addAuditLog({
      action: 'paypal_refund_access_revoked',
      email: customerEmail || null,
      details: {
        payment_id: paymentId,
        customer_id: payment.customer_id || customerRecord?.id || null,
        customer_name: customerName,
        refund_id: refundId || null,
        refund_status: refundStatus,
        refund_amount: refundAmount,
        removed_share_count: accessRemoval.removed.length,
        share_removal_failures: accessRemoval.failures.length,
        share_removal_skipped: accessRemoval.skippedReason || null,
      },
    })

    return NextResponse.json({
      ok: true,
      refundId: refundId || null,
      refundStatus,
      customerEmail: customerEmail || null,
      customerName,
      customerStatus: customerEmail ? 'inactive' : 'unknown',
      accessRemoval,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Refund failed' }, { status: 500 })
  }
}

export const runtime = 'nodejs'

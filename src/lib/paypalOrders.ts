import paypal from '@paypal/checkout-server-sdk'
import { buildPaymentHistoryNote, parsePayPalCustomId, type PayPalCheckoutMode } from '@/lib/payments'
import { type Plan } from '@/lib/pricing'
import { findPayPalLedgerEntry, recordPayPalLedgerEntry } from '@/lib/paymentLedger'

const sanitize = (value?: string) => String(value || '').trim().replace(/^['"]|['"]$/g, '')

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

function hasDetailedLedgerNote(input: {
  note?: string | null
  mode?: string | null
}) {
  const note = String(input.note || '').trim()
  const mode = String(input.mode || '').trim()
  if (!note || !mode) return false
  if (mode === 'downloads_addon' || mode === 'streams_addon') {
    return note.includes('|')
  }
  return true
}

function parsePlanLabel(label: string): Plan {
  const normalized = String(label || '').trim().toLowerCase()
  if (normalized.includes('movie')) return 'movies_only'
  if (normalized.includes('tv')) return 'tv_only'
  if (normalized.includes('month')) return 'monthly'
  return 'yearly'
}

export function inferPayPalOrderMetadata(input: {
  description?: string | null
  customId?: string | null
}) {
  const description = String(input.description || '').trim()
  const parsedCustomId = parsePayPalCustomId(input.customId)
  if (parsedCustomId) {
    return {
      mode: parsedCustomId.mode,
      plan: parsedCustomId.plan,
      streams: parsedCustomId.streams,
      downloads: parsedCustomId.downloads,
      note: buildPaymentHistoryNote({
        mode: parsedCustomId.mode,
        plan: parsedCustomId.plan,
        streams: parsedCustomId.streams,
        downloads: parsedCustomId.downloads,
      }),
    }
  }

  if (!description) return null

  if (/^downloads add-on/i.test(description)) {
    return {
      mode: 'downloads_addon' as PayPalCheckoutMode,
      plan: 'yearly' as Plan,
      streams: 1,
      downloads: true,
      note: 'Downloads add-on | Downloads enabled for the current plan',
    }
  }

  const streamAddonMatch = description.match(/extra stream add-on\s*-\s*(\d+)\s+total\s+streams?/i)
  if (streamAddonMatch) {
    const streams = Math.max(1, Number(streamAddonMatch[1] || 1))
    return {
      mode: 'streams_addon' as PayPalCheckoutMode,
      plan: 'yearly' as Plan,
      streams,
      downloads: false,
      note: `Extra stream add-on | ${streams} total ${streams === 1 ? 'stream' : 'streams'}`,
    }
  }

  const renewalMatch = description.match(/^(1 year|12 months|1 month)\s+(.+?)\s*-\s*(\d+)\s+(server|servers|stream|streams)(\s+\+\s+downloads)?$/i)
  if (renewalMatch) {
    const duration = String(renewalMatch[1] || '').trim().toLowerCase()
    const plan = duration === '1 month' ? 'monthly' : parsePlanLabel(renewalMatch[2] || '')
    const streams = Math.max(1, Number(renewalMatch[3] || 1))
    const downloads = Boolean(renewalMatch[5])
    return {
      mode: 'renewal' as PayPalCheckoutMode,
      plan,
      streams,
      downloads,
      note: buildPaymentHistoryNote({
        mode: 'renewal',
        plan,
        streams,
        downloads,
      }),
    }
  }

  return {
    mode: 'renewal' as PayPalCheckoutMode,
    plan: 'yearly' as Plan,
    streams: 1,
    downloads: false,
    note: description,
  }
}

export async function backfillPayPalLedgerFromOrder(input: {
  orderId?: string | null
  captureId?: string | null
  paymentId?: string | null
  customerId?: string | null
  customerEmail?: string | null
  customerName?: string | null
}) {
  const orderId = String(input.orderId || '').trim()
  if (!orderId) return null

  const existingEntry = await findPayPalLedgerEntry({
    paymentId: input.paymentId,
    captureId: input.captureId,
    orderId,
  }).catch(() => null)

  if (existingEntry && hasDetailedLedgerNote(existingEntry)) {
    return existingEntry
  }

  const response = await client().execute(new paypal.orders.OrdersGetRequest(orderId))
  const purchaseUnit = response.result?.purchase_units?.[0] || {}
  const capture = purchaseUnit?.payments?.captures?.[0] || null
  const payer = response.result?.payer || {}
  const parsed = inferPayPalOrderMetadata({
    description: String(purchaseUnit?.description || '').trim(),
    customId: String(purchaseUnit?.custom_id || '').trim(),
  })

  if (!parsed) return existingEntry

  return recordPayPalLedgerEntry({
    paymentId: String(input.paymentId || existingEntry?.paymentId || '').trim() || null,
    customerId: String(input.customerId || existingEntry?.customerId || '').trim() || null,
    customerEmail: String(input.customerEmail || existingEntry?.customerEmail || payer?.email_address || '').trim().toLowerCase(),
    customerName: String(input.customerName || existingEntry?.customerName || payer?.name?.given_name || '').trim(),
    payerEmail: String(existingEntry?.payerEmail || payer?.email_address || '').trim().toLowerCase() || null,
    payerName: [payer?.name?.given_name, payer?.name?.surname].filter(Boolean).join(' ').trim() || existingEntry?.payerName || null,
    amount: Number(capture?.amount?.value || purchaseUnit?.amount?.value || existingEntry?.amount || 0),
    currency: String(capture?.amount?.currency_code || purchaseUnit?.amount?.currency_code || existingEntry?.currency || 'GBP').trim() || 'GBP',
    paymentMethod:
      existingEntry?.paymentMethod ||
      (parsed.mode === 'downloads_addon'
        ? 'PayPal - Downloads Add-on'
        : parsed.mode === 'streams_addon'
          ? 'PayPal - Streams Add-on'
          : 'PayPal'),
    status: String(capture?.status || response.result?.status || existingEntry?.status || 'COMPLETED').trim() || 'COMPLETED',
    createdAt: String(capture?.create_time || response.result?.create_time || existingEntry?.createdAt || new Date().toISOString()).trim(),
    entrySource: existingEntry?.entrySource || 'website',
    note: parsed.note,
    mode: parsed.mode,
    plan: parsed.plan,
    streams: parsed.streams,
    downloads: parsed.downloads,
    orderId,
    captureId: String(input.captureId || capture?.id || existingEntry?.captureId || '').trim(),
    captureStatus: String(capture?.status || existingEntry?.captureStatus || response.result?.status || 'COMPLETED').trim() || 'COMPLETED',
    capturedAt: String(capture?.create_time || existingEntry?.capturedAt || '').trim() || null,
  }).catch(() => existingEntry)
}

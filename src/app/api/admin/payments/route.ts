import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { listPayPalLedgerEntries } from '@/lib/paymentLedger'
import { backfillPayPalLedgerFromOrder } from '@/lib/paypalOrders'

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

function normalizeEmail(value: unknown) {
  return String(value || '').trim().toLowerCase()
}

function normalizeDate(value: unknown) {
  const raw = String(value || '').trim()
  if (!raw) return null
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

export async function GET() {
  try {
    if (cookies().get('admin_session')?.value !== '1') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = svc()
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
    }

    const [paymentsRes, customersRes, initialLedgerEntries] = await Promise.all([
      supabase.from('payments').select('*').order('payment_date', { ascending: false }),
      supabase.from('customers').select('id,name,email'),
      listPayPalLedgerEntries().catch(() => []),
    ])

    if (paymentsRes.error) {
      return NextResponse.json({ error: paymentsRes.error.message }, { status: 500 })
    }

    const customersById = new Map<string, { id: string; name: string; email: string }>()
    const customersByEmail = new Map<string, { id: string; name: string; email: string }>()
    for (const row of customersRes.data || []) {
      const id = String((row as any).id || '').trim()
      if (!id) continue
      const customer = {
        id,
        name: String((row as any).name || '').trim(),
        email: normalizeEmail((row as any).email),
      }
      customersById.set(id, customer)
      if (customer.email) customersByEmail.set(customer.email, customer)
    }

    const ledgerByPaymentId = new Map<string, (typeof initialLedgerEntries)[number]>()
    const ledgerByCaptureId = new Map<string, (typeof initialLedgerEntries)[number]>()
    const ledgerByOrderId = new Map<string, (typeof initialLedgerEntries)[number]>()
    for (const entry of initialLedgerEntries || []) {
      const paymentId = String(entry?.paymentId || '').trim()
      if (paymentId && !ledgerByPaymentId.has(paymentId)) {
        ledgerByPaymentId.set(paymentId, entry)
      }
      const captureId = String(entry?.captureId || '').trim()
      if (captureId && !ledgerByCaptureId.has(captureId)) {
        ledgerByCaptureId.set(captureId, entry)
      }
      const orderId = String(entry?.orderId || '').trim()
      if (orderId && !ledgerByOrderId.has(orderId)) {
        ledgerByOrderId.set(orderId, entry)
      }
    }

    const paymentBackfillTargets = (paymentsRes.data || []).filter((row: any) => {
      const paymentId = String(row?.id || '').trim()
      const orderId = String(row?.order_id || '').trim()
      if (!orderId) return false
      const existingLedger =
        ledgerByPaymentId.get(paymentId) ||
        ledgerByCaptureId.get(String(row?.capture_id || '').trim()) ||
        ledgerByOrderId.get(orderId) ||
        null
      return !existingLedger?.note
    })

    const ledgerBackfillTargets = (initialLedgerEntries || []).filter((entry) => {
      const orderId = String(entry?.orderId || '').trim()
      return Boolean(orderId && !String(entry?.note || '').trim())
    })

    if (paymentBackfillTargets.length || ledgerBackfillTargets.length) {
      await Promise.all(
        [
          ...paymentBackfillTargets.map((row: any) =>
            backfillPayPalLedgerFromOrder({
              paymentId: String(row?.id || '').trim(),
              customerId: String(row?.customer_id || '').trim(),
              customerEmail: customersById.get(String(row?.customer_id || '').trim())?.email || null,
              customerName: customersById.get(String(row?.customer_id || '').trim())?.name || null,
              orderId: String(row?.order_id || '').trim(),
              captureId: String(row?.capture_id || '').trim(),
            }).catch(() => null)
          ),
          ...ledgerBackfillTargets.map((entry) =>
          backfillPayPalLedgerFromOrder({
            paymentId: String(entry?.paymentId || '').trim(),
            customerId: String(entry?.customerId || '').trim(),
            customerEmail: String(entry?.customerEmail || '').trim() || null,
            customerName: String(entry?.customerName || '').trim() || null,
            orderId: String(entry?.orderId || '').trim(),
            captureId: String(entry?.captureId || '').trim(),
          }).catch(() => null)
        ),
        ]
      )
    }

    const ledgerEntries =
      paymentBackfillTargets.length || ledgerBackfillTargets.length
        ? await listPayPalLedgerEntries().catch(() => initialLedgerEntries)
        : initialLedgerEntries
    ledgerByPaymentId.clear()
    ledgerByCaptureId.clear()
    ledgerByOrderId.clear()
    for (const entry of ledgerEntries || []) {
      const paymentId = String(entry?.paymentId || '').trim()
      if (paymentId && !ledgerByPaymentId.has(paymentId)) {
        ledgerByPaymentId.set(paymentId, entry)
      }
      const captureId = String(entry?.captureId || '').trim()
      if (captureId && !ledgerByCaptureId.has(captureId)) {
        ledgerByCaptureId.set(captureId, entry)
      }
      const orderId = String(entry?.orderId || '').trim()
      if (orderId && !ledgerByOrderId.has(orderId)) {
        ledgerByOrderId.set(orderId, entry)
      }
    }

    const rows = (paymentsRes.data || []).map((row: any) => {
      const paymentId = String(row?.id || '').trim()
      const customer = customersById.get(String(row?.customer_id || '').trim())
      const ledger =
        ledgerByPaymentId.get(paymentId) ||
        ledgerByCaptureId.get(String(row?.capture_id || '').trim()) ||
        ledgerByOrderId.get(String(row?.order_id || '').trim()) ||
        null
      const provider = String(row?.provider || row?.payment_method || 'PayPal').trim() || 'PayPal'
      const isRefunded = Boolean(ledger?.refundId)
      const type =
        String(ledger?.mode || '').trim() === 'downloads_addon' || provider.toLowerCase().includes('downloads add-on')
          ? 'downloads_addon'
          : String(ledger?.mode || '').trim() === 'streams_addon' || provider.toLowerCase().includes('streams add-on')
            ? 'streams_addon'
          : 'hosting'

      return {
        id: paymentId,
        customer_id: String(row?.customer_id || '').trim() || null,
        customer_name: customer?.name || ledger?.customerName || 'Unknown customer',
        customer_email: customer?.email || ledger?.customerEmail || null,
        payer_email: ledger?.payerEmail || null,
        payer_name: ledger?.payerName || null,
        amount: Number(row?.amount || 0),
        currency: String(row?.currency || ledger?.currency || 'GBP').trim() || 'GBP',
        provider,
        status: isRefunded ? 'refunded' : String(row?.status || ledger?.status || 'completed').trim(),
        created_at: row?.payment_date || row?.created_at || ledger?.createdAt || null,
        note: ledger?.note || null,
        type,
        order_id: ledger?.orderId || null,
        capture_id: ledger?.captureId || null,
        refund_id: ledger?.refundId || null,
        refund_amount: ledger?.refundAmount ?? null,
        refund_status: ledger?.refundStatus || null,
        refunded_at: ledger?.refundedAt || null,
        refund_available: Boolean(ledger?.captureId && !ledger?.refundId),
        legacy: !ledger?.captureId,
        linked: Boolean(customer?.id || ledger?.customerId || ledger?.customerEmail),
        source: 'payments',
        entry_source: ledger?.entrySource || 'website',
      }
    })

    const seenKeys = new Set<string>()
    for (const row of rows) {
      if (row.id) seenKeys.add(`payment:${row.id}`)
      if (row.capture_id) seenKeys.add(`capture:${row.capture_id}`)
      if (row.order_id) seenKeys.add(`order:${row.order_id}`)
    }

    for (const entry of ledgerEntries || []) {
      const paymentId = String(entry?.paymentId || '').trim()
      const captureId = String(entry?.captureId || '').trim()
      const orderId = String(entry?.orderId || '').trim()
      if ((paymentId && seenKeys.has(`payment:${paymentId}`)) || (captureId && seenKeys.has(`capture:${captureId}`)) || (orderId && seenKeys.has(`order:${orderId}`))) {
        continue
      }

      const linkedCustomer =
        customersById.get(String(entry?.customerId || '').trim()) ||
        customersByEmail.get(normalizeEmail(entry?.customerEmail))

      rows.push({
        id: paymentId || `ledger:${captureId || orderId || Date.now().toString(36)}`,
        customer_id: linkedCustomer?.id || String(entry?.customerId || '').trim() || null,
        customer_name: linkedCustomer?.name || String(entry?.customerName || '').trim() || 'Unknown customer',
        customer_email: linkedCustomer?.email || normalizeEmail(entry?.customerEmail) || null,
        payer_email: entry?.payerEmail || null,
        payer_name: entry?.payerName || null,
        amount: Number(entry?.amount || 0),
        currency: String(entry?.currency || 'GBP').trim() || 'GBP',
        provider: String(entry?.paymentMethod || 'PayPal').trim() || 'PayPal',
        status: entry?.refundId ? 'refunded' : String(entry?.status || 'completed').trim() || 'completed',
        created_at: entry?.createdAt || entry?.capturedAt || null,
        note: entry?.note || null,
        type:
          String(entry?.mode || '').trim() === 'downloads_addon'
            ? 'downloads_addon'
            : String(entry?.mode || '').trim() === 'streams_addon'
              ? 'streams_addon'
              : 'hosting',
        order_id: orderId || null,
        capture_id: captureId || null,
        refund_id: entry?.refundId || null,
        refund_amount: entry?.refundAmount ?? null,
        refund_status: entry?.refundStatus || null,
        refunded_at: entry?.refundedAt || null,
        refund_available: false,
        legacy: false,
        linked: Boolean(linkedCustomer?.id || entry?.customerId || entry?.customerEmail),
        source: 'ledger',
        entry_source: entry?.entrySource || 'website',
      })
    }

    rows.sort((left, right) => {
      const a = normalizeDate(left.created_at)
      const b = normalizeDate(right.created_at)
      if (!a && !b) return 0
      if (!a) return 1
      if (!b) return -1
      return b.localeCompare(a)
    })

    return NextResponse.json({
      transactions: rows,
      count: rows.length,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to load PayPal transactions' }, { status: 500 })
  }
}

export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { listPayPalLedgerEntries } from '@/lib/paymentLedger'
import { backfillPayPalLedgerFromOrder } from '@/lib/paypalOrders'

function authClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
  if (!url || !anon) return null
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

export async function GET(request: Request){
  const header = String(request.headers.get('authorization') || '')
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const auth = authClient()
  const service = serviceClient()
  if (!auth || !service) return NextResponse.json([])

  const { data: authData, error: authError } = await auth.auth.getUser(token)
  const email = String(authData?.user?.email || '').trim().toLowerCase()
  if (authError || !email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: customers } = await service.from('customers').select('id').eq('email', email).limit(1)
  const customer = customers?.[0]
  if (!customer) return NextResponse.json([])

  const [{ data }, initialLedgerEntries] = await Promise.all([
    service.from('payments').select('*').eq('customer_id', customer.id).order('created_at', { ascending: false }),
    listPayPalLedgerEntries().catch(() => []),
  ])

  const ledgerByPaymentId = new Map<string, (typeof initialLedgerEntries)[number]>()
  const ledgerByCaptureId = new Map<string, (typeof initialLedgerEntries)[number]>()
  const ledgerByOrderId = new Map<string, (typeof initialLedgerEntries)[number]>()
  for (const entry of initialLedgerEntries || []) {
    const paymentId = String(entry?.paymentId || '').trim()
    if (paymentId && !ledgerByPaymentId.has(paymentId)) ledgerByPaymentId.set(paymentId, entry)
    const captureId = String(entry?.captureId || '').trim()
    if (captureId && !ledgerByCaptureId.has(captureId)) ledgerByCaptureId.set(captureId, entry)
    const orderId = String(entry?.orderId || '').trim()
    if (orderId && !ledgerByOrderId.has(orderId)) ledgerByOrderId.set(orderId, entry)
  }

  const paymentBackfillTargets = (data || []).filter((row: any) => {
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
    const entryEmail = String(entry?.customerEmail || '').trim().toLowerCase()
    return Boolean(orderId && entryEmail === email && !String(entry?.note || '').trim())
  })

  if (paymentBackfillTargets.length || ledgerBackfillTargets.length) {
    await Promise.all(
      [
        ...paymentBackfillTargets.map((row: any) =>
          backfillPayPalLedgerFromOrder({
            paymentId: String(row?.id || '').trim(),
            customerId: String(customer.id || '').trim(),
            customerEmail: email,
            orderId: String(row?.order_id || '').trim(),
            captureId: String(row?.capture_id || '').trim(),
          }).catch(() => null)
        ),
        ...ledgerBackfillTargets.map((entry) =>
          backfillPayPalLedgerFromOrder({
            paymentId: String(entry?.paymentId || '').trim(),
            customerId: String(entry?.customerId || '').trim() || String(customer.id || '').trim(),
            customerEmail: email,
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
    if (paymentId && !ledgerByPaymentId.has(paymentId)) ledgerByPaymentId.set(paymentId, entry)
    const captureId = String(entry?.captureId || '').trim()
    if (captureId && !ledgerByCaptureId.has(captureId)) ledgerByCaptureId.set(captureId, entry)
    const orderId = String(entry?.orderId || '').trim()
    if (orderId && !ledgerByOrderId.has(orderId)) ledgerByOrderId.set(orderId, entry)
  }

  const rows = Array.isArray(data)
    ? data.map((row: any) => {
        const ledger =
          ledgerByPaymentId.get(String(row?.id || '').trim()) ||
          ledgerByCaptureId.get(String(row?.capture_id || '').trim()) ||
          ledgerByOrderId.get(String(row?.order_id || '').trim()) ||
          null

        return {
          ...row,
          provider: ledger?.paymentMethod || row.provider || row.payment_method || 'PayPal',
          currency: row.currency || ledger?.currency || 'GBP',
          created_at: row.payment_date || row.created_at || ledger?.createdAt || null,
          order_id: String(row?.order_id || ledger?.orderId || '').trim() || null,
          capture_id: String(row?.capture_id || ledger?.captureId || '').trim() || null,
          note: ledger?.note || null,
          source: 'payments',
        }
      })
    : []

  const seen = new Set<string>()
  for (const row of rows) {
    const paymentId = String(row?.id || '').trim()
    if (paymentId) seen.add(`payment:${paymentId}`)
  }

  for (const entry of ledgerEntries || []) {
    const paymentId = String(entry?.paymentId || '').trim()
    const customerId = String(entry?.customerId || '').trim()
    const customerEmail = String(entry?.customerEmail || '').trim().toLowerCase()
    if (paymentId && seen.has(`payment:${paymentId}`)) continue
    if (customerId !== String(customer.id).trim() && customerEmail !== email) continue

    rows.push({
      id: paymentId || `ledger:${String(entry?.captureId || entry?.orderId || '').trim() || rows.length + 1}`,
      amount: Number(entry?.amount || 0),
      currency: String(entry?.currency || 'GBP').trim() || 'GBP',
      provider: String(entry?.paymentMethod || 'PayPal').trim() || 'PayPal',
      status: entry?.refundId ? 'refunded' : String(entry?.status || 'completed').trim() || 'completed',
      created_at: entry?.createdAt || entry?.capturedAt || null,
      order_id: String(entry?.orderId || '').trim() || null,
      capture_id: String(entry?.captureId || '').trim() || null,
      note: entry?.note || null,
      source: 'ledger',
    })
  }

  rows.sort((left: any, right: any) => {
    const a = new Date(String(left?.created_at || 0)).getTime()
    const b = new Date(String(right?.created_at || 0)).getTime()
    return b - a
  })
  return NextResponse.json(rows)
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

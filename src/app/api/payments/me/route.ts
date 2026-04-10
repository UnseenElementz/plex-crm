import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { listPayPalLedgerEntries } from '@/lib/paymentLedger'

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

  const [{ data }, ledgerEntries] = await Promise.all([
    service.from('payments').select('*').eq('customer_id', customer.id).order('created_at', { ascending: false }),
    listPayPalLedgerEntries().catch(() => []),
  ])

  const rows = Array.isArray(data)
    ? data.map((row: any) => ({
        ...row,
        provider: row.provider || row.payment_method || 'PayPal',
        currency: row.currency || 'GBP',
        created_at: row.payment_date || row.created_at || null,
        order_id: null,
        capture_id: null,
        note: null,
        source: 'payments',
      }))
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

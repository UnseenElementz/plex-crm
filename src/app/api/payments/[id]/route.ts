import { NextResponse } from 'next/server'
import { createServiceClient, getRequester } from '@/lib/serverSupabase'
import { listPayPalLedgerEntries } from '@/lib/paymentLedger'

export async function GET(request: Request, { params }: { params: { id: string } }){
  const requester = await getRequester(request)
  const service = createServiceClient()
  if (!service) return NextResponse.json([])

  const { data: customer } = await service
    .from('customers')
    .select('id,email')
    .eq('id', params.id)
    .maybeSingle()

  const customerEmail = String(customer?.email || '').trim().toLowerCase()
  if (!customer?.id) return NextResponse.json([])
  if (!requester.isAdmin && requester.email !== customerEmail) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [{ data }, ledgerEntries] = await Promise.all([
    service.from('payments').select('*').eq('customer_id', params.id).order('created_at', { ascending: false }),
    listPayPalLedgerEntries().catch(() => []),
  ])

  const rows = Array.isArray(data)
    ? data.map((row: any) => ({
        ...row,
        provider: row.provider || row.payment_method || 'PayPal',
        currency: row.currency || 'GBP',
        created_at: row.payment_date || row.created_at || null,
      }))
    : []

  const seen = new Set<string>()
  for (const row of rows) {
    const paymentId = String(row?.id || '').trim()
    if (paymentId) seen.add(`payment:${paymentId}`)
  }

  for (const entry of ledgerEntries || []) {
    const paymentId = String(entry?.paymentId || '').trim()
    const entryCustomerId = String(entry?.customerId || '').trim()
    const entryCustomerEmail = String(entry?.customerEmail || '').trim().toLowerCase()
    if (paymentId && seen.has(`payment:${paymentId}`)) continue
    if (entryCustomerId !== params.id && entryCustomerEmail !== customerEmail) continue

    rows.push({
      id: paymentId || `ledger:${String(entry?.captureId || entry?.orderId || '').trim() || rows.length + 1}`,
      amount: Number(entry?.amount || 0),
      currency: String(entry?.currency || 'GBP').trim() || 'GBP',
      provider: String(entry?.paymentMethod || 'PayPal').trim() || 'PayPal',
      status: entry?.refundId ? 'refunded' : String(entry?.status || 'completed').trim() || 'completed',
      created_at: entry?.createdAt || entry?.capturedAt || null,
    })
  }

  rows.sort((left: any, right: any) => {
    const a = new Date(String(left?.created_at || 0)).getTime()
    const b = new Date(String(right?.created_at || 0)).getTime()
    return b - a
  })

  return NextResponse.json(rows)
}

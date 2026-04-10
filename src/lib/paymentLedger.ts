import { createClient } from '@supabase/supabase-js'
import { PAYPAL_LEDGER_CUSTOMER_EMAIL, PAYPAL_LEDGER_CUSTOMER_NAME } from '@/lib/systemCustomers'

export type PayPalLedgerEntry = {
  paymentId: string | null
  customerId: string | null
  customerEmail: string
  customerName: string
  payerEmail: string | null
  payerName: string | null
  amount: number
  currency: string
  paymentMethod: string
  status: string
  createdAt: string
  entrySource: 'website' | 'manual'
  note: string | null
  mode: string
  plan: string
  streams: number
  downloads: boolean
  orderId: string
  captureId: string
  captureStatus: string
  capturedAt: string | null
  refundedAt: string | null
  refundId: string | null
  refundAmount: number | null
  refundStatus: string | null
}

type PaymentLedgerState = {
  entries: PayPalLedgerEntry[]
}

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

function normalizeMoney(value: unknown) {
  const parsed = Number(value || 0)
  if (!Number.isFinite(parsed)) return 0
  return Number(parsed.toFixed(2))
}

function normalizeCount(value: unknown) {
  const parsed = Number(value || 0)
  if (!Number.isFinite(parsed) || parsed <= 0) return 1
  return Math.max(1, Math.floor(parsed))
}

function emptyState(): PaymentLedgerState {
  return { entries: [] }
}

function mapLedgerEntry(row: any): PayPalLedgerEntry | null {
  const orderId = String(row?.orderId || '').trim()
  const captureId = String(row?.captureId || '').trim()
  if (!orderId && !captureId) return null

  return {
    paymentId: String(row?.paymentId || '').trim() || null,
    customerId: String(row?.customerId || '').trim() || null,
    customerEmail: normalizeEmail(row?.customerEmail),
    customerName: String(row?.customerName || '').trim(),
    payerEmail: normalizeEmail(row?.payerEmail) || null,
    payerName: String(row?.payerName || '').trim() || null,
    amount: normalizeMoney(row?.amount),
    currency: String(row?.currency || 'GBP').trim() || 'GBP',
    paymentMethod: String(row?.paymentMethod || 'PayPal').trim() || 'PayPal',
    status: String(row?.status || 'completed').trim() || 'completed',
    createdAt: String(row?.createdAt || new Date().toISOString()).trim() || new Date().toISOString(),
    entrySource: String(row?.entrySource || 'website').trim() === 'manual' ? 'manual' : 'website',
    note: String(row?.note || '').trim() || null,
    mode: String(row?.mode || 'renewal').trim() || 'renewal',
    plan: String(row?.plan || 'yearly').trim() || 'yearly',
    streams: normalizeCount(row?.streams),
    downloads: Boolean(row?.downloads),
    orderId,
    captureId,
    captureStatus: String(row?.captureStatus || '').trim() || 'COMPLETED',
    capturedAt: String(row?.capturedAt || '').trim() || null,
    refundedAt: String(row?.refundedAt || '').trim() || null,
    refundId: String(row?.refundId || '').trim() || null,
    refundAmount: row?.refundAmount === null || row?.refundAmount === undefined ? null : normalizeMoney(row?.refundAmount),
    refundStatus: String(row?.refundStatus || '').trim() || null,
  }
}

function parsePaymentLedgerState(value: unknown): PaymentLedgerState {
  const raw = String(value || '').trim()
  if (!raw) return emptyState()
  try {
    const parsed = JSON.parse(raw)
    return {
      entries: Array.isArray(parsed?.entries) ? parsed.entries.map(mapLedgerEntry).filter(Boolean) as PayPalLedgerEntry[] : [],
    }
  } catch {
    return emptyState()
  }
}

function stringifyPaymentLedgerState(state: PaymentLedgerState) {
  return JSON.stringify({
    entries: state.entries.slice(-800),
  })
}

async function getPaymentLedgerRecord() {
  const supabase = svc()
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('customers')
    .select('id,notes')
    .eq('email', PAYPAL_LEDGER_CUSTOMER_EMAIL)
    .maybeSingle()

  if (error) throw new Error(error.message)

  if (data?.id) {
    return {
      id: String(data.id),
      notes: String(data.notes || ''),
      state: parsePaymentLedgerState(data.notes),
    }
  }

  const initialNotes = stringifyPaymentLedgerState(emptyState())
  const now = new Date().toISOString()
  const { data: inserted, error: insertError } = await supabase
    .from('customers')
    .insert({
      name: PAYPAL_LEDGER_CUSTOMER_NAME,
      email: PAYPAL_LEDGER_CUSTOMER_EMAIL,
      subscription_type: 'yearly',
      streams: 1,
      start_date: now,
      next_payment_date: now,
      subscription_status: 'inactive',
      notes: initialNotes,
    })
    .select('id,notes')
    .single()

  if (insertError || !inserted?.id) {
    throw new Error(insertError?.message || 'Failed to initialize PayPal ledger storage')
  }

  return {
    id: String(inserted.id),
    notes: String(inserted.notes || initialNotes),
    state: parsePaymentLedgerState(inserted.notes || initialNotes),
  }
}

async function savePaymentLedgerState(customerId: string, state: PaymentLedgerState) {
  const supabase = svc()
  if (!supabase) throw new Error('Supabase not configured')

  const { error } = await supabase
    .from('customers')
    .update({ notes: stringifyPaymentLedgerState(state) })
    .eq('id', customerId)

  if (error) throw new Error(error.message)
}

export async function listPayPalLedgerEntries() {
  const storage = await getPaymentLedgerRecord()
  return storage.state.entries
}

export async function recordPayPalLedgerEntry(input: Partial<PayPalLedgerEntry> & {
  customerEmail: string
  orderId: string
  captureId?: string
}) {
  const storage = await getPaymentLedgerRecord()
  const normalizedOrderId = String(input.orderId || '').trim()
  const normalizedCaptureId = String(input.captureId || '').trim()
  const normalizedPaymentId = String(input.paymentId || '').trim()

  const nextEntry = mapLedgerEntry({
    ...input,
    customerEmail: normalizeEmail(input.customerEmail),
    orderId: normalizedOrderId,
    captureId: normalizedCaptureId,
  })

  if (!nextEntry) throw new Error('PayPal ledger entry requires orderId or captureId')

  const existingIndex = storage.state.entries.findIndex((entry) => {
    if (normalizedPaymentId && entry.paymentId === normalizedPaymentId) return true
    if (normalizedCaptureId && entry.captureId === normalizedCaptureId) return true
    return normalizedOrderId && entry.orderId === normalizedOrderId
  })

  if (existingIndex >= 0) {
    const existing = storage.state.entries[existingIndex]
    storage.state.entries[existingIndex] = {
      ...existing,
      ...nextEntry,
      refundedAt: nextEntry.refundedAt ?? existing.refundedAt,
      refundId: nextEntry.refundId ?? existing.refundId,
      refundAmount: nextEntry.refundAmount ?? existing.refundAmount,
      refundStatus: nextEntry.refundStatus ?? existing.refundStatus,
    }
  } else {
    storage.state.entries.unshift(nextEntry)
  }

  await savePaymentLedgerState(storage.id, storage.state)
  return storage.state.entries[existingIndex >= 0 ? existingIndex : 0]
}

export async function findPayPalLedgerEntry(input: {
  paymentId?: string | null
  orderId?: string | null
  captureId?: string | null
}) {
  const entries = await listPayPalLedgerEntries()
  const paymentId = String(input.paymentId || '').trim()
  const orderId = String(input.orderId || '').trim()
  const captureId = String(input.captureId || '').trim()

  return (
    entries.find((entry) => {
      if (paymentId && entry.paymentId === paymentId) return true
      if (captureId && entry.captureId === captureId) return true
      return Boolean(orderId && entry.orderId === orderId)
    }) || null
  )
}

export async function markPayPalLedgerRefund(input: {
  paymentId?: string | null
  orderId?: string | null
  captureId?: string | null
  refundId: string
  refundAmount: number
  refundStatus: string
  refundedAt?: string | null
}) {
  const entry = await findPayPalLedgerEntry(input)
  if (!entry) throw new Error('PayPal ledger entry not found')

  return recordPayPalLedgerEntry({
    ...entry,
    refundId: String(input.refundId || '').trim(),
    refundAmount: normalizeMoney(input.refundAmount),
    refundStatus: String(input.refundStatus || 'COMPLETED').trim() || 'COMPLETED',
    refundedAt: String(input.refundedAt || new Date().toISOString()).trim() || new Date().toISOString(),
  })
}

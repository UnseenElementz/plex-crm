import { createClient } from '@supabase/supabase-js'
import { calculateNextDue, type Plan } from '@/lib/pricing'
import { mergeCustomerNotes as mergeStoredCustomerNotes, parseCustomerNotes } from '@/lib/customerNotes'
import { grantReferralRewardForCustomer } from '@/lib/referrals'

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

function isValidDate(value: unknown) {
  if (!value) return false
  const date = new Date(String(value))
  return !Number.isNaN(date.getTime())
}

export function buildHostingReference(plan: Plan, screens: number, downloads?: boolean) {
  const duration = plan === 'monthly' ? '1 Month' : '1 Year'
  const packageLabel =
    plan === 'movies_only'
      ? 'Movie Hosting'
      : plan === 'tv_only'
        ? 'TV Hosting'
        : 'Hosting'
  const serverLabel = `${screens} ${screens === 1 ? 'Server' : 'Servers'}`
  return `${duration} ${packageLabel} - ${serverLabel}${downloads ? ' + Downloads' : ''}`
}

export function buildPayPalCustomId(input: {
  email: string
  plan: Plan
  streams: number
  downloads?: boolean
  creditUsed?: number
}) {
  const email = String(input.email || '').trim().toLowerCase()
  const plan = String(input.plan || 'yearly').trim()
  const streams = Math.max(1, Number(input.streams || 1))
  const downloads = input.downloads ? '1' : '0'
  const creditUsed = Math.max(0, Number(input.creditUsed || 0)).toFixed(2)
  return `v2|${email}|${plan}|${streams}|${downloads}|${creditUsed}`
}

export function parsePayPalCustomId(value: unknown): null | {
  email: string
  plan: Plan
  streams: number
  downloads: boolean
  creditUsed: number
} {
  const raw = String(value || '').trim()
  const parts = raw.split('|')
  if (parts[0] !== 'v1' && parts[0] !== 'v2') return null

  const email = String(parts[1] || '').trim().toLowerCase()
  const plan = String(parts[2] || 'yearly').trim() as Plan
  const streams = Math.max(1, Number(parts[3] || 1))
  const downloads = String(parts[4] || '0') === '1'
  const creditUsed = parts[0] === 'v2' ? Math.max(0, Number(parts[5] || 0)) : 0
  if (!email || !email.includes('@')) return null
  return { email, plan, streams, downloads, creditUsed: Number(creditUsed.toFixed(2)) }
}

export async function applySuccessfulPayment(input: {
  customerEmail: string
  plan: Plan
  streams: number
  downloads?: boolean
  amount: number
  creditUsed?: number
  paymentMethod?: string
  paymentOrderId?: string
}) {
  const supabase = svc()
  if (!supabase) throw new Error('Supabase not configured')

  const email = String(input.customerEmail || '').trim().toLowerCase()
  const plan = input.plan
  const streams = Math.max(1, Number(input.streams || 1))
  const downloads = Boolean(input.downloads)
  const amount = Number(input.amount || 0)
  const creditUsed = Math.max(0, Number(input.creditUsed || 0))
  const paymentMethod = String(input.paymentMethod || 'PayPal').trim() || 'PayPal'
  const paymentOrderId = String(input.paymentOrderId || '').trim()
  if (!email) throw new Error('Customer email is required')

  const now = new Date()
  const { data: existing } = await supabase.from('customers').select('*').eq('email', email).maybeSingle()
  const { data: profile } = await supabase.from('profiles').select('full_name').eq('email', email).maybeSingle()
  const currentNotesState = parseCustomerNotes(existing?.notes || '')

  if (paymentOrderId && currentNotesState.paymentOrders.includes(paymentOrderId)) {
    return {
      mode: 'duplicate',
      customerId: existing?.id || null,
      nextDue: existing?.next_payment_date || null,
    }
  }

  const existingNextDue = existing?.next_payment_date
  const activeBase =
    existing && existing.subscription_status === 'active' && isValidDate(existingNextDue) && new Date(existingNextDue) > now
      ? new Date(existingNextDue)
      : now

  const nextDue = calculateNextDue(plan, activeBase)
  const nextNotes = mergeStoredCustomerNotes({
    existing: existing?.notes || '',
    downloads,
    referralCredit: Math.max(0, Number(currentNotesState.referralCredit || 0) - creditUsed),
    paymentOrders: paymentOrderId
      ? Array.from(new Set([...currentNotesState.paymentOrders, paymentOrderId])).slice(-12)
      : currentNotesState.paymentOrders,
  })
  const customerName = String(existing?.name || profile?.full_name || email).trim()

  if (existing?.id) {
    await supabase
      .from('customers')
      .update({
        name: customerName,
        subscription_type: plan,
        streams,
        start_date: existing.start_date || now.toISOString(),
        next_payment_date: nextDue.toISOString(),
        subscription_status: 'active',
        notes: nextNotes,
      })
      .eq('id', existing.id)

    await supabase.from('payments').insert({
      customer_id: existing.id,
      amount,
      status: 'completed',
      payment_method: paymentMethod,
    })

    await grantReferralRewardForCustomer(email).catch(() => null)
    return { mode: 'updated', customerId: existing.id, nextDue: nextDue.toISOString() }
  }

  const createdNotes = mergeStoredCustomerNotes({
    existing: '',
    downloads,
    referralCredit: 0,
    paymentOrders: paymentOrderId ? [paymentOrderId] : [],
  })

  const { data: created, error: createError } = await supabase
    .from('customers')
    .insert({
      name: customerName,
      email,
      subscription_type: plan,
      streams,
      start_date: now.toISOString(),
      next_payment_date: nextDue.toISOString(),
      subscription_status: 'active',
      notes: createdNotes,
    })
    .select('id')
    .single()

  if (createError || !created?.id) {
    throw new Error(createError?.message || 'Failed to create customer after payment')
  }

  await supabase.from('payments').insert({
    customer_id: created.id,
    amount,
    status: 'completed',
    payment_method: paymentMethod,
  })

  await grantReferralRewardForCustomer(email).catch(() => null)
  return { mode: 'created', customerId: created.id, nextDue: nextDue.toISOString() }
}

import { createClient } from '@supabase/supabase-js'
import { calculateNextDue, calculatePrice, STANDARD_PRICING_CONFIG, type Plan } from '@/lib/pricing'
import { mergeCustomerNotes as mergeStoredCustomerNotes, parseCustomerNotes } from '@/lib/customerNotes'
import { addAuditLog } from '@/lib/moderation'
import { grantReferralRewardForCustomer } from '@/lib/referrals'
import { enableDownloadsForCustomerEmail } from '@/lib/plexDownloadsAccess'
import { provisionPlexMembershipForCustomer } from '@/lib/plexProvisioning'
import { findPayPalLedgerEntry, recordPayPalLedgerEntry } from '@/lib/paymentLedger'

export type PayPalCheckoutMode = 'renewal' | 'downloads_addon' | 'streams_addon'

export function isFullPriceReferralRewardEligible(input: {
  plan: Plan
  streams: number
  downloads?: boolean
  amount: number
  creditUsed?: number
}) {
  const expectedFullPrice = Number(
    calculatePrice(
      input.plan,
      Math.max(1, Number(input.streams || 1)),
      STANDARD_PRICING_CONFIG,
      Boolean(input.downloads)
    ).toFixed(2)
  )
  const amount = Number(Number(input.amount || 0).toFixed(2))
  const creditUsed = Number(Number(input.creditUsed || 0).toFixed(2))

  if (amount <= 0) return false
  if (creditUsed > 0) return false
  return Math.abs(amount - expectedFullPrice) <= 0.05
}

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

function buildMissingPaymentOrderFilter(paymentOrderId: string) {
  const safeOrderId = String(paymentOrderId || '').trim()
  if (!safeOrderId) return null
  return `notes.is.null,notes.not.ilike.%${safeOrderId}%`
}

export function resolveMembershipExtensionBaseDate(nextPaymentDate: unknown, now = new Date()) {
  if (isValidDate(nextPaymentDate)) {
    const existingDueDate = new Date(String(nextPaymentDate))
    if (existingDueDate > now) return existingDueDate
  }
  return now
}

export function calculateMembershipExtensionDate(plan: Plan, nextPaymentDate: unknown, now = new Date()) {
  return calculateNextDue(plan, resolveMembershipExtensionBaseDate(nextPaymentDate, now))
}

export function buildHostingReference(plan: Plan, screens: number, downloads?: boolean) {
  const duration = plan === 'monthly' ? '1 Month' : '12 Months'
  const packageLabel =
    plan === 'movies_only'
      ? 'Movies Only'
      : plan === 'tv_only'
        ? 'TV Shows Only'
        : 'Full Access'
  const serverLabel = `${screens} ${screens === 1 ? 'Stream' : 'Streams'}`
  return `${duration} ${packageLabel} - ${serverLabel}${downloads ? ' + Downloads' : ''}`
}

export function buildCheckoutReference(input: {
  mode?: PayPalCheckoutMode
  plan: Plan
  screens: number
  downloads?: boolean
}) {
  if (input.mode === 'downloads_addon') {
    return 'Downloads Add-on'
  }
  if (input.mode === 'streams_addon') {
    return `Extra Stream Add-on - ${Math.max(1, Number(input.screens || 1))} Total ${Math.max(1, Number(input.screens || 1)) === 1 ? 'Stream' : 'Streams'}`
  }
  return buildHostingReference(input.plan, input.screens, input.downloads)
}

function buildPlanLabel(plan: Plan) {
  if (plan === 'movies_only') return 'Movies Only'
  if (plan === 'tv_only') return 'TV Shows Only'
  if (plan === 'monthly') return 'Monthly Legacy'
  return 'Full Access'
}

function buildEndsLabel(nextDue?: string | null) {
  const raw = String(nextDue || '').trim()
  if (!raw || !isValidDate(raw)) return ''
  return new Date(raw).toLocaleDateString('en-GB')
}

export function buildPaymentHistoryNote(input: {
  mode?: PayPalCheckoutMode
  plan: Plan
  streams: number
  downloads?: boolean
  nextDue?: string | null
}) {
  const endsLabel = buildEndsLabel(input.nextDue)
  if (input.mode === 'downloads_addon') {
    return endsLabel
      ? `Downloads add-on | Downloads enabled until ${endsLabel}`
      : 'Downloads add-on | Downloads enabled for the current plan'
  }
  if (input.mode === 'streams_addon') {
    const streamLabel = `${Math.max(1, Number(input.streams || 1))} total ${Math.max(1, Number(input.streams || 1)) === 1 ? 'stream' : 'streams'}`
    return endsLabel
      ? `Extra stream add-on | ${streamLabel} | Ends ${endsLabel}`
      : `Extra stream add-on | ${streamLabel}`
  }
  const parts = [
    `12-month ${buildPlanLabel(input.plan)} renewal`,
    `${Math.max(1, Number(input.streams || 1))} ${Math.max(1, Number(input.streams || 1)) === 1 ? 'stream' : 'streams'}`,
    input.downloads ? 'Downloads included' : '',
    endsLabel ? `Plan ends ${endsLabel}` : '',
  ].filter(Boolean)
  return parts.join(' | ')
}

export function buildPayPalCustomId(input: {
  email: string
  plan: Plan
  streams: number
  downloads?: boolean
  creditUsed?: number
  mode?: PayPalCheckoutMode
}) {
  const email = String(input.email || '').trim().toLowerCase()
  const plan = String(input.plan || 'yearly').trim()
  const streams = Math.max(1, Number(input.streams || 1))
  const downloads = input.downloads ? '1' : '0'
  const creditUsed = Math.max(0, Number(input.creditUsed || 0)).toFixed(2)
  const mode = String(input.mode || 'renewal').trim() || 'renewal'
  return `v3|${mode}|${email}|${plan}|${streams}|${downloads}|${creditUsed}`
}

export function parsePayPalCustomId(value: unknown): null | {
  mode: PayPalCheckoutMode
  email: string
  plan: Plan
  streams: number
  downloads: boolean
  creditUsed: number
} {
  const raw = String(value || '').trim()
  const parts = raw.split('|')
  if (parts[0] !== 'v1' && parts[0] !== 'v2' && parts[0] !== 'v3') return null

  const mode = parts[0] === 'v3' ? (String(parts[1] || 'renewal').trim() as PayPalCheckoutMode) : 'renewal'
  const offset = parts[0] === 'v3' ? 1 : 0
  const email = String(parts[1 + offset] || '').trim().toLowerCase()
  const plan = String(parts[2 + offset] || 'yearly').trim() as Plan
  const streams = Math.max(1, Number(parts[3 + offset] || 1))
  const downloads = String(parts[4 + offset] || '0') === '1'
  const creditUsed = parts[0] !== 'v1' ? Math.max(0, Number(parts[5 + offset] || 0)) : 0
  if (!email || !email.includes('@')) return null
  return { mode, email, plan, streams, downloads, creditUsed: Number(creditUsed.toFixed(2)) }
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
  if (paymentOrderId) {
    const existingLedgerEntry = await findPayPalLedgerEntry({ orderId: paymentOrderId }).catch(() => null)
    if (existingLedgerEntry) {
      const { data: existingCustomer } = await supabase
        .from('customers')
        .select('id,next_payment_date')
        .eq('email', email)
        .maybeSingle()
      return {
        mode: 'duplicate',
        customerId: existingCustomer?.id || existingLedgerEntry.customerId || null,
        nextDue: existingCustomer?.next_payment_date || null,
      }
    }
  }
  const referralRewardEligible = isFullPriceReferralRewardEligible({
    plan,
    streams,
    downloads,
    amount,
    creditUsed,
  })

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

  const nextDue = calculateMembershipExtensionDate(plan, existing?.next_payment_date, now)
  const nextNotes = mergeStoredCustomerNotes({
    existing: existing?.notes || '',
    joinAccessMode: '',
    joinAccessGrantedAt: null,
    downloads,
    referralCredit: Math.max(0, Number(currentNotesState.referralCredit || 0) - creditUsed),
    paymentOrders: paymentOrderId
      ? Array.from(new Set([...currentNotesState.paymentOrders, paymentOrderId])).slice(-12)
      : currentNotesState.paymentOrders,
  })
  const customerName = String(existing?.name || profile?.full_name || email).trim()

  if (existing?.id) {
    let updateQuery = supabase
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
    const paymentOrderFilter = buildMissingPaymentOrderFilter(paymentOrderId)
    if (paymentOrderFilter) {
      updateQuery = updateQuery.or(paymentOrderFilter)
    }
    const { data: updatedCustomer, error: updateError } = await updateQuery.select('id,next_payment_date').maybeSingle()
    if (updateError) {
      throw new Error(updateError.message)
    }
    if (!updatedCustomer?.id) {
      const { data: latestCustomer } = await supabase
        .from('customers')
        .select('id,next_payment_date')
        .eq('email', email)
        .maybeSingle()
      return {
        mode: 'duplicate',
        customerId: latestCustomer?.id || existing.id,
        nextDue: latestCustomer?.next_payment_date || existing?.next_payment_date || null,
      }
    }

    const { data: insertedPayment, error: insertedPaymentError } = await supabase.from('payments').insert({
      customer_id: existing.id,
      amount,
      status: 'completed',
      payment_method: paymentMethod,
    }).select('id,payment_date').single()
    if (insertedPaymentError) {
      console.error('Failed to insert payment row for existing customer payment', {
        email,
        paymentMethod,
        paymentOrderId,
        error: insertedPaymentError.message,
      })
    }

    const plexProvision = await provisionPlexMembershipForCustomer({
      customerEmail: email,
      plan,
      downloads,
    }).catch((error: any) => ({
      ok: false,
      error: error?.message || 'Automatic Plex provisioning failed',
      server_machine_id: null,
      share_id: null,
      created: false,
      updated: false,
      downloads_enabled: false,
      path: null,
      warning: undefined,
    }))

    if (!plexProvision.ok || plexProvision.warning) {
      await addAuditLog({
        action: plexProvision.ok ? 'plex_auto_share_warning' : 'plex_auto_share_failed',
        email,
        share_id: plexProvision.share_id,
        server_machine_id: plexProvision.server_machine_id,
        details: {
          plan,
          streams,
          downloads,
          warning: plexProvision.warning || null,
          error: plexProvision.error || null,
          path: plexProvision.path,
        },
      }).catch(() => null)
    }

    if (referralRewardEligible) {
      await grantReferralRewardForCustomer(email, {
        rewardReference: paymentOrderId || `payment:${existing.id}:${nextDue.toISOString()}`,
      }).catch(() => null)
    }
    return {
      mode: 'updated',
      customerId: existing.id,
      nextDue: nextDue.toISOString(),
      paymentId: String(insertedPayment?.id || '').trim() || null,
      paymentDate: insertedPayment?.payment_date || null,
      referralRewardEligible,
      plex: plexProvision,
    }
  }

  const createdNotes = mergeStoredCustomerNotes({
    existing: '',
    joinAccessMode: '',
    joinAccessGrantedAt: null,
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

  const { data: insertedPayment, error: insertedPaymentError } = await supabase.from('payments').insert({
    customer_id: created.id,
    amount,
    status: 'completed',
    payment_method: paymentMethod,
  }).select('id,payment_date').single()
  if (insertedPaymentError) {
    console.error('Failed to insert payment row for newly created customer payment', {
      email,
      paymentMethod,
      paymentOrderId,
      error: insertedPaymentError.message,
    })
  }

  const plexProvision = await provisionPlexMembershipForCustomer({
    customerEmail: email,
    plan,
    downloads,
  }).catch((error: any) => ({
    ok: false,
    error: error?.message || 'Automatic Plex provisioning failed',
    server_machine_id: null,
    share_id: null,
    created: false,
    updated: false,
    downloads_enabled: false,
    path: null,
    warning: undefined,
  }))

  if (!plexProvision.ok || plexProvision.warning) {
    await addAuditLog({
      action: plexProvision.ok ? 'plex_auto_share_warning' : 'plex_auto_share_failed',
      email,
      share_id: plexProvision.share_id,
      server_machine_id: plexProvision.server_machine_id,
      details: {
        plan,
        streams,
        downloads,
        warning: plexProvision.warning || null,
        error: plexProvision.error || null,
        path: plexProvision.path,
      },
    }).catch(() => null)
  }

  if (referralRewardEligible) {
    await grantReferralRewardForCustomer(email, {
      rewardReference: paymentOrderId || `payment:${created.id}:${nextDue.toISOString()}`,
    }).catch(() => null)
  }
  return {
    mode: 'created',
    customerId: created.id,
    nextDue: nextDue.toISOString(),
    paymentId: String(insertedPayment?.id || '').trim() || null,
    paymentDate: insertedPayment?.payment_date || null,
    referralRewardEligible,
    plex: plexProvision,
  }
}

export async function applyDownloadsAddonPurchase(input: {
  customerEmail: string
  amount: number
  paymentMethod?: string
  paymentOrderId?: string
}) {
  const supabase = svc()
  if (!supabase) throw new Error('Supabase not configured')

  const email = String(input.customerEmail || '').trim().toLowerCase()
  const amount = Number(input.amount || 0)
  const paymentMethod = String(input.paymentMethod || 'PayPal').trim() || 'PayPal'
  const paymentOrderId = String(input.paymentOrderId || '').trim()
  if (!email) throw new Error('Customer email is required')

  const { data: existing } = await supabase.from('customers').select('*').eq('email', email).maybeSingle()
  if (!existing?.id) {
    throw new Error('Customer account not found for downloads add-on')
  }

  const currentNotesState = parseCustomerNotes(existing?.notes || '')
  if (paymentOrderId && currentNotesState.paymentOrders.includes(paymentOrderId)) {
    return {
      mode: 'duplicate',
      customerId: existing.id,
      downloadsEnabled: currentNotesState.downloads,
      nextDue: existing.next_payment_date || null,
    }
  }

  const nextNotes = mergeStoredCustomerNotes({
    existing: existing?.notes || '',
    downloads: true,
    paymentOrders: paymentOrderId
      ? Array.from(new Set([...currentNotesState.paymentOrders, paymentOrderId])).slice(-12)
      : currentNotesState.paymentOrders,
  })

  let updateQuery = supabase.from('customers').update({ notes: nextNotes }).eq('id', existing.id)
  const paymentOrderFilter = buildMissingPaymentOrderFilter(paymentOrderId)
  if (paymentOrderFilter) {
    updateQuery = updateQuery.or(paymentOrderFilter)
  }
  const { data: updatedCustomer, error: updateError } = await updateQuery.select('id,next_payment_date').maybeSingle()
  if (updateError) {
    throw new Error(updateError.message)
  }
  if (!updatedCustomer?.id) {
    const { data: latestCustomer } = await supabase
      .from('customers')
      .select('id,next_payment_date,notes')
      .eq('email', email)
      .maybeSingle()
    return {
      mode: 'duplicate',
      customerId: latestCustomer?.id || existing.id,
      downloadsEnabled: parseCustomerNotes(latestCustomer?.notes || '').downloads,
      nextDue: latestCustomer?.next_payment_date || existing.next_payment_date || null,
    }
  }

  const { data: insertedPayment, error: insertedPaymentError } = await supabase.from('payments').insert({
    customer_id: existing.id,
    amount,
    status: 'completed',
    payment_method: `${paymentMethod} - Downloads Add-on`,
  }).select('id,payment_date').single()
  if (insertedPaymentError) {
    console.error('Failed to insert payment row for downloads add-on payment', {
      email,
      paymentMethod,
      paymentOrderId,
      error: insertedPaymentError.message,
    })
  }

  const plexResult = await enableDownloadsForCustomerEmail(email).catch((error: any) => ({
    ok: false,
    error: error?.message || 'Failed to update Plex downloads access',
    updated: 0,
    total: 0,
  }))

  return {
    mode: 'downloads_addon',
    customerId: existing.id,
    downloadsEnabled: true,
    nextDue: existing.next_payment_date || null,
    paymentId: String(insertedPayment?.id || '').trim() || null,
    paymentDate: insertedPayment?.payment_date || null,
    plex: plexResult,
  }
}

export async function applyStreamsAddonPurchase(input: {
  customerEmail: string
  streams: number
  amount: number
  paymentMethod?: string
  paymentOrderId?: string
}) {
  const supabase = svc()
  if (!supabase) throw new Error('Supabase not configured')

  const email = String(input.customerEmail || '').trim().toLowerCase()
  const targetStreams = Math.max(1, Number(input.streams || 1))
  const amount = Number(input.amount || 0)
  const paymentMethod = String(input.paymentMethod || 'PayPal').trim() || 'PayPal'
  const paymentOrderId = String(input.paymentOrderId || '').trim()
  if (!email) throw new Error('Customer email is required')

  const { data: existing } = await supabase.from('customers').select('*').eq('email', email).maybeSingle()
  if (!existing?.id) {
    throw new Error('Customer account not found for stream add-on')
  }

  const currentStreams = Math.max(1, Number(existing.streams || 1))
  const currentNotesState = parseCustomerNotes(existing?.notes || '')
  if (paymentOrderId && currentNotesState.paymentOrders.includes(paymentOrderId)) {
    return {
      mode: 'duplicate',
      customerId: existing.id,
      streams: currentStreams,
      nextDue: existing.next_payment_date || null,
    }
  }

  if (targetStreams <= currentStreams) {
    return {
      mode: 'streams_addon',
      customerId: existing.id,
      streams: currentStreams,
      addedStreams: 0,
      nextDue: existing.next_payment_date || null,
    }
  }

  const nextNotes = mergeStoredCustomerNotes({
    existing: existing?.notes || '',
    paymentOrders: paymentOrderId
      ? Array.from(new Set([...currentNotesState.paymentOrders, paymentOrderId])).slice(-12)
      : currentNotesState.paymentOrders,
  })

  let updateQuery = supabase
    .from('customers')
    .update({
      streams: targetStreams,
      notes: nextNotes,
    })
    .eq('id', existing.id)

  const paymentOrderFilter = buildMissingPaymentOrderFilter(paymentOrderId)
  if (paymentOrderFilter) {
    updateQuery = updateQuery.or(paymentOrderFilter)
  }

  const { data: updatedCustomer, error: updateError } = await updateQuery.select('id,next_payment_date,streams').maybeSingle()
  if (updateError) {
    throw new Error(updateError.message)
  }
  if (!updatedCustomer?.id) {
    const { data: latestCustomer } = await supabase
      .from('customers')
      .select('id,next_payment_date,streams')
      .eq('email', email)
      .maybeSingle()
    return {
      mode: 'duplicate',
      customerId: latestCustomer?.id || existing.id,
      streams: Math.max(1, Number(latestCustomer?.streams || currentStreams)),
      nextDue: latestCustomer?.next_payment_date || existing.next_payment_date || null,
    }
  }

  const { data: insertedPayment, error: insertedPaymentError } = await supabase.from('payments').insert({
    customer_id: existing.id,
    amount,
    status: 'completed',
    payment_method: `${paymentMethod} - Streams Add-on`,
  }).select('id,payment_date').single()
  if (insertedPaymentError) {
    console.error('Failed to insert payment row for streams add-on payment', {
      email,
      paymentMethod,
      paymentOrderId,
      error: insertedPaymentError.message,
    })
  }

  return {
    mode: 'streams_addon',
    customerId: existing.id,
    streams: targetStreams,
    addedStreams: targetStreams - currentStreams,
    nextDue: existing.next_payment_date || null,
    paymentId: String(insertedPayment?.id || '').trim() || null,
    paymentDate: insertedPayment?.payment_date || null,
  }
}

export async function recordManualPayPalPayment(input: {
  customerId: string
  amount: number
  currency?: string
  paidAt?: string | null
  payerEmail?: string | null
  payerName?: string | null
  transactionId?: string | null
  note?: string | null
}) {
  const supabase = svc()
  if (!supabase) throw new Error('Supabase not configured')

  const customerId = String(input.customerId || '').trim()
  const amount = Number(input.amount || 0)
  if (!customerId) throw new Error('Customer is required')
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Amount must be greater than 0')

  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .select('id,name,email')
    .eq('id', customerId)
    .maybeSingle()

  if (customerError || !customer?.id) {
    throw new Error(customerError?.message || 'Customer not found')
  }

  const paidAtValue = String(input.paidAt || '').trim()
  const paidAt = paidAtValue ? new Date(paidAtValue) : new Date()
  if (Number.isNaN(paidAt.getTime())) throw new Error('Paid date is invalid')
  const paidAtIso = paidAt.toISOString()
  const transactionId = String(input.transactionId || '').trim().toUpperCase() || null

  if (transactionId) {
    const existingEntry = await findPayPalLedgerEntry({ captureId: transactionId })
    if (existingEntry) {
      throw new Error('That PayPal transaction ID is already linked to a payment.')
    }
  }

  const paymentMethod = 'PayPal - Direct payment'
  const insertPayload: Record<string, unknown> = {
    customer_id: customer.id,
    amount: Number(amount.toFixed(2)),
    status: 'completed',
    payment_method: paymentMethod,
    payment_date: paidAtIso,
  }

  let insertedPayment:
    | {
        id?: string | null
        payment_date?: string | null
      }
    | null = null
  let insertedPaymentError: { message?: string | null } | null = null

  const primaryInsert = await supabase.from('payments').insert(insertPayload).select('id,payment_date').single()
  insertedPayment = primaryInsert.data || null
  insertedPaymentError = primaryInsert.error || null

  if (insertedPaymentError) {
    const fallbackInsert = await supabase
      .from('payments')
      .insert({
        customer_id: customer.id,
        amount: Number(amount.toFixed(2)),
        status: 'completed',
        payment_method: paymentMethod,
      })
      .select('id,payment_date')
      .single()
    insertedPayment = fallbackInsert.data || null
    insertedPaymentError = fallbackInsert.error || null
  }

  if (insertedPaymentError || !insertedPayment?.id) {
    throw new Error(insertedPaymentError?.message || 'Failed to save manual payment')
  }

  const payerEmail = String(input.payerEmail || '').trim().toLowerCase() || null
  const payerName = String(input.payerName || '').trim() || null
  const baseNote = String(input.note || '').trim()
  const note = [transactionId ? `PayPal Transaction ID: ${transactionId}` : '', baseNote].filter(Boolean).join(' | ') || null
  const manualReference = transactionId ? `direct:${transactionId}` : `manual:${insertedPayment.id}`

  await recordPayPalLedgerEntry({
    paymentId: String(insertedPayment.id),
    customerId: String(customer.id),
    customerEmail: String(customer.email || '').trim().toLowerCase(),
    customerName: String(customer.name || '').trim(),
    payerEmail,
    payerName,
    amount: Number(amount.toFixed(2)),
    currency: String(input.currency || 'GBP').trim().toUpperCase() || 'GBP',
    paymentMethod,
    status: 'completed',
    createdAt: insertedPayment.payment_date || paidAtIso,
    entrySource: 'manual',
    note,
    mode: 'manual',
    plan: 'manual',
    streams: 1,
    downloads: false,
    orderId: manualReference,
    captureId: transactionId || '',
  }).catch(() => null)

  return {
    paymentId: String(insertedPayment.id),
    paymentDate: insertedPayment.payment_date || paidAtIso,
    customerId: String(customer.id),
    customerEmail: String(customer.email || '').trim().toLowerCase(),
    customerName: String(customer.name || '').trim(),
    amount: Number(amount.toFixed(2)),
    currency: String(input.currency || 'GBP').trim().toUpperCase() || 'GBP',
    transactionId,
    payerEmail,
    payerName,
    note,
  }
}

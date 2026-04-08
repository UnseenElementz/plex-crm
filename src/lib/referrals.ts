import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { mergeCustomerNotes, parseCustomerNotes, type ReferralRewardHistoryEntry } from '@/lib/customerNotes'

export const REFERRAL_BONUS_GBP = 10
export const REFERRAL_CREDIT_CAP_GBP = 80

type CustomerRow = {
  id: string
  name: string
  email: string
  notes: string
  subscription_type: string | null
  streams: number | null
  start_date: string | null
  next_payment_date: string | null
  subscription_status: string | null
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

function normalizeCode(value: unknown) {
  return String(value || '').trim().toUpperCase()
}

export function normalizeReferralCode(value: unknown) {
  return normalizeCode(value)
}

function hasStartedPaidService(customer: CustomerRow | null | undefined) {
  if (!customer) return false
  if (customer.start_date || customer.next_payment_date) return true
  const status = String(customer.subscription_status || '').trim().toLowerCase()
  return status === 'active' || status === 'due soon' || status === 'due today'
}

async function fetchCustomers() {
  const supabase = svc()
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase
    .from('customers')
    .select('id,name,email,notes,subscription_type,streams,start_date,next_payment_date,subscription_status')

  if (error) throw new Error(error.message)

  return ((data || []) as any[]).map((row) => ({
    id: String(row.id || ''),
    name: String(row.name || '').trim(),
    email: normalizeEmail(row.email),
    notes: String(row.notes || ''),
    subscription_type: row.subscription_type || null,
    streams: row.streams ?? null,
    start_date: row.start_date || null,
    next_payment_date: row.next_payment_date || null,
    subscription_status: row.subscription_status || null,
  })) as CustomerRow[]
}

export function buildReferralCode(email: string) {
  const normalized = normalizeEmail(email)
  if (!normalized.includes('@')) return ''
  const hash = crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 8).toUpperCase()
  return `SRU-${hash}`
}

export function createReferralCode(seed: string, attempt = 0) {
  const normalized = String(seed || '').trim().toLowerCase()
  if (!normalized) return ''
  if (attempt === 0 && normalized.includes('@')) return buildReferralCode(normalized)
  const hash = crypto.createHash('sha256').update(`${normalized}:${attempt}`).digest('hex').slice(0, 8).toUpperCase()
  return `SRU-${hash}`
}

export function getReferralRewardAmount(totalEarned: unknown) {
  const earned = Math.max(0, Number(totalEarned || 0))
  if (!Number.isFinite(earned) || earned >= REFERRAL_CREDIT_CAP_GBP) return 0
  return Math.min(REFERRAL_BONUS_GBP, REFERRAL_CREDIT_CAP_GBP - earned)
}

export async function findCustomerByReferralCode(code: string) {
  const normalizedCode = normalizeCode(code)
  if (!normalizedCode) return null
  const customers = await fetchCustomers()
  return customers.find((customer) => buildReferralCode(customer.email) === normalizedCode) || null
}

export async function getCustomerByEmail(email: string) {
  const customers = await fetchCustomers()
  return customers.find((customer) => customer.email === normalizeEmail(email)) || null
}

export async function getReferralDiscountSnapshot(customerEmail: string, baseAmount: number) {
  const customer = await getCustomerByEmail(customerEmail)
  const parsed = parseCustomerNotes(customer?.notes || '')
  const availableCredit = Math.max(0, Math.min(REFERRAL_CREDIT_CAP_GBP, Number(parsed.referralCredit || 0)))
  const creditToUse = Math.min(Number(baseAmount || 0), availableCredit)
  const payableAmount = Math.max(0, Number(baseAmount || 0) - creditToUse)

  return {
    customer,
    availableCredit,
    creditToUse: Number(creditToUse.toFixed(2)),
    payableAmount: Number(payableAmount.toFixed(2)),
  }
}

export async function claimReferralCodeForCustomer(customerEmail: string, referralCode: string) {
  const supabase = svc()
  if (!supabase) throw new Error('Supabase not configured')

  const normalizedEmail = normalizeEmail(customerEmail)
  const normalizedCode = normalizeCode(referralCode)
  if (!normalizedEmail || !normalizedCode) throw new Error('Referral code is required')

  const customers = await fetchCustomers()
  const customer = customers.find((row) => row.email === normalizedEmail)
  if (!customer) throw new Error('Customer account was not found')

  const ownCode = buildReferralCode(normalizedEmail)
  if (ownCode === normalizedCode) throw new Error('You cannot use your own referral code')
  if (hasStartedPaidService(customer)) throw new Error('Referral codes must be added before the first paid renewal')

  const parsed = parseCustomerNotes(customer.notes)
  if (parsed.referredBy) {
    if (parsed.referredBy === normalizedCode) {
      return { ok: true, alreadyClaimed: true }
    }
    throw new Error('A referral code has already been linked to this account')
  }

  const referrer = customers.find((row) => buildReferralCode(row.email) === normalizedCode)
  if (!referrer) throw new Error('Referral code was not found')
  if (referrer.email === normalizedEmail) throw new Error('You cannot use your own referral code')

  const nextNotes = mergeCustomerNotes({
    existing: customer.notes,
    referredBy: normalizedCode,
    referralClaimedAt: new Date().toISOString(),
  })

  const { error } = await supabase.from('customers').update({ notes: nextNotes }).eq('id', customer.id)
  if (error) throw new Error(error.message)

  return {
    ok: true,
    alreadyClaimed: false,
    referrerEmail: referrer.email,
    referrerName: referrer.name || referrer.email,
  }
}

export async function grantReferralRewardForCustomer(customerEmail: string) {
  const supabase = svc()
  if (!supabase) throw new Error('Supabase not configured')

  const normalizedEmail = normalizeEmail(customerEmail)
  const customers = await fetchCustomers()
  const customer = customers.find((row) => row.email === normalizedEmail)
  if (!customer) return { granted: false, reason: 'customer-not-found' as const }

  const customerNotes = parseCustomerNotes(customer.notes)
  if (!customerNotes.referredBy) return { granted: false, reason: 'no-referral' as const }
  if (customerNotes.referralRewardedAt) return { granted: false, reason: 'already-rewarded' as const }

  const referrer = customers.find((row) => buildReferralCode(row.email) === customerNotes.referredBy)
  if (!referrer || referrer.email === normalizedEmail) {
    return { granted: false, reason: 'invalid-referrer' as const }
  }

  const referrerNotes = parseCustomerNotes(referrer.notes)
  const alreadyRewarded = referrerNotes.referralRewardHistory.some((entry) => entry.email === normalizedEmail)
  if (alreadyRewarded) {
    const syncedCustomerNotes = mergeCustomerNotes({
      existing: customer.notes,
      referralRewardedAt: customerNotes.referralRewardedAt || new Date().toISOString(),
      referralRewardedTo: referrer.email,
    })
    await supabase.from('customers').update({ notes: syncedCustomerNotes }).eq('id', customer.id)
    return { granted: false, reason: 'already-linked' as const }
  }

  const rewardEntry: ReferralRewardHistoryEntry = {
    email: normalizedEmail,
    at: new Date().toISOString(),
    amount: REFERRAL_BONUS_GBP,
  }

  const nextCredit = Math.min(REFERRAL_CREDIT_CAP_GBP, Number(referrerNotes.referralCredit || 0) + REFERRAL_BONUS_GBP)
  const nextHistory = [...referrerNotes.referralRewardHistory, rewardEntry]
  const nextReferrerNotes = mergeCustomerNotes({
    existing: referrer.notes,
    referralCredit: nextCredit,
    referralRewardHistory: nextHistory,
  })

  const nextCustomerNotes = mergeCustomerNotes({
    existing: customer.notes,
    referralRewardedAt: rewardEntry.at,
    referralRewardedTo: referrer.email,
  })

  const { error: referrerError } = await supabase.from('customers').update({ notes: nextReferrerNotes }).eq('id', referrer.id)
  if (referrerError) throw new Error(referrerError.message)

  const { error: customerError } = await supabase.from('customers').update({ notes: nextCustomerNotes }).eq('id', customer.id)
  if (customerError) throw new Error(customerError.message)

  return {
    granted: true,
    referrerEmail: referrer.email,
    referrerName: referrer.name || referrer.email,
    availableCredit: nextCredit,
  }
}

export async function getReferralDashboard(email: string, baseUrl: string) {
  const customer = await getCustomerByEmail(email)
  if (!customer) throw new Error('Customer account was not found')

  const parsed = parseCustomerNotes(customer.notes)
  const code = buildReferralCode(customer.email)
  const shareUrl = `${baseUrl.replace(/\/+$/, '')}/customer/register?ref=${encodeURIComponent(code)}`

  return {
    code,
    shareUrl,
    availableCredit: Math.max(0, Math.min(REFERRAL_CREDIT_CAP_GBP, Number(parsed.referralCredit || 0))),
    creditCap: REFERRAL_CREDIT_CAP_GBP,
    rewardValue: REFERRAL_BONUS_GBP,
    successfulReferrals: parsed.referralRewardHistory.length,
    rewardHistory: parsed.referralRewardHistory
      .slice()
      .reverse()
      .map((entry) => ({
        ...entry,
        label: `${entry.email} joined`,
      })),
    referredBy: parsed.referredBy || null,
    claimed: Boolean(parsed.referredBy),
    canClaim: !parsed.referredBy && !hasStartedPaidService(customer),
  }
}

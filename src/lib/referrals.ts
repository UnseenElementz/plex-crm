import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { mergeCustomerNotes, parseCustomerNotes, type ReferralRewardHistoryEntry } from '@/lib/customerNotes'
import { getCommunityAccessCodeStatus } from '@/lib/communityAccess'
import { COMMUNITY_ACTIVE_CUSTOMER_LIMIT, countActiveCommunityCustomers, hasPaidCommunityHistory } from '@/lib/communityGate'
import { sendReferralCreditEmail } from '@/lib/email'

export const REFERRAL_BONUS_GBP = 10
export const REFERRAL_LINK_LIMIT = 8

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

export type PortalInviteStatus =
  | {
      ok: true
      mode: 'existing-customer' | 'invite-only' | 'community-access'
      customerEmail: string | null
      referralCode: string
      referrerEmail: string | null
      referrerName: string | null
      message: string
      grantsDiscount: boolean
      communityCode: string | null
      lockedEmail: string | null
    }
  | {
      ok: false
      reason: 'invite_required' | 'invite_not_found' | 'invite_inactive' | 'self_invite' | 'banned' | 'invite_locked' | 'capacity_reached'
      message: string
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

function hasStartedPaidService(customer: CustomerRow | null | undefined) {
  if (!customer) return false
  if (customer.start_date || customer.next_payment_date) return true
  const status = String(customer.subscription_status || '').trim().toLowerCase()
  return status === 'active' || status === 'due soon' || status === 'due today'
}

function getReferrerLinkedCustomers(customers: CustomerRow[], referrerEmail: string) {
  const referrerCode = buildReferralCode(referrerEmail)
  if (!referrerCode) return []
  return customers.filter((customer) => {
    if (customer.email === normalizeEmail(referrerEmail)) return false
    const notes = parseCustomerNotes(customer.notes || '')
    return notes.referredBy === referrerCode
  })
}

function getRewardedReferralCount(entries: ReferralRewardHistoryEntry[]) {
  return new Set(entries.map((entry) => normalizeEmail(entry.email)).filter(Boolean)).size
}

function getFirstName(name: string, email: string) {
  const normalizedName = String(name || '').trim()
  if (normalizedName) return normalizedName.split(/\s+/)[0] || normalizedName
  const normalizedEmail = normalizeEmail(email)
  return normalizedEmail.includes('@') ? normalizedEmail.split('@')[0] : normalizedEmail || 'there'
}

export function customerCanIssueInvite(customer: CustomerRow | null | undefined) {
  if (!customer) return false
  const notes = parseCustomerNotes(customer.notes || '')
  if (notes.banned) return false
  return hasStartedPaidService(customer)
}

export function customerCanSelfServePortal(customer: CustomerRow | null | undefined) {
  if (!customer) return false
  return !parseCustomerNotes(customer.notes || '').banned
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

export async function getPortalInviteStatus(input: {
  email?: string | null
  referralCode?: string | null
}) {
  const normalizedEmail = normalizeEmail(input.email)
  const normalizedCode = normalizeCode(input.referralCode)
  const customers = await fetchCustomers()
  const activeCustomerCount = countActiveCommunityCustomers(customers)
  const atCapacity = activeCustomerCount >= COMMUNITY_ACTIVE_CUSTOMER_LIMIT

  const customer = normalizedEmail ? customers.find((row) => row.email === normalizedEmail) || null : null
  if (customer) {
    if (!customerCanSelfServePortal(customer)) {
      return {
        ok: false,
        reason: 'banned',
        message: 'This email cannot create portal access.',
      } satisfies PortalInviteStatus
    }
    if (!hasPaidCommunityHistory(customer) && atCapacity) {
      return {
        ok: false,
        reason: 'capacity_reached',
        message: `The server is currently full at ${COMMUNITY_ACTIVE_CUSTOMER_LIMIT}/${COMMUNITY_ACTIVE_CUSTOMER_LIMIT} active customers. New joins are paused until a slot opens.`,
      } satisfies PortalInviteStatus
    }

    let referrerEmail: string | null = null
    let referrerName: string | null = null
    let referralCode = parseCustomerNotes(customer.notes || '').referredBy || ''

    if (normalizedCode) {
      const referrer = customers.find((row) => buildReferralCode(row.email) === normalizedCode) || null
      if (!referrer) {
        return {
          ok: false,
          reason: 'invite_not_found',
          message: 'That invite code was not found.',
        } satisfies PortalInviteStatus
      }
      if (!customerCanIssueInvite(referrer)) {
        return {
          ok: false,
          reason: 'invite_inactive',
          message: 'That invite code is no longer active.',
        } satisfies PortalInviteStatus
      }
      if (referrer.email === normalizedEmail) {
        return {
          ok: false,
          reason: 'self_invite',
          message: 'You cannot use your own invite code.',
        } satisfies PortalInviteStatus
      }
      referralCode = normalizedCode
      referrerEmail = referrer.email
      referrerName = referrer.name || referrer.email
    }

    return {
      ok: true,
      mode: 'existing-customer',
      customerEmail: customer.email,
      referralCode,
      referrerEmail,
      referrerName,
      message: 'Existing customer record found. Portal access can be attached to this email.',
      grantsDiscount: Boolean(referralCode),
      communityCode: null,
      lockedEmail: null,
    } satisfies PortalInviteStatus
  }

  if (!normalizedCode) {
    return {
      ok: false,
      reason: 'invite_required',
      message: 'This is now a closed community. New accounts need a valid invite code from an existing customer.',
    } satisfies PortalInviteStatus
  }

  if (atCapacity) {
    return {
      ok: false,
      reason: 'capacity_reached',
      message: `The server is currently full at ${COMMUNITY_ACTIVE_CUSTOMER_LIMIT}/${COMMUNITY_ACTIVE_CUSTOMER_LIMIT} active customers. New joins are paused until a slot opens.`,
    } satisfies PortalInviteStatus
  }

  const referrer = customers.find((row) => buildReferralCode(row.email) === normalizedCode) || null
  const communityAccess = !referrer ? await getCommunityAccessCodeStatus({ code: normalizedCode, email: normalizedEmail }) : null

  if (communityAccess?.ok) {
    return {
      ok: true,
      mode: 'community-access',
      customerEmail: null,
      referralCode: '',
      referrerEmail: null,
      referrerName: null,
      message: communityAccess.message,
      grantsDiscount: false,
      communityCode: communityAccess.code,
      lockedEmail: communityAccess.lockedEmail,
    } satisfies PortalInviteStatus
  }

  if (communityAccess && !communityAccess.ok && communityAccess.reason === 'locked_email') {
    return {
      ok: false,
      reason: 'invite_locked',
      message: communityAccess.message,
    } satisfies PortalInviteStatus
  }

  if (!referrer) {
    return {
      ok: false,
      reason: 'invite_not_found',
      message: 'That invite code was not found.',
    } satisfies PortalInviteStatus
  }
  if (!customerCanIssueInvite(referrer)) {
    return {
      ok: false,
      reason: 'invite_inactive',
      message: 'That invite code is no longer active.',
    } satisfies PortalInviteStatus
  }
  if (normalizedEmail && referrer.email === normalizedEmail) {
    return {
      ok: false,
      reason: 'self_invite',
      message: 'You cannot use your own invite code.',
    } satisfies PortalInviteStatus
  }

  return {
    ok: true,
    mode: 'invite-only',
    customerEmail: null,
    referralCode: normalizedCode,
    referrerEmail: referrer.email,
    referrerName: referrer.name || referrer.email,
    message: 'Invite accepted. This signup can be linked to a current customer invite.',
    grantsDiscount: true,
    communityCode: null,
    lockedEmail: null,
  } satisfies PortalInviteStatus
}

export async function getReferralDiscountSnapshot(customerEmail: string, baseAmount: number) {
  const customer = await getCustomerByEmail(customerEmail)
  const parsed = parseCustomerNotes(customer?.notes || '')
  const availableCredit = Math.max(0, Number(parsed.referralCredit || 0))
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
  if (!customerCanIssueInvite(referrer)) throw new Error('Referral code is no longer active')
  if (referrer.email === normalizedEmail) throw new Error('You cannot use your own referral code')
  if (getReferrerLinkedCustomers(customers, referrer.email).length >= REFERRAL_LINK_LIMIT) {
    throw new Error(`This referral account already has ${REFERRAL_LINK_LIMIT} linked members`)
  }

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

export async function grantReferralRewardForCustomer(
  customerEmail: string,
  options?: {
    rewardReference?: string
    notifyReferrer?: boolean
  }
) {
  const supabase = svc()
  if (!supabase) throw new Error('Supabase not configured')

  const normalizedEmail = normalizeEmail(customerEmail)
  const customers = await fetchCustomers()
  const customer = customers.find((row) => row.email === normalizedEmail)
  if (!customer) return { granted: false, reason: 'customer-not-found' as const }

  const customerNotes = parseCustomerNotes(customer.notes)
  if (!customerNotes.referredBy) return { granted: false, reason: 'no-referral' as const }

  const referrer = customers.find((row) => buildReferralCode(row.email) === customerNotes.referredBy)
  if (!referrer || referrer.email === normalizedEmail) {
    return { granted: false, reason: 'invalid-referrer' as const }
  }

  const referrerNotes = parseCustomerNotes(referrer.notes)
  const rewardReference = String(options?.rewardReference || '').trim()
  if (rewardReference && referrerNotes.referralRewardHistory.some((entry) => entry.reference === rewardReference)) {
    return { granted: false, reason: 'already-rewarded' as const }
  }

  const rewardEntry: ReferralRewardHistoryEntry = {
    email: normalizedEmail,
    at: new Date().toISOString(),
    amount: REFERRAL_BONUS_GBP,
    reference: rewardReference || undefined,
  }
  const customerGetsSignupBonus = !customerNotes.referralSignupCreditGrantedAt

  const nextCredit = Number(Number(referrerNotes.referralCredit || 0) + REFERRAL_BONUS_GBP).toFixed(2)
  const nextHistory = [...referrerNotes.referralRewardHistory, rewardEntry]
  const nextReferrerNotes = mergeCustomerNotes({
    existing: referrer.notes,
    referralCredit: Number(nextCredit),
    referralRewardHistory: nextHistory,
  })

  const nextCustomerNotes = mergeCustomerNotes({
    existing: customer.notes,
    referralRewardedAt: rewardEntry.at,
    referralRewardedTo: referrer.email,
    referralSignupCreditGrantedAt: customerGetsSignupBonus ? rewardEntry.at : customerNotes.referralSignupCreditGrantedAt,
    referralCredit: customerGetsSignupBonus
      ? Number((Number(customerNotes.referralCredit || 0) + REFERRAL_BONUS_GBP).toFixed(2))
      : customerNotes.referralCredit,
  })

  const { error: referrerError } = await supabase.from('customers').update({ notes: nextReferrerNotes }).eq('id', referrer.id)
  if (referrerError) throw new Error(referrerError.message)

  const { error: customerError } = await supabase.from('customers').update({ notes: nextCustomerNotes }).eq('id', customer.id)
  if (customerError) throw new Error(customerError.message)

  if (options?.notifyReferrer !== false) {
    await sendReferralCreditEmail(referrer.email, {
      firstName: getFirstName(referrer.name || '', referrer.email),
      rewardAmount: REFERRAL_BONUS_GBP,
      linkedCount: getReferrerLinkedCustomers(customers, referrer.email).length,
      linkedLimit: REFERRAL_LINK_LIMIT,
      referredEmail: normalizedEmail,
    }).catch(() => null)
  }

  return {
    granted: true,
    referrerEmail: referrer.email,
    referrerName: referrer.name || referrer.email,
    availableCredit: Number(nextCredit),
    customerSignupBonusGranted: customerGetsSignupBonus,
    customerAvailableCredit: customerGetsSignupBonus
      ? Number((Number(customerNotes.referralCredit || 0) + REFERRAL_BONUS_GBP).toFixed(2))
      : Number(customerNotes.referralCredit || 0),
  }
}

export async function manuallyLinkReferralToCustomer(input: {
  customerId: string
  referrerCustomerId: string
}) {
  const supabase = svc()
  if (!supabase) throw new Error('Supabase not configured')

  const customerId = String(input.customerId || '').trim()
  const referrerCustomerId = String(input.referrerCustomerId || '').trim()
  if (!customerId || !referrerCustomerId) throw new Error('Customer and referral account are required')
  if (customerId === referrerCustomerId) throw new Error('A customer cannot refer themselves')

  const customers = await fetchCustomers()
  const customer = customers.find((row) => row.id === customerId)
  const referrer = customers.find((row) => row.id === referrerCustomerId)

  if (!customer) throw new Error('Customer account was not found')
  if (!referrer) throw new Error('Referral account was not found')
  if (!customerCanIssueInvite(referrer)) throw new Error('That referral account is not active for invites')

  const referrerCode = buildReferralCode(referrer.email)
  const customerNotes = parseCustomerNotes(customer.notes || '')
  if (customerNotes.referredBy && customerNotes.referredBy !== referrerCode) {
    throw new Error('This customer is already linked to a different referral account')
  }

  const linkedCustomers = getReferrerLinkedCustomers(customers, referrer.email)
  const alreadyLinked = customerNotes.referredBy === referrerCode
  if (!alreadyLinked && linkedCustomers.length >= REFERRAL_LINK_LIMIT) {
    throw new Error(`This referral account already has ${REFERRAL_LINK_LIMIT}/${REFERRAL_LINK_LIMIT} linked members`)
  }

  if (!alreadyLinked) {
    const nextNotes = mergeCustomerNotes({
      existing: customer.notes,
      referredBy: referrerCode,
      referralClaimedAt: customerNotes.referralClaimedAt || new Date().toISOString(),
    })
    const { error } = await supabase.from('customers').update({ notes: nextNotes }).eq('id', customer.id)
    if (error) throw new Error(error.message)
  }

  const reward = await grantReferralRewardForCustomer(customer.email, {
    rewardReference: `manual-link:${customer.id}:${referrer.id}`,
    notifyReferrer: true,
  })

  const refreshedCustomer = await getCustomerByEmail(customer.email)
  const refreshedReferrer = await getCustomerByEmail(referrer.email)
  const refreshedReferrerNotes = parseCustomerNotes(refreshedReferrer?.notes || '')

  return {
    ok: true,
    alreadyLinked,
    rewardGranted: reward.granted,
    rewardReason: reward.granted ? null : reward.reason,
    customerEmail: customer.email,
    referrerEmail: referrer.email,
    referrerName: referrer.name || referrer.email,
    referralCode: referrerCode,
    referralCount: getReferrerLinkedCustomers(await fetchCustomers(), referrer.email).length,
    referralLimit: REFERRAL_LINK_LIMIT,
    referralCredit: Number(refreshedReferrerNotes.referralCredit || 0),
    referredBy: parseCustomerNotes(refreshedCustomer?.notes || '').referredBy || referrerCode,
  }
}

export async function unlinkReferralFromCustomer(input: {
  customerId: string
}) {
  const supabase = svc()
  if (!supabase) throw new Error('Supabase not configured')

  const customerId = String(input.customerId || '').trim()
  if (!customerId) throw new Error('Customer is required')

  const customers = await fetchCustomers()
  const customer = customers.find((row) => row.id === customerId)
  if (!customer) throw new Error('Customer account was not found')

  const customerNotes = parseCustomerNotes(customer.notes || '')
  const referredBy = String(customerNotes.referredBy || '').trim().toUpperCase()
  if (!referredBy) throw new Error('This customer does not have a linked referral')

  const referrer = customers.find((row) => buildReferralCode(row.email) === referredBy)
  const normalizedCustomerEmail = normalizeEmail(customer.email)
  let reversedManualCredit = false
  let referrerEmail: string | null = referrer?.email || null
  let reversedCreditAmount = 0
  let reversedRewardCount = 0

  if (referrer) {
    const referrerNotes = parseCustomerNotes(referrer.notes || '')
    const removedRewardEntries = referrerNotes.referralRewardHistory.filter((entry) => normalizeEmail(entry.email) === normalizedCustomerEmail)
    const nextRewardHistory = referrerNotes.referralRewardHistory.filter((entry) => normalizeEmail(entry.email) !== normalizedCustomerEmail)
    reversedCreditAmount = Number(
      removedRewardEntries.reduce((total, entry) => total + Number(entry.amount || 0), 0).toFixed(2)
    )
    reversedRewardCount = removedRewardEntries.length
    const nextCredit = Math.max(0, Number(referrerNotes.referralCredit || 0) - reversedCreditAmount)

    if (removedRewardEntries.length) {
      const nextReferrerNotes = mergeCustomerNotes({
        existing: referrer.notes,
        referralCredit: nextCredit,
        referralRewardHistory: nextRewardHistory,
      })
      const { error: referrerError } = await supabase.from('customers').update({ notes: nextReferrerNotes }).eq('id', referrer.id)
      if (referrerError) throw new Error(referrerError.message)
      reversedManualCredit = removedRewardEntries.some((entry) => String(entry.reference || '').startsWith('manual-link:'))
    }
  }

  const nextCustomerNotes = mergeCustomerNotes({
    existing: customer.notes,
    referredBy: '',
    referralClaimedAt: null,
    referralRewardedAt: null,
    referralRewardedTo: '',
  })

  const { error: customerError } = await supabase.from('customers').update({ notes: nextCustomerNotes }).eq('id', customer.id)
  if (customerError) throw new Error(customerError.message)

  return {
    ok: true,
    customerEmail: customer.email,
    referrerEmail,
    reversedManualCredit,
    reversedCreditAmount,
    reversedRewardCount,
    message: reversedCreditAmount > 0
      ? 'Referral link removed and the linked referral credit was reversed.'
      : 'Referral link removed.',
  }
}

export async function getReferralDashboard(email: string, baseUrl: string) {
  const customer = await getCustomerByEmail(email)
  if (!customer) throw new Error('Customer account was not found')

  const parsed = parseCustomerNotes(customer.notes)
  const code = buildReferralCode(customer.email)
  const shareUrl = `${baseUrl.replace(/\/+$/, '')}/customer/register?ref=${encodeURIComponent(code)}`
  const linkedCustomers = getReferrerLinkedCustomers(await fetchCustomers(), customer.email)

  return {
    code,
    shareUrl,
    availableCredit: Math.max(0, Number(parsed.referralCredit || 0)),
    creditCap: REFERRAL_LINK_LIMIT,
    rewardValue: REFERRAL_BONUS_GBP,
    successfulReferrals: getRewardedReferralCount(parsed.referralRewardHistory),
    linkedReferrals: linkedCustomers.length,
    slotLimit: REFERRAL_LINK_LIMIT,
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

import { createClient } from '@supabase/supabase-js'
import { parseCustomerNotes } from '@/lib/customerNotes'
import { isSystemCustomerEmail } from '@/lib/systemCustomers'

export const COMMUNITY_ACTIVE_CUSTOMER_LIMIT = 100

export type CommunityGateCustomer = {
  id?: string | null
  name?: string | null
  email?: string | null
  notes?: string | null
  start_date?: string | null
  next_payment_date?: string | null
  subscription_status?: string | null
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

function hasValidDate(value: unknown) {
  const raw = String(value || '').trim()
  if (!raw) return false
  return !Number.isNaN(new Date(raw).getTime())
}

export function hasPaidCommunityHistory(customer: CommunityGateCustomer | null | undefined) {
  if (!customer) return false
  const status = String(customer.subscription_status || '').trim().toLowerCase()
  if (status && status !== 'inactive') return true
  return hasValidDate(customer.start_date) || hasValidDate(customer.next_payment_date)
}

export function hasPendingInviteJoinAccess(customer: CommunityGateCustomer | null | undefined) {
  if (!customer) return false
  const status = String(customer.subscription_status || '').trim().toLowerCase()
  if (status !== 'inactive') return false
  if (hasPaidCommunityHistory(customer)) return false
  const notes = parseCustomerNotes(customer.notes || '')
  if (notes.banned) return false
  return Boolean(
    notes.referredBy ||
      notes.joinAccessMode === 'invite-only' ||
      notes.joinAccessMode === 'community-access'
  )
}

export function countActiveCommunityCustomers(customers: CommunityGateCustomer[]) {
  return customers.filter((customer) => {
    if (isSystemCustomerEmail(customer.email)) return false
    return String(customer.subscription_status || '').trim().toLowerCase() === 'active'
  }).length
}

export async function getCommunityCapacitySnapshot() {
  const supabase = svc()
  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('customers')
    .select('id,name,email,notes,start_date,next_payment_date,subscription_status')

  if (error) throw new Error(error.message)

  const customers = ((data || []) as CommunityGateCustomer[]).filter(
    (customer) => !isSystemCustomerEmail(customer.email)
  )
  const activeCustomerCount = countActiveCommunityCustomers(customers)

  return {
    customers,
    activeCustomerCount,
    customerLimit: COMMUNITY_ACTIVE_CUSTOMER_LIMIT,
    atCapacity: activeCustomerCount >= COMMUNITY_ACTIVE_CUSTOMER_LIMIT,
  }
}

export async function getCommunityCheckoutEligibility(email: string) {
  const normalizedEmail = normalizeEmail(email)
  const snapshot = await getCommunityCapacitySnapshot()
  const customer =
    snapshot.customers.find((entry) => normalizeEmail(entry.email) === normalizedEmail) || null

  if (!customer) {
    return {
      allowed: false,
      reason: snapshot.atCapacity ? 'capacity_reached' : 'invite_required',
      customer: null,
      newJoin: true,
      pendingInviteAccess: false,
      ...snapshot,
    }
  }

  const existingMember = hasPaidCommunityHistory(customer)
  const pendingInviteAccess = hasPendingInviteJoinAccess(customer)

  if (existingMember) {
    return {
      allowed: true,
      reason: 'existing_member',
      customer,
      newJoin: false,
      pendingInviteAccess: false,
      ...snapshot,
    }
  }

  if (pendingInviteAccess) {
    return {
      allowed: !snapshot.atCapacity,
      reason: snapshot.atCapacity ? 'capacity_reached' : 'pending_invite',
      customer,
      newJoin: true,
      pendingInviteAccess: true,
      ...snapshot,
    }
  }

  return {
    allowed: false,
    reason: snapshot.atCapacity ? 'capacity_reached' : 'invite_required',
    customer,
    newJoin: true,
    pendingInviteAccess: false,
    ...snapshot,
  }
}

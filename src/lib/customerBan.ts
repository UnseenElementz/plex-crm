import { parseCustomerNotes } from '@/lib/customerNotes'
import { hasPendingInviteJoinAccess } from '@/lib/communityGate'

export const CLOSED_COMMUNITY_BAN_HREF = '/customer/banned?reason=closed-community'
export const SERVER_FULL_BAN_HREF = '/customer/banned?reason=server-full'

export function getBanReasonKey(notes: unknown) {
  return String(parseCustomerNotes(notes).banReason || '').trim().toLowerCase()
}

export function getPublicBanReason(reason: string) {
  const normalized = String(reason || '').trim().toLowerCase()
  if (normalized === 'time-waster') return 'TW'
  return normalized
}

export function getBannedHref(notes: unknown) {
  const reason = getBanReasonKey(notes)
  const publicReason = getPublicBanReason(reason)
  return publicReason ? `/customer/banned?reason=${encodeURIComponent(publicReason)}` : '/customer/banned'
}

export function shouldAutoBlockBanAttempt(notes: unknown) {
  return getBanReasonKey(notes) === 'time-waster'
}

export function isPlanEndTerminationDue(input: {
  notes?: unknown
  startDate?: string | null
  nextPaymentDate?: string | null
  subscriptionStatus?: string | null
}) {
  const status = String(input.subscriptionStatus || '').trim().toLowerCase()
  if (status === 'inactive') {
    if (
      hasPendingInviteJoinAccess({
        notes: typeof input.notes === 'string' ? input.notes : null,
        start_date: input.startDate,
        next_payment_date: input.nextPaymentDate,
        subscription_status: input.subscriptionStatus,
      })
    ) {
      return false
    }
    return true
  }

  const parsed = parseCustomerNotes(input.notes)
  if (!parsed.terminateAtPlanEnd) return false

  const dueDate = String(input.nextPaymentDate || '').trim()
  if (!dueDate) return false

  const due = new Date(dueDate)
  if (Number.isNaN(due.getTime())) return false
  return due.getTime() <= Date.now()
}

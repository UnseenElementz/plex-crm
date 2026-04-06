export const REFERRAL_REWARD_GBP = 10
export const REFERRAL_CREDIT_CAP_GBP = 80

export function normalizeReferralCode(value?: string | null) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 16)
}

function sanitizeSeed(seed?: string | null) {
  return normalizeReferralCode(seed).replace(/[AEIOU]/g, '')
}

export function createReferralCode(seed?: string | null, attempt = 0) {
  const cleaned = sanitizeSeed(seed)
  const head = (cleaned || 'STREAMZ').slice(0, 8).padEnd(6, 'X')
  const suffix = (Date.now() + attempt).toString(36).toUpperCase().slice(-4)
  return normalizeReferralCode(`${head}${suffix}`)
}

export function getRemainingReferralCapacity(earnedTotal?: number | null) {
  return Math.max(0, REFERRAL_CREDIT_CAP_GBP - Number(earnedTotal || 0))
}

export function getReferralRewardAmount(earnedTotal?: number | null) {
  return Math.min(REFERRAL_REWARD_GBP, getRemainingReferralCapacity(earnedTotal))
}

export function getRenewalTotals(baseAmount: number, creditBalance?: number | null) {
  const safeBase = Math.max(0, Number(baseAmount || 0))
  const safeCredit = Math.max(0, Number(creditBalance || 0))
  const appliedCredit = Math.min(safeBase, safeCredit)
  const finalAmount = Math.max(0, safeBase - appliedCredit)

  return {
    baseAmount: safeBase,
    appliedCredit,
    finalAmount,
  }
}

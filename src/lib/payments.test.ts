import { describe, expect, it } from 'vitest'
import { calculateMembershipExtensionDate, isFullPriceReferralRewardEligible, resolveMembershipExtensionBaseDate } from './payments'

describe('full-price referral reward eligibility', () => {
  it('allows standard full-price renewals', () => {
    expect(
      isFullPriceReferralRewardEligible({
        plan: 'yearly',
        streams: 1,
        downloads: false,
        amount: 85,
        creditUsed: 0,
      })
    ).toBe(true)
  })

  it('blocks discounted renewals', () => {
    expect(
      isFullPriceReferralRewardEligible({
        plan: 'yearly',
        streams: 1,
        downloads: false,
        amount: 42.5,
        creditUsed: 0,
      })
    ).toBe(false)
  })

  it('blocks renewals that used referral credit', () => {
    expect(
      isFullPriceReferralRewardEligible({
        plan: 'yearly',
        streams: 1,
        downloads: false,
        amount: 75,
        creditUsed: 10,
      })
    ).toBe(false)
  })
})

describe('membership extension date rules', () => {
  it('extends from the current future end date', () => {
    const now = new Date('2026-04-11T10:00:00.000Z')
    const currentEndDate = '2027-04-20T12:00:00.000Z'

    expect(resolveMembershipExtensionBaseDate(currentEndDate, now).toISOString()).toBe(currentEndDate)
    expect(calculateMembershipExtensionDate('yearly', currentEndDate, now).toISOString()).toBe('2028-04-20T12:00:00.000Z')
  })

  it('extends from now when the plan is already expired', () => {
    const now = new Date('2026-04-11T10:00:00.000Z')
    const expiredEndDate = '2026-03-01T09:00:00.000Z'

    expect(resolveMembershipExtensionBaseDate(expiredEndDate, now).toISOString()).toBe(now.toISOString())
    expect(calculateMembershipExtensionDate('yearly', expiredEndDate, now).toISOString()).toBe('2027-04-11T10:00:00.000Z')
  })
})

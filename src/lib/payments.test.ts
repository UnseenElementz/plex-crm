import { describe, expect, it } from 'vitest'
import { isFullPriceReferralRewardEligible } from './payments'

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

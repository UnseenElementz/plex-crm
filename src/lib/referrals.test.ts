import { describe, expect, it } from 'vitest'
import { mergeCustomerNotes } from './customerNotes'
import { customerCanIssueInvite, customerCanSelfServePortal } from './referrals'

const baseCustomer = {
  id: '1',
  name: 'Member One',
  email: 'member@example.com',
  notes: '',
  subscription_type: 'yearly',
  streams: 1,
  start_date: null,
  next_payment_date: null,
  subscription_status: 'inactive',
} as const

describe('referrals invite access', () => {
  it('allows invite issuing for active customers', () => {
    expect(customerCanIssueInvite({ ...baseCustomer, subscription_status: 'active' })).toBe(true)
    expect(customerCanIssueInvite({ ...baseCustomer, next_payment_date: new Date().toISOString() })).toBe(true)
  })

  it('blocks invite issuing for inactive or banned customers', () => {
    expect(customerCanIssueInvite(baseCustomer)).toBe(false)
    expect(
      customerCanIssueInvite({
        ...baseCustomer,
        subscription_status: 'active',
        notes: mergeCustomerNotes({ existing: '', banned: true, banReason: 'service-ban' }),
      })
    ).toBe(false)
  })

  it('blocks self-serve portal access for banned customers', () => {
    expect(customerCanSelfServePortal(baseCustomer)).toBe(true)
    expect(
      customerCanSelfServePortal({
        ...baseCustomer,
        notes: mergeCustomerNotes({ existing: '', banned: true, banReason: 'time-waster' }),
      })
    ).toBe(false)
  })
})

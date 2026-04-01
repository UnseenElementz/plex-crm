import { describe, expect, it } from 'vitest'
import { nextConversationStatus, shouldAutoWait } from './chatIdle'

describe('chatIdle', () => {
  it('activates waiting conversation on first customer message', () => {
    expect(nextConversationStatus({ current: 'waiting', senderType: 'customer' })).toBe('active')
  })

  it('keeps closed conversation closed', () => {
    expect(nextConversationStatus({ current: 'closed', senderType: 'admin' })).toBe('closed')
    expect(nextConversationStatus({ current: 'closed', senderType: 'customer' })).toBe('closed')
  })

  it('auto-waits when admin idle and no newer customer message', () => {
    const now = Date.now()
    expect(shouldAutoWait({
      lastAdminAt: new Date(now - 6 * 60_000).toISOString(),
      lastCustomerAt: new Date(now - 7 * 60_000).toISOString(),
      nowMs: now,
      idleMinutes: 5
    })).toBe(true)
  })

  it('does not auto-wait if customer message is newer', () => {
    const now = Date.now()
    expect(shouldAutoWait({
      lastAdminAt: new Date(now - 10 * 60_000).toISOString(),
      lastCustomerAt: new Date(now - 1 * 60_000).toISOString(),
      nowMs: now,
      idleMinutes: 5
    })).toBe(false)
  })
})


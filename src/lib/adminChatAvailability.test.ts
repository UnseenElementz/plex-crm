import { describe, expect, it } from 'vitest'
import { normalizeAvailability, resolveAvailability } from './adminChatAvailability'

describe('adminChatAvailability', () => {
  it('normalizes values', () => {
    expect(normalizeAvailability('off')).toBe('off')
    expect(normalizeAvailability('WAITING')).toBe('waiting')
    expect(normalizeAvailability('active')).toBe('active')
    expect(normalizeAvailability('nope')).toBe('active')
  })

  it('prefers dbAvailability over local', () => {
    expect(resolveAvailability({ local: 'off', dbAvailability: 'waiting' })).toBe('waiting')
  })

  it('maps dbChatOnline false to off', () => {
    expect(resolveAvailability({ local: 'active', dbChatOnline: false })).toBe('off')
  })
})


import { describe, expect, it } from 'vitest'
import { inferPayPalOrderMetadata } from './paypalOrders'

describe('inferPayPalOrderMetadata', () => {
  it('detects downloads add-on descriptions', () => {
    expect(inferPayPalOrderMetadata({ description: 'Downloads Add-on' })).toMatchObject({
      mode: 'downloads_addon',
      downloads: true,
      note: 'Downloads add-on | Downloads enabled for the current plan',
    })
  })

  it('detects extra stream add-on descriptions', () => {
    expect(inferPayPalOrderMetadata({ description: 'Extra Stream Add-on - 3 Total Streams' })).toMatchObject({
      mode: 'streams_addon',
      streams: 3,
      note: 'Extra stream add-on | 3 total streams',
    })
  })

  it('parses legacy renewal descriptions', () => {
    expect(inferPayPalOrderMetadata({ description: '1 Year Hosting - 2 Servers + Downloads' })).toMatchObject({
      mode: 'renewal',
      plan: 'yearly',
      streams: 2,
      downloads: true,
    })
  })
})

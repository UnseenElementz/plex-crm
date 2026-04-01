import { describe, expect, it } from 'vitest'
import { buildSharedServerUpdateForm, extractServerIdFromServersXml, extractUserIdOnServerFromUsersXml, isTruthyPlexBool, toPlexBit } from './plexShareUpdate'

describe('plexShareUpdate', () => {
  it('toPlexBit maps explicit values', () => {
    expect(toPlexBit(true)).toBe(1)
    expect(toPlexBit(false)).toBe(0)
    expect(toPlexBit(1)).toBe(1)
    expect(toPlexBit(0)).toBe(0)
    expect(toPlexBit('1')).toBe(1)
    expect(toPlexBit('0')).toBe(0)
    expect(toPlexBit('true')).toBe(0)
  })

  it('isTruthyPlexBool rejects generic truthy strings', () => {
    expect(isTruthyPlexBool('0')).toBe(false)
    expect(isTruthyPlexBool('1')).toBe(true)
    expect(isTruthyPlexBool('true')).toBe(false)
    expect(isTruthyPlexBool('yes')).toBe(false)
  })

  it('extractServerIdFromServersXml handles self-closing tags', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <MediaContainer size="1">
        <Server name="My Server" owned="1" machineIdentifier="m1" id="srv1" />
      </MediaContainer>`
    expect(extractServerIdFromServersXml(xml, 'm1')).toBe('srv1')
    expect(extractServerIdFromServersXml(xml, 'missing')).toBe(null)
  })

  it('buildSharedServerUpdateForm includes allowSync=0 when disabled', () => {
    const { form } = buildSharedServerUpdateForm({
      serverId: 'srv1',
      librarySectionIds: [1, 2],
      settings: { allow_sync: false },
      filters: { filter_all: '' }
    })
    const entries = Object.fromEntries(form.entries())
    expect(entries['server_id']).toBe('srv1')
    expect(entries['shared_server[library_section_ids]']).toBe('1,2')
    expect(entries['shared_server[allowSync]']).toBe('0')
    expect(entries['shared_server[filterAll]']).toBe('')
  })

  it('extractUserIdOnServerFromUsersXml finds server share id by plex user id', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <MediaContainer size="1">
        <User id="99" email="carradice@sky.com">
          <Server id="555" machineIdentifier="m1" name="Server" />
        </User>
      </MediaContainer>`
    expect(extractUserIdOnServerFromUsersXml(xml, { plexUserId: '99', machineIdentifier: 'm1' })).toBe('555')
  })
})

import { createClient } from '@supabase/supabase-js'
import { getPlexLibrariesForMachine } from '@/lib/plex'
import {
  buildSharedServerUpdateForm,
  extractServerIdFromServersXml,
  extractUserIdOnServerFromUsersXml,
  parseXmlAttrs,
} from '@/lib/plexShareUpdate'
import { updatePlexSharingSettings } from '@/lib/plexSharingSettings'
import { syncCustomerDownloads } from '@/lib/moderation'

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

function plexHeaders(token: string) {
  return {
    'X-Plex-Token': token,
    'X-Plex-Client-Identifier': 'plex-crm',
    'X-Plex-Product': 'Plex CRM',
    'X-Plex-Device': 'Web',
    'X-Plex-Platform': 'Web',
    'X-Plex-Version': '1.0',
    Accept: 'application/xml',
    'Content-Type': 'application/x-www-form-urlencoded',
  } as Record<string, string>
}

function plexJsonHeaders(token: string) {
  return {
    'X-Plex-Token': token,
    'X-Plex-Client-Identifier': 'plex-crm',
    'X-Plex-Product': 'Plex CRM',
    'X-Plex-Device': 'Web',
    'X-Plex-Platform': 'Web',
    'X-Plex-Version': '1.0',
    Accept: 'application/json',
    'Content-Type': 'application/json',
  } as Record<string, string>
}

function toAllowSyncBit(value: unknown): 0 | 1 {
  return value === true || value === 1 || value === '1' ? 1 : 0
}

function parseShareLibraryIds(block: string) {
  return Array.from(block.matchAll(/<Section\s+([^>]+)\/>/g))
    .map((match) => parseXmlAttrs(match[1]))
    .map((attrs) => Number(attrs.sectionKey || attrs.key || attrs.id || 0))
    .filter((value) => Number.isFinite(value) && value > 0)
}

async function verifyAllowSyncViaList(token: string, machineIdentifier: string, shareId: string) {
  const verifyRes = await fetch(`https://plex.tv/api/servers/${machineIdentifier}/shared_servers`, {
    headers: { 'X-Plex-Token': token, Accept: 'application/xml' },
    cache: 'no-store',
  })
  const verifyTxt = await verifyRes.text().catch(() => '')
  if (!verifyRes.ok) {
    return { value: null as 0 | 1 | null, status: verifyRes.status, response: verifyTxt.slice(0, 500) }
  }
  const blocks = verifyTxt.split('</SharedServer>')
  for (const block of blocks) {
    if (!block.includes('<SharedServer')) continue
    const attrs = block.match(/<SharedServer\s+([^>]+)>/)?.[1] || ''
    const at = parseXmlAttrs(attrs)
    if (String(at.id || '') !== shareId) continue
    if (at.allowSync !== undefined) {
      return {
        value: String(at.allowSync) === '1' ? 1 : 0,
        status: verifyRes.status,
        response: verifyTxt.slice(0, 500),
      }
    }
  }
  return { value: null as 0 | 1 | null, status: verifyRes.status, response: verifyTxt.slice(0, 500) }
}

async function verifyAllowSyncViaV2(token: string, machineIdentifier: string, plexUserId: string, email: string) {
  const usersRes = await fetch('https://plex.tv/api/users', {
    headers: { 'X-Plex-Token': token, Accept: 'application/xml' },
    cache: 'no-store',
  })
  const usersTxt = await usersRes.text().catch(() => '')
  if (!usersRes.ok) {
    return { value: null as 0 | 1 | null, status: usersRes.status, response: usersTxt.slice(0, 500) }
  }

  const userIdOnServer =
    extractUserIdOnServerFromUsersXml(usersTxt, {
      plexUserId: plexUserId || null,
      email: email || null,
      machineIdentifier,
    }) || null

  if (!userIdOnServer) {
    return { value: null as 0 | 1 | null, status: 0, response: 'Could not determine userIdOnServer' }
  }

  const v2Res = await fetch(`https://plex.tv/api/v2/shared_servers/${encodeURIComponent(userIdOnServer)}`, {
    method: 'GET',
    headers: plexJsonHeaders(token),
    cache: 'no-store',
  })
  const v2Txt = await v2Res.text().catch(() => '')
  if (!v2Res.ok) {
    return { value: null as 0 | 1 | null, status: v2Res.status, response: v2Txt.slice(0, 500) }
  }

  const data = JSON.parse(v2Txt)
  const bit =
    data?.settings?.allowSync ??
    data?.sharingSettings?.allowSync ??
    data?.sharing_settings?.allowSync ??
    data?.allowSync

  if (bit === undefined || bit === null) {
    return { value: null as 0 | 1 | null, status: v2Res.status, response: v2Txt.slice(0, 500) }
  }

  return {
    value: toAllowSyncBit(bit),
    status: v2Res.status,
    response: v2Txt.slice(0, 500),
  }
}

async function updateShareAllowSync(input: {
  token: string
  serversXml: string
  machineIdentifier: string
  shareId: string
  plexUserId: string
  email: string
  librarySectionIds: number[]
  filterAll?: string | null
  filterMovies?: string | null
  filterTelevision?: string | null
  allowSync: boolean
}) {
  const serverId = extractServerIdFromServersXml(input.serversXml, input.machineIdentifier)
  const desiredAllowSync = toAllowSyncBit(input.allowSync)
  const { form } = buildSharedServerUpdateForm({
    serverId,
    librarySectionIds: input.librarySectionIds,
    settings: { allow_sync: desiredAllowSync },
    filters: {
      filter_all: input.filterAll || undefined,
      filter_movies: input.filterMovies || undefined,
      filter_television: input.filterTelevision || undefined,
    },
  })

  const url = `https://plex.tv/api/servers/${input.machineIdentifier}/shared_servers/${input.shareId}`
  const firstRes = await fetch(url, {
    method: 'PUT',
    headers: plexHeaders(input.token),
    body: form,
    cache: 'no-store',
  })
  const firstTxt = await firstRes.text().catch(() => '')
  if (!firstRes.ok) {
    return {
      ok: false,
      expected: desiredAllowSync,
      got: null as 0 | 1 | null,
      attempts: { form: { status: firstRes.status, response: firstTxt.slice(0, 500) } },
    }
  }

  const listVerify = await verifyAllowSyncViaList(input.token, input.machineIdentifier, input.shareId)
  if (listVerify.value === desiredAllowSync) {
    return {
      ok: true,
      expected: desiredAllowSync,
      got: listVerify.value,
      attempts: {
        form: { status: firstRes.status, response: firstTxt.slice(0, 500) },
        verify_list: listVerify,
      },
    }
  }

  const sharingSettings = input.plexUserId
    ? await updatePlexSharingSettings(input.token, input.plexUserId, { allowSync: desiredAllowSync === 1 }).catch(() => null)
    : null
  const v2Verify = await verifyAllowSyncViaV2(input.token, input.machineIdentifier, input.plexUserId, input.email)
  if (v2Verify.value === desiredAllowSync) {
    return {
      ok: true,
      expected: desiredAllowSync,
      got: v2Verify.value,
      attempts: {
        form: { status: firstRes.status, response: firstTxt.slice(0, 500) },
        verify_list: listVerify,
        sharing_settings: sharingSettings
          ? { status: sharingSettings.status, response: sharingSettings.responseText.slice(0, 500) }
          : null,
        v2_get: v2Verify,
      },
    }
  }

  return {
    ok: false,
    expected: desiredAllowSync,
    got: v2Verify.value ?? listVerify.value,
    attempts: {
      form: { status: firstRes.status, response: firstTxt.slice(0, 500) },
      verify_list: listVerify,
      sharing_settings: sharingSettings
        ? { status: sharingSettings.status, response: sharingSettings.responseText.slice(0, 500) }
        : null,
      v2_get: v2Verify,
    },
  }
}

async function recreateShareWithAllowSync(input: {
  token: string
  machineIdentifier: string
  shareId: string
  plexUserId: string
  email: string
  librarySectionIds: number[]
}) {
  const attempts: Record<string, unknown> = {}

  const deleteRes = await fetch(`https://plex.tv/api/servers/${input.machineIdentifier}/shared_servers/${encodeURIComponent(input.shareId)}`, {
    method: 'DELETE',
    headers: { 'X-Plex-Token': input.token, Accept: 'application/xml' },
    cache: 'no-store',
  }).catch(() => null)
  const deleteTxt = deleteRes ? await deleteRes.text().catch(() => '') : ''
  attempts.delete = deleteRes ? { status: deleteRes.status, response: deleteTxt.slice(0, 500) } : { status: 0, response: 'delete failed' }

  const createBody = new URLSearchParams()
  createBody.set('shared_server[identifier]', input.email)
  createBody.set('shared_server[invited_email]', input.email)
  if (input.librarySectionIds.length) {
    createBody.set('shared_server[library_section_ids]', input.librarySectionIds.join(','))
  }
  createBody.set('shared_server[allowSync]', '1')

  const createRes = await fetch(`https://plex.tv/api/servers/${input.machineIdentifier}/shared_servers`, {
    method: 'POST',
    headers: plexHeaders(input.token),
    body: createBody,
    cache: 'no-store',
  }).catch(() => null)
  const createTxt = createRes ? await createRes.text().catch(() => '') : ''
  attempts.recreate = createRes ? { status: createRes.status, response: createTxt.slice(0, 500) } : { status: 0, response: 'create failed' }

  const listVerify = await fetch(`https://plex.tv/api/servers/${input.machineIdentifier}/shared_servers`, {
    headers: { 'X-Plex-Token': input.token, Accept: 'application/xml' },
    cache: 'no-store',
  }).catch(() => null)
  const listTxt = listVerify ? await listVerify.text().catch(() => '') : ''
  attempts.verify_list = listVerify ? { status: listVerify.status, response: listTxt.slice(0, 500) } : { status: 0, response: 'list failed' }

  if (listVerify?.ok) {
    const blocks = listTxt.split('</SharedServer>')
    for (const block of blocks) {
      if (!block.includes('<SharedServer')) continue
      const attrs = parseXmlAttrs(block.match(/<SharedServer\s+([^>]+)>/)?.[1] || '')
      const shareEmail = String(attrs.email || '').trim().toLowerCase()
      const shareUserId = String(attrs.userID || attrs.userId || '').trim()
      const emailMatch = shareEmail === String(input.email || '').trim().toLowerCase()
      const userIdMatch = input.plexUserId && shareUserId === input.plexUserId
      if (!emailMatch && !userIdMatch) continue
      const allowSync = attrs.allowSync !== undefined ? toAllowSyncBit(attrs.allowSync) : null
      if (allowSync === 1) {
        return {
          ok: true,
          expected: 1 as const,
          got: 1 as const,
          attempts,
        }
      }
    }
  }

  const v2Verify = await verifyAllowSyncViaV2(input.token, input.machineIdentifier, input.plexUserId, input.email)
  attempts.v2_get = v2Verify

  return {
    ok: v2Verify.value === 1,
    expected: 1 as const,
    got: v2Verify.value,
    attempts,
  }
}

export async function enableDownloadsForCustomerEmail(email: string) {
  const supabase = svc()
  if (!supabase) throw new Error('Supabase not configured')

  const normalizedEmail = String(email || '').trim().toLowerCase()
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    throw new Error('Valid customer email required')
  }

  const { data: settings } = await supabase.from('admin_settings').select('plex_token,plex_server_url').eq('id', 1).maybeSingle()
  const token = String((settings as any)?.plex_token || '').trim()
  if (!token) throw new Error('Plex token not set in Settings')

  const serversRes = await fetch('https://plex.tv/api/servers', {
    headers: { 'X-Plex-Token': token, Accept: 'application/xml' },
    cache: 'no-store',
  })
  const serversXml = await serversRes.text().catch(() => '')
  if (!serversRes.ok) {
    throw new Error(`Plex servers fetch failed: ${serversRes.status}`)
  }

  const serverAttrs = Array.from(serversXml.matchAll(/<Server\s+([^>]+)\/>/g)).map((match) => parseXmlAttrs(match[1]))
  const ownedServers = serverAttrs
    .map((attrs) => ({
      machineIdentifier: String(attrs.machineIdentifier || '').trim(),
      name: String(attrs.name || '').trim(),
    }))
    .filter((server) => server.machineIdentifier)

  const results: Array<Record<string, unknown>> = []
  let total = 0
  let updated = 0

  for (const server of ownedServers) {
    const listRes = await fetch(`https://plex.tv/api/servers/${server.machineIdentifier}/shared_servers`, {
      headers: { 'X-Plex-Token': token, Accept: 'application/xml' },
      cache: 'no-store',
    })
    const listXml = await listRes.text().catch(() => '')
    if (!listRes.ok) continue

    const blocks = listXml.split('</SharedServer>')
    for (const block of blocks) {
      if (!block.includes('<SharedServer')) continue
      const attrs = parseXmlAttrs(block.match(/<SharedServer\s+([^>]+)>/)?.[1] || '')
      const shareEmail = String(attrs.email || '').trim().toLowerCase()
      if (shareEmail !== normalizedEmail) continue

      total += 1
      const shareId = String(attrs.id || '').trim()
      const plexUserId = String(attrs.userID || attrs.userId || '').trim()
      const username = String(attrs.username || '').trim()
      const allLibraries = String(attrs.allLibraries || '') === '1'
      const parsedLibraryIds = parseShareLibraryIds(block)

      let librarySectionIds = parsedLibraryIds
      if (allLibraries || !librarySectionIds.length) {
        const libraries = await getPlexLibrariesForMachine('https://plex.tv', token, server.machineIdentifier).catch(() => null)
        librarySectionIds = (libraries?.libraries || [])
          .map((library) => Number(library.id))
          .filter((value) => Number.isFinite(value) && value > 0)
      }

      const result = await updateShareAllowSync({
        token,
        serversXml,
        machineIdentifier: server.machineIdentifier,
        shareId,
        plexUserId,
        email: normalizedEmail,
        librarySectionIds,
        filterAll: attrs.filterAll || null,
        filterMovies: attrs.filterMovies || null,
        filterTelevision: attrs.filterTelevision || null,
        allowSync: true,
      })

      const finalResult = result.ok
        ? result
        : await recreateShareWithAllowSync({
            token,
            machineIdentifier: server.machineIdentifier,
            shareId,
            plexUserId,
            email: normalizedEmail,
            librarySectionIds,
          })

      if (finalResult.ok) {
        updated += 1
      }

      results.push({
        server_name: server.name || server.machineIdentifier,
        server_machine_id: server.machineIdentifier,
        share_id: shareId,
        username,
        ok: finalResult.ok,
        expected: finalResult.expected,
        got: finalResult.got,
        attempts: finalResult.attempts,
      })
    }
  }

  if (updated > 0) {
    await syncCustomerDownloads(normalizedEmail, true)
  }

  return {
    ok: total > 0 && updated === total,
    total,
    updated,
    results,
  }
}

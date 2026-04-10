import { createClient } from '@supabase/supabase-js'
import { type Plan } from '@/lib/pricing'
import { getOwnedServers, getPlexFriends, getPlexLibrariesForMachine, type PlexLibrary } from '@/lib/plex'
import { parseCustomerNotes } from '@/lib/customerNotes'
import { updatePlexSharingSettings } from '@/lib/plexSharingSettings'

type ProvisionResult = {
  ok: boolean
  server_machine_id: string | null
  share_id: string | null
  created: boolean
  updated: boolean
  downloads_enabled: boolean
  path: 'plex_web' | 'share_form' | null
  warning?: string
  error?: string
}

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

function plexFormHeaders(token: string) {
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

function normalizeEmail(value: unknown) {
  return String(value || '').trim().toLowerCase()
}

function normalizeTitle(value: unknown) {
  return String(value || '').trim().toLowerCase()
}

function parseSharedServerBlock(block: string) {
  const attrs = block.match(/<SharedServer\s+([^>]+)>/)?.[1] || ''
  return {
    id: attrs.match(/id="([^"]+)"/)?.[1] || '',
    email: attrs.match(/email="([^"]+)"/)?.[1] || '',
    username: attrs.match(/username="([^"]+)"/)?.[1] || '',
    userID: attrs.match(/userID="([^"]+)"/)?.[1] || attrs.match(/userId="([^"]+)"/)?.[1] || '',
  }
}

function pickLibraryIdsForPlan(libraries: PlexLibrary[], plan: Plan) {
  if (plan === 'yearly' || plan === 'monthly') {
    return libraries.map((library) => Number(library.id)).filter((value) => Number.isFinite(value) && value > 0)
  }

  const includeTitle = (title: string) => /kids|family|mixed|shared|general|anime/i.test(title)
  const wantedType = plan === 'movies_only' ? 'movie' : 'show'
  const selected = libraries
    .filter((library) => {
      const title = normalizeTitle(library.title)
      return library.type === wantedType || includeTitle(title)
    })
    .map((library) => Number(library.id))
    .filter((value) => Number.isFinite(value) && value > 0)

  return selected.length
    ? selected
    : libraries
        .filter((library) => library.type === wantedType)
        .map((library) => Number(library.id))
        .filter((value) => Number.isFinite(value) && value > 0)
}

async function findExistingShare(token: string, machineIdentifier: string, email: string, username?: string) {
  const res = await fetch(`https://plex.tv/api/servers/${machineIdentifier}/shared_servers`, {
    headers: { 'X-Plex-Token': token, Accept: 'application/xml' },
    cache: 'no-store',
  })
  if (!res.ok) return null
  const xml = await res.text()
  const blocks = xml.split('</SharedServer>')
  const normalizedEmail = normalizeEmail(email)
  const normalizedUsername = normalizeTitle(username)

  for (const block of blocks) {
    if (!block.includes('<SharedServer')) continue
    const parsed = parseSharedServerBlock(block)
    if (normalizeEmail(parsed.email) === normalizedEmail) return parsed
    if (normalizedUsername && normalizeTitle(parsed.username) === normalizedUsername) return parsed
  }
  return null
}

export async function provisionPlexMembershipForCustomer(input: {
  customerEmail: string
  plan: Plan
  downloads?: boolean
}) : Promise<ProvisionResult> {
  const supabase = svc()
  if (!supabase) return { ok: false, server_machine_id: null, share_id: null, created: false, updated: false, downloads_enabled: false, path: null, error: 'Supabase not configured' }

  const normalizedEmail = normalizeEmail(input.customerEmail)
  if (!normalizedEmail) {
    return { ok: false, server_machine_id: null, share_id: null, created: false, updated: false, downloads_enabled: false, path: null, error: 'Customer email is required' }
  }

  const [{ data: settings }, { data: customer }] = await Promise.all([
    supabase.from('admin_settings').select('plex_token,plex_server_url').eq('id', 1).maybeSingle(),
    supabase.from('customers').select('notes').eq('email', normalizedEmail).maybeSingle(),
  ])

  const token = String(settings?.plex_token || '').trim()
  const serverUrl = String(settings?.plex_server_url || 'https://plex.tv').trim() || 'https://plex.tv'
  if (!token) {
    return { ok: false, server_machine_id: null, share_id: null, created: false, updated: false, downloads_enabled: false, path: null, error: 'Plex token not configured' }
  }

  const parsedNotes = parseCustomerNotes(customer?.notes || '')
  const friends = await getPlexFriends('https://plex.tv', token).catch(() => [])
  const friend = friends.find((entry) => normalizeEmail(entry.email) === normalizedEmail) || null
  const inviteUsername = String(friend?.username || parsedNotes.plexUsername || '').trim()

  const servers = await getOwnedServers(token)
  const server = servers[0]
  if (!server?.machineIdentifier) {
    return { ok: false, server_machine_id: null, share_id: null, created: false, updated: false, downloads_enabled: false, path: null, error: 'No owned Plex server found' }
  }

  const librariesData = await getPlexLibrariesForMachine(serverUrl, token, server.machineIdentifier).catch(() => null)
  const libraryIds = pickLibraryIdsForPlan(librariesData?.libraries || [], input.plan)
  const existingShare = await findExistingShare(token, server.machineIdentifier, normalizedEmail, inviteUsername)

  let shareId = String(existingShare?.id || '').trim()
  let invitedId = String(existingShare?.userID || friend?.id || '').trim()
  let created = false
  let updated = false

  if (existingShare?.id) {
    const form = new URLSearchParams()
    if (libraryIds.length) form.set('shared_server[library_section_ids]', libraryIds.join(','))
    const updateRes = await fetch(`https://plex.tv/api/servers/${server.machineIdentifier}/shared_servers/${existingShare.id}`, {
      method: 'PUT',
      headers: plexFormHeaders(token),
      body: form,
      cache: 'no-store',
    })
    if (!updateRes.ok) {
      return {
        ok: false,
        server_machine_id: server.machineIdentifier,
        share_id: existingShare.id,
        created: false,
        updated: false,
        downloads_enabled: false,
        path: null,
        error: `Plex share update failed: ${updateRes.status}`,
      }
    }
    updated = true
  } else {
    const form = new URLSearchParams()
    form.set('shared_server[identifier]', normalizedEmail)
    form.set('shared_server[invited_email]', normalizedEmail)
    if (inviteUsername) form.set('shared_server[username]', inviteUsername)
    if (friend?.id) form.set('shared_server[user_id]', String(friend.id))
    if (libraryIds.length) form.set('shared_server[library_section_ids]', libraryIds.join(','))
    const createRes = await fetch(`https://plex.tv/api/servers/${server.machineIdentifier}/shared_servers`, {
      method: 'POST',
      headers: plexFormHeaders(token),
      body: form,
      cache: 'no-store',
    })
    if (!createRes.ok) {
      const existingAfterFailure = await findExistingShare(token, server.machineIdentifier, normalizedEmail, inviteUsername)
      if (!existingAfterFailure?.id) {
        return {
          ok: false,
          server_machine_id: server.machineIdentifier,
          share_id: null,
          created: false,
          updated: false,
          downloads_enabled: false,
          path: null,
          error: `Plex share create failed: ${createRes.status}`,
        }
      }
      shareId = existingAfterFailure.id
      invitedId = existingAfterFailure.userID || invitedId
      updated = true
    } else {
      created = true
      const createdShare = await findExistingShare(token, server.machineIdentifier, normalizedEmail, inviteUsername)
      shareId = String(createdShare?.id || shareId).trim()
      invitedId = String(createdShare?.userID || invitedId).trim()
    }
  }

  let downloadsEnabled = false
  let warning = ''
  if (invitedId) {
    const sharingSettings = await updatePlexSharingSettings(token, invitedId, { allowSync: Boolean(input.downloads) }).catch(() => null)
    downloadsEnabled = Boolean(sharingSettings?.settings?.allowSync)
    if (!sharingSettings?.ok) {
      warning = 'Plex share saved, but downloads could not be confirmed automatically.'
    } else if (Boolean(input.downloads) !== downloadsEnabled) {
      warning = 'Plex share saved, but downloads did not match the requested state exactly.'
    }
  } else {
    downloadsEnabled = Boolean(input.downloads)
    if (input.downloads) {
      warning = 'Plex share saved, but the downloads identity could not be resolved for final confirmation.'
    }
  }

  return {
    ok: true,
    server_machine_id: server.machineIdentifier,
    share_id: shareId || null,
    created,
    updated,
    downloads_enabled: downloadsEnabled,
    path: invitedId ? 'plex_web' : 'share_form',
    warning: warning || undefined,
  }
}

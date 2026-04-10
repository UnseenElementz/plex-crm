import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies, headers } from 'next/headers'
import {
  getAnyServerIdentifier,
  getOwnedServers,
  getPlexFriends,
  getServerIdentifierFromUrl,
} from '@/lib/plex'
import { syncCustomerDownloads } from '@/lib/moderation'
import { enableDownloadsForCustomerEmail } from '@/lib/plexDownloadsAccess'

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return null
  return createClient(url, key)
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

function buildShareUpdateForm(input: { librarySectionIds: number[]; allowSync: boolean }) {
  const form = new URLSearchParams()
  if (input.librarySectionIds.length) {
    form.set('shared_server[library_section_ids]', input.librarySectionIds.join(','))
  }
  form.set('shared_server[allowSync]', input.allowSync ? '1' : '0')
  return form
}

async function buildDownloadsWarningResponse(input: {
  inviteEmail: string
  downloadsResult: { ok: boolean; updated?: number; total?: number; results?: unknown }
  payload: Record<string, unknown>
}) {
  await syncCustomerDownloads(input.inviteEmail, false)
  return NextResponse.json({
    ...input.payload,
    ok: true,
    downloads_enabled: false,
    warning:
      'Share saved, but Plex refused to keep downloads enabled for this account. Access is active and downloads remain off.',
    downloads_result: input.downloadsResult,
  })
}

type ExistingShareMatch = {
  id: string
  email: string
  username: string
}

async function findExistingShare(input: {
  token: string
  machineIdentifier: string
  inviteEmail: string
  username?: string
  extraUsernameHint?: string
}) {
  const resList = await fetch(`https://plex.tv/api/servers/${input.machineIdentifier}/shared_servers`, {
    headers: { 'X-Plex-Token': input.token, Accept: 'application/xml' },
    cache: 'no-store',
  })
  if (!resList.ok) return null
  const text = await resList.text()
  const usernameHints = [input.username, input.extraUsernameHint]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean)

  const blocks = text.split('</SharedServer>')
  for (const block of blocks) {
    if (!block.includes('<SharedServer')) continue
    const attrs = block.match(/<SharedServer\s+([^>]+)>/)?.[1] || ''
    const email = attrs.match(/email="([^"]+)"/)?.[1] || ''
    const username = attrs.match(/username="([^"]+)"/)?.[1] || ''
    const id = attrs.match(/id="([^"]+)"/)?.[1] || ''
    const normalizedEmail = email.toLowerCase()
    const normalizedUsername = username.toLowerCase()

    if (
      (normalizedEmail && normalizedEmail === input.inviteEmail.toLowerCase()) ||
      usernameHints.includes(normalizedUsername)
    ) {
      return { id, email, username } satisfies ExistingShareMatch
    }
  }
  return null
}

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(request: Request) {
  const s = svc()
  try {
    const reqJson = await request.json()
    const email = reqJson.email
    const libraries = reqJson.libraries
    let machineIdentifier = String(reqJson.machineIdentifier || '').trim()
    const allowSync = Boolean(reqJson.allow_sync)

    let settings: any = null

    const reqHeaders = headers()
    const headerToken = reqHeaders.get('X-Plex-Token-Local')
    const headerUrl = reqHeaders.get('X-Plex-Url-Local')

    if (headerToken) {
      settings = { plex_token: headerToken, plex_server_url: headerUrl || 'https://plex.tv' }
    }

    if (!settings?.plex_token && s) {
      const { data } = await s.from('admin_settings').select('*').single()
      if (data) settings = data
    }

    if (!settings?.plex_token) {
      const cookieStore = cookies()
      const raw = cookieStore.get('admin_settings')?.value
      if (raw) {
        try {
          const cookieSettings = JSON.parse(decodeURIComponent(raw))
          if (cookieSettings.plex_token) {
            settings = { ...(settings || {}), ...cookieSettings }
          }
        } catch {}
      }
    }

    const token = settings?.plex_token
    const serverUrl = settings?.plex_server_url || 'https://plex.tv'
    if (!token) return NextResponse.json({ error: 'Plex token not configured' }, { status: 400 })
    if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })

    const inviteEmail = String(email || '').trim()
    const sectionIds = (Array.isArray(libraries) ? libraries : []).join(',')
    const libIds = sectionIds ? sectionIds.split(',').map(Number).filter((n) => Number.isFinite(n)) : []
    const finalizeDownloads = async () => {
      if (!allowSync) return { ok: true as const, updated: 0, total: 0 }
      return enableDownloadsForCustomerEmail(inviteEmail)
    }

    const friends = await getPlexFriends(serverUrl, token)
    const friend = friends.find((f) => (f.email || '').toLowerCase() === inviteEmail.toLowerCase())

    let username = friend?.username || ''
    if (!username && s) {
      try {
        const { data: matches } = await s.from('customers').select('plex_username').eq('email', inviteEmail).limit(1)
        username = (matches && matches[0]?.plex_username) || ''
      } catch {}
    }

    const ownedServers = await getOwnedServers(token)
    let resolvedServer = ownedServers.find((server) => server.machineIdentifier === machineIdentifier) || null

    if (!resolvedServer && serverUrl && !serverUrl.includes('plex.tv')) {
      const directMachineIdentifier = await getServerIdentifierFromUrl(serverUrl, token)
      if (directMachineIdentifier) {
        machineIdentifier = directMachineIdentifier
        resolvedServer = ownedServers.find((server) => server.machineIdentifier === directMachineIdentifier) || null
      }
    }

    if (!resolvedServer && ownedServers.length) {
      resolvedServer = ownedServers[0]
      machineIdentifier = resolvedServer.machineIdentifier
    }

    let serverId = resolvedServer?.id || ''
    if (!machineIdentifier) machineIdentifier = resolvedServer?.machineIdentifier || ''

    if (!machineIdentifier) {
      const any = await getAnyServerIdentifier(token)
      if (!any?.machineIdentifier) {
        return NextResponse.json(
          { error: 'No Plex servers found for this token. Please check Admin Settings.' },
          { status: 404 }
        )
      }
      machineIdentifier = any.machineIdentifier
      serverId = serverId || any.serverId || any.machineIdentifier
    }

    const existingShare = machineIdentifier
      ? await findExistingShare({
          token,
          machineIdentifier,
          inviteEmail,
          username,
        })
      : null
    const existingSharedId = existingShare?.id || ''

    if (existingSharedId) {
      const res = await fetch(`https://plex.tv/api/servers/${machineIdentifier}/shared_servers/${existingSharedId}`, {
        method: 'PUT',
        headers: plexFormHeaders(token),
        body: buildShareUpdateForm({ librarySectionIds: libIds, allowSync }),
      })

      if (res.ok) {
        const downloadsResult = await finalizeDownloads()
        if (!downloadsResult.ok) {
          return buildDownloadsWarningResponse({
            inviteEmail,
            downloadsResult,
            payload: { server_id: serverId || machineIdentifier, updated: true },
          })
        }
        await syncCustomerDownloads(inviteEmail, allowSync)
        return NextResponse.json({ ok: true, server_id: serverId || machineIdentifier, updated: true })
      }
    }

    const formBody = new URLSearchParams()
    formBody.set('shared_server[identifier]', inviteEmail)
    formBody.set('shared_server[invited_email]', inviteEmail)
    if (username) formBody.set('shared_server[username]', username)
    if (friend?.id) formBody.set('shared_server[user_id]', String(friend.id))
    if (sectionIds) formBody.set('shared_server[library_section_ids]', sectionIds)
    if (allowSync) formBody.set('shared_server[allowSync]', '1')

    const formResponse = await fetch(`https://plex.tv/api/servers/${machineIdentifier}/shared_servers`, {
      method: 'POST',
      headers: plexFormHeaders(token),
      body: formBody,
    })

    if (formResponse.ok) {
      const downloadsResult = await finalizeDownloads()
      if (!downloadsResult.ok) {
        return buildDownloadsWarningResponse({
          inviteEmail,
          downloadsResult,
          payload: { server_id: serverId || machineIdentifier, v1: true },
        })
      }
      await syncCustomerDownloads(inviteEmail, allowSync)
      try {
        if (s) {
          await s.from('plex_audit_logs').insert({
            id: crypto.randomUUID(),
            action: 'plex_share_add',
            email: inviteEmail,
            server_machine_id: machineIdentifier,
            share_id: null,
            details: { via: 'v1_form', libraries: libIds, allow_sync: allowSync },
          })
        }
      } catch {}
      return NextResponse.json({ ok: true, server_id: serverId || machineIdentifier, v1: true })
    }

    const formFailure = {
      status: formResponse.status,
      response: (await formResponse.text().catch(() => '')).slice(0, 500),
    }

    const duplicateShareUsername =
      formFailure.status === 400
        ? formFailure.response.match(/already sharing this server with ([^.]+)\./i)?.[1]?.trim() || ''
        : ''

    if (duplicateShareUsername) {
      const duplicateShare = await findExistingShare({
        token,
        machineIdentifier,
        inviteEmail,
        username,
        extraUsernameHint: duplicateShareUsername,
      })

      if (duplicateShare?.id) {
        const duplicateUpdate = await fetch(
          `https://plex.tv/api/servers/${machineIdentifier}/shared_servers/${duplicateShare.id}`,
          {
            method: 'PUT',
            headers: plexFormHeaders(token),
            body: buildShareUpdateForm({ librarySectionIds: libIds, allowSync }),
          }
        )

        if (duplicateUpdate.ok) {
          const downloadsResult = await finalizeDownloads()
          if (!downloadsResult.ok) {
            return buildDownloadsWarningResponse({
              inviteEmail,
              downloadsResult,
              payload: {
                server_id: serverId || machineIdentifier,
                updated: true,
                recovered_existing_share: duplicateShare.username || duplicateShareUsername,
              },
            })
          }
          await syncCustomerDownloads(inviteEmail, allowSync)
          return NextResponse.json({
            ok: true,
            server_id: serverId || machineIdentifier,
            updated: true,
            recovered_existing_share: duplicateShare.username || duplicateShareUsername,
          })
        }
      }
    }

    const jsonResponse = await fetch(`https://plex.tv/api/servers/${machineIdentifier}/shared_servers`, {
      method: 'POST',
      headers: plexJsonHeaders(token),
      body: JSON.stringify({
        server_id: serverId || machineIdentifier,
        shared_server: {
          library_section_ids: libIds,
          identifier: inviteEmail || username,
          invited_email: inviteEmail,
        },
      }),
    })
    const jsonResponseText = await jsonResponse.text().catch(() => '')
    if (!jsonResponse.ok) {
      return NextResponse.json(
        {
          error: `Share failed: ${jsonResponse.status}`,
          response: jsonResponseText,
          attempts: {
            v1_form: formFailure,
            v1_json: { status: jsonResponse.status, response: jsonResponseText.slice(0, 500) },
          },
        },
        { status: jsonResponse.status }
      )
    }

    const downloadsResult = await finalizeDownloads()
    if (!downloadsResult.ok) {
      return buildDownloadsWarningResponse({
        inviteEmail,
        downloadsResult,
        payload: { server_id: serverId || machineIdentifier, friend: friend || { email }, libraries },
      })
    }
    await syncCustomerDownloads(inviteEmail, allowSync)
    try {
      if (s) {
        await s.from('plex_audit_logs').insert({
          id: crypto.randomUUID(),
          action: 'plex_share_add',
          email: inviteEmail,
          server_machine_id: machineIdentifier,
          share_id: null,
          details: { via: 'v1_json', libraries: libIds, allow_sync: allowSync },
        })
      }
    } catch {}
    return NextResponse.json({ ok: true, server_id: serverId || machineIdentifier, friend: friend || { email }, libraries })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}

export const runtime = 'nodejs'

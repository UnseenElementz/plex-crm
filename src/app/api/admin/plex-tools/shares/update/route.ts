import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { buildSharedServerUpdateForm, extractServerIdFromServersXml, extractUserIdOnServerFromUsersXml, parseXmlAttrs, toPlexBit } from '@/lib/plexShareUpdate'
import { updatePlexSharingSettings } from '@/lib/plexSharingSettings'
import { syncCustomerDownloads } from '@/lib/moderation'

function svc(){
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
}

function plexHeaders(token: string){
  return {
    'X-Plex-Token': token,
    'X-Plex-Client-Identifier': 'plex-crm',
    'X-Plex-Product': 'Plex CRM',
    'X-Plex-Device': 'Web',
    'X-Plex-Platform': 'Web',
    'X-Plex-Version': '1.0',
    'Accept': 'application/xml',
    'Content-Type': 'application/x-www-form-urlencoded'
  } as Record<string, string>
}

function toBitFromUnknown(v: any): 0 | 1 | null {
  if (v === undefined || v === null) return null
  if (v === true || v === 1 || v === '1') return 1
  if (v === false || v === 0 || v === '0') return 0
  return null
}

function buildAllowSyncWarningPayload(input: {
  machineIdentifier: string
  shareId: string
  expected: 0 | 1
  got: 0 | 1 | null
  attempts: Record<string, unknown>
  downloadsUpdatePath?: 'plex_web' | null
}) {
  return {
    ok: true,
    warning:
      input.expected === 1
        ? 'Share updated, but Plex refused to keep downloads enabled for this user. Access remains active and downloads stayed off.'
        : 'Share updated, but Plex did not reflect the requested downloads state exactly.',
    downloads_enabled: input.got === 1,
    expected: input.expected,
    got: input.got,
    share_id: input.shareId,
    server_machine_id: input.machineIdentifier,
    downloads_update_path: input.downloadsUpdatePath || null,
    attempts: input.attempts,
  }
}

export async function POST(request: Request){
  try{
    if (cookies().get('admin_session')?.value !== '1') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const supabase = svc()
    if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })

    const body = await request.json().catch(()=>({}))
    const machineIdentifier = String(body?.server_machine_id || '').trim()
    const shareId = String(body?.share_id || '').trim()
    const plexUserId = String(body?.plex_user_id || '').trim()
    const email = String(body?.email || '').trim()
    const librarySectionIds = Array.isArray(body?.library_section_ids) ? body.library_section_ids : []
    const settings = body?.settings || {}
    const filters = body?.filters || {}
    const forceRecreate = Boolean(body?.force_recreate)

    if (!machineIdentifier) return NextResponse.json({ error: 'server_machine_id required' }, { status: 400 })
    if (!shareId) return NextResponse.json({ error: 'share_id required' }, { status: 400 })

    const { data: as, error: asErr } = await supabase.from('admin_settings').select('plex_token').eq('id', 1).maybeSingle()
    if (asErr) return NextResponse.json({ error: asErr.message }, { status: 500 })
    const token = String(as?.plex_token || '').trim()
    if (!token) return NextResponse.json({ error: 'Plex token not set in Settings' }, { status: 400 })

    let serverId: string | null = null
    try {
      const serversRes = await fetch('https://plex.tv/api/servers', { headers: { 'X-Plex-Token': token, 'Accept': 'application/xml' }, cache: 'no-store' })
      if (serversRes.ok) {
        const xml = await serversRes.text()
        serverId = extractServerIdFromServersXml(xml, machineIdentifier)
      }
    } catch {}

    let effectiveShareId = shareId
    const shareUrl = (id: string) => `https://plex.tv/api/servers/${machineIdentifier}/shared_servers/${encodeURIComponent(id)}`
    const { form, libs } = buildSharedServerUpdateForm({
      serverId,
      librarySectionIds,
      settings,
      filters
    })

    const attempts: any = {}
    const findMatchingShareId = (xml: string) => {
      const targetEmail = String(email || '').trim().toLowerCase()
      const targetUserId = String(plexUserId || '').trim()
      const blocks = xml.split('</SharedServer>')
      for (const block of blocks) {
        if (!block.includes('<SharedServer')) continue
        const attrs = parseXmlAttrs(block.match(/<SharedServer\s+([^>]+)>/)?.[1] || '')
        const listedId = String(attrs.id || '').trim()
        if (!listedId) continue
        const listedEmail = String(attrs.email || '').trim().toLowerCase()
        const listedUserId = String(attrs.userID || attrs.userId || '').trim()
        if (listedId === effectiveShareId) return listedId
        if (targetEmail && listedEmail && listedEmail === targetEmail) return listedId
        if (targetUserId && listedUserId && listedUserId === targetUserId) return listedId
      }
      return null
    }

    let updateSucceeded = false
    let initialUpdateStatus = 0
    let initialUpdateResponse = ''

    const res = await fetch(shareUrl(effectiveShareId), { method: 'PUT', headers: plexHeaders(token), body: form, cache: 'no-store' })
    const txt = await res.text().catch(()=> '')
    initialUpdateStatus = res.status
    initialUpdateResponse = txt
    attempts.form = { status: res.status, response: txt.slice(0, 500), sent: Object.fromEntries(form.entries()), share_id: effectiveShareId }
    updateSucceeded = res.status >= 200 && res.status < 300

    if (!updateSucceeded) {
      try {
        const relistRes = await fetch(`https://plex.tv/api/servers/${machineIdentifier}/shared_servers`, {
          headers: { 'X-Plex-Token': token, 'Accept': 'application/xml' },
          cache: 'no-store'
        })
        const relistTxt = await relistRes.text().catch(()=> '')
        attempts.relookup = { status: relistRes.status, response: relistTxt.slice(0, 500) }
        if (relistRes.ok) {
          const refreshedShareId = findMatchingShareId(relistTxt)
          if (refreshedShareId && refreshedShareId !== effectiveShareId) {
            effectiveShareId = refreshedShareId
            attempts.relookup_share_id = refreshedShareId
            const retryRes = await fetch(shareUrl(effectiveShareId), {
              method: 'PUT',
              headers: plexHeaders(token),
              body: form,
              cache: 'no-store',
            })
            const retryTxt = await retryRes.text().catch(()=> '')
            attempts.form_retry = {
              status: retryRes.status,
              response: retryTxt.slice(0, 500),
              sent: Object.fromEntries(form.entries()),
              share_id: effectiveShareId,
            }
            updateSucceeded = retryRes.status >= 200 && retryRes.status < 300
            if (updateSucceeded) {
              initialUpdateStatus = retryRes.status
              initialUpdateResponse = retryTxt
            }
          }
        }
      } catch {}
    }

    if (!updateSucceeded && settings?.allow_sync === undefined) {
      return NextResponse.json({ error: `Update failed: ${initialUpdateStatus}`, response: initialUpdateResponse, attempts }, { status: 400 })
    }

    const desiredAllowSync = settings?.allow_sync !== undefined ? toPlexBit(settings.allow_sync) : undefined
    let downloadsUpdatePath: 'plex_web' | null = null
    let verifiedAllowSync: 0 | 1 | null = null
    let userIdOnServer: string | null = null
    const needsAllowSyncRetry = () => desiredAllowSync !== undefined && verifiedAllowSync !== desiredAllowSync
    async function verify(label: string) {
      try{
        const verifyRes = await fetch(`https://plex.tv/api/servers/${machineIdentifier}/shared_servers`, { headers: { 'X-Plex-Token': token, 'Accept': 'application/xml' }, cache: 'no-store' })
        const verifyTxt = await verifyRes.text().catch(()=> '')
        attempts[label] = { status: verifyRes.status, response: verifyTxt.slice(0, 500) }
        if (verifyRes.ok) {
          const blocks = verifyTxt.split('</SharedServer>')
          for (const block of blocks) {
            if (!block.includes('<SharedServer')) continue
            const attrs = block.match(/<SharedServer\s+([^>]+)>/)?.[1] || ''
            const at = parseXmlAttrs(attrs)
            if (String(at.id || '') === effectiveShareId) {
              if (at.allowSync !== undefined) verifiedAllowSync = String(at.allowSync) === '1' ? 1 : 0
              break
            }
          }
        }
      } catch {}
    }

    async function resolveUserIdOnServer(label: string) {
      if (userIdOnServer) return userIdOnServer
      try{
        const usersRes = await fetch('https://plex.tv/api/users', { headers: { 'X-Plex-Token': token, 'Accept': 'application/xml' }, cache: 'no-store' })
        const usersTxt = await usersRes.text().catch(()=> '')
        attempts[label] = { status: usersRes.status, response: usersTxt.slice(0, 500) }
        if (!usersRes.ok) return null
        userIdOnServer =
          extractUserIdOnServerFromUsersXml(usersTxt, { plexUserId: plexUserId || null, email: email || null, machineIdentifier }) ||
          null
        return userIdOnServer
      } catch {
        return null
      }
    }

    async function verifyViaV2(label: string) {
      try{
        const resolved = await resolveUserIdOnServer(`${label}_users`)
        if (!resolved) {
          attempts[label] = { status: 0, response: 'Could not determine userIdOnServer from /api/users', userIdOnServer: null }
          return
        }
        const v2Get = await fetch(`https://plex.tv/api/v2/shared_servers/${encodeURIComponent(resolved)}`, {
          method: 'GET',
          headers: {
            'X-Plex-Token': token,
            'X-Plex-Client-Identifier': 'plex-crm',
            'X-Plex-Product': 'Plex CRM',
            'X-Plex-Device': 'Web',
            'X-Plex-Platform': 'Web',
            'X-Plex-Version': '1.0',
            'Accept': 'application/json'
          },
          cache: 'no-store'
        })
        const v2GetTxt = await v2Get.text().catch(()=> '')
        attempts[label] = { status: v2Get.status, response: v2GetTxt.slice(0, 500), userIdOnServer: resolved }
        if (!v2Get.ok) return
        const data = JSON.parse(v2GetTxt)
        const bit =
          toBitFromUnknown(data?.settings?.allowSync) ??
          toBitFromUnknown(data?.sharingSettings?.allowSync) ??
          toBitFromUnknown(data?.sharing_settings?.allowSync) ??
          toBitFromUnknown(data?.allowSync) ??
          null
        if (bit !== null) {
          attempts[`${label}_allowSync`] = bit
          verifiedAllowSync = bit
        }
      } catch {}
    }

    await verify('verify_list')

    if (desiredAllowSync !== undefined) {
      try {
        const invitedId = String(plexUserId || '').trim() || String(await resolveUserIdOnServer('users') || '').trim()
        if (invitedId) {
          const sharingSettingsRes = await updatePlexSharingSettings(token, invitedId, {
            allowSync: desiredAllowSync === 1,
          })
          attempts.sharing_settings = {
            status: sharingSettingsRes.status,
            response: sharingSettingsRes.responseText.slice(0, 500),
            invitedId,
          }
          if (sharingSettingsRes.settings) {
            verifiedAllowSync = sharingSettingsRes.settings.allowSync ? 1 : 0
          }
          if (sharingSettingsRes.ok) downloadsUpdatePath = 'plex_web'
        } else {
          attempts.sharing_settings = { status: 0, response: 'Could not determine invitedId for sharing settings update' }
        }
      } catch (error: any) {
        attempts.sharing_settings = { status: 0, response: error?.message || 'sharing settings update failed' }
      }

      await verifyViaV2('v2_get')
      await verify('verify_list_2')
    }

    if (needsAllowSyncRetry()) {
      const expectedAllowSync = desiredAllowSync ?? 0
      if (email && desiredAllowSync !== undefined) {
        await syncCustomerDownloads(email, verifiedAllowSync === 1)
      }
      return NextResponse.json(
        buildAllowSyncWarningPayload({
          machineIdentifier,
          shareId: effectiveShareId,
          expected: expectedAllowSync,
          got: verifiedAllowSync,
          attempts,
          downloadsUpdatePath,
        })
      )
    }

    try{
      await supabase.from('plex_audit_logs').insert({
        id: crypto.randomUUID(),
        action: 'plex_share_update',
        email: email || null,
        server_machine_id: machineIdentifier,
        share_id: effectiveShareId,
        details: { libraries: libs, allow_sync: desiredAllowSync }
      })
    } catch {}
    if (email && desiredAllowSync !== undefined) {
      await syncCustomerDownloads(email, desiredAllowSync === 1)
    }
    return NextResponse.json({ ok: true, downloads_update_path: downloadsUpdatePath })
  } catch(e: any){
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

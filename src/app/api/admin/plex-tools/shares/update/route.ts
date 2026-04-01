import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { buildSharedServerUpdateForm, extractServerIdFromServersXml, extractUserIdOnServerFromUsersXml, parseXmlAttrs, toPlexBit } from '@/lib/plexShareUpdate'

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

    const url = `https://plex.tv/api/servers/${machineIdentifier}/shared_servers/${shareId}`
    const { form, libs } = buildSharedServerUpdateForm({
      serverId,
      librarySectionIds,
      settings,
      filters
    })

    const attempts: any = {}
    const res = await fetch(url, { method: 'PUT', headers: plexHeaders(token), body: form, cache: 'no-store' })
    const txt = await res.text().catch(()=> '')
    attempts.form = { status: res.status, response: txt.slice(0, 500), sent: Object.fromEntries(form.entries()) }
    if (!(res.status >= 200 && res.status < 300)) {
      return NextResponse.json({ error: `Update failed: ${res.status}`, response: txt, attempts }, { status: 400 })
    }

    const desiredAllowSync = settings?.allow_sync !== undefined ? toPlexBit(settings.allow_sync) : undefined
    let verifiedAllowSync: 0 | 1 | null = null
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
            if (String(at.id || '') === shareId) {
              if (at.allowSync !== undefined) verifiedAllowSync = String(at.allowSync) === '1' ? 1 : 0
              break
            }
          }
        }
      } catch {}
    }

    await verify('verify_list')

    if (desiredAllowSync !== undefined && verifiedAllowSync !== null && verifiedAllowSync !== desiredAllowSync) {
      try{
        const jsonRes = await fetch(url, {
          method: 'PUT',
          headers: {
            'X-Plex-Token': token,
            'X-Plex-Client-Identifier': 'plex-crm',
            'X-Plex-Product': 'Plex CRM',
            'X-Plex-Device': 'Web',
            'X-Plex-Platform': 'Web',
            'X-Plex-Version': '1.0',
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            server_id: serverId,
            shared_server: {
              library_section_ids: libs,
              allowSync: desiredAllowSync,
              filterAll: filters?.filter_all !== undefined ? String(filters?.filter_all || '') : undefined,
              filterMovies: filters?.filter_movies !== undefined ? String(filters?.filter_movies || '') : undefined,
              filterTelevision: filters?.filter_television !== undefined ? String(filters?.filter_television || '') : undefined
            }
          }),
          cache: 'no-store'
        })
        const jsonTxt = await jsonRes.text().catch(()=> '')
        attempts.json = { status: jsonRes.status, response: jsonTxt.slice(0, 500) }
      } catch {}

      await verify('verify_list_2')
    }

    if (desiredAllowSync !== undefined && verifiedAllowSync !== null && verifiedAllowSync !== desiredAllowSync) {
      try{
        const altForm = new URLSearchParams(form)
        altForm.set('shared_server[allowSync]', String(desiredAllowSync))
        altForm.set('sharingSettings[allowSync]', String(desiredAllowSync))
        if (serverId) altForm.set('server_id', String(serverId))
        const altRes = await fetch(url, { method: 'PUT', headers: plexHeaders(token), body: altForm, cache: 'no-store' })
        const altTxt = await altRes.text().catch(()=> '')
        attempts.alt_form = { status: altRes.status, response: altTxt.slice(0, 500), sent: Object.fromEntries(altForm.entries()) }
      } catch {}

      await verify('verify_list_3')
    }

    if (desiredAllowSync !== undefined && verifiedAllowSync !== null && verifiedAllowSync !== desiredAllowSync) {
      try{
        const altJsonRes = await fetch(url, {
          method: 'PUT',
          headers: {
            'X-Plex-Token': token,
            'X-Plex-Client-Identifier': 'plex-crm',
            'X-Plex-Product': 'Plex CRM',
            'X-Plex-Device': 'Web',
            'X-Plex-Platform': 'Web',
            'X-Plex-Version': '1.0',
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            server_id: serverId,
            shared_server: { library_section_ids: libs },
            sharing_settings: { allowSync: desiredAllowSync },
            sharingSettings: { allowSync: desiredAllowSync }
          }),
          cache: 'no-store'
        })
        const altJsonTxt = await altJsonRes.text().catch(()=> '')
        attempts.alt_json = { status: altJsonRes.status, response: altJsonTxt.slice(0, 500) }
      } catch {}

      await verify('verify_list_4')
    }

    if (desiredAllowSync !== undefined && verifiedAllowSync !== null && verifiedAllowSync !== desiredAllowSync) {
      try{
        const usersRes = await fetch('https://plex.tv/api/users', { headers: { 'X-Plex-Token': token, 'Accept': 'application/xml' }, cache: 'no-store' })
        const usersTxt = await usersRes.text().catch(()=> '')
        attempts.users = { status: usersRes.status, response: usersTxt.slice(0, 500) }
        const userIdOnServer =
          (usersRes.ok ? extractUserIdOnServerFromUsersXml(usersTxt, { plexUserId: plexUserId || null, email: email || null, machineIdentifier }) : null) ||
          null
        if (userIdOnServer) {
          const v2Res = await fetch(`https://plex.tv/api/v2/shared_servers/${encodeURIComponent(userIdOnServer)}`, {
            method: 'POST',
            headers: {
              'X-Plex-Token': token,
              'X-Plex-Client-Identifier': 'plex-crm',
              'X-Plex-Product': 'Plex CRM',
              'X-Plex-Device': 'Web',
              'X-Plex-Platform': 'Web',
              'X-Plex-Version': '1.0',
              'Accept': 'application/json',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              machineIdentifier,
              librarySectionIds: libs,
              settings: { allowSync: desiredAllowSync }
            }),
            cache: 'no-store'
          })
          const v2Txt = await v2Res.text().catch(()=> '')
          attempts.v2_post = { status: v2Res.status, response: v2Txt.slice(0, 500), userIdOnServer }
        } else {
          attempts.v2_post = { status: 0, response: 'Could not determine userIdOnServer from /api/users', userIdOnServer: null }
        }
      } catch {}

      try{
        const userIdOnServer = attempts?.v2_post?.userIdOnServer
        if (userIdOnServer) {
          const v2Get = await fetch(`https://plex.tv/api/v2/shared_servers/${encodeURIComponent(userIdOnServer)}`, {
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
          attempts.v2_get = { status: v2Get.status, response: v2GetTxt.slice(0, 500), userIdOnServer }
          if (v2Get.ok) {
            const data = JSON.parse(v2GetTxt)
            const bit =
              toBitFromUnknown(data?.settings?.allowSync) ??
              toBitFromUnknown(data?.sharingSettings?.allowSync) ??
              toBitFromUnknown(data?.sharing_settings?.allowSync) ??
              toBitFromUnknown(data?.allowSync) ??
              null
            if (bit !== null) attempts.v2_get_allowSync = bit
          }
        }
      } catch {}

      await verify('verify_list_5')
    }

    if (desiredAllowSync !== undefined && verifiedAllowSync !== null && verifiedAllowSync !== desiredAllowSync) {
      if (forceRecreate) {
        attempts.force_recreate = true
        const allowSyncBit = desiredAllowSync ?? 0
        try{
          const listRes = await fetch(`https://plex.tv/api/servers/${machineIdentifier}/shared_servers`, { headers: { 'X-Plex-Token': token, 'Accept': 'application/xml' }, cache: 'no-store' })
          const listTxt = await listRes.text().catch(()=> '')
          attempts.force_list = { status: listRes.status, response: listTxt.slice(0, 500) }
          if (listRes.ok) {
            const targetEmail = String(email || '').trim().toLowerCase()
            const targetUserId = String(plexUserId || '').trim()
            const blocks = listTxt.split('</SharedServer>')
            const ids: string[] = []
            for (const block of blocks) {
              if (!block.includes('<SharedServer')) continue
              const attrs = block.match(/<SharedServer\s+([^>]+)>/)?.[1] || ''
              const at = parseXmlAttrs(attrs)
              const id = String(at.id || '').trim()
              if (!id) continue
              const e = String(at.email || '').trim().toLowerCase()
              const uid = String(at.userID || at.userId || '').trim()
              const emailMatch = targetEmail && e && e === targetEmail
              const userIdMatch = targetUserId && uid && uid === targetUserId
              if (emailMatch || userIdMatch) ids.push(id)
            }
            attempts.force_delete_ids = ids
            const results: Array<{ id: string; status: number; response: string }> = []
            for (const id of ids) {
              const delUrl = `https://plex.tv/api/servers/${machineIdentifier}/shared_servers/${encodeURIComponent(id)}`
              const del = await fetch(delUrl, { method: 'DELETE', headers: { 'X-Plex-Token': token, 'Accept': 'application/xml' }, cache: 'no-store' })
              const delTxt = await del.text().catch(()=> '')
              results.push({ id, status: del.status, response: delTxt.slice(0, 200) })
            }
            attempts.force_delete = results
          }
        } catch {}

        try{
          const create = await fetch('https://plex.tv/api/v2/shared_servers', {
            method: 'POST',
            headers: {
              'X-Plex-Token': token,
              'X-Plex-Client-Identifier': 'plex-crm',
              'X-Plex-Product': 'Plex CRM',
              'X-Plex-Device': 'Web',
              'X-Plex-Platform': 'Web',
              'X-Plex-Version': '1.0',
              'Accept': 'application/json',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              machineIdentifier,
              librarySectionIds: libs,
              settings: { allowSync: allowSyncBit },
              invitedEmail: email
            }),
            cache: 'no-store'
          })
          const createTxt = await create.text().catch(()=> '')
          attempts.force_v2_create = { status: create.status, response: createTxt.slice(0, 500) }
        } catch {}

        const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
        const verifyByEmail = async (label: string) => {
          try{
            const r = await fetch(`https://plex.tv/api/servers/${machineIdentifier}/shared_servers`, { headers: { 'X-Plex-Token': token, 'Accept': 'application/xml' }, cache: 'no-store' })
            const t = await r.text().catch(()=> '')
            attempts[label] = { status: r.status, response: t.slice(0, 500) }
            if (!r.ok) return null
            const targetEmail = String(email || '').trim().toLowerCase()
            const targetUserId = String(plexUserId || '').trim()
            const blocks = t.split('</SharedServer>')
            for (const block of blocks) {
              if (!block.includes('<SharedServer')) continue
              const attrs = block.match(/<SharedServer\s+([^>]+)>/)?.[1] || ''
              const at = parseXmlAttrs(attrs)
              const e = String(at.email || '').trim().toLowerCase()
              const uid = String(at.userID || at.userId || '').trim()
              const emailMatch = targetEmail && e && e === targetEmail
              const userIdMatch = targetUserId && uid && uid === targetUserId
              if (targetEmail || targetUserId) {
                if (!emailMatch && !userIdMatch) continue
              }
              if (at.allowSync !== undefined) return String(at.allowSync) === '1' ? 1 : 0
            }
          } catch {}
          return null
        }

        for (let i = 0; i < 10; i++) {
          const v = await verifyByEmail(`force_verify_${i + 1}`)
          if (v !== null) {
            verifiedAllowSync = v
            break
          }
          await sleep(500)
        }

        if (verifiedAllowSync !== null && verifiedAllowSync === allowSyncBit) {
          try{
            await supabase.from('plex_audit_logs').insert({
              id: crypto.randomUUID(),
              action: 'plex_share_recreate',
              email: email || null,
              server_machine_id: machineIdentifier,
              share_id: shareId,
              details: { libraries: libs, allow_sync: allowSyncBit }
            })
          } catch {}
          return NextResponse.json({ ok: true, recreated: true })
        }
      }

      return NextResponse.json(
        {
          error: 'Update did not persist allowSync on Plex',
          expected: desiredAllowSync,
          got: verifiedAllowSync,
          response: JSON.stringify({ expected: desiredAllowSync, got: verifiedAllowSync, attempts }).slice(0, 800),
          attempts
        },
        { status: 409 }
      )
    }
    try{
      await supabase.from('plex_audit_logs').insert({
        id: crypto.randomUUID(),
        action: 'plex_share_update',
        email: email || null,
        server_machine_id: machineIdentifier,
        share_id: shareId,
        details: { libraries: libs, allow_sync: desiredAllowSync }
      })
    } catch {}
    return NextResponse.json({ ok: true })
  } catch(e: any){
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

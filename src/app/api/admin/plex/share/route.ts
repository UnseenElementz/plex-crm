import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies, headers } from 'next/headers'
import { getPlexFriends, getOwnedServers, getAnyServerIdentifier, getServerIdentifierFromUrl } from '@/lib/plex'

function svc(){
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return null
  return createClient(url, key)
}

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(request: Request){
  const s = svc()
  try{
    const reqJson = await request.json()
    const email = reqJson.email
    const libraries = reqJson.libraries
    let machineIdentifier = reqJson.machineIdentifier
    const allowSync = Boolean(reqJson.allow_sync)
    
    let settings: any = null
    
    // Check headers first
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
    const friends = await getPlexFriends(serverUrl, token)
    const friend = friends.find(f=> (f.email||'').toLowerCase() === String(email).toLowerCase())
    
    let serverId = ''
    if (serverUrl && !serverUrl.includes('plex.tv')) {
      const directId = await getServerIdentifierFromUrl(serverUrl, token)
      if (directId) {
          serverId = directId
          machineIdentifier = directId
      }
    }

    if (!serverId) {
      const servers = await getOwnedServers(token)
      serverId = servers[0]?.id
      machineIdentifier = servers[0]?.machineIdentifier
    }

    if (!serverId) {
      const any = await getAnyServerIdentifier(token)
      if (!any?.serverId) return NextResponse.json({ error: 'No Plex servers found for this token. Please check Admin Settings.' }, { status: 404 })
      serverId = any.serverId
      if (!machineIdentifier) machineIdentifier = any.machineIdentifier
    }

    const sectionIds = (Array.isArray(libraries) ? libraries : []).join(',')
    
    // Determine inviteEmail and username early
    const inviteEmail = String(email || '').trim()
    let username = friend?.username || ''
    if (!username && s) {
      try {
        const { data: matches } = await s.from('customers').select('plex_username').eq('email', String(email)).limit(1)
        username = (matches && matches[0]?.plex_username) || ''
      } catch {}
    }

    // If we have a sharedServerId (from update request), use it to update
    let existingSharedId = ''
    if (machineIdentifier) {
        const resList = await fetch(`https://plex.tv/api/servers/${machineIdentifier}/shared_servers`, { headers: { 'X-Plex-Token': token } })
        if (resList.ok) {
            const text = await resList.text()
            const blocks = text.split('</SharedServer>')
            for (const block of blocks) {
                if (!block.includes('<SharedServer')) continue
                const attrs = block.match(/<SharedServer\s+([^>]+)>/)?.[1] || ''
                const uEmail = attrs.match(/email="([^"]+)"/)?.[1] || ''
                const uName = attrs.match(/username="([^"]+)"/)?.[1] || ''
                
                if ((uEmail && uEmail.toLowerCase() === inviteEmail.toLowerCase()) || 
                    (uName && uName.toLowerCase() === inviteEmail.toLowerCase()) ||
                    (username && uName.toLowerCase() === username.toLowerCase())) {
                    existingSharedId = attrs.match(/id="([^"]+)"/)?.[1] || ''
                    break
                }
            }
        }
    }

    if (existingSharedId) {
        const updateBody = JSON.stringify({
            server_id: serverId,
            shared_server: {
                library_section_ids: sectionIds ? sectionIds.split(',').map(Number) : []
            }
        })
        
        const res = await fetch(`https://plex.tv/api/servers/${machineIdentifier}/shared_servers/${existingSharedId}`, {
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
            body: updateBody
        })
        
        const ok = res.status >= 200 && res.status < 300
        if (ok) return NextResponse.json({ ok: true, server_id: serverId, updated: true })
    }

    const libIds = sectionIds ? sectionIds.split(',').map(Number).filter(n => Number.isFinite(n)) : []
    const targetMachine = String(machineIdentifier || '').trim()
    if (!targetMachine) return NextResponse.json({ error: 'No Plex server machine identifier found' }, { status: 404 })
    let v2Fail: any = null
    let v1Fail: any = null
    let inviteFail: any = null

    try{
      const v2 = await fetch('https://plex.tv/api/v2/shared_servers', {
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
          machineIdentifier: targetMachine,
          librarySectionIds: libIds,
          settings: { allowSync: allowSync ? 1 : 0 },
          invitedEmail: inviteEmail
        })
      })
      if (v2.status >= 200 && v2.status < 300) {
        try{
          if (s) {
            await s.from('plex_audit_logs').insert({
              id: crypto.randomUUID(),
              action: 'plex_share_add',
              email: inviteEmail,
              server_machine_id: targetMachine,
              share_id: null,
              details: { via: 'v2', libraries: libIds, allow_sync: allowSync }
            })
          }
        } catch {}
        return NextResponse.json({ ok: true, server_id: serverId, v2: true })
      }
      v2Fail = { status: v2.status, response: (await v2.text().catch(()=> '')).slice(0, 500) }
    } catch {}

    try{
      const body = new URLSearchParams()
      body.set('shared_server[identifier]', inviteEmail)
      body.set('shared_server[invited_email]', inviteEmail)
      if (serverId) body.set('shared_server[server_id]', String(serverId))
      if (sectionIds) body.set('shared_server[library_section_ids]', sectionIds)
      if (allowSync) body.set('shared_server[allowSync]', '1')

      if (!serverId) throw new Error('missing_server_id')
      const v1 = await fetch(`https://plex.tv/api/servers/${targetMachine}/shared_servers`, {
        method: 'POST',
        headers: {
          'X-Plex-Token': token,
          'X-Plex-Client-Identifier': 'plex-crm',
          'X-Plex-Product': 'Plex CRM',
          'X-Plex-Device': 'Web',
          'X-Plex-Platform': 'Web',
          'X-Plex-Version': '1.0',
          'Accept': 'application/xml',
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body
      })
      if (v1.status >= 200 && v1.status < 300) {
        try{
          if (s) {
            await s.from('plex_audit_logs').insert({
              id: crypto.randomUUID(),
              action: 'plex_share_add',
              email: inviteEmail,
              server_machine_id: targetMachine,
              share_id: null,
              details: { via: 'v1_form', libraries: libIds, allow_sync: allowSync }
            })
          }
        } catch {}
        return NextResponse.json({ ok: true, server_id: serverId, v1: true })
      }
      v1Fail = { status: v1.status, response: (await v1.text().catch(()=> '')).slice(0, 500) }
    } catch {}

    const body = new URLSearchParams()
    if (inviteEmail) {
      body.set('shared_server[identifier]', inviteEmail)
    }
    if (username) {
      body.set('shared_server[username]', username)
    }
    if (friend?.id) body.set('shared_server[user_id]', friend.id)
    if (serverId) body.set('shared_server[server_id]', serverId)
    if (sectionIds) body.set('shared_server[library_section_ids]', sectionIds)
    body.set('shared_server[invited]', '1')
    
    const res = await fetch(`https://plex.tv/api/servers/${targetMachine}/shared_servers`, {
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
        server_id: serverId || undefined,
        shared_server: {
          library_section_ids: sectionIds ? sectionIds.split(',').map(Number) : [],
          identifier: inviteEmail || username,
          invited_email: inviteEmail
        }
      })
    })
    let ok = res.status >= 200 && res.status < 300
    const v1JsonText = await res.text().catch(()=> '')
    if (!ok) {
      const any = await getAnyServerIdentifier(token)
      const fallback = new URLSearchParams()
      if (inviteEmail) {
        fallback.set('friend[email]', inviteEmail)
        fallback.set('friend[invitee_email]', inviteEmail)
      }
      if (username) {
        fallback.set('friend[username]', username)
        fallback.set('friend[invitee_username]', username)
      }
      if (serverId) fallback.set('server_id', serverId)
      if (any?.machineIdentifier) fallback.set('machineIdentifier', any.machineIdentifier)
      if (sectionIds) fallback.set('shared_library_section_ids', sectionIds)
      if (allowSync) fallback.set('sharingSettings[allowSync]', '1')
      const r2 = await fetch('https://plex.tv/api/friends/invite', {
        method: 'POST',
        headers: { 
          'X-Plex-Token': token, 
          'X-Plex-Client-Identifier': 'plex-crm',
          'X-Plex-Product': 'Plex CRM',
          'X-Plex-Device': 'Web',
          'X-Plex-Platform': 'Web',
          'X-Plex-Version': '1.0',
          'Accept': 'application/xml', 
          'Content-Type': 'application/x-www-form-urlencoded' 
        },
        body: fallback
      })
      ok = r2.status >= 200 && r2.status < 300
      const friendInviteText = await r2.text().catch(()=> '')
      if (!ok) {
        inviteFail = { status: r2.status, response: friendInviteText.slice(0, 500) }
        return NextResponse.json({ error: `Share failed: ${r2.status}`, response: inviteFail.response, attempts: { v2: v2Fail, v1: v1Fail, v1json: { status: res.status, response: v1JsonText.slice(0, 500) } } }, { status: r2.status })
      }
      return NextResponse.json({ ok: true, server_id: serverId, friend: friend || { email }, libraries })
    }
    if (!ok) return NextResponse.json({ error: `Share failed: ${res.status}`, response: v1JsonText }, { status: res.status })
    try{
      if (s) {
        await s.from('plex_audit_logs').insert({
          id: crypto.randomUUID(),
          action: 'plex_share_add',
          email: inviteEmail,
          server_machine_id: targetMachine,
          share_id: null,
          details: { via: 'v1_json', libraries: libIds, allow_sync: allowSync }
        })
      }
    } catch {}
    return NextResponse.json({ ok: true, server_id: serverId, friend: friend || { email }, libraries })
  } catch(e:any){
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}

export const runtime = 'nodejs'

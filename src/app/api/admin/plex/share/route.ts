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
    const { email, libraries } = await request.json()
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
      // If we have a direct URL, try to get the ID from there first
      const directId = await getServerIdentifierFromUrl(serverUrl, token)
      if (directId) serverId = directId
    }

    if (!serverId) {
      const servers = await getOwnedServers(token)
      serverId = servers[0]?.id
    }

    if (!serverId) {
      const any = await getAnyServerIdentifier(token)
      if (!any?.serverId) return NextResponse.json({ error: 'No Plex servers found for this token. Please check Admin Settings.' }, { status: 404 })
      serverId = any.serverId
    }

    const sectionIds = (Array.isArray(libraries) ? libraries : []).join(',')
    const body = new URLSearchParams()
    // Always include email when provided (Plex requires email or username)
    const inviteEmail = String(email || '').trim()
    if (inviteEmail) {
      // Correct field for shared_server invite is 'identifier'
      body.set('shared_server[identifier]', inviteEmail)
    }
    // Include username if we can infer it (from friends or customers)
    let username = friend?.username || ''
    if (!username && s) {
      try {
        const { data: matches } = await s.from('customers').select('plex_username').eq('email', String(email)).limit(1)
        username = (matches && matches[0]?.plex_username) || ''
      } catch {}
    }
    // Also set username as backup if identifier logic fails on some servers
    if (username) {
      body.set('shared_server[username]', username)
    }
    // Prefer user_id if we have it
    if (friend?.id) body.set('shared_server[user_id]', friend.id)
    // Required server
    body.set('shared_server[server_id]', serverId)
    if (sectionIds) body.set('shared_server[library_section_ids]', sectionIds)
    // Hint invite intent
    body.set('shared_server[invited]', '1')
    const res = await fetch(`https://plex.tv/api/servers/${serverId}/shared_servers`, {
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
        server_id: serverId,
        shared_server: {
          library_section_ids: sectionIds ? sectionIds.split(',').map(Number) : [],
          identifier: inviteEmail || username,
          invited_email: inviteEmail
        }
      })
    })
    let ok = res.status >= 200 && res.status < 300
    let text = await res.text().catch(()=> '')
    if (!ok && text.includes('You must specify an email address or username')) {
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
      text = await r2.text().catch(()=> '')
      if (!ok) return NextResponse.json({ error: `Share failed: ${r2.status}`, response: text }, { status: r2.status })
      return NextResponse.json({ ok: true, server_id: serverId, friend: friend || { email }, libraries })
    }
    if (!ok) return NextResponse.json({ error: `Share failed: ${res.status}`, response: text }, { status: res.status })
    return NextResponse.json({ ok: true, server_id: serverId, friend: friend || { email }, libraries })
  } catch(e:any){
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}

export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies, headers } from 'next/headers'
import { getPlexFriends, getOwnedServers, getAnyServerIdentifier } from '@/lib/plex'

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
    const { email } = await request.json()
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
    
    // We need to find the specific SharedServer ID for this user on our server
    // 1. Get our server identifier
    const servers = await getOwnedServers(token)
    let machineId = servers[0]?.machineIdentifier
    
    if (!machineId) {
      const any = await getAnyServerIdentifier(token)
      if (any?.machineIdentifier) machineId = any.machineIdentifier
    }
    
    if (!machineId) return NextResponse.json({ error: 'No Plex server found' }, { status: 404 })

    // 2. Fetch shared servers list to find the friendship ID / shared server ID
    const resList = await fetch(`https://plex.tv/api/servers/${machineId}/shared_servers`, { headers: { 'X-Plex-Token': token } })
    if (!resList.ok) return NextResponse.json({ error: 'Failed to fetch shared list' }, { status: resList.status })
    
    const text = await resList.text()
    const blocks = text.split('</SharedServer>')
    let sharedServerId = ''
    
    for (const block of blocks) {
        if (!block.includes('<SharedServer')) continue
        const attrs = block.match(/<SharedServer\s+([^>]+)>/)?.[1] || ''
        const uEmail = attrs.match(/email="([^"]+)"/)?.[1] || ''
        const uName = attrs.match(/username="([^"]+)"/)?.[1] || ''
        
        if ((uEmail && uEmail.toLowerCase() === email.toLowerCase()) || 
            (uName && uName.toLowerCase() === email.toLowerCase())) {
            sharedServerId = attrs.match(/id="([^"]+)"/)?.[1] || ''
            break
        }
    }
    
    if (!sharedServerId) {
        // Fallback: Try to find friend ID if not found in shared_servers (maybe invited but not accepted?)
        const friends = await getPlexFriends(settings.plex_server_url || 'https://plex.tv', token)
        const friend = friends.find(f => (f.email||'').toLowerCase() === email.toLowerCase() || f.username.toLowerCase() === email.toLowerCase())
        if (friend) sharedServerId = friend.id // This is friend ID, might work for removal in some contexts
    }

    if (!sharedServerId) return NextResponse.json({ error: 'User not found in shares' }, { status: 404 })

    // 3. Delete
    const url = `https://plex.tv/api/servers/${machineId}/shared_servers/${sharedServerId}`
    const res = await fetch(url, { 
      method: 'DELETE', 
      headers: { 
        'X-Plex-Token': token, 
        'X-Plex-Client-Identifier': 'plex-crm',
        'X-Plex-Product': 'Plex CRM',
        'X-Plex-Device': 'Web',
        'X-Plex-Platform': 'Web',
        'X-Plex-Version': '1.0',
        'Accept': 'application/xml' 
      } 
    })
    
    const ok = res.status >= 200 && res.status < 300
    const resText = await res.text().catch(()=> '')
    if (!ok) return NextResponse.json({ error: `Unshare failed: ${res.status}`, response: resText }, { status: res.status })
    
    return NextResponse.json({ ok: true, server_id: machineId })
  } catch(e:any){
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}

export const runtime = 'nodejs'

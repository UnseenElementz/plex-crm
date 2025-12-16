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
    const friends = await getPlexFriends(serverUrl, token)
    const friend = friends.find(f=> (f.email||'').toLowerCase() === String(email).toLowerCase())
    if (!friend) return NextResponse.json({ error: 'Plex user not found for email' }, { status: 404 })
    const servers = await getOwnedServers(token)
    let serverId = servers[0]?.id
    if (!serverId) {
      const any = await getAnyServerIdentifier(token)
      if (!any?.serverId) return NextResponse.json({ error: 'No Plex servers found for this token' }, { status: 404 })
      serverId = any.serverId
    }
    // Attempt delete shared server; API shape varies, try userId path
    const url = `https://plex.tv/api/servers/${serverId}/shared_servers/${friend.id}`
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
    const text = await res.text().catch(()=> '')
    if (!ok) return NextResponse.json({ error: `Unshare failed: ${res.status}`, response: text }, { status: res.status })
    return NextResponse.json({ ok: true, server_id: serverId, friend })
  } catch(e:any){
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}

export const runtime = 'nodejs'

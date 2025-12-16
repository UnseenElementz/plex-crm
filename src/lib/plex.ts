import { createClient } from '@supabase/supabase-js'

function svc(){
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return null
  return createClient(url, key)
}

function plexHeaders(token: string){
  return {
    'X-Plex-Token': token,
    'X-Plex-Client-Identifier': 'plex-crm',
    'X-Plex-Product': 'Plex CRM',
    'X-Plex-Device': 'Web',
    'X-Plex-Platform': 'Web',
    'X-Plex-Version': '1.0',
    'Accept': 'application/xml'
  } as Record<string,string>
}

export interface PlexFriend {
  id: string
  title: string
  username: string
  email: string
  thumb: string
}

export async function getPlexFriends(serverUrl: string, token: string): Promise<PlexFriend[]> {
  try {
    // Try cloud first if serverUrl is just plex.tv
    const isCloud = serverUrl.includes('plex.tv')
    const target = isCloud ? 'https://plex.tv/api/users' : `${serverUrl}/users` // Simplified, actually friends endpoint is better on plex.tv
    
    // Plex.tv API for friends/users
    const res = await fetch('https://plex.tv/api/users', { headers: plexHeaders(token) })
    
    if (!res.ok) throw new Error(`Plex API Error: ${res.status}`)
    const text = await res.text()
    
    // Simple XML parsing since we don't want heavy dependencies
    const matches = text.matchAll(/<User\s+([^>]+)>/g)
    const friends: PlexFriend[] = []
    
    for (const m of matches) {
      const attrs = m[1]
      const id = attrs.match(/id="([^"]+)"/)?.[1] || ''
      const title = attrs.match(/title="([^"]+)"/)?.[1] || ''
      const username = attrs.match(/username="([^"]+)"/)?.[1] || title
      const email = attrs.match(/email="([^"]+)"/)?.[1] || ''
      const thumb = attrs.match(/thumb="([^"]+)"/)?.[1] || ''
      
      if (username) {
        friends.push({ id, title, username, email, thumb })
      }
    }
    
    return friends
  } catch (e) {
    console.error('Plex fetch error:', e)
    return []
  }
}

export interface PlexLibrary {
  id: string
  title: string
  type: string
}

export async function getPlexLibraries(serverUrl: string, token: string): Promise<PlexLibrary[]> {
  try{
    // If serverUrl points to plex.tv, resolve a concrete server connection URI via resources
    let base = serverUrl.replace(/\/+$/,'')
    if (base.includes('plex.tv')) {
      base = await getPreferredServerUri(token)
    }
    const res = await fetch(`${base}/library/sections`, { headers: plexHeaders(token) })
    if (!res.ok) throw new Error(`Libraries fetch failed: ${res.status}`)
    const text = await res.text()
    const matches = text.matchAll(/<Directory\s+([^>]+)>/g)
    const libs: PlexLibrary[] = []
    for (const m of matches) {
      const attrs = m[1]
      const id = attrs.match(/key="([^"]+)"/)?.[1] || ''
      const title = attrs.match(/title="([^"]+)"/)?.[1] || ''
      const type = attrs.match(/type="([^"]+)"/)?.[1] || ''
      if (id && title) libs.push({ id, title, type })
    }
    return libs
  } catch(e){
    console.error('Plex libraries error:', e)
    return []
  }
}

export interface PlexServerInfo {
  id: string
  name: string
  machineIdentifier: string
  owned?: boolean
}

export async function getOwnedServers(token: string): Promise<PlexServerInfo[]> {
  try{
    const res = await fetch('https://plex.tv/api/servers', { headers: plexHeaders(token) })
    if (!res.ok) throw new Error(`Servers fetch failed: ${res.status}`)
    const text = await res.text()
    const matches = text.matchAll(/<Server\s+([^>]+)>/g)
    const list: PlexServerInfo[] = []
    for (const m of matches) {
      const attrs = m[1]
      const owned = attrs.match(/owned="([^"]+)"/)?.[1] === '1'
      const id = attrs.match(/id="([^"]+)"/)?.[1] || ''
      const name = attrs.match(/name="([^"]+)"/)?.[1] || ''
      const machineIdentifier = attrs.match(/machineIdentifier="([^"]+)"/)?.[1] || ''
      if (id) list.push({ id, name, machineIdentifier, owned })
    }
    return list
  } catch(e){
    console.error('Plex servers error:', e)
    return []
  }
}

export async function getPreferredServerUri(token: string): Promise<string> {
  try{
    const res = await fetch('https://plex.tv/pms/resources?includeHttps=1&includeRelay=1&includeManaged=1', { headers: plexHeaders(token) })
    if (!res.ok) throw new Error(`Resources fetch failed: ${res.status}`)
    const text = await res.text()
    // Find first owned server device
    const devMatches = text.matchAll(/<Device\s+([^>]+)>[\s\S]*?<\/Device>/g)
    for (const dm of devMatches) {
      const dAttrs = dm[1]
      const provides = dAttrs.match(/provides="([^"]+)"/)?.[1] || ''
      const owned = dAttrs.match(/owned="([^"]+)"/)?.[1] || '0'
      if (provides.includes('server') && owned === '1') {
        // Prefer local/public connection
        const block = dm[0]
        const connMatches = block.matchAll(/<Connection\s+([^>]+)\/>/g)
        let best: { uri: string; score: number } | null = null
        for (const cm of connMatches) {
          const cAttrs = cm[1]
          const uri = cAttrs.match(/uri="([^"]+)"/)?.[1] || ''
          const local = cAttrs.match(/local="([^"]+)"/)?.[1] === '1'
          const relay = cAttrs.match(/relay="([^"]+)"/)?.[1] === '1'
          const publicConn = cAttrs.match(/public="([^"]+)"/)?.[1] === '1'
          let score = 0
          // Prefer public connection to ensure reachability from CRM server context
          if (publicConn) score = 3
          else if (local) score = 2
          else if (!relay) score = 1
          if (uri) {
            if (!best || score > best.score) best = { uri, score }
          }
        }
        if (best) return best.uri.replace(/\/+$/,'')
      }
    }
    // Fallback to plex.tv (will likely fail for library endpoints)
    return 'https://plex.tv'
  } catch(e){
    console.error('Plex preferred URI error:', e)
    return 'https://plex.tv'
  }
}

export async function getAnyServerIdentifier(token: string): Promise<{ serverId?: string, machineIdentifier?: string } | null> {
  try {
    // Try owned/visible servers first
    const servers = await getOwnedServers(token)
    if (servers.length) return { serverId: servers[0].id, machineIdentifier: servers[0].machineIdentifier }
    // Fallback to resources list to obtain machineIdentifier/clientIdentifier
    const res = await fetch('https://plex.tv/pms/resources?includeHttps=1&includeRelay=1&includeManaged=1', { headers: plexHeaders(token) })
    if (!res.ok) throw new Error(`Resources fetch failed: ${res.status}`)
    const text = await res.text()
    const devMatches = text.matchAll(/<Device\s+([^>]+)>[\s\S]*?<\/Device>/g)
    for (const dm of devMatches) {
      const dAttrs = dm[1]
      const provides = dAttrs.match(/provides="([^"]+)"/)?.[1] || ''
      const owned = dAttrs.match(/owned="([^"]+)"/)?.[1] || '0'
      if (!provides.includes('server')) continue
      const clientIdentifier = dAttrs.match(/clientIdentifier="([^"]+)"/)?.[1] || ''
      const machineIdentifier = dAttrs.match(/machineIdentifier="([^"]+)"/)?.[1] || ''
      // Use clientIdentifier as serverId candidate when server list is empty
      if (clientIdentifier || machineIdentifier) return { serverId: clientIdentifier || machineIdentifier, machineIdentifier }
    }
    return null
  } catch (e) {
    console.error('Plex server identifier error:', e)
    return null
  }
}

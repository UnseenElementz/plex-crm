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

export async function getPlexLibraries(serverUrl: string, token: string): Promise<{ libraries: PlexLibrary[], machineIdentifier: string }> {
  try{
    let base = serverUrl.replace(/\/+$/,'')
    
    // If user provided a specific URL, use it directly first
    if (!base.includes('plex.tv')) {
      try {
        const res = await fetch(`${base}/library/sections`, { headers: plexHeaders(token) })
        if (res.ok) {
          return await parseLibraries(res)
        }
      } catch (e) {
        console.error('Direct server connection failed:', e)
        // Fall through to auto-discovery
      }
    }

    // Auto-discovery via plex.tv resources
    if (base.includes('plex.tv')) {
      const discovered = await getPreferredServerUri(token)
      if (discovered === 'https://plex.tv') {
        throw new Error('Could not resolve Plex Media Server URI. Please ensure the server is claimed and Remote Access is enabled, or set a direct local IP in Settings.')
      }
      base = discovered
    }
    
    // Try connecting to the resolved base
    try {
      const res = await fetch(`${base}/library/sections`, { headers: plexHeaders(token) })
      if (!res.ok) throw new Error(`Libraries fetch failed: ${res.status} ${res.statusText}`)
      return await parseLibraries(res)
    } catch (e: any) {
      // If the auto-resolved URI failed, let's try ONE MORE aggressive fallback:
      console.warn(`Preferred URI ${base} failed, trying all connection candidates...`)
      const candidates = await getAllConnectionCandidates(token)
      for (const uri of candidates) {
        if (uri === base) continue
        try {
          const res2 = await fetch(`${uri}/library/sections`, { headers: plexHeaders(token) })
          if (res2.ok) return await parseLibraries(res2)
        } catch {}
      }
      throw new Error(`Connection failed to ${base}. Checked ${candidates.length} alternative URIs. Last error: ${e.message}`)
    }
  } catch(e: any){
    console.error('Plex libraries error:', e)
    throw new Error(e.message || 'Failed to load libraries')
  }
}

async function parseLibraries(res: Response): Promise<{ libraries: PlexLibrary[], machineIdentifier: string }> {
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
  
  // Try to find machineIdentifier from the root <MediaContainer> tag
  const rootMatch = text.match(/<MediaContainer\s+([^>]+)>/)
  let machineIdentifier = ''
  if (rootMatch) {
    machineIdentifier = rootMatch[1].match(/machineIdentifier="([^"]+)"/)?.[1] || ''
  }
  
  return { libraries: libs, machineIdentifier }
}

// Helper to get ALL possible URIs for owned servers
async function getAllConnectionCandidates(token: string): Promise<string[]> {
  try {
    const res = await fetch('https://plex.tv/pms/resources?includeHttps=1&includeRelay=1&includeManaged=1', { headers: plexHeaders(token) })
    if (!res.ok) return []
    const text = await res.text()
    const uris: string[] = []
    const devMatches = text.matchAll(/<Device\s+([^>]+)>[\s\S]*?<\/Device>/g)
    for (const dm of devMatches) {
      const dAttrs = dm[1]
      const provides = dAttrs.match(/provides="([^"]+)"/)?.[1] || ''
      const owned = dAttrs.match(/owned="([^"]+)"/)?.[1] || '0'
      if (provides.includes('server') && owned === '1') {
        const block = dm[0]
        const connMatches = block.matchAll(/<Connection\s+([^>]+)\/>/g)
        for (const cm of connMatches) {
          const uri = cm[1].match(/uri="([^"]+)"/)?.[1]
          if (uri) uris.push(uri.replace(/\/+$/,''))
        }
      }
    }
    return uris
  } catch { return [] }
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

export async function getPlexSharedSections(token: string, email: string, username?: string, targetMachineId?: string): Promise<string[]> {
  try {
    const servers = await getOwnedServers(token)
    
    // Determine which servers to check
    let machineIds: string[] = []
    
    if (targetMachineId) {
      machineIds.push(targetMachineId)
    } else {
      machineIds = servers.map(s => s.machineIdentifier)
      if (machineIds.length === 0) {
        const any = await getAnyServerIdentifier(token)
        if (any?.machineIdentifier) machineIds.push(any.machineIdentifier)
      }
    }
    
    if (machineIds.length === 0) return []

    // Iterate ALL relevant servers to find the user share
    // We return the first non-empty set of sections found for this user
    for (const machineId of machineIds) {
      const res = await fetch(`https://plex.tv/api/servers/${machineId}/shared_servers`, { headers: plexHeaders(token) })
      if (!res.ok) continue
      const text = await res.text()
      
      // Split by SharedServer tags
      const blocks = text.split('</SharedServer>')
      for (const block of blocks) {
        if (!block.includes('<SharedServer')) continue
        
        const attrsMatch = block.match(/<SharedServer\s+([^>]+)>/)
        if (!attrsMatch) continue
        const attrs = attrsMatch[1]
        
        const uEmail = attrs.match(/email="([^"]+)"/)?.[1] || ''
        const uName = attrs.match(/username="([^"]+)"/)?.[1] || ''
        
        const emailMatch = uEmail && email && uEmail.toLowerCase() === email.toLowerCase()
        const nameMatch = uName && ((username && uName.toLowerCase() === username.toLowerCase()) || (email && uName.toLowerCase() === email.toLowerCase()))
        
        if (emailMatch || nameMatch) {
          // Found user
          const allLibs = attrs.match(/allLibraries="1"/);
          if (allLibs) return ['all'] 
          
          const ids: string[] = []
          const sectionMatches = block.matchAll(/<Section\s+([^>]+)\/>/g)
          for (const sm of sectionMatches) {
            const sAttrs = sm[1]
            // Try all possible ID attributes
            const sKey = sAttrs.match(/sectionKey="([^"]+)"/)?.[1] || sAttrs.match(/key="([^"]+)"/)?.[1] || sAttrs.match(/id="([^"]+)"/)?.[1]
            if (sKey) ids.push(sKey)
          }
          
          // Also try to match non-self-closing Section tags if regex missed them (less common but possible)
          // Actually, let's just return what we found. If ids is empty but user found, maybe they have no libraries shared?
          return ids
        }
      }
    }
    
    return []
  } catch (e) {
    console.error('Plex shared sections error:', e)
    return []
  }
}

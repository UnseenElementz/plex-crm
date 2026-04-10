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
    
    // Plex.tv API for friends/users
    const res = await fetch('https://plex.tv/api/users', { 
      headers: plexHeaders(token),
      cache: 'no-store'
    })
    
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

export async function getAllPlexUsers(token: string): Promise<PlexFriend[]> {
  const usersMap = new Map<string, PlexFriend>()

  // 1. Get Shared Users from all servers (These are people with ACTUAL access)
  try {
    const servers = await getOwnedServers(token)
    for (const server of servers) {
        const res = await fetch(`https://plex.tv/api/servers/${server.machineIdentifier}/shared_servers`, { 
          headers: plexHeaders(token),
          cache: 'no-store'
        })
        if (!res.ok) continue
        const text = await res.text()
        const blocks = text.split('</SharedServer>')
        for (const block of blocks) {
            if (!block.includes('<SharedServer')) continue
            const attrs = block.match(/<SharedServer\s+([^>]+)>/)?.[1] || ''
            const id = attrs.match(/id="([^"]+)"/)?.[1] || ''
            const username = attrs.match(/username="([^"]+)"/)?.[1] || ''
            const email = attrs.match(/email="([^"]+)"/)?.[1] || ''
            const thumb = attrs.match(/thumb="([^"]+)"/)?.[1] || ''
            const userID = attrs.match(/userID="([^"]+)"/)?.[1] || id 

            if (username || email) {
                const key = email ? email.toLowerCase() : username.toLowerCase()
                // If they are in shared_servers, they have access.
                if (!usersMap.has(key)) {
                    usersMap.set(key, { id: userID, title: username, username, email, thumb })
                }
            }
        }
    }
  } catch (e) {
      console.error('Error fetching shared users:', e)
  }

  // 2. Get Friends (Optional: only use to augment data, or if no servers found)
  // We'll skip adding friends who aren't already in usersMap to avoid "old members"
  // unless the map is completely empty (maybe no servers yet?)
  try {
    const friends = await getPlexFriends('https://plex.tv', token)
    friends.forEach(f => {
        const key = f.email ? f.email.toLowerCase() : f.username.toLowerCase()
        if (usersMap.has(key)) {
            // Augment existing entry with friend data if needed
            const existing = usersMap.get(key)!
            usersMap.set(key, {
                ...existing,
                email: existing.email || f.email,
                thumb: existing.thumb || f.thumb
            })
        }
    })
  } catch {}

  return Array.from(usersMap.values())
}

export async function getActivePlexUsernameMap(): Promise<Map<string, string>> {
  const supabase = svc()
  if (!supabase) return new Map()

  const { data: settings } = await supabase.from('admin_settings').select('plex_token').eq('id', 1).maybeSingle()
  const token = String(settings?.plex_token || '').trim()
  if (!token) return new Map()

  const friends = await getAllPlexUsers(token)
  const usernames = new Map<string, string>()
  for (const friend of friends) {
    const email = String(friend.email || '').trim().toLowerCase()
    const username = String(friend.username || friend.title || '').trim()
    if (!email || !username) continue
    usernames.set(email, username)
  }

  return usernames
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
        const candidates = await getServerUrisFromApiServers(token)
        if (!candidates.length) {
          throw new Error('Could not resolve Plex Media Server URI. Please ensure the server is claimed and Remote Access is enabled, or set a direct local IP in Settings.')
        }
        base = candidates[0]
      } else {
        base = discovered
      }
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
      const fromServers = await getServerUrisFromApiServers(token)
      for (const u of fromServers) candidates.push(u)
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

async function getServerUrisFromApiServers(token: string): Promise<string[]> {
  try{
    const res = await fetch('https://plex.tv/api/servers', { headers: plexHeaders(token), cache: 'no-store' })
    if (!res.ok) return []
    const text = await res.text()
    const matches = text.matchAll(/<Server\s+([^>]+)\/>/g)
    const out: string[] = []
    for (const m of matches) {
      const attrs = m[1]
      const owned = attrs.match(/owned="([^"]+)"/)?.[1] === '1'
      if (!owned) continue
      const scheme = attrs.match(/scheme="([^"]+)"/)?.[1] || 'http'
      const address = attrs.match(/address="([^"]+)"/)?.[1] || attrs.match(/host="([^"]+)"/)?.[1] || ''
      const port = attrs.match(/port="([^"]+)"/)?.[1] || '32400'
      const machineIdentifier = attrs.match(/machineIdentifier="([^"]+)"/)?.[1] || ''
      if (!address) continue
      const primary = `${scheme}://${address}:${port}`
      out.push(primary)
      if (scheme === 'http') out.push(`https://${address}:${port}`)
      if (scheme === 'https') out.push(`http://${address}:${port}`)
      if (machineIdentifier) out.push(`https://${machineIdentifier}.plex.direct:${port}`)
    }
    return Array.from(new Set(out.map(u => u.replace(/\/+$/,''))))
  } catch {
    return []
  }
}

export async function getPlexLibrariesForMachine(serverUrl: string, token: string, targetMachineId: string): Promise<{ libraries: PlexLibrary[], machineIdentifier: string }> {
  try{
    let base = serverUrl.replace(/\/+$/,'')
    if (!base.includes('plex.tv')) {
      try {
        const res = await fetch(`${base}/library/sections`, { headers: plexHeaders(token) })
        if (res.ok) return await parseLibraries(res)
      } catch {}
    }

    const uri = await getServerUriForMachine(token, targetMachineId)
    if (uri) {
      const res = await fetch(`${uri}/library/sections`, { headers: plexHeaders(token) })
      if (res.ok) return await parseLibraries(res)
    }

    const candidates = [
      ...(await getAllConnectionCandidates(token)),
      ...(await getServerUrisFromApiServers(token))
    ]
    for (const u of candidates) {
      try {
        const res2 = await fetch(`${u}/library/sections`, { headers: plexHeaders(token) })
        if (!res2.ok) continue
        const parsed = await parseLibraries(res2)
        if (parsed.machineIdentifier && parsed.machineIdentifier === targetMachineId) return parsed
      } catch {}
    }
    return await getPlexLibraries(serverUrl, token)
  } catch(e: any){
    throw new Error(e.message || 'Failed to load libraries')
  }
}

async function getServerUriForMachine(token: string, machineIdentifier: string): Promise<string | null> {
  try{
    const res = await fetch('https://plex.tv/pms/resources?includeHttps=1&includeRelay=1&includeManaged=1', {
      headers: plexHeaders(token),
      cache: 'no-store'
    })
    if (!res.ok) return null
    const text = await res.text()
    const devMatches = text.matchAll(/<Device\s+([^>]+)>[\s\S]*?<\/Device>/g)
    for (const dm of devMatches) {
      const dAttrs = dm[1]
      const provides = dAttrs.match(/provides="([^"]+)"/)?.[1] || ''
      const owned = dAttrs.match(/owned="([^"]+)"/)?.[1] || '0'
      const mid = dAttrs.match(/machineIdentifier="([^"]+)"/)?.[1] || ''
      if (!provides.includes('server') || owned !== '1') continue
      if (mid !== machineIdentifier) continue
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
        if (publicConn) score = 3
        else if (local) score = 2
        else if (!relay) score = 1
        if (uri) {
          if (!best || score > best.score) best = { uri, score }
        }
      }
      if (best) return best.uri.replace(/\/+$/,'')
    }
    return null
  } catch {
    return null
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
    const res = await fetch('https://plex.tv/pms/resources?includeHttps=1&includeRelay=1&includeManaged=1', { 
      headers: plexHeaders(token),
      cache: 'no-store'
    })
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
    const res = await fetch('https://plex.tv/api/servers', { 
      headers: plexHeaders(token),
      cache: 'no-store'
    })
    if (!res.ok) throw new Error(`Servers fetch failed: ${res.status}`)
    const text = await res.text()
    const matches = text.matchAll(/<Server\s+([^>]+)>/g)
    const list: PlexServerInfo[] = []
    for (const m of matches) {
      const attrs = m[1]
      const owned = attrs.match(/owned="([^"]+)"/)?.[1] === '1'
      const name = attrs.match(/name="([^"]+)"/)?.[1] || ''
      const machineIdentifier = attrs.match(/machineIdentifier="([^"]+)"/)?.[1] || ''
      const id = attrs.match(/id="([^"]+)"/)?.[1] || machineIdentifier
      if (owned && id && machineIdentifier) list.push({ id, name, machineIdentifier, owned })
    }
    if (list.length) return list

    const r2 = await fetch('https://plex.tv/pms/resources?includeHttps=1&includeRelay=1&includeManaged=1', {
      headers: plexHeaders(token),
      cache: 'no-store'
    })
    if (!r2.ok) return []
    const t2 = await r2.text()
    const out: PlexServerInfo[] = []
    const devMatches = t2.matchAll(/<Device\s+([^>]+)>[\s\S]*?<\/Device>/g)
    for (const dm of devMatches) {
      const dAttrs = dm[1]
      const provides = dAttrs.match(/provides="([^"]+)"/)?.[1] || ''
      const owned = dAttrs.match(/owned="([^"]+)"/)?.[1] === '1'
      if (!provides.includes('server') || !owned) continue
      const name = dAttrs.match(/name="([^"]+)"/)?.[1] || ''
      const machineIdentifier = dAttrs.match(/machineIdentifier="([^"]+)"/)?.[1] || ''
      const id = dAttrs.match(/clientIdentifier="([^"]+)"/)?.[1] || machineIdentifier
      if (id && machineIdentifier) out.push({ id, name, machineIdentifier, owned: true })
    }
    return out
  } catch(e){
    console.error('Plex servers error:', e)
    return []
  }
}

export async function removePlexSharesByEmail(token: string, email: string) {
  const target = String(email || '').trim().toLowerCase()
  if (!token || !target) {
    return {
      removed: [] as Array<{ server_machine_id: string; share_id: string }>,
      failures: [] as Array<{ server_machine_id: string; share_id?: string; status?: number; error: string }>,
    }
  }

  const removed: Array<{ server_machine_id: string; share_id: string }> = []
  const failures: Array<{ server_machine_id: string; share_id?: string; status?: number; error: string }> = []
  const servers = await getOwnedServers(token)

  for (const server of servers) {
    const listResponse = await fetch(`https://plex.tv/api/servers/${server.machineIdentifier}/shared_servers`, {
      headers: plexHeaders(token),
      cache: 'no-store',
    })

    if (!listResponse.ok) {
      failures.push({
        server_machine_id: server.machineIdentifier,
        status: listResponse.status,
        error: 'Failed to fetch shared_servers',
      })
      continue
    }

    const xml = await listResponse.text()
    const matches = [...xml.matchAll(/<SharedServer\s+([^>]+)>/g)].map((match) => match[1])

    for (const attrs of matches) {
      const shareEmail = attrs.match(/email="([^"]+)"/)?.[1] || ''
      if (String(shareEmail).trim().toLowerCase() !== target) continue

      const shareId = attrs.match(/id="([^"]+)"/)?.[1] || ''
      if (!shareId) continue

      const deleteResponse = await fetch(`https://plex.tv/api/servers/${server.machineIdentifier}/shared_servers/${shareId}`, {
        method: 'DELETE',
        headers: plexHeaders(token),
        cache: 'no-store',
      })

      if (deleteResponse.ok) {
        removed.push({ server_machine_id: server.machineIdentifier, share_id: shareId })
        continue
      }

      failures.push({
        server_machine_id: server.machineIdentifier,
        share_id: shareId,
        status: deleteResponse.status,
        error: 'Delete failed',
      })
    }
  }

  return { removed, failures }
}

export async function getPreferredServerUri(token: string): Promise<string> {
  try{
    const res = await fetch('https://plex.tv/pms/resources?includeHttps=1&includeRelay=1&includeManaged=1', { 
      headers: plexHeaders(token),
      cache: 'no-store'
    })
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

export async function getServerIdentifierFromUrl(url: string, token: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: plexHeaders(token) })
    if (!res.ok) return null
    const text = await res.text()
    const match = text.match(/machineIdentifier="([^"]+)"/)
    return match ? match[1] : null
  } catch {
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

export interface PlexSessionRow {
  sessionKey: string
  title: string
  type: string
  user: string
  player: string
  product: string
  state: string
  ip: string
  startedAt: string | null
  transcodeDecision: string
  videoDecision: string
  audioDecision: string
}

export async function getPlexSessions(serverUrl: string, token: string): Promise<PlexSessionRow[]> {
  try {
    let base = serverUrl.replace(/\/+$/, '')
    if (base.includes('plex.tv')) {
      base = await getPreferredServerUri(token)
    }
    const res = await fetch(`${base}/status/sessions`, { headers: plexHeaders(token), cache: 'no-store' })
    if (!res.ok) throw new Error(`Sessions fetch failed: ${res.status}`)
    const text = await res.text()
    const blocks = text.split('</Video>')
    const rows: PlexSessionRow[] = []

    for (const block of blocks) {
      if (!block.includes('<Video')) continue
      const attrs = block.match(/<Video\s+([^>]+)>/)?.[1] || ''
      const userAttrs = block.match(/<User\s+([^>]+)\/>/)?.[1] || ''
      const playerAttrs = block.match(/<Player\s+([^>]+)\/>/)?.[1] || ''
      const sessionAttrs = block.match(/<Session\s+([^>]+)\/>/)?.[1] || ''
      const transcodeAttrs = block.match(/<TranscodeSession\s+([^>]+)\/>/)?.[1] || ''

      const title = attrs.match(/grandparentTitle="([^"]+)"/)?.[1] || attrs.match(/title="([^"]+)"/)?.[1] || 'Unknown'
      const mediaTitle = attrs.match(/title="([^"]+)"/)?.[1] || ''
      const type = attrs.match(/type="([^"]+)"/)?.[1] || 'video'
      const user = userAttrs.match(/title="([^"]+)"/)?.[1] || userAttrs.match(/username="([^"]+)"/)?.[1] || ''
      const player = playerAttrs.match(/title="([^"]+)"/)?.[1] || playerAttrs.match(/device="([^"]+)"/)?.[1] || ''
      const product = playerAttrs.match(/product="([^"]+)"/)?.[1] || ''
      const state = playerAttrs.match(/state="([^"]+)"/)?.[1] || ''
      const ip = playerAttrs.match(/address="([^"]+)"/)?.[1] || ''
      const startedAtRaw = sessionAttrs.match(/startedAt="([^"]+)"/)?.[1] || ''
      const transcodeDecision = transcodeAttrs ? 'transcode' : 'direct'
      const videoDecision = transcodeAttrs.match(/videoDecision="([^"]+)"/)?.[1] || (transcodeAttrs ? 'transcode' : 'direct play')
      const audioDecision = transcodeAttrs.match(/audioDecision="([^"]+)"/)?.[1] || (transcodeAttrs ? 'transcode' : 'direct play')
      const sessionKey = sessionAttrs.match(/id="([^"]+)"/)?.[1] || attrs.match(/ratingKey="([^"]+)"/)?.[1] || `${user}-${title}-${ip}`

      rows.push({
        sessionKey,
        title: mediaTitle ? `${title}${mediaTitle !== title ? ` / ${mediaTitle}` : ''}` : title,
        type,
        user,
        player,
        product,
        state,
        ip,
        startedAt: startedAtRaw ? new Date(Number(startedAtRaw) * 1000).toISOString() : null,
        transcodeDecision,
        videoDecision,
        audioDecision,
      })
    }

    return rows
  } catch (e) {
    console.error('Plex sessions error:', e)
    return []
  }
}

export async function terminatePlexSessions(serverUrl: string, token: string, sessionKeys: string[], reason: string) {
  const keys = Array.from(new Set((sessionKeys || []).map((value) => String(value || '').trim()).filter(Boolean)))
  if (!keys.length) return { stopped: 0, failed: [] as string[] }

  let base = serverUrl.replace(/\/+$/, '')
  if (base.includes('plex.tv')) {
    base = await getPreferredServerUri(token)
  }

  const failed: string[] = []
  let stopped = 0

  for (const sessionKey of keys) {
    const endpoint = `${base}/status/sessions/terminate?sessionId=${encodeURIComponent(sessionKey)}&reason=${encodeURIComponent(reason)}`
    try {
      const res = await fetch(endpoint, { method: 'GET', headers: plexHeaders(token), cache: 'no-store' })
      if (res.ok) stopped += 1
      else failed.push(sessionKey)
    } catch {
      failed.push(sessionKey)
    }
  }

  return { stopped, failed }
}

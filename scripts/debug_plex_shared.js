const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) return
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) process.env[m[1]] = m[2]
  }
}

function plexHeaders(token) {
  return {
    'X-Plex-Token': token,
    'X-Plex-Client-Identifier': 'plex-crm',
    'X-Plex-Product': 'Plex CRM',
    'X-Plex-Device': 'Web',
    'X-Plex-Platform': 'Web',
    'X-Plex-Version': '1.0',
    Accept: 'application/xml'
  }
}

async function main() {
  loadEnvLocal()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env')
  const supabase = createClient(url, key, { auth: { persistSession: false } })
  const { data } = await supabase.from('admin_settings').select('plex_token').eq('id', 1).maybeSingle()
  const token = data?.plex_token
  if (!token) throw new Error('No plex_token in admin_settings')

  const target = (process.argv[2] || '').toLowerCase()
  if (!target) throw new Error('Pass email to check as argv[2]')

  const serversXml = await (await fetch('https://plex.tv/api/servers', { headers: plexHeaders(token) })).text()
  const serverAttrs = [...serversXml.matchAll(/<Server\s+([^>]+)\/>/g)].map((m) => m[1])
  const servers = serverAttrs
    .map((a) => ({
      name: (a.match(/name="([^"]+)"/) || [])[1] || '',
      machine: (a.match(/machineIdentifier="([^"]+)"/) || [])[1] || '',
      owned: (a.match(/owned="([^"]+)"/) || [])[1] === '1'
    }))
    .filter((s) => s.owned && s.machine)

  console.log('ownedServers', servers.map((s) => `${s.name}:${s.machine}`).join(' | ') || '(none)')

  for (const srv of servers) {
    const xml = await (await fetch(`https://plex.tv/api/servers/${srv.machine}/shared_servers`, { headers: plexHeaders(token) })).text()
    const entries = [...xml.matchAll(/<SharedServer\s+([^>]+)>/g)].map((m) => m[1])
    const matches = entries.filter((attrs) => ((attrs.match(/email="([^"]+)"/) || [])[1] || '').toLowerCase() === target)
    if (matches.length) {
      console.log('FOUND_ON', srv.name, 'count', matches.length)
      console.log(matches[0])
    }
  }
}

main().catch((e) => {
  console.error(String(e?.message || e))
  process.exit(1)
})


import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

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
    'Accept': 'application/xml'
  } as Record<string, string>
}

function parseAttrs(attrs: string) {
  const out: Record<string, string> = {}
  const re = /([a-zA-Z0-9_:-]+)="([^"]*)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(attrs))) {
    out[m[1]] = m[2]
  }
  return out
}

export async function GET(){
  try{
    if (cookies().get('admin_session')?.value !== '1') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const supabase = svc()
    if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })

    const { data: settings, error: setErr } = await supabase.from('admin_settings').select('plex_token,plex_server_url').eq('id', 1).maybeSingle()
    if (setErr) return NextResponse.json({ error: setErr.message }, { status: 500 })
    const token = String(settings?.plex_token || '').trim()
    if (!token) return NextResponse.json({ error: 'Plex token not set in Settings' }, { status: 400 })
    const serversRes = await fetch(`https://plex.tv/api/servers`, { headers: plexHeaders(token), cache: 'no-store' })
    if (!serversRes.ok) {
      const txt = await serversRes.text().catch(()=> '')
      return NextResponse.json({ error: `Plex servers fetch failed: ${serversRes.status}`, response: txt.slice(0, 500) }, { status: 502 })
    }
    const serversXml = await serversRes.text()
    const serverAttrs = [...serversXml.matchAll(/<Server\s+([^>]+)\/>/g)].map(m => m[1])
    const servers = serverAttrs
      .map(a => {
        const at = parseAttrs(a)
        const owned = String(at.owned || '') === '1'
        const machineIdentifier = String(at.machineIdentifier || '')
        const name = String(at.name || '')
        return { owned, machineIdentifier, name }
      })
      .filter(s => s.owned && s.machineIdentifier)

    if (!servers.length) {
      return NextResponse.json({ error: 'No owned Plex servers returned by plex.tv for this token. If Plex is having an outage, try again later.' }, { status: 502 })
    }

    const items: any[] = []
    for (const srv of servers) {
      const r = await fetch(`https://plex.tv/api/servers/${srv.machineIdentifier}/shared_servers`, { headers: plexHeaders(token), cache: 'no-store' })
      if (!r.ok) {
        const txt = await r.text().catch(()=> '')
        return NextResponse.json({ error: `Plex shared_servers fetch failed: ${r.status}`, response: txt.slice(0, 500) }, { status: 502 })
      }
      const xml = await r.text()
      const matches = [...xml.matchAll(/<SharedServer\s+([^>]+)>/g)].map(m => m[1])
      for (const attrs of matches) {
        const at = parseAttrs(attrs)
        const email = String(at.email || '')
        items.push({
          server_name: srv.name || srv.machineIdentifier,
          server_machine_id: srv.machineIdentifier,
          email,
          username: String(at.username || ''),
          share_id: String(at.id || ''),
          plex_user_id: String(at.userID || ''),
          all_libraries: at.allLibraries !== undefined ? String(at.allLibraries) === '1' : null,
          allow_sync: at.allowSync !== undefined ? String(at.allowSync) === '1' : null,
          allow_tuners: at.allowTuners !== undefined ? String(at.allowTuners) === '1' : null,
          allow_channels: at.allowChannels !== undefined ? String(at.allowChannels) === '1' : null,
          allow_camera_upload: at.allowCameraUpload !== undefined ? String(at.allowCameraUpload) === '1' : null,
          allow_subtitle_admin: at.allowSubtitleAdmin !== undefined ? String(at.allowSubtitleAdmin) === '1' : null,
          filter_all: at.filterAll !== undefined ? String(at.filterAll) : null,
          filter_movies: at.filterMovies !== undefined ? String(at.filterMovies) : null,
          filter_television: at.filterTelevision !== undefined ? String(at.filterTelevision) : null,
          accepted_at: (() => {
            const n = Number(at.acceptedAt)
            return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : null
          })(),
          invited_at: (() => {
            const n = Number(at.invitedAt)
            return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : null
          })(),
          raw: at
        })
      }
    }

    try{
      const emails = Array.from(new Set(items.map(i => String(i.email || '').toLowerCase()).filter(Boolean)))
      const map = new Map<string, string>()
      const CHUNK = 200
      for (let i = 0; i < emails.length; i += CHUNK) {
        const chunk = emails.slice(i, i + CHUNK)
        const { data } = await supabase.from('customers').select('email,name').in('email', chunk)
        for (const row of (data || []) as any[]) {
          const e = String(row?.email || '').toLowerCase()
          const n = String(row?.name || '').trim()
          if (e && n) map.set(e, n)
        }
      }
      items.forEach(i => {
        const key = String(i.email || '').toLowerCase()
        i.customer_name = map.get(key) || null
      })
    } catch {}

    return NextResponse.json({ ok: true, items })
  }catch(e: any){
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { syncCustomerDownloads } from '@/lib/moderation'

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
  while ((m = re.exec(attrs))) out[m[1]] = m[2]
  return out
}

export async function POST(request: Request){
  try{
    if (cookies().get('admin_session')?.value !== '1') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const supabase = svc()
    if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })

    const body = await request.json().catch(()=>({}))
    const email = String(body?.email || '').trim()
    if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })
    const target = email.toLowerCase()

    const { data: settings } = await supabase.from('admin_settings').select('plex_token').eq('id', 1).maybeSingle()
    const token = String(settings?.plex_token || '').trim()
    if (!token) return NextResponse.json({ error: 'Plex token not set in Settings' }, { status: 400 })

    const serversRes = await fetch('https://plex.tv/api/servers', { headers: plexHeaders(token), cache: 'no-store' })
    if (!serversRes.ok) return NextResponse.json({ error: `Plex servers fetch failed: ${serversRes.status}` }, { status: 502 })
    const serversXml = await serversRes.text()
    const serverAttrs = [...serversXml.matchAll(/<Server\s+([^>]+)\/>/g)].map(m => m[1])
    const servers = serverAttrs
      .map(a => {
        const at = parseAttrs(a)
        return {
          owned: String(at.owned || '') === '1',
          machine: String(at.machineIdentifier || ''),
          name: String(at.name || '')
        }
      })
      .filter(s => s.owned && s.machine)

    const removed: Array<{ server_machine_id: string; share_id: string }> = []
    const failures: Array<{ server_machine_id: string; share_id?: string; status?: number; error: string }> = []

    for (const srv of servers) {
      const r = await fetch(`https://plex.tv/api/servers/${srv.machine}/shared_servers`, { headers: plexHeaders(token), cache: 'no-store' })
      if (!r.ok) {
        failures.push({ server_machine_id: srv.machine, status: r.status, error: 'Failed to fetch shared_servers' })
        continue
      }
      const xml = await r.text()
      const entries = [...xml.matchAll(/<SharedServer\s+([^>]+)>/g)].map(m => parseAttrs(m[1]))
      const matches = entries.filter(at => String(at.email || '').toLowerCase() === target)
      for (const at of matches) {
        const shareId = String(at.id || '').trim()
        if (!shareId) continue
        const del = await fetch(`https://plex.tv/api/servers/${srv.machine}/shared_servers/${shareId}`, { method: 'DELETE', headers: plexHeaders(token), cache: 'no-store' })
        if (del.status >= 200 && del.status < 300) {
          removed.push({ server_machine_id: srv.machine, share_id: shareId })
          try{
            await supabase.from('plex_audit_logs').insert({
              id: crypto.randomUUID(),
              action: 'plex_share_remove_by_email',
              email,
              server_machine_id: srv.machine,
              share_id: shareId,
              details: { server_name: srv.name || null }
            })
          } catch {}
        } else {
          failures.push({ server_machine_id: srv.machine, share_id: shareId, status: del.status, error: 'Delete failed' })
        }
      }
    }

    if (removed.length) {
      await syncCustomerDownloads(email, false)
    }

    return NextResponse.json({ ok: true, removed, failures })
  } catch(e: any){
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

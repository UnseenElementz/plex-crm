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

export async function POST(request: Request){
  try{
    if (cookies().get('admin_session')?.value !== '1') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const supabase = svc()
    if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })

    const body = await request.json().catch(()=>({}))
    const machineIdentifier = String(body?.server_machine_id || '').trim()
    const shareId = String(body?.share_id || '').trim()
    if (!machineIdentifier) return NextResponse.json({ error: 'server_machine_id required' }, { status: 400 })
    if (!shareId) return NextResponse.json({ error: 'share_id required' }, { status: 400 })

    const { data: as, error: asErr } = await supabase.from('admin_settings').select('plex_token').eq('id', 1).maybeSingle()
    if (asErr) return NextResponse.json({ error: asErr.message }, { status: 500 })
    const token = String(as?.plex_token || '').trim()
    if (!token) return NextResponse.json({ error: 'Plex token not set in Settings' }, { status: 400 })

    const url = `https://plex.tv/api/servers/${machineIdentifier}/shared_servers/${shareId}`
    const res = await fetch(url, { method: 'DELETE', headers: plexHeaders(token), cache: 'no-store' })
    const txt = await res.text().catch(()=> '')
    const ok = res.status >= 200 && res.status < 300
    if (!ok) return NextResponse.json({ error: `Remove failed: ${res.status}`, response: txt }, { status: 400 })
    try{
      await supabase.from('plex_audit_logs').insert({
        id: crypto.randomUUID(),
        action: 'plex_share_remove',
        email: null,
        server_machine_id: machineIdentifier,
        share_id: shareId,
        details: {}
      })
    } catch {}
    return NextResponse.json({ ok: true })
  } catch(e: any){
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { syncCustomerDownloads } from '@/lib/moderation'

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

function plexHeaders(token: string) {
  return {
    'X-Plex-Token': token,
    'X-Plex-Client-Identifier': 'plex-crm',
    'X-Plex-Product': 'Plex CRM',
    'X-Plex-Device': 'Web',
    'X-Plex-Platform': 'Web',
    'X-Plex-Version': '1.0',
    Accept: 'application/xml',
  } as Record<string, string>
}

function parseAttrs(attrs: string) {
  const out: Record<string, string> = {}
  const re = /([a-zA-Z0-9_:-]+)="([^"]*)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(attrs))) out[m[1]] = m[2]
  return out
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    if (cookies().get('admin_session')?.value !== '1') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = svc()
    if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })

    const body = await request.json().catch(() => ({}))
    const machineIdentifier = String(body?.server_machine_id || '').trim()
    const shareId = String(body?.share_id || '').trim()
    const email = String(body?.email || '').trim().toLowerCase()
    const plexUserId = String(body?.plex_user_id || '').trim()

    if (!machineIdentifier) {
      return NextResponse.json({ error: 'server_machine_id required' }, { status: 400 })
    }
    if (!shareId && !email && !plexUserId) {
      return NextResponse.json({ error: 'share_id, email, or plex_user_id required' }, { status: 400 })
    }

    const { data: settings, error: settingsError } = await supabase
      .from('admin_settings')
      .select('plex_token')
      .eq('id', 1)
      .maybeSingle()

    if (settingsError) return NextResponse.json({ error: settingsError.message }, { status: 500 })
    const token = String(settings?.plex_token || '').trim()
    if (!token) return NextResponse.json({ error: 'Plex token not set in Settings' }, { status: 400 })

    const listRes = await fetch(`https://plex.tv/api/servers/${machineIdentifier}/shared_servers`, {
      headers: plexHeaders(token),
      cache: 'no-store',
    })
    const listTxt = await listRes.text().catch(() => '')
    if (!listRes.ok) {
      return NextResponse.json(
        { error: `Plex shared_servers fetch failed: ${listRes.status}`, response: listTxt.slice(0, 500) },
        { status: 502 }
      )
    }

    const blocks = listTxt.split('</SharedServer>')
    let matched: Record<string, string> | null = null
    for (const block of blocks) {
      if (!block.includes('<SharedServer')) continue
      const attrs = parseAttrs(block.match(/<SharedServer\s+([^>]+)>/)?.[1] || '')
      const listedShareId = String(attrs.id || '').trim()
      const listedEmail = String(attrs.email || '').trim().toLowerCase()
      const listedUserId = String(attrs.userID || attrs.userId || '').trim()
      if (
        (shareId && listedShareId === shareId) ||
        (email && listedEmail === email) ||
        (plexUserId && listedUserId === plexUserId)
      ) {
        matched = attrs
        break
      }
    }

    if (!matched) {
      return NextResponse.json({ error: 'Share not found on Plex' }, { status: 404 })
    }

    const matchedEmail = String(matched.email || '').trim().toLowerCase()
    const downloadsEnabled = String(matched.allowSync || '') === '1'
    if (matchedEmail) {
      await syncCustomerDownloads(matchedEmail, downloadsEnabled)
    }

    try {
      await supabase.from('plex_audit_logs').insert({
        id: crypto.randomUUID(),
        action: 'plex_share_downloads_sync',
        email: matchedEmail || null,
        server_machine_id: machineIdentifier,
        share_id: String(matched.id || '').trim() || null,
        details: { allow_sync: downloadsEnabled, source: 'plex_live' },
      })
    } catch {}

    return NextResponse.json({
      ok: true,
      email: matchedEmail,
      allow_sync: downloadsEnabled,
      share_id: String(matched.id || '').trim(),
      username: String(matched.username || '').trim(),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}

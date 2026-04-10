import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { getPreferredServerUri } from '@/lib/plex'

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
}

function plexHeaders(token: string) {
  return {
    'X-Plex-Token': token,
    Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    'X-Plex-Client-Identifier': 'plex-crm',
    'X-Plex-Product': 'Plex CRM',
    'X-Plex-Device': 'Web',
    'X-Plex-Platform': 'Web',
    'X-Plex-Version': '1.0',
  } as Record<string, string>
}

async function resolveBaseUrl(serverUrl: string, token: string) {
  const clean = String(serverUrl || '').trim().replace(/\/+$/, '')
  if (clean && !clean.includes('plex.tv')) return clean
  const discovered = await getPreferredServerUri(token)
  return String(discovered || clean || 'https://plex.tv').trim().replace(/\/+$/, '') || 'https://plex.tv'
}

export async function GET(request: Request) {
  try {
    if (cookies().get('admin_session')?.value !== '1') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const path = String(new URL(request.url).searchParams.get('path') || '').trim()
    if (!path) return NextResponse.json({ error: 'path required' }, { status: 400 })

    const supabase = svc()
    if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })

    const { data: settings, error } = await supabase
      .from('admin_settings')
      .select('plex_token,plex_server_url')
      .eq('id', 1)
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const token = String(settings?.plex_token || '').trim()
    const serverUrl = String(settings?.plex_server_url || 'https://plex.tv').trim() || 'https://plex.tv'
    if (!token) return NextResponse.json({ error: 'Plex token not configured' }, { status: 400 })

    const target =
      /^https?:\/\//i.test(path)
        ? path
        : `${await resolveBaseUrl(serverUrl, token)}${path.startsWith('/') ? path : `/${path}`}`

    const upstream = await fetch(target, { headers: plexHeaders(token), cache: 'no-store' })
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: `fetch ${upstream.status}` }, { status: 502 })
    }

    const response = new NextResponse(upstream.body, { status: 200 })
    response.headers.set('Content-Type', upstream.headers.get('content-type') || 'image/jpeg')
    response.headers.set('Cache-Control', 'private, max-age=300')
    return response
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to load Plex artwork' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

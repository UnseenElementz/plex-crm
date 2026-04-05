import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { getPlexSessions } from '@/lib/plex'

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return null
  return createClient(url, key)
}

export async function GET() {
  try {
    if (cookies().get('admin_session')?.value !== '1') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const s = svc()
    if (!s) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })

    const { data: settings } = await s
      .from('admin_settings')
      .select('plex_token,plex_server_url,ip_logs,blocked_ips')
      .eq('id', 1)
      .maybeSingle()
    const token = String(settings?.plex_token || '').trim()
    const url = String(settings?.plex_server_url || 'https://plex.tv').trim() || 'https://plex.tv'
    if (!token) return NextResponse.json({ error: 'Plex token not configured' }, { status: 400 })

    const [sessions, customers] = await Promise.all([
      getPlexSessions(url, token),
      s.from('customers').select('email,name,streams'),
    ])

    const customerMap = new Map<string, { email: string; name: string; streams: number }>()
    for (const row of customers.data || []) {
      const email = String((row as any).email || '').trim().toLowerCase()
      if (!email) continue
      customerMap.set(email, {
        email,
        name: String((row as any).name || '').trim(),
        streams: Number((row as any).streams || 1) || 1,
      })
    }

    const grouped = new Map<string, number>()
    for (const session of sessions) {
      const key = String(session.user || '').trim().toLowerCase()
      grouped.set(key, (grouped.get(key) || 0) + 1)
    }

    const blockedIps = Array.isArray(settings?.blocked_ips) ? settings.blocked_ips : []
    const items = sessions.map((session) => {
      const key = String(session.user || '').trim().toLowerCase()
      const customer = customerMap.get(key)
      const activeStreams = grouped.get(key) || 1
      const allowedStreams = customer?.streams || 1
      return {
        ...session,
        customer_name: customer?.name || null,
        customer_email: customer?.email || session.user || null,
        allowed_streams: allowedStreams,
        active_streams: activeStreams,
        over_limit: activeStreams > allowedStreams,
        ip_blocked: Boolean(session.ip && blockedIps.includes(session.ip)),
      }
    })

    const ipLogs =
      settings?.ip_logs && typeof settings.ip_logs === 'object'
        ? { ...(settings.ip_logs as Record<string, string[]>) }
        : {}

    for (const item of items) {
      const email = String(item.customer_email || '').trim().toLowerCase()
      const ip = String(item.ip || '').trim()
      if (!email || !ip || !email.includes('@')) continue
      const existing = Array.isArray(ipLogs[email]) ? ipLogs[email].map((value) => String(value)) : []
      if (!existing.includes(ip)) {
        ipLogs[email] = [ip, ...existing].slice(0, 20)
      }
    }

    await Promise.allSettled([
      s.from('admin_settings').update({ ip_logs: ipLogs }).eq('id', 1),
      items.length
        ? s.from('plex_audit_logs').upsert(
            items.map((item) => ({
              id: `session:${item.sessionKey}:${new Date().toISOString().slice(0, 16)}`,
              action: 'session_seen',
              email: item.customer_email,
              share_id: item.sessionKey,
              details: {
                title: item.title,
                type: item.type,
                user: item.user,
                customer_name: item.customer_name,
                customer_email: item.customer_email,
                player: item.player,
                product: item.product,
                state: item.state,
                ip: item.ip,
                started_at: item.startedAt,
                transcode_decision: item.transcodeDecision,
                video_decision: item.videoDecision,
                audio_decision: item.audioDecision,
                allowed_streams: item.allowed_streams,
                active_streams: item.active_streams,
                over_limit: item.over_limit,
              },
            })),
            { onConflict: 'id' }
          )
        : Promise.resolve(),
    ])

    const { data: historyRows } = await s
      .from('plex_audit_logs')
      .select('id,created_at,email,details')
      .eq('action', 'session_seen')
      .order('created_at', { ascending: false })
      .limit(24)

    const history = (historyRows || []).map((row: any) => ({
      id: String(row.id || ''),
      created_at: row.created_at,
      email: row.email || row.details?.customer_email || null,
      customer_name: row.details?.customer_name || null,
      title: row.details?.title || 'Unknown',
      player: row.details?.player || '',
      product: row.details?.product || '',
      state: row.details?.state || '',
      ip: row.details?.ip || '',
      started_at: row.details?.started_at || null,
      over_limit: Boolean(row.details?.over_limit),
    }))

    return NextResponse.json({
      items,
      history,
      total: items.length,
      flagged: items.filter((item) => item.over_limit).length,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to load Plex sessions' }, { status: 500 })
  }
}

export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { sendStreamKilledEmail } from '@/lib/email'
import { terminatePlexSessions } from '@/lib/plex'
import { addAuditLog } from '@/lib/moderation'

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

export async function POST(request: Request) {
  try {
    if (cookies().get('admin_session')?.value !== '1') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = svc()
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
    }

    const body = await request.json().catch(() => ({}))
    const sessionKey = String(body.sessionKey || '').trim()
    const reason = String(body.reason || '').trim()
    const email = String(body.email || '').trim().toLowerCase()
    const user = String(body.user || '').trim()
    const title = String(body.title || '').trim()
    const ip = String(body.ip || '').trim()

    if (!sessionKey) return NextResponse.json({ error: 'Session key required' }, { status: 400 })
    if (!reason) return NextResponse.json({ error: 'Reason required' }, { status: 400 })

    const { data: settings } = await supabase.from('admin_settings').select('*').eq('id', 1).maybeSingle()
    const plexToken = String(settings?.plex_token || '').trim()
    const plexUrl = String(settings?.plex_server_url || 'https://plex.tv').trim() || 'https://plex.tv'
    const companyName = String(settings?.company_name || 'STREAMZ R US').trim() || 'STREAMZ R US'

    if (!plexToken) {
      return NextResponse.json({ error: 'Plex token not configured' }, { status: 400 })
    }

    const stopResult = await terminatePlexSessions(plexUrl, plexToken, [sessionKey], reason)
    if (!stopResult.stopped) {
      return NextResponse.json(
        {
          error: stopResult.failed?.length ? `Plex refused to stop this stream (${stopResult.failed.join(', ')})` : 'Plex did not stop the stream',
        },
        { status: 400 }
      )
    }

    let emailed = false
    if (email.includes('@')) {
      const smtpConfig = {
        host: String(settings?.smtp_host || '').trim(),
        port: settings?.smtp_port || '587',
        user: String(settings?.smtp_user || '').trim(),
        pass: String(settings?.smtp_pass || '').trim(),
        from: String(settings?.smtp_from || settings?.smtp_user || '').trim(),
      }

      if (smtpConfig.host && smtpConfig.user && smtpConfig.pass) {
        await sendStreamKilledEmail(email, { companyName, reason })
        emailed = true
      }
    }

    await addAuditLog({
      action: 'customer_stream_killed',
      email: email || null,
      share_id: sessionKey,
      details: {
        user,
        title,
        ip,
        reason,
        emailed,
      },
    })

    return NextResponse.json({ ok: true, stopped: stopResult.stopped, emailed })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to stop stream' }, { status: 500 })
  }
}

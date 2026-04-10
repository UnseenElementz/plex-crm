import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { markInboxMessageSeen, type MailboxConfig } from '@/lib/mailInbox'

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return null
  return createClient(url, key)
}

function parseBool(value: unknown, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback
  return String(value).toLowerCase() === 'true'
}

function envString(key: string) {
  return String(process.env[key] || '')
    .replace(/\\r\\n/g, '')
    .replace(/[\r\n]+/g, '')
    .trim()
}

function getEnvInboxConfig() {
  return {
    host: envString('INBOUND_IMAP_HOST'),
    port: Number(envString('INBOUND_IMAP_PORT') || 993),
    secure: parseBool(envString('INBOUND_IMAP_SECURE'), true),
    tlsRejectUnauthorized: parseBool(envString('INBOUND_IMAP_TLS_REJECT_UNAUTHORIZED'), true),
    user: envString('INBOUND_IMAP_USER'),
    pass: envString('INBOUND_IMAP_PASS'),
    mailbox: envString('INBOUND_IMAP_MAILBOX') || 'INBOX',
    service_keywords: envString('INBOUND_IMAP_SERVICE_KEYWORDS'),
  }
}

export async function POST(request: Request) {
  try {
    if (cookies().get('admin_session')?.value !== '1') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const uid = Number(body?.uid || 0)
    if (!Number.isFinite(uid) || uid <= 0) {
      return NextResponse.json({ error: 'Valid inbox uid required.' }, { status: 400 })
    }

    const supabase = svc()
    let settings: any = null
    try {
      if (supabase) {
        const { data } = await supabase.from('admin_settings').select('*').single()
        settings = data || null
      }
    } catch {}
    if (!settings) {
      const raw = cookies().get('admin_settings')?.value
      settings = raw ? JSON.parse(decodeURIComponent(raw)) : null
    }

    const envConfig = getEnvInboxConfig()
    const config: MailboxConfig = {
      host: String(settings?.imap_host || envConfig.host || '').trim(),
      port: Number(settings?.imap_port || envConfig.port || 993),
      secure: settings?.imap_secure !== undefined ? parseBool(settings?.imap_secure, true) : envConfig.secure,
      tlsRejectUnauthorized: envConfig.tlsRejectUnauthorized,
      user: String(settings?.imap_user || envConfig.user || '').trim(),
      pass: String(settings?.imap_pass || envConfig.pass || '').trim(),
      mailbox: String(settings?.imap_mailbox || envConfig.mailbox || 'INBOX').trim() || 'INBOX',
      service_keywords: String(settings?.service_email_keywords || envConfig.service_keywords || '').trim(),
    }

    if (!config.host || !config.user || !config.pass) {
      return NextResponse.json({ error: 'Inbound mailbox is not configured yet.' }, { status: 400 })
    }

    await markInboxMessageSeen({ config, uid })
    return NextResponse.json({ ok: true, uid })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to update inbox message' }, { status: 500 })
  }
}

export const runtime = 'nodejs'

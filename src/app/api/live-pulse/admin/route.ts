import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { fetchInboxMessages, type MailboxConfig } from '@/lib/mailInbox'
import { getSecurityOverview } from '@/lib/moderation'
import { scanPlexSessions } from '@/lib/plexSessionMonitor'
import { getRequester } from '@/lib/serverSupabase'

const ADMIN_PULSE_CACHE_MS = 2000

type PulseAlert = {
  id: string
  kind: 'chat' | 'mail' | 'plex' | 'site' | 'checkout'
  level: 'info' | 'warn' | 'critical'
  title: string
  body: string
  href: string
  createdAt: string | null
}

function isVideoTranscode(value: unknown) {
  return String(value || '').trim().toLowerCase().includes('transcode')
}

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

function buildMailboxConfig(settings: any): MailboxConfig {
  return {
    host: String(settings?.imap_host || envString('INBOUND_IMAP_HOST') || '').trim(),
    port: Number(settings?.imap_port || envString('INBOUND_IMAP_PORT') || 993),
    secure:
      settings?.imap_secure !== undefined
        ? parseBool(settings?.imap_secure, true)
        : parseBool(envString('INBOUND_IMAP_SECURE'), true),
    tlsRejectUnauthorized: parseBool(envString('INBOUND_IMAP_TLS_REJECT_UNAUTHORIZED'), true),
    user: String(settings?.imap_user || envString('INBOUND_IMAP_USER') || '').trim(),
    pass: String(settings?.imap_pass || envString('INBOUND_IMAP_PASS') || '').trim(),
    mailbox: String(settings?.imap_mailbox || envString('INBOUND_IMAP_MAILBOX') || 'INBOX').trim() || 'INBOX',
    service_keywords: String(settings?.service_email_keywords || envString('INBOUND_IMAP_SERVICE_KEYWORDS') || '').trim(),
  }
}

function isFresh(value: string | null | undefined, maxAgeMs: number) {
  if (!value) return false
  const time = new Date(value).getTime()
  if (Number.isNaN(time)) return false
  return Date.now() - time <= maxAgeMs
}

async function loadUnreadMail(supabase: ReturnType<typeof svc>, settings: any) {
  if (!supabase) return []
  const mailbox = buildMailboxConfig(settings)
  if (!mailbox.host || !mailbox.user || !mailbox.pass) return []

  const { data: customers, error } = await supabase.from('customers').select('email,name')
  if (error) return []

  const customerIndex = new Map<string, { email: string; name: string }>()
  for (const row of customers || []) {
    const email = String((row as any).email || '').trim().toLowerCase()
    if (!email) continue
    customerIndex.set(email, {
      email,
      name: String((row as any).name || '').trim(),
    })
  }

  return fetchInboxMessages({
    config: mailbox,
    customerIndex,
    limit: 5,
    serviceOnly: true,
    unreadOnly: true,
  }).catch(() => [])
}

function getCachedPulse() {
  const store = globalThis as typeof globalThis & {
    __adminPulseCache?: { expiresAt: number; payload: unknown }
  }
  const cached = store.__adminPulseCache
  if (cached && cached.expiresAt > Date.now()) {
    return cached.payload
  }
  return null
}

function setCachedPulse(payload: unknown) {
  const store = globalThis as typeof globalThis & {
    __adminPulseCache?: { expiresAt: number; payload: unknown }
  }
  store.__adminPulseCache = {
    expiresAt: Date.now() + ADMIN_PULSE_CACHE_MS,
    payload,
  }
}

async function isAuthorizedAdmin(request: Request, supabase: ReturnType<typeof svc>) {
  if (cookies().get('admin_session')?.value === '1') {
    return true
  }

  const requester = await getRequester(request)
  const email = String(requester.email || '').trim().toLowerCase()
  if (!email || !supabase) {
    return false
  }

  const adminAlias = String(process.env.NEXT_PUBLIC_ADMIN_ALIAS_EMAIL || 'admin@streamzrus.local')
    .trim()
    .toLowerCase()
  if (email === adminAlias) {
    return true
  }

  const { data } = await supabase.from('profiles').select('role').eq('email', email).maybeSingle()
  return String((data as any)?.role || '').trim().toLowerCase() === 'admin'
}

export async function GET(request: Request) {
  try {
    const supabase = svc()
    if (!(await isAuthorizedAdmin(request, supabase))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const cached = getCachedPulse()
    if (cached) {
      return NextResponse.json(cached)
    }

    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
    }

    const settingsPromise = supabase.from('admin_settings').select('*').eq('id', 1).maybeSingle()
    const conversationsPromise = supabase
      .from('conversations')
      .select('id,status,updated_at,metadata')
      .order('updated_at', { ascending: false })
      .limit(40)
    const securityPromise = getSecurityOverview().catch(() => null)
    const plexPromise = scanPlexSessions().catch(() => null)

    const [{ data: settings }, { data: conversations }] = await Promise.all([settingsPromise, conversationsPromise])
    const [mail, security, plex] = await Promise.all([
      loadUnreadMail(supabase, settings || null),
      securityPromise,
      plexPromise,
    ])

    const waitingChats = (conversations || []).filter((row: any) => row.status === 'waiting')
    const activeChats = (conversations || []).filter((row: any) => row.status === 'active')

    const visitorMap = new Map<
      string,
      {
        id: string
        name: string
        email: string
        source: string
        seenAt: string
      }
    >()

    for (const event of security?.recentIpEvents || []) {
      const email = String(event?.email || '').trim().toLowerCase()
      const source = String(event?.source || '').trim().toLowerCase()
      const createdAt = String(event?.created_at || '').trim()
      if (!email || source === 'plex-session' || !isFresh(createdAt, 6 * 60 * 1000)) continue
      if (visitorMap.has(email)) continue
      visitorMap.set(email, {
        id: `visitor:${email}`,
        name: String(event?.name || email).trim(),
        email,
        source: source || 'site',
        seenAt: createdAt,
      })
    }

    const onlineUsers = Array.from(visitorMap.values()).slice(0, 6)
    const plexItems = Array.isArray(plex?.items) ? plex.items : []
    const websiteEvents = Array.isArray(security?.recentIpEvents)
      ? security.recentIpEvents.filter((event: any) => {
          const source = String(event?.source || '').trim().toLowerCase()
          const createdAt = String(event?.created_at || '').trim()
          return Boolean(source) && source !== 'plex-session' && isFresh(createdAt, 6 * 60 * 1000)
        })
      : []
    const checkoutEvents = websiteEvents.filter((event: any) =>
      String(event?.source || '').trim().toLowerCase().includes('paypal-checkout')
    )
    const plexAlerts = plexItems
      .filter((item: any) => item.over_limit || item.over_download_limit || isVideoTranscode(item.videoDecision))
      .slice(0, 6)

    const alerts: PulseAlert[] = [
      ...checkoutEvents.slice(0, 3).map((event: any) => ({
        id: `checkout:${String(event?.email || '').trim().toLowerCase()}:${String(event?.created_at || '')}`,
        kind: 'checkout' as const,
        level: 'info' as const,
        title: 'Customer opened PayPal checkout',
        body: String(event?.name || event?.email || 'Checkout activity').trim(),
        href: '/admin/payments',
        createdAt: String(event?.created_at || ''),
      })),
      ...waitingChats.slice(0, 3).map((conversation: any) => ({
        id: `chat:${conversation.id}:${conversation.updated_at}`,
        kind: 'chat' as const,
        level: 'info' as const,
        title: 'Customer waiting in live chat',
        body: String(conversation?.metadata?.full_name || conversation?.metadata?.email || 'Open support queue').trim(),
        href: `/admin?open=${encodeURIComponent(String(conversation.id || ''))}`,
        createdAt: String(conversation.updated_at || ''),
      })),
      ...mail.slice(0, 3).map((message: any) => ({
        id: `mail:${message.uid}`,
        kind: 'mail' as const,
        level: 'warn' as const,
        title: 'Unread customer email',
        body: String(message.subject || message.matchedCustomerName || message.fromEmail || 'New inbox message').trim(),
        href: '/admin/email',
        createdAt: String(message.date || ''),
      })),
      ...plexAlerts.map((item: any) => ({
        id: `plex:${item.sessionKey}:${item.over_download_limit ? 'download' : item.over_limit ? 'limit' : 'video-transcode'}`,
        kind: 'plex' as const,
        level: item.over_download_limit || item.over_limit ? ('critical' as const) : ('warn' as const),
        title: item.over_download_limit
          ? 'Download limit alert'
          : item.over_limit
            ? 'Stream limit alert'
            : 'Video transcode active',
        body: (() => {
          const target = String(item.customer_name || item.customer_email || item.title || 'Plex activity').trim()
          if (item.over_download_limit) return `${target} is over the download limit.`
          if (item.over_limit) return `${target} is over the stream limit.`
          const pipeline = item.transcodeHardwareFullPipeline
            ? 'Hardware video transcode'
            : item.transcodeHardwareEncoding || item.transcodeHardwareDecoding
              ? `${String(item.transcodeHardwareEncoding || item.transcodeHardwareDecoding).trim()} video transcode`
              : 'Video transcode'
          return `${target} is running ${pipeline}.`
        })(),
        href: '/admin/plex-tools',
        createdAt: String(item.startedAt || plex?.fetched_at || ''),
      })),
    ].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())

    const payload = {
      role: 'admin',
      counts: {
        onlineNow: onlineUsers.length,
        waitingChats: waitingChats.length,
        activeChats: activeChats.length,
        unreadMail: mail.length,
        checkoutStarts: checkoutEvents.length,
        activeStreams: Number(plex?.summary?.activeSessions || 0),
        flaggedStreams:
          Number(plex?.summary?.overLimitSessions || 0) + Number(plex?.summary?.overDownloadSessions || 0),
        transcoding: Number(plex?.summary?.transcodingSessions || 0),
      },
      onlineUsers,
      alerts,
      fetchedAt: new Date().toISOString(),
    }

    setCachedPulse(payload)
    return NextResponse.json(payload)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to load live pulse' }, { status: 500 })
  }
}

export const runtime = 'nodejs'

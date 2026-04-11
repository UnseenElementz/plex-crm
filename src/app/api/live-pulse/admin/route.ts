import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { fetchInboxMessages, type MailboxConfig } from '@/lib/mailInbox'
import { parseCustomerNotes } from '@/lib/customerNotes'
import { listPayPalLedgerEntries } from '@/lib/paymentLedger'
import { scanPlexSessions } from '@/lib/plexSessionMonitor'
import { getRequester } from '@/lib/serverSupabase'

const ADMIN_PULSE_CACHE_MS = 2000

type PulseAlert = {
  id: string
  kind: 'chat' | 'mail' | 'plex' | 'site' | 'checkout' | 'purchase'
  level: 'info' | 'warn' | 'critical'
  title: string
  body: string
  href: string
  createdAt: string | null
}

type PulseHistoryEvent = {
  id: string
  kind: 'visit' | 'checkout' | 'purchase'
  title: string
  body: string
  href: string
  createdAt: string | null
}

type PulsePurchaseRow = {
  id: string
  customerName: string
  customerEmail: string | null
  amount: number
  title: string
  body: string
  createdAt: string | null
  status: string
}

function isVideoTranscode(value: unknown) {
  return String(value || '').trim().toLowerCase().includes('transcode')
}

function normalizeSource(value: unknown) {
  return String(value || '').trim().toLowerCase()
}

function isCheckoutSource(source: string) {
  return source.includes('paypal-checkout')
}

function isIgnoredPulseSource(source: string) {
  return !source || source === 'admin-shell' || source.endsWith('-banned') || source.endsWith('-inactive')
}

function getVisitSourceLabel(source: string) {
  switch (source) {
    case 'customer-portal':
    case 'customer-shell':
      return 'Customer portal'
    case 'customer-login':
      return 'Customer login'
    case 'customer-payments':
      return 'Payments page'
    case 'customer-register':
      return 'Registration page'
    case 'customer-paypal-checkout':
      return 'PayPal checkout'
    default:
      return source.replace(/^customer-/, '').replace(/-/g, ' ') || 'Website'
  }
}

function getPurchaseTitle(method: string) {
  const normalized = String(method || '').trim().toLowerCase()
  if (normalized.includes('downloads add-on')) return 'Downloads add-on purchased'
  if (normalized.includes('streams add-on')) return 'Extra streams purchased'
  return 'New membership payment'
}

function getPurchaseTitleFromLedger(input: {
  paymentMethod?: string | null
  note?: string | null
  mode?: string | null
}) {
  const note = String(input.note || '').trim()
  if (note) {
    return note.split('|')[0]?.trim() || getPurchaseTitle(input.paymentMethod || '')
  }
  const mode = String(input.mode || '').trim().toLowerCase()
  if (mode === 'downloads_addon') return 'Downloads add-on purchased'
  if (mode === 'streams_addon') return 'Extra streams purchased'
  return getPurchaseTitle(input.paymentMethod || '')
}

function getPurchaseBody(input: {
  customerName?: string | null
  customerEmail?: string | null
  amount?: number
  note?: string | null
}) {
  const customer = String(input.customerName || input.customerEmail || 'Customer').trim()
  const amount = Number(input.amount || 0)
  const note = String(input.note || '').trim()
  if (note) return `${customer} • ${note}`
  return `${customer} paid GBP ${amount.toFixed(2)}`
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

function toTimestamp(value: unknown) {
  const time = new Date(String(value || '')).getTime()
  return Number.isNaN(time) ? 0 : time
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

    const { searchParams } = new URL(request.url)
    const seenAtMs = Number(searchParams.get('seenAt') || 0)
    const now = Date.now()
    const history24hCutoff = new Date(now - 24 * 60 * 60 * 1000).toISOString()
    const history7dCutoff = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString()

    const settingsPromise = supabase.from('admin_settings').select('*').eq('id', 1).maybeSingle()
    const conversationsPromise = supabase
      .from('conversations')
      .select('id,status,updated_at,metadata')
      .order('updated_at', { ascending: false })
      .limit(40)
    const customersPromise = supabase.from('customers').select('id,name,email,notes')
    const paymentsPromise = supabase
      .from('payments')
      .select('id,customer_id,amount,currency,payment_date,payment_method,status')
      .order('payment_date', { ascending: false })
      .limit(12)
    const paymentHistoryPromise = supabase
      .from('payments')
      .select('id,customer_id,amount,currency,payment_date,payment_method,status')
      .gte('payment_date', history7dCutoff)
      .order('payment_date', { ascending: false })
      .limit(200)
    const ledgerEntriesPromise = listPayPalLedgerEntries().catch(() => [])
    const auditHistoryPromise = supabase
      .from('plex_audit_logs')
      .select('id,email,created_at,details')
      .eq('action', 'ip_seen')
      .gte('created_at', history7dCutoff)
      .order('created_at', { ascending: false })
      .limit(800)
    const plexPromise = scanPlexSessions().catch(() => null)

    const [
      { data: settings },
      { data: conversations },
      { data: customers },
      { data: payments },
      { data: paymentHistoryRows },
      ledgerEntries,
      { data: auditHistoryRows },
    ] = await Promise.all([
      settingsPromise,
      conversationsPromise,
      customersPromise,
      paymentsPromise,
      paymentHistoryPromise,
      ledgerEntriesPromise,
      auditHistoryPromise,
    ])
    const [mail, plex] = await Promise.all([
      loadUnreadMail(supabase, settings || null),
      plexPromise,
    ])

    const waitingChats = (conversations || []).filter((row: any) => row.status === 'waiting')
    const activeChats = (conversations || []).filter((row: any) => row.status === 'active')
    const customersById = new Map<string, { name: string; email: string; notes: string }>()
    const customersByEmail = new Map<string, { name: string; email: string; notes: string }>()
    for (const row of customers || []) {
      const customerId = String((row as any)?.id || '').trim()
      const customerEmail = String((row as any)?.email || '').trim().toLowerCase()
      const customerName = String((row as any)?.name || '').trim()
      const customerNotes = String((row as any)?.notes || '')
      if (!customerId) continue
      const entry = {
        name: customerName,
        email: customerEmail,
        notes: customerNotes,
      }
      customersById.set(customerId, entry)
      if (customerEmail) customersByEmail.set(customerEmail, entry)
    }

    const conversationIdByEmail = new Map<string, string>()
    for (const row of conversations || []) {
      const email = String((row as any)?.metadata?.email || '').trim().toLowerCase()
      const id = String((row as any)?.id || '').trim()
      if (!email || !id || conversationIdByEmail.has(email)) continue
      conversationIdByEmail.set(email, id)
    }

    const ledgerByPaymentId = new Map<string, any>()
    const ledgerByCaptureId = new Map<string, any>()
    const ledgerByOrderId = new Map<string, any>()
    for (const entry of Array.isArray(ledgerEntries) ? ledgerEntries : []) {
      const paymentId = String((entry as any)?.paymentId || '').trim()
      const captureId = String((entry as any)?.captureId || '').trim()
      const orderId = String((entry as any)?.orderId || '').trim()
      if (paymentId && !ledgerByPaymentId.has(paymentId)) ledgerByPaymentId.set(paymentId, entry)
      if (captureId && !ledgerByCaptureId.has(captureId)) ledgerByCaptureId.set(captureId, entry)
      if (orderId && !ledgerByOrderId.has(orderId)) ledgerByOrderId.set(orderId, entry)
    }

    const normalizedPurchaseRowsMap = new Map<string, PulsePurchaseRow>()
    const seenPurchaseKeys = new Set<string>()

    for (const row of Array.isArray(paymentHistoryRows) ? paymentHistoryRows : []) {
      const paymentId = String((row as any)?.id || '').trim()
      const customer = customersById.get(String((row as any)?.customer_id || '').trim())
      const ledger =
        ledgerByPaymentId.get(paymentId) ||
        ledgerByCaptureId.get(String((row as any)?.capture_id || '').trim()) ||
        ledgerByOrderId.get(String((row as any)?.order_id || '').trim()) ||
        null
      const status = String((ledger as any)?.refundId ? 'refunded' : (row as any)?.status || (ledger as any)?.status || 'completed').trim().toLowerCase()
      const createdAt = String((ledger as any)?.createdAt || (row as any)?.payment_date || '').trim() || null
      const amount = Number((row as any)?.amount || (ledger as any)?.amount || 0)
      const title = getPurchaseTitleFromLedger({
        paymentMethod: String((ledger as any)?.paymentMethod || (row as any)?.payment_method || ''),
        note: String((ledger as any)?.note || ''),
        mode: String((ledger as any)?.mode || ''),
      })
      const purchaseRow: PulsePurchaseRow = {
        id: paymentId || `payment:${String((row as any)?.customer_id || '')}:${createdAt || Math.random()}`,
        customerName: customer?.name || String((ledger as any)?.customerName || customer?.email || 'Customer').trim(),
        customerEmail: customer?.email || String((ledger as any)?.customerEmail || '').trim().toLowerCase() || null,
        amount,
        title,
        body: getPurchaseBody({
          customerName: customer?.name || String((ledger as any)?.customerName || '').trim(),
          customerEmail: customer?.email || String((ledger as any)?.customerEmail || '').trim().toLowerCase() || null,
          amount,
          note: String((ledger as any)?.note || ''),
        }),
        createdAt,
        status,
      }
      normalizedPurchaseRowsMap.set(purchaseRow.id, purchaseRow)
      if (paymentId) seenPurchaseKeys.add(`payment:${paymentId}`)
      const captureId = String((ledger as any)?.captureId || '').trim()
      const orderId = String((ledger as any)?.orderId || '').trim()
      if (captureId) seenPurchaseKeys.add(`capture:${captureId}`)
      if (orderId) seenPurchaseKeys.add(`order:${orderId}`)
    }

    for (const entry of Array.isArray(ledgerEntries) ? ledgerEntries : []) {
      const paymentId = String((entry as any)?.paymentId || '').trim()
      const captureId = String((entry as any)?.captureId || '').trim()
      const orderId = String((entry as any)?.orderId || '').trim()
      if ((paymentId && seenPurchaseKeys.has(`payment:${paymentId}`)) || (captureId && seenPurchaseKeys.has(`capture:${captureId}`)) || (orderId && seenPurchaseKeys.has(`order:${orderId}`))) {
        continue
      }

      const customerEmail = String((entry as any)?.customerEmail || '').trim().toLowerCase()
      const customer = customersByEmail.get(customerEmail)
      const amount = Number((entry as any)?.amount || 0)
      const title = getPurchaseTitleFromLedger({
        paymentMethod: String((entry as any)?.paymentMethod || ''),
        note: String((entry as any)?.note || ''),
        mode: String((entry as any)?.mode || ''),
      })
      normalizedPurchaseRowsMap.set(`ledger:${captureId || orderId || paymentId || crypto.randomUUID()}`, {
        id: `ledger:${captureId || orderId || paymentId || crypto.randomUUID()}`,
        customerName: customer?.name || String((entry as any)?.customerName || customerEmail || 'Customer').trim(),
        customerEmail: customer?.email || customerEmail || null,
        amount,
        title,
        body: getPurchaseBody({
          customerName: customer?.name || String((entry as any)?.customerName || '').trim(),
          customerEmail: customer?.email || customerEmail || null,
          amount,
          note: String((entry as any)?.note || ''),
        }),
        createdAt: String((entry as any)?.createdAt || (entry as any)?.capturedAt || '').trim() || null,
        status: String((entry as any)?.refundId ? 'refunded' : (entry as any)?.status || 'completed').trim().toLowerCase(),
      })
    }

    const normalizedPurchases = Array.from(normalizedPurchaseRowsMap.values())
      .filter((row) => row.status === 'completed')
      .sort((a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt))

    const visitorMap = new Map<
      string,
      {
        id: string
        name: string
        email: string
        source: string
        seenAt: string
        href: string
      }
    >()

    const visitor24h = new Set<string>()
    const visitor7d = new Set<string>()
    const sinceSeenVisitors = new Set<string>()
    const checkoutEventsRaw: Array<{ id: string; email: string; name: string; createdAt: string; source: string; details: Record<string, unknown> }> = []
    const recentVisitHistoryMap = new Map<string, PulseHistoryEvent>()

    const registerVisit = (input: {
      id: string
      email: string
      name: string
      source: string
      createdAt: string
    }) => {
      const email = String(input.email || '').trim().toLowerCase()
      const createdAt = String(input.createdAt || '').trim()
      const source = normalizeSource(input.source)
      if (!email || !createdAt || isIgnoredPulseSource(source)) return

      const customer = customersByEmail.get(email)
      const name = String(input.name || customer?.name || email).trim() || email
      const createdAtMs = toTimestamp(createdAt)
      const uniqueVisitKey = email

      visitor7d.add(uniqueVisitKey)
      if (createdAtMs >= toTimestamp(history24hCutoff)) visitor24h.add(uniqueVisitKey)
      if (seenAtMs > 0 && createdAtMs > seenAtMs) sinceSeenVisitors.add(uniqueVisitKey)

      const existingOnline = visitorMap.get(email)
      if (isFresh(createdAt, 6 * 60 * 1000) && (!existingOnline || toTimestamp(existingOnline.seenAt) < createdAtMs)) {
        visitorMap.set(email, {
          id: `visitor:${email}`,
          name,
          email,
          source: source || 'site',
          seenAt: createdAt,
          href: conversationIdByEmail.has(email)
            ? `/admin?open=${encodeURIComponent(String(conversationIdByEmail.get(email) || ''))}`
            : `/admin?startChat=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}`,
        })
      }

      const existingHistory = recentVisitHistoryMap.get(email)
      if (!existingHistory || toTimestamp(existingHistory.createdAt) < createdAtMs) {
        recentVisitHistoryMap.set(email, {
          id: input.id || `visit:${email}:${createdAt}`,
          kind: 'visit' as const,
          title: 'Website visit',
          body: `${name} opened ${getVisitSourceLabel(source)}.`,
          href: conversationIdByEmail.has(email)
            ? `/admin?open=${encodeURIComponent(String(conversationIdByEmail.get(email) || ''))}`
            : `/admin?startChat=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}`,
          createdAt,
        })
      }
    }

    for (const row of auditHistoryRows || []) {
      const email = String((row as any)?.email || '').trim().toLowerCase()
      const createdAt = String((row as any)?.created_at || '').trim()
      const details = (((row as any)?.details || {}) as Record<string, unknown>) || {}
      const source = normalizeSource(details.source)
      if (!email || !createdAt || isIgnoredPulseSource(source)) continue

      const customer = customersByEmail.get(email)
      const name = customer?.name || String(details.name || email).trim() || email
      const createdAtMs = new Date(createdAt).getTime()

      if (isCheckoutSource(source)) {
        checkoutEventsRaw.push({
          id: String((row as any)?.id || `${email}:${createdAt}`),
          email,
          name,
          createdAt,
          source,
          details,
        })
        continue
      }

      registerVisit({
        id: `visit:${email}:${createdAt}`,
        email,
        name,
        source,
        createdAt,
      })
    }

    for (const customer of customersByEmail.values()) {
      const parsedNotes = parseCustomerNotes(customer.notes)
      const lastPortalSeenAt = String(parsedNotes.lastPortalSeenAt || '').trim()
      const lastPortalSource = String(parsedNotes.lastPortalSource || 'customer-portal').trim()
      if (!lastPortalSeenAt) continue
      registerVisit({
        id: `customer-note:${customer.email}:${lastPortalSeenAt}`,
        email: customer.email,
        name: customer.name || customer.email,
        source: lastPortalSource,
        createdAt: lastPortalSeenAt,
      })
    }

    const onlineUsers = Array.from(visitorMap.values()).slice(0, 6)
    const plexItems = Array.isArray(plex?.items) ? plex.items : []
    const checkoutEvents = checkoutEventsRaw.filter((event) => isFresh(event.createdAt, 20 * 60 * 1000))
    const purchaseEvents = normalizedPurchases.filter((row) => isFresh(row.createdAt, 20 * 60 * 1000))
    const plexAlerts = plexItems
      .filter((item: any) => item.over_limit || item.over_download_limit || isVideoTranscode(item.videoDecision))
      .slice(0, 6)

    const alerts: PulseAlert[] = [
      ...purchaseEvents.slice(0, 4).map((payment) => {
        return {
          id: `purchase:${String(payment.id || '')}`,
          kind: 'purchase' as const,
          level: 'info' as const,
          title: payment.title,
          body: payment.body,
          href: '/admin/payments',
          createdAt: payment.createdAt,
        }
      }),
      ...checkoutEvents.slice(0, 3).map((event) => ({
        id: `checkout:${event.email}:${event.createdAt}`,
        kind: 'checkout' as const,
        level: 'info' as const,
        title: 'Customer opened PayPal checkout',
        body: String(event.name || event.email || 'Checkout activity').trim(),
        href: '/admin/payments',
        createdAt: event.createdAt,
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

    const purchase24h = normalizedPurchases.filter((row) => toTimestamp(row.createdAt) >= toTimestamp(history24hCutoff))
    const purchase7d = normalizedPurchases.filter((row) => toTimestamp(row.createdAt) >= toTimestamp(history7dCutoff))

    const checkout24h = checkoutEventsRaw.filter((event) => toTimestamp(event.createdAt) >= toTimestamp(history24hCutoff))

    const latestPurchases24h: PulseHistoryEvent[] = purchase24h.slice(0, 5).map((payment) => {
      return {
        id: `latest-purchase:${String(payment.id || '')}`,
        kind: 'purchase' as const,
        title: payment.title,
        body: payment.body,
        href: '/admin/payments',
        createdAt: payment.createdAt,
      }
    })

    const latestVisits24h: PulseHistoryEvent[] = Array.from(recentVisitHistoryMap.values())
      .filter((event) => toTimestamp(event.createdAt) >= toTimestamp(history24hCutoff))
      .sort((a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt))
      .slice(0, 5)

    const historyEvents: PulseHistoryEvent[] = [
      ...purchase7d.slice(0, 10).map((payment) => {
        return {
          id: `history-purchase:${String(payment.id || '')}`,
          kind: 'purchase' as const,
          title: payment.title,
          body: payment.body,
          href: '/admin/payments',
          createdAt: payment.createdAt,
        }
      }),
      ...checkoutEventsRaw.slice(0, 10).map((event) => ({
        id: `history-checkout:${event.id}`,
        kind: 'checkout' as const,
        title: 'Checkout started',
        body: `${event.name || event.email} opened ${getVisitSourceLabel(event.source)}.`,
        href: '/admin/payments',
        createdAt: event.createdAt,
      })),
      ...Array.from(recentVisitHistoryMap.values()).slice(0, 14),
    ]
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, 10)

    const sinceSeenPurchases = seenAtMs > 0
      ? purchase7d.filter((row) => toTimestamp(row.createdAt) > seenAtMs).length
      : 0
    const sinceSeenCheckouts = seenAtMs > 0
      ? checkoutEventsRaw.filter((event) => new Date(event.createdAt).getTime() > seenAtMs).length
      : 0
    const sinceSeenWaitingChats = seenAtMs > 0
      ? waitingChats.filter((conversation: any) => new Date(String(conversation?.updated_at || 0)).getTime() > seenAtMs).length
      : 0

    const payload = {
      role: 'admin',
      counts: {
        onlineNow: onlineUsers.length,
        waitingChats: waitingChats.length,
        activeChats: activeChats.length,
        unreadMail: mail.length,
        recentPurchases: purchaseEvents.length,
        checkoutStarts: checkoutEvents.length,
        activeStreams: Number(plex?.summary?.activeSessions || 0),
        flaggedStreams:
          Number(plex?.summary?.overLimitSessions || 0) + Number(plex?.summary?.overDownloadSessions || 0),
        transcoding: Number(plex?.summary?.transcodingSessions || 0),
      },
      history: {
        visitors24h: visitor24h.size,
        visitors7d: visitor7d.size,
        purchases24h: purchase24h.length,
        purchases7d: purchase7d.length,
        checkout24h: checkout24h.length,
        latestPurchases24h,
        latestVisits24h,
        recentEvents: historyEvents,
        sinceSeen: {
          visitors: sinceSeenVisitors.size,
          purchases: sinceSeenPurchases,
          checkoutStarts: sinceSeenCheckouts,
          waitingChats: sinceSeenWaitingChats,
        },
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

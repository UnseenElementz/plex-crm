import { createClient } from '@supabase/supabase-js'
import { mergeCustomerNotes, parseCustomerNotes, type WarningHistoryEntry } from '@/lib/customerNotes'
import { getAllPlexUsers } from '@/lib/plex'

export type ModerationCustomer = {
  id: string
  name: string
  email: string
  notes: string
  streams: number
  subscription_type: string
  next_payment_date: string | null
  subscription_status: string
  plex_username: string
}

export type RequestIpContext = {
  ip: string
  userAgent: string | null
  country: string | null
  region: string | null
  city: string | null
  postalCode: string | null
  latitude: string | null
  longitude: string | null
  source: string
}

export type SecurityTrackedIp = {
  ip: string
  seen_count: number
  first_seen_at: string | null
  last_seen_at: string | null
  last_source: string | null
  user_agent: string | null
  country: string | null
  region: string | null
  city: string | null
  postal_code: string | null
  latitude: string | null
  longitude: string | null
  location_label: string
  blocked: boolean
}

export type SecurityTrackedCustomer = {
  email: string
  name: string
  last_seen_at: string | null
  last_ip: string | null
  unique_ip_count: number
  total_events: number
  ips: SecurityTrackedIp[]
}

export type SecurityRecentEvent = {
  action: string
  email: string
  name: string
  created_at: string
  ip: string
  source: string | null
  user_agent: string | null
  country: string | null
  region: string | null
  city: string | null
  postal_code: string | null
  latitude: string | null
  longitude: string | null
  location_label: string
  blocked: boolean
}

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

async function findCustomerByEmail(supabase: ReturnType<typeof svc>, email: string) {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  if (!supabase || !normalizedEmail) return null
  const { data, error } = await supabase
    .from('customers')
    .select('id,notes,email')
    .ilike('email', normalizedEmail)
    .limit(1)
    .maybeSingle()

  if (error || !data?.id) return null
  return data
}

function cleanText(value: unknown) {
  const text = String(value || '').trim()
  return text || null
}

function cleanIp(value: unknown) {
  const ip = String(value || '').split(',')[0].trim()
  return ip || 'unknown'
}

function buildLocationLabel(input: {
  city?: string | null
  region?: string | null
  country?: string | null
  latitude?: string | null
  longitude?: string | null
}) {
  const place = [cleanText(input.city), cleanText(input.region), cleanText(input.country)].filter(Boolean).join(', ')
  if (place) return place
  const coords = [cleanText(input.latitude), cleanText(input.longitude)].filter(Boolean).join(', ')
  return coords || 'Unknown'
}

export function getRequestIpContext(request: Request, source = 'portal'): RequestIpContext {
  const forwarded = request.headers.get('x-forwarded-for')
  const real = request.headers.get('x-real-ip')
  const ip = cleanIp(forwarded || real || '')

  return {
    ip,
    userAgent: cleanText(request.headers.get('user-agent')),
    country: cleanText(request.headers.get('x-vercel-ip-country')),
    region: cleanText(request.headers.get('x-vercel-ip-country-region')),
    city: cleanText(request.headers.get('x-vercel-ip-city')),
    postalCode: cleanText(request.headers.get('x-vercel-ip-postal-code')),
    latitude: cleanText(request.headers.get('x-vercel-ip-latitude')),
    longitude: cleanText(request.headers.get('x-vercel-ip-longitude')),
    source: cleanText(source) || 'portal',
  }
}

export function parsePlexUsername(notes: unknown) {
  return parseCustomerNotes(notes).plexUsername
}

export function isCustomerBannedInNotes(notes: unknown) {
  return parseCustomerNotes(notes).banned
}

export function setCustomerBannedInNotes(notes: unknown, banned: boolean, banReason?: string | null) {
  return mergeCustomerNotes({
    existing: notes,
    banned,
    bannedAt: banned ? new Date().toISOString() : null,
    banReason: banned ? String(banReason || '').trim() : '',
  })
}

export async function findCustomerByIdentity(identity: {
  customerEmail?: string | null
  email?: string | null
  user?: string | null
}) {
  const supabase = svc()
  if (!supabase) return null

  const directEmails = Array.from(
    new Set(
      [identity.customerEmail, identity.email]
        .map((value) => String(value || '').trim().toLowerCase())
        .filter((value) => value.includes('@'))
    )
  )

  const { data: customers } = await supabase
    .from('customers')
    .select('id,name,email,notes,streams,subscription_type,next_payment_date,subscription_status')

  const rows = (customers || []).map((row: any) => ({
    id: String(row.id || ''),
    name: String(row.name || '').trim(),
    email: String(row.email || '').trim().toLowerCase(),
    notes: String(row.notes || ''),
    streams: Number(row.streams || 1) || 1,
    subscription_type: String(row.subscription_type || 'yearly'),
    next_payment_date: row.next_payment_date || null,
    subscription_status: String(row.subscription_status || 'inactive'),
    plex_username: parsePlexUsername(row.notes).toLowerCase(),
  })) satisfies ModerationCustomer[]

  for (const email of directEmails) {
    const customer = rows.find((row) => row.email === email)
    if (customer) return customer
  }

  const user = String(identity.user || '').trim().toLowerCase()
  if (user) {
    const customer = rows.find((row) => row.plex_username === user)
    if (customer) return customer
  }

  const { data: settings } = await supabase
    .from('admin_settings')
    .select('plex_token')
    .eq('id', 1)
    .maybeSingle()

  const plexToken = String((settings as any)?.plex_token || '').trim()
  if (!plexToken) return null

  try {
    const plexUsers = await getAllPlexUsers(plexToken)
    const identityKeys = Array.from(
      new Set(
        [identity.customerEmail, identity.email, identity.user]
          .map((value) => String(value || '').trim().toLowerCase())
          .filter(Boolean)
      )
    )

    const sharedUser = plexUsers.find((entry) => {
      const email = String(entry.email || '').trim().toLowerCase()
      const username = String(entry.username || '').trim().toLowerCase()
      const title = String(entry.title || '').trim().toLowerCase()
      return identityKeys.some((key) => key === email || key === username || key === title)
    })

    if (!sharedUser) return null

    const sharedEmail = String(sharedUser.email || '').trim().toLowerCase()
    if (sharedEmail.includes('@')) {
      const customer = rows.find((row) => row.email === sharedEmail)
      if (customer) return customer
    }

    const sharedUsername = String(sharedUser.username || sharedUser.title || '').trim().toLowerCase()
    if (sharedUsername) {
      const customer = rows.find((row) => row.plex_username === sharedUsername)
      if (customer) return customer
    }
  } catch {}

  return null
}

export async function countWarnings(email: string) {
  const supabase = svc()
  if (!supabase || !email) return 0
  const normalizedEmail = String(email || '').trim().toLowerCase()
  const { data, error } = await supabase
    .from('plex_audit_logs')
    .select('id')
    .eq('action', 'customer_warning')
    .eq('email', normalizedEmail)

  if (error) {
    try {
      const customer = await findCustomerByEmail(supabase, normalizedEmail)
      return parseCustomerNotes(customer?.notes || '').warningCount
    } catch {
      return 0
    }
  }
  let noteCount = 0
  try {
    const customer = await findCustomerByEmail(supabase, normalizedEmail)
    noteCount = parseCustomerNotes(customer?.notes || '').warningCount
  } catch {}
  return Math.max(Array.isArray(data) ? data.length : 0, noteCount)
}

export async function isCustomerBanned(email: string) {
  const supabase = svc()
  if (!supabase || !email) return false
  const { data, error } = await supabase
    .from('plex_audit_logs')
    .select('action,created_at')
    .eq('email', email)
    .in('action', ['customer_ban', 'customer_unban'])
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) return false
  return (data || [])[0]?.action === 'customer_ban'
}

export async function addAuditLog(input: {
  action: string
  email?: string | null
  share_id?: string | null
  server_machine_id?: string | null
  details?: Record<string, unknown>
}) {
  const supabase = svc()
  if (!supabase) return
  try {
    const normalizedEmail = cleanText(input.email)?.toLowerCase() || null
    await supabase.from('plex_audit_logs').insert({
      id: crypto.randomUUID(),
      action: input.action,
      email: normalizedEmail,
      share_id: input.share_id || null,
      server_machine_id: input.server_machine_id || null,
      details: input.details || {},
    })
  } catch {}
}

export async function persistBlockedIpsSnapshot(blockedIps: string[]) {
  const supabase = svc()
  if (!supabase) return
  try {
    await supabase.from('admin_settings').update({ blocked_ips: blockedIps }).eq('id', 1)
  } catch {}
}

export async function syncCustomerDownloads(email: string, downloads: boolean) {
  const supabase = svc()
  if (!supabase || !email) return
  try {
    const current = await findCustomerByEmail(supabase, email)
    if (!current?.id) return
    const nextNotes = mergeCustomerNotes({
      existing: current.notes || '',
      downloads,
    })
    await supabase.from('customers').update({ notes: nextNotes }).eq('id', current.id)
  } catch {}
}

export async function syncCustomerTranscodeNotice(email: string, sentAt?: string | null) {
  const supabase = svc()
  if (!supabase || !email) return
  try {
    const current = await findCustomerByEmail(supabase, email)
    if (!current?.id) return
    const nextNotes = mergeCustomerNotes({
      existing: current.notes || '',
      transcodeNoticeSentAt: sentAt || new Date().toISOString(),
    })
    await supabase.from('customers').update({ notes: nextNotes }).eq('id', current.id)
  } catch {}
}

export async function syncCustomerWarning(
  email: string,
  input?: {
    at?: string | null
    ip?: string | null
    user?: string | null
    reason?: string | null
  }
) {
  const supabase = svc()
  if (!supabase || !email) return 0
  try {
    const current = await findCustomerByEmail(supabase, email)
    if (!current?.id) return 0
    const parsed = parseCustomerNotes(current.notes || '')
    const entry: WarningHistoryEntry = {
      at: String(input?.at || new Date().toISOString()).trim(),
      ip: String(input?.ip || '').trim(),
      user: String(input?.user || '').trim(),
      reason: String(input?.reason || 'Over streaming').trim(),
    }
    const warningHistory = [...parsed.warningHistory, entry].slice(-12)
    const warningCount = warningHistory.length
    const nextNotes = mergeCustomerNotes({
      existing: current.notes || '',
      warningCount,
      warningHistory,
    })
    await supabase.from('customers').update({ notes: nextNotes }).eq('id', current.id)
    return warningCount
  } catch {
    return 0
  }
}

export async function getSecurityOverview() {
  const supabase = svc()
  if (!supabase) {
    return {
      ipLogs: {},
      blockedIps: [],
      bannedCustomers: [] as any[],
      trackedCustomers: [] as SecurityTrackedCustomer[],
      recentIpEvents: [] as SecurityRecentEvent[],
      summary: {
        tracked_customers: 0,
        unique_ips: 0,
        blocked_ips: 0,
        banned_customers: 0,
        recent_events: 0,
      },
    }
  }

  const { data: settings } = await supabase
    .from('admin_settings')
    .select('blocked_ips')
    .eq('id', 1)
    .maybeSingle()

  const blockedSnapshot = Array.isArray((settings as any)?.blocked_ips)
    ? ((settings as any).blocked_ips as unknown[])
        .map((entry) => cleanIp(entry))
        .filter((entry) => entry && entry !== 'unknown')
    : []

  const { data: logs, error } = await supabase
    .from('plex_audit_logs')
    .select('action,email,created_at,details')
    .in('action', ['ip_seen', 'ip_block', 'ip_unblock', 'customer_warning', 'customer_ban', 'customer_unban', 'session_seen'])
    .order('created_at', { ascending: true })
    .limit(4000)

  const ipLogs: Record<string, string[]> = {}
  const blockedSet = new Set<string>(blockedSnapshot)
  const warningCount = new Map<string, number>()
  const bannedMap = new Map<string, { email: string; banned_at: string; reason: string; warning_count: number }>()
  const tracked = new Map<
    string,
    {
      email: string
      name: string
      last_seen_at: string | null
      last_ip: string | null
      total_events: number
      ips: Map<
        string,
        {
          ip: string
          seen_count: number
          first_seen_at: string | null
          last_seen_at: string | null
          last_source: string | null
          user_agent: string | null
          country: string | null
          region: string | null
          city: string | null
          postal_code: string | null
          latitude: string | null
          longitude: string | null
        }
      >
    }
  >()
  const recentEventsRaw: Array<Omit<SecurityRecentEvent, 'name' | 'blocked'>> = []

  for (const row of error ? [] : logs || []) {
    const action = String((row as any).action || '')
    const email = String((row as any).email || '').trim().toLowerCase()
    const createdAt = String((row as any).created_at || '')
    const details = ((row as any).details || {}) as Record<string, unknown>
    const ip = cleanIp(details.ip)

    if (action === 'ip_block' && ip && ip !== 'unknown') blockedSet.add(ip)
    if (action === 'ip_unblock' && ip && ip !== 'unknown') blockedSet.delete(ip)

    if (action === 'customer_warning' && email) {
      warningCount.set(email, (warningCount.get(email) || 0) + 1)
    }

    if (action === 'customer_ban' && email) {
      bannedMap.set(email, {
        email,
        banned_at: createdAt,
        reason: String(details.reason || 'Terms of service breach').trim(),
        warning_count: warningCount.get(email) || 0,
      })
    }

    if (action === 'customer_unban' && email) {
      bannedMap.delete(email)
    }

    if ((action === 'ip_seen' || action === 'session_seen') && email && ip && ip !== 'unknown') {
      const source = cleanText(details.source) || (action === 'session_seen' ? 'plex-session' : 'portal')
      const userAgent = cleanText(details.user_agent || details.userAgent)
      const country = cleanText(details.country)
      const region = cleanText(details.region)
      const city = cleanText(details.city)
      const postalCode = cleanText(details.postal_code || details.postalCode)
      const latitude = cleanText(details.latitude)
      const longitude = cleanText(details.longitude)

      const existing = Array.isArray(ipLogs[email]) ? ipLogs[email] : []
      if (!existing.includes(ip)) ipLogs[email] = [ip, ...existing].slice(0, 20)

      const customer =
        tracked.get(email) ||
        {
          email,
          name: email,
          last_seen_at: createdAt || null,
          last_ip: ip,
          total_events: 0,
          ips: new Map(),
        }

      customer.total_events += 1
      if (!customer.last_seen_at || new Date(createdAt).getTime() >= new Date(customer.last_seen_at).getTime()) {
        customer.last_seen_at = createdAt || customer.last_seen_at
        customer.last_ip = ip
      }

      const ipEntry =
        customer.ips.get(ip) ||
        {
          ip,
          seen_count: 0,
          first_seen_at: createdAt || null,
          last_seen_at: createdAt || null,
          last_source: source,
          user_agent: userAgent,
          country,
          region,
          city,
          postal_code: postalCode,
          latitude,
          longitude,
        }

      ipEntry.seen_count += 1
      ipEntry.last_seen_at = createdAt || ipEntry.last_seen_at
      ipEntry.last_source = source
      ipEntry.user_agent = userAgent || ipEntry.user_agent
      ipEntry.country = country || ipEntry.country
      ipEntry.region = region || ipEntry.region
      ipEntry.city = city || ipEntry.city
      ipEntry.postal_code = postalCode || ipEntry.postal_code
      ipEntry.latitude = latitude || ipEntry.latitude
      ipEntry.longitude = longitude || ipEntry.longitude

      customer.ips.set(ip, ipEntry)
      tracked.set(email, customer)

      recentEventsRaw.push({
        action,
        email,
        created_at: createdAt,
        ip,
        source,
        user_agent: userAgent,
        country,
        region,
        city,
        postal_code: postalCode,
        latitude,
        longitude,
        location_label: buildLocationLabel({ city, region, country, latitude, longitude }),
      })
    }
  }

  const { data: customers } = await supabase.from('customers').select('email,name,notes')
  const names = new Map<string, string>()
  const customerNotes = new Map<
    string,
    {
      banned: boolean
      bannedAt: string | null
      banReason: string | null
      warningCount: number
    }
  >()
  for (const row of customers || []) {
    const email = String((row as any).email || '').trim().toLowerCase()
    const name = String((row as any).name || '').trim()
    if (email) names.set(email, name)
    if (email) {
      const parsedNotes = parseCustomerNotes((row as any).notes || '')
      customerNotes.set(email, {
        banned: Boolean(parsedNotes.banned),
        bannedAt: parsedNotes.bannedAt || null,
        banReason: parsedNotes.banReason || null,
        warningCount: Number(parsedNotes.warningCount || 0),
      })
    }
  }

  for (const [email, noteState] of customerNotes.entries()) {
    if (!noteState.banned || bannedMap.has(email)) continue
    bannedMap.set(email, {
      email,
      banned_at: noteState.bannedAt || '',
      reason: noteState.banReason || 'Access suspended',
      warning_count: noteState.warningCount,
    })
  }

  const trackedCustomers = Array.from(tracked.values())
    .map((customer) => ({
      email: customer.email,
      name: names.get(customer.email) || customer.name || customer.email,
      last_seen_at: customer.last_seen_at,
      last_ip: customer.last_ip,
      unique_ip_count: customer.ips.size,
      total_events: customer.total_events,
      ips: Array.from(customer.ips.values())
        .map((entry) => ({
          ...entry,
          location_label: buildLocationLabel(entry),
          blocked: blockedSet.has(entry.ip),
        }))
        .sort((a, b) => new Date(b.last_seen_at || 0).getTime() - new Date(a.last_seen_at || 0).getTime()),
    }))
    .sort((a, b) => new Date(b.last_seen_at || 0).getTime() - new Date(a.last_seen_at || 0).getTime())

  const recentIpEvents = recentEventsRaw
    .map((event) => ({
      ...event,
      name: names.get(event.email) || event.email,
      blocked: blockedSet.has(event.ip),
    }))
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
    .slice(0, 80)

  const bannedCustomers = Array.from(bannedMap.values())
    .map((row) => ({
      ...row,
      name: names.get(row.email) || row.email,
    }))
    .sort((a, b) => new Date(b.banned_at || 0).getTime() - new Date(a.banned_at || 0).getTime())

  const uniqueIps = new Set<string>()
  trackedCustomers.forEach((customer) => customer.ips.forEach((entry) => uniqueIps.add(entry.ip)))

  return {
    ipLogs,
    blockedIps: Array.from(blockedSet).sort(),
    bannedCustomers,
    trackedCustomers,
    recentIpEvents,
    summary: {
      tracked_customers: trackedCustomers.length,
      unique_ips: uniqueIps.size,
      blocked_ips: blockedSet.size,
      banned_customers: bannedCustomers.length,
      recent_events: recentIpEvents.length,
    },
  }
}

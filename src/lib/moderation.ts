import { createClient } from '@supabase/supabase-js'
import { mergeCustomerNotes, parseCustomerNotes } from '@/lib/customerNotes'

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

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

export function parsePlexUsername(notes: unknown) {
  return parseCustomerNotes(notes).plexUsername
}

export function isCustomerBannedInNotes(notes: unknown) {
  return parseCustomerNotes(notes).banned
}

export function setCustomerBannedInNotes(notes: unknown, banned: boolean) {
  return mergeCustomerNotes({
    existing: notes,
    banned,
    bannedAt: banned ? new Date().toISOString() : null,
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

  return null
}

export async function countWarnings(email: string) {
  const supabase = svc()
  if (!supabase || !email) return 0
  const { data, error } = await supabase
    .from('plex_audit_logs')
    .select('id')
    .eq('action', 'customer_warning')
    .eq('email', email)

  if (error) return 0
  return Array.isArray(data) ? data.length : 0
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
    await supabase.from('plex_audit_logs').insert({
      id: crypto.randomUUID(),
      action: input.action,
      email: input.email || null,
      share_id: input.share_id || null,
      server_machine_id: input.server_machine_id || null,
      details: input.details || {},
    })
  } catch {}
}

export async function getSecurityOverview() {
  const supabase = svc()
  if (!supabase) return { ipLogs: {}, blockedIps: [], bannedCustomers: [] as any[] }

  const { data: logs, error } = await supabase
    .from('plex_audit_logs')
    .select('action,email,created_at,details')
    .in('action', ['ip_seen', 'ip_block', 'ip_unblock', 'customer_warning', 'customer_ban', 'customer_unban', 'session_seen'])
    .order('created_at', { ascending: true })
    .limit(2000)

  if (error) {
    return { ipLogs: {}, blockedIps: [], bannedCustomers: [] as any[] }
  }

  const ipLogs: Record<string, string[]> = {}
  const blockedSet = new Set<string>()
  const warningCount = new Map<string, number>()
  const bannedMap = new Map<string, { email: string; banned_at: string; reason: string; warning_count: number }>()

  for (const row of logs || []) {
    const action = String((row as any).action || '')
    const email = String((row as any).email || '').trim().toLowerCase()
    const details = ((row as any).details || {}) as Record<string, unknown>
    const ip = String(details.ip || '').trim()

    if ((action === 'ip_seen' || action === 'session_seen') && email && ip) {
      const existing = Array.isArray(ipLogs[email]) ? ipLogs[email] : []
      if (!existing.includes(ip)) ipLogs[email] = [ip, ...existing].slice(0, 20)
    }

    if (action === 'ip_block' && ip) blockedSet.add(ip)
    if (action === 'ip_unblock' && ip) blockedSet.delete(ip)

    if (action === 'customer_warning' && email) {
      warningCount.set(email, (warningCount.get(email) || 0) + 1)
    }

    if (action === 'customer_ban' && email) {
      bannedMap.set(email, {
        email,
        banned_at: String((row as any).created_at || ''),
        reason: String(details.reason || 'Terms of service breach').trim(),
        warning_count: warningCount.get(email) || 0,
      })
    }

    if (action === 'customer_unban' && email) {
      bannedMap.delete(email)
    }
  }

  const { data: customers } = await supabase.from('customers').select('email,name')
  const names = new Map<string, string>()
  for (const row of customers || []) {
    const email = String((row as any).email || '').trim().toLowerCase()
    const name = String((row as any).name || '').trim()
    if (email) names.set(email, name)
  }

  const bannedCustomers = Array.from(bannedMap.values())
    .map((row) => ({
      ...row,
      name: names.get(row.email) || row.email,
    }))
    .sort((a, b) => new Date(b.banned_at).getTime() - new Date(a.banned_at).getTime())

  return {
    ipLogs,
    blockedIps: Array.from(blockedSet).sort(),
    bannedCustomers,
  }
}
